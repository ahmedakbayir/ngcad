/**
 * Component Placement Handler
 * Bileşen yerleştirme işlemlerini yönetir
 */

import { setMode, setDrawingMode, dom, state, setState } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { BAGLANTI_TIPLERI, createBoru } from '../objects/pipe.js';
import { createSayac } from '../objects/meter.js';
import { createVana } from '../objects/valve.js';
import { createRegulator } from '../objects/regulator.js';
import { createBaca } from '../objects/chimney.js';
import { canPlaceValveOnPipe, getObjectsOnPipe } from './placement-utils.js';
import { TESISAT_MODLARI } from './interaction-manager.js';
import { snapTo15DegreeAngle } from '../../draw/geometry.js';
import { initObjectDefaults } from '../properties/properties-panel.js';
import { getFloorIdForZ } from '../../floor/floor-handler.js';
import { ensureFloorForElevation } from '../../floor/floor-panel.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';

/**
 * Bileşeni yerleştir
 */
export function placeComponent(point) {
    if (!this.manager.tempComponent) return;
    const component = this.manager.tempComponent;
    const prevMode = this.previousMode;
    const prevDrawMode = this.previousDrawingMode;
    const prevTool = this.previousActiveTool;

    // Yerleştirilmeden önce tüm default değerleri ata
    initObjectDefaults(component, this.manager);

    switch (component.type) {
        case 'servis_kutusu':
            // ... (Mevcut kod) ...
            saveState();
            this.manager.components.push(component);
            this.startBoruCizim(component.getCikisNoktasi(), component.id);
            this.manager.activeTool = 'boru';
            setMode("plumbingV2", true);
            break;

        case 'sayac':
            // Eğer ghost bağlantısı varsa (boru ucuna snap olmuşsa), normal sayaç ekleme
            if (component.ghostConnectionInfo && component.ghostConnectionInfo.boruUcu) {
                saveState();
                const successSayac = this.handleSayacEndPlacement(component);
                if (successSayac) {
                    // Sayaç eklendi — downstream borular iç tesisat (TURQUAZ) olmalı
                    this.manager.recomputePipeParents();
                    // Sayacın çıkış noktasından boru çizimi başlat
                    const cikisNoktasi = component.getCikisNoktasi();
                    this.startBoruCizim(cikisNoktasi, component.id, BAGLANTI_TIPLERI.SAYAC);
                    // Sayaç eklendikten sonra boru çizme modunda kal (icon doğru görünsün)
                    this.manager.activeTool = 'boru';
                    setMode("plumbingV2", true);
                }
            }
            // Eğer ghost bağlantısı yoksa VE servis kutusu yoksa (İÇ TESİSAT modu)
            else if (!this.hasServisKutusu()) {
                // İÇ TESİSAT MODU: 2 nokta ile kesikli boru + sayaç ekleme
                // İlk tıklama: Kesikli borunun başlangıç noktası
                saveState();

                this.meterPlacementState = 'drawing_start_pipe';
                // İç tesisat modunda ilk tıklama noktası default Z=200 (canlı hat kotu)
                this.meterStartPoint = { x: point.x, y: point.y, z: 200 };
                // tempComponent'i TUTUYORUZ - mevcut ghost sistemi kullanacak

                // console.log('✅ İÇ TESİSAT: Kesikli boru başlangıç noktası belirlendi. İkinci nokta için tıklayın.');
            }
            // Eğer ghost bağlantısı yoksa VE servis kutusu varsa, uyarı ver
            else {
                // console.warn('⚠️ Sayaç sadece boru ucuna eklenebilir!');
                // alert('⚠️ Sayaç sadece boru ucuna eklenebilir!\n\nLütfen sayacı bir boru ucuna yerleştirin.');
            }
            break;

        case 'vana':
            if (this.vanaPreview) {
                this.handleVanaPlacement(this.vanaPreview);
                return;
            }
            console.warn("Vana sadece boru üzerine eklenebilir.");
            break;

        case 'regulator':
            if (this.regulatorPreview) {
                this.handleRegulatorPlacement(this.regulatorPreview);
                return;
            }
            console.warn("Regülatör sadece boru üzerine eklenebilir.");
            break;

        case 'cihaz':
            // Cihaz ekleme - Seç moduna geç
            const successCihaz = this.handleCihazEkleme(component);
            if (successCihaz) {
                // Cihaz eklendikten sonra seç moduna geç
                this.manager.activeTool = null; // activeTool'u temizle - double-click için gerekli
                setMode("select", true);
                // if (this.previousMode) {
                //     console.log(`[MODE] Cihaz eklendi, önceki moda dönülüyor: ${this.previousMode}`);
                //     setTimeout(() => {
                //         if (this.previousDrawingMode) {
                //             console.log(`[MODE] Drawing mode restore: ${this.previousDrawingMode}`);
                //             setDrawingMode(this.previousDrawingMode);
                //         }
                //         console.log(`[MODE] Mode restore: ${this.previousMode}`);
                //         setMode(this.previousMode);

                //         // activeTool'u kaydettiğimiz önceki değere geri yükle
                //         console.log(`[MODE] ActiveTool restore: ${this.previousActiveTool}`);
                //         this.manager.activeTool = this.previousActiveTool;

                //         this.previousMode = null;
                //         this.previousDrawingMode = null;
                //         this.previousActiveTool = null;
                //     }, 10);
                // } else {
                //     // Önceki mod yoksa, normal boru çizme moduna geç
                //     this.manager.activeTool = 'boru';
                //     setMode("plumbingV2", true);
                // }
            }
            break;

        case 'baca':
            // Baca ekleme - sadece cihaz üzerinde
            if (component.ghostSnapCihaz) {
                // İlk tıklama: Baca yerleştir ve çizim moduna geç
                if (!component.parentCihazId) {
                    // VALIDASYON: Bir cihaza max 1 baca
                    const existingBaca = this.manager.components.find(c =>
                        c.type === 'baca' && c.parentCihazId === component.ghostSnapCihazId
                    );
                    if (existingBaca) {
                        console.warn('⚠️ Bu cihaza zaten baca eklenmiş! Bir cihaza maksimum 1 baca eklenebilir.');
                        // Ghost'ı temizle ve moddan çık
                        this.manager.tempComponent = null;
                        this.manager.activeTool = null;
                        return;
                    }

                    saveState();
                    component.parentCihazId = component.ghostSnapCihazId;
                    this.manager.components.push(component);
                    this.manager.saveToState();
                    // tempComponent'i tutuyoruz - çizim devam edecek
                    // Fonksiyon sonundaki tempComponent = null'u atlamak için return
                    return;
                }
                // Sonraki tıklamalar: Segment ekle
                else if (component.isDrawing) {
                    saveState();

                    // Eksen snap - Sadece X/Y eksenlerine 15° içindeyse snap
                    let snappedPoint = point;
                    if (component.currentSegmentStart) {
                        const dx = point.x - component.currentSegmentStart.x;
                        const dy = point.y - component.currentSegmentStart.y;
                        const distance = Math.hypot(dx, dy);

                        if (distance >= 10) {
                            let angleRad = Math.atan2(dy, dx);
                            let angleDeg = angleRad * 180 / Math.PI;

                            // Eksenlere snap (0°, 90°, 180°, -90°)
                            const SNAP_TOLERANCE = 15;
                            let snappedAngle = null;

                            if (Math.abs(angleDeg) <= SNAP_TOLERANCE) {
                                snappedAngle = 0;
                            } else if (Math.abs(angleDeg - 90) <= SNAP_TOLERANCE) {
                                snappedAngle = 90;
                            } else if (Math.abs(Math.abs(angleDeg) - 180) <= SNAP_TOLERANCE) {
                                snappedAngle = 180;
                            } else if (Math.abs(angleDeg + 90) <= SNAP_TOLERANCE) {
                                snappedAngle = -90;
                            }

                            if (snappedAngle !== null) {
                                const snappedAngleRad = snappedAngle * Math.PI / 180;
                                snappedPoint = {
                                    x: component.currentSegmentStart.x + distance * Math.cos(snappedAngleRad),
                                    y: component.currentSegmentStart.y + distance * Math.sin(snappedAngleRad),
                                    z: component.currentSegmentStart.z || component.z || 0 // Z koordinatını koru
                                };
                            }
                        }
                    }

                    // Z koordinatını garanti et
                    const segmentZ = snappedPoint.z !== undefined ? snappedPoint.z : (component.z || 0);
                    const success = component.addSegment(snappedPoint.x, snappedPoint.y, segmentZ);
                    if (success) {
                        this.manager.saveToState();
                        // tempComponent'i tutuyoruz - çizim devam edecek
                        return;
                    } else {
                        // Minimum uzunluk yok, uyarı ver
                        console.warn('⚠️ Segment çok kısa! En az 10cm olmalı.');
                        return;
                    }
                }
            } else {
                // Cihaz yoksa - ghost görünmez olduğu için buraya gelmemeli
                console.warn('⚠️ Baca sadece cihaz üzerine eklenebilir!');
            }
            break;

        default:
            saveState();
            this.manager.components.push(component);
            break;
    }

    this.manager.tempComponent = null;
    //if (!this.boruCizimAktif) this.manager.activeTool = null;
    this.manager.saveToState();
}

/**
 * İşlem tamamlandıktan sonra önceki modu geri yükleyen yardımcı fonksiyon
 */
export function restorePreviousMode(prevMode, prevDrawMode, prevTool) {
    const targetMode = prevMode || "select";
    const targetDrawMode = prevDrawMode || "KARMA";
    const targetTool = prevTool;

    setTimeout(() => {
        // 1. Çizim modunu (MİMARİ/TESİSAT) geri yükle
        setDrawingMode(targetDrawMode);

        // 2. Ana etkileşim modunu (select/plumbingV2) zorlayarak geri yükle
        setMode(targetMode, true);

        // 3. Tesisat aracını ikon seviyesinde aktif et
        this.manager.activeTool = targetTool;

        // 4. Eğer boru moduna dönüldüyse, çizimi sıfırla ama modu koru
        if (targetTool === 'boru') {
            this.boruCizimAktif = false;
            this.boruBaslangic = null;
        }

        // 5. UI ikonunun mavi yanması için setMode içindeki mantığı manuel tetikle
        if (targetMode === "plumbingV2") {
            const activeTool = targetTool;
            dom.bBoru.classList.toggle("active", activeTool === 'boru');
            // Diğer tesisat butonlarını da burada senkronize edebilirsiniz
        }

        this.previousMode = null;
        this.previousDrawingMode = null;
        this.previousActiveTool = null;
    }, 50); // Zamanlamayı biraz artırmak UI çakışmalarını önler
}

/**
 * Yerleştirilen boruya ve konuma göre otomatik vana tipini belirle.
 *   - Servis kutusu → ilk ayrım arası boru → AKV
 *   - Borunun serbest (bağlantısız) ucuna yakın              → BRANSMAN
 *   - Diğer durumlar                                         → EMNIYET
 */
function _detectVanaTipi(pipe, t, manager) {
    const pipes = manager.pipes || [];
    const components = manager.components || [];

    // Boruların fiziksel uç noktası haritaları
    // Her boru ucu koordinatına o borunun bilgisini tut
    const ptKey = (p) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${Math.round((p.z || 0) * 10)}`;

    // p1 koordinatından hangi borular başlar / bitiyor — junction tespiti için
    const pipesStartingAt = new Map(); // key → [boruId, ...]
    const pipesEndingAt = new Map();
    pipes.forEach(p => {
        if (!p.p1 || !p.p2) return;
        const k1 = ptKey(p.p1), k2 = ptKey(p.p2);
        if (!pipesStartingAt.has(k1)) pipesStartingAt.set(k1, []);
        pipesStartingAt.get(k1).push(p.id);
        if (!pipesEndingAt.has(k2)) pipesEndingAt.set(k2, []);
        pipesEndingAt.get(k2).push(p.id);
    });

    // ── 1. Serbest boru ucu tespiti → BRANSMAN ──────────────────────────────
    const END_T = 0.10; // borunun son %20'si "uca yakın" sayılır
    if (pipe.p1 && pipe.p2) {
        const len3d = Math.hypot(
            pipe.p2.x - pipe.p1.x,
            pipe.p2.y - pipe.p1.y,
            (pipe.p2.z || 0) - (pipe.p1.z || 0)
        );
        const END_T_abs = len3d > 0 ? Math.min(END_T, 15 / len3d) : END_T;

        if (t >= 1 - END_T_abs) {
            // p2 ucuna yakın — o uç serbest mi?
            const k2 = ptKey(pipe.p2);
            const connectedAtP2 = (pipesStartingAt.get(k2) || []).length;
            const hasComponentAtP2 = components.some(c => {
                const cp = c.getGirisNoktasi?.() || c.getCikisNoktasi?.();
                return cp && Math.hypot(cp.x - pipe.p2.x, cp.y - pipe.p2.y) < 5;
            });
            if (connectedAtP2 === 0 && !hasComponentAtP2) return 'BRANSMAN';
        }
        if (t <= END_T_abs) {
            // p1 ucuna yakın — o uç serbest mi?
            const k1 = ptKey(pipe.p1);
            const connectedAtP1 = (pipesEndingAt.get(k1) || []).length;
            const hasComponentAtP1 = components.some(c => {
                const cp = c.getGirisNoktasi?.() || c.getCikisNoktasi?.();
                return cp && Math.hypot(cp.x - pipe.p1.x, cp.y - pipe.p1.y) < 5;
            });
            if (connectedAtP1 === 0 && !hasComponentAtP1) return 'BRANSMAN';
        }
    }

    // ── 2. Servis kutusu → ilk ayrım arası boru tespiti → AKV ───────────────
    // Servis kutusunu bul
    const sk = components.find(c => c.type === 'servis_kutusu');
    if (sk) {
        const skCikis = sk.getCikisNoktasi?.();
        if (skCikis) {
            // BFS: SK çıkışından ilerle, junction'a kadar olan boru kümesini bul
            const visited = new Set();
            const queue = [];
            // SK çıkışından başlayan borular
            const skKey = ptKey(skCikis);
            (pipesStartingAt.get(skKey) || []).forEach(id => queue.push(id));

            const preJunctionPipes = new Set();
            while (queue.length > 0) {
                const bid = queue.shift();
                if (visited.has(bid)) continue;
                visited.add(bid);

                const b = pipes.find(p => p.id === bid);
                if (!b || !b.p2) continue;
                preJunctionPipes.add(bid);

                // p2'den devam eden borular
                const nextKey = ptKey(b.p2);
                const nextPipes = pipesStartingAt.get(nextKey) || [];

                // Junction: 2+ boru ayrılıyor → DUR (bu nokta ayrım noktası, bu borular dahil değil)
                if (nextPipes.length >= 2) break;

                // Tek devam eden boru varsa ilerle
                nextPipes.forEach(id => { if (!visited.has(id)) queue.push(id); });
            }

            if (preJunctionPipes.has(pipe.id)) {
                // Bu bölgede zaten bir AKV varsa EMNIYET ekle
                const akvarAlreadyExists = components.some(
                    c => c.type === 'vana' && c.vanaTipi === 'AKV' && preJunctionPipes.has(c.bagliBoruId)
                );
                return akvarAlreadyExists ? 'EMNIYET' : 'AKV';
            }
        }
    }

    // ── 3. Varsayılan ────────────────────────────────────────────────────────
    return 'EMNIYET';
}

/**
 * Vana yerleştir - YENİ STRATEJİ (Düşey Boru Destekli)
 * Vana boruyu bölmez, boru üzerinde serbest kayabilir bir nesne olarak eklenir
 */
export function handleVanaPlacement(vanaPreview) {
    const { pipe, point, skipSaveState } = vanaPreview;

    // Undo için state kaydet (chord içinden çağrılırken atlanır — iniş+vana
    // tek undo adımı kalsın diye dışarıdan saveState bir kez yapılır).
    if (!skipSaveState) saveState();

    const existingObjects = getObjectsOnPipe(this.manager.components, pipe.id);

    // --- 1. DÜŞEY BORU VE 3D GEOMETRİ HESABI ---
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);

    // 2D ve 3D uzunlukları ayrı hesapla
    const len2d = Math.hypot(dx, dy);
    const len3d = Math.hypot(dx, dy, dz);

    // Düşey boru tespiti: Z farkı baskınsa veya 2D uzunluk çok kısaysa
    const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

    let placementResult;

    if (isVertical) {
        // Düşey boru için MANUEL hesaplama (standart 2D fonksiyon çalışmaz)
        let t = 0.5;
        if (Math.abs(dz) > 0.01) {
            t = ((point.z || 0) - (pipe.p1.z || 0)) / dz;
        }
        // T değerini 0-1 arasına sınırla
        t = Math.max(0, Math.min(1, t));

        placementResult = {
            success: true,
            t: t,
            x: pipe.p1.x, // Düşeyde X değişmez
            y: pipe.p1.y, // Düşeyde Y değişmez
            z: (pipe.p1.z || 0) + t * dz,
            adjusted: false
        };
    } else {
        // Yatay/Eğik borular için mevcut standart fonksiyonu kullan
        placementResult = canPlaceValveOnPipe(pipe, point, existingObjects);
    }

    if (!placementResult || (placementResult.error && !placementResult.success)) {
        // Hata durumu
        this.vanaPreview = null;
        return;
    }

    const { t, x, y, adjusted } = placementResult;
    // Z değerini garantile (yatay boruysa p1.z ile aynıdır, düşeyse t ile değişir)
    const z = placementResult.z !== undefined ? placementResult.z : ((pipe.p1.z || 0) + t * dz);

    // --- 2. UÇ NOKTALARA SABİTLEME (3D Mesafe ile) ---
    // pipe.uzunluk yerine hesapladığımız len3d (3D uzunluk) kullan
    const VANA_GENISLIGI = 8;
    const BORU_UCU_BOSLUK = 0; // max 1 cm kalsın boru ucunda (ara vanalar için)
    const fixedDistanceFromEnd = VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK; // ~5 cm (ara vanalar)
    const fixedDistanceFromEndSonlanma = 1; // 1 cm (sonlanma vanaları - boru ucuna çok yakın)

    // Boru ucuna yakın mı kontrol et
    const END_THRESHOLD_CM = 10;
    const distToP1 = t * len3d;
    const distToP2 = (1 - t) * len3d;

    const isNearP1 = distToP1 < END_THRESHOLD_CM;
    const isNearP2 = distToP2 < END_THRESHOLD_CM;

    // Vana oluşturma seçenekleri
    const vanaOptions = {
        floorId: state.currentFloor?.id,
        bagliBoruId: pipe.id,
        boruPozisyonu: t
    };

    if (isNearP2) {
        vanaOptions.fromEnd = 'p2';
        vanaOptions.fixedDistance = fixedDistanceFromEnd;
    } else if (isNearP1) {
        vanaOptions.fromEnd = 'p1';
        vanaOptions.fixedDistance = fixedDistanceFromEnd;
    }

    // --- 3. NESNEYİ OLUŞTUR VE AYARLA ---
    // Öncelik: vanaPreview.vanaTipi (context menu) > tempComponent.vanaTipi (V+harf kısayolu) > otomatik tespit
    const vanaTipi = vanaPreview.vanaTipi
        || this.manager.tempComponent?.vanaTipi
        || _detectVanaTipi(pipe, t, this.manager);
    const vana = createVana(x, y, vanaTipi, vanaOptions);

    // Z Yüksekliğini Ata
    vana.z = z;
    ensureFloorForElevation(z);
    vana.floorId = getFloorIdForZ(z);

    // AÇI DÜZELTMESİ (Sorunu çözen kısım)
    if (isVertical) {
        // Düşey boru ise -45 derece (3D izometrikte dikey görünüm)
        vana.rotation = -45;
    } else {
        // Yatay boru ise kendi açısı
        vana.rotation = pipe.aciDerece;
    }

    // Sonlanma vanaları için fixedDistance değerini güncelle (boru ucuna daha yakın)
    if (vana.isSonlanma() && vana.fixedDistance !== null) {
        vana.fixedDistance = fixedDistanceFromEndSonlanma;
    }

    // Manager'a ekle
    initObjectDefaults(vana, this.manager);
    this.manager.components.push(vana);
    vana.updateEndCapStatus(this.manager);
    this.manager.saveToState();

    // Temizlik
    this.vanaPreview = null;
    this.manager.activeTool = null;
    this.cancelCurrentAction();
    setMode("select");
}

/**
 * Bir borunun upstream (kaynak) basıncını döndürür.
 * Servis kutusu varsa kutuBasinc; iç tesisat ise (sayaç var, kutu yok) sayaç.basinc.
 * Hiçbiri yoksa default '21'.
 */
function _getPipeUpstreamBasinc(pipe, manager) {
    if (!manager || !pipe) return '21';
    let current = pipe;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const bag = current.baslangicBaglanti;
        if (!bag?.tip) break;
        if (bag.tip === 'sayac') {
            const sayac = manager.components.find(c => c.id === bag.hedefId);
            return sayac?.basinc != null ? String(sayac.basinc) : '21';
        }
        if (bag.tip === 'servis_kutusu') {
            const kutu = manager.components.find(c => c.id === bag.hedefId);
            return kutu?.kutuBasinc != null ? String(kutu.kutuBasinc) : '21';
        }
        if (bag.tip === 'boru') {
            current = manager.pipes.find(p => p.id === bag.hedefId) || null;
            continue;
        }
        break;
    }
    return '21';
}

/**
 * Borunun upstream'inde (yukarı doğru) ilk karşılaşılan kaynak bileşenini döndürür.
 * Sayaç veya servis kutusu olabilir.
 */
function _findUpstreamSource(pipe, manager) {
    if (!manager || !pipe) return null;
    let current = pipe;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const bag = current.baslangicBaglanti;
        if (!bag?.tip) break;
        if (bag.tip === 'sayac' || bag.tip === 'servis_kutusu') {
            return manager.components.find(c => c.id === bag.hedefId) || null;
        }
        if (bag.tip === 'boru') {
            current = manager.pipes.find(p => p.id === bag.hedefId) || null;
            continue;
        }
        break;
    }
    return null;
}

/**
 * Regülatör yerleştir — vana gibi tıkla, ama fiziksel olarak boruyu bölüp
 * çıkış noktasından itibaren yeni basınçla devam eden boru oluşturur.
 *
 * Otomatik kurallar:
 *   • Çıkış basıncı default '21'.
 *   • 21 mbar bir hatta eklenince:
 *       - servis kutusu varsa kutuBasinc → '300'
 *       - servis kutusu yoksa upstream sayaç varsa onun basıncı → '300'
 *   • Yerleştirme sonrası tüm boruların basıncı zincirden recompute edilir.
 */
export function handleRegulatorPlacement(regulatorPreview) {
    const { pipe, point } = regulatorPreview;

    saveState();

    const existingObjects = getObjectsOnPipe(this.manager.components, pipe.id);

    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const len2d = Math.hypot(dx, dy);
    const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;

    let placementResult;
    if (isVertical) {
        let t = 0.5;
        if (Math.abs(dz) > 0.01) t = ((point.z || 0) - (pipe.p1.z || 0)) / dz;
        t = Math.max(0, Math.min(1, t));
        placementResult = {
            success: true, t,
            x: pipe.p1.x, y: pipe.p1.y,
            z: (pipe.p1.z || 0) + t * dz,
        };
    } else {
        placementResult = canPlaceValveOnPipe(pipe, point, existingObjects);
    }

    if (!placementResult || (placementResult.error && !placementResult.success)) {
        this.regulatorPreview = null;
        return;
    }

    const { x, y } = placementResult;
    const t = placementResult.t;
    const z = placementResult.z !== undefined ? placementResult.z : ((pipe.p1.z || 0) + t * dz);

    // Boruyu fiziksel olarak böl — çıkış noktasında yeni hat başlasın
    const splitPoint = { x, y, z };
    const splitResult = pipe.splitAt(splitPoint);
    if (!splitResult) {
        console.warn('Regülatör için boru bölünemedi.');
        this.regulatorPreview = null;
        return;
    }
    const { boru1, boru2 } = splitResult;

    // Pipe listesini güncelle (oldPipe sil, yenileri ekle)
    const idx = this.manager.pipes.findIndex(p => p.id === pipe.id);
    if (idx !== -1) this.manager.pipes.splice(idx, 1);
    this.manager.pipes.push(boru1, boru2);
    this.manager.registerPipeNodes(boru1);
    this.manager.registerPipeNodes(boru2);

    // Eski boruya bağlı vanalar/regülatörler/fleks bağlantıları yeni borulara dağıt
    redistributePipeComponentsInline.call(this, pipe, boru1, boru2, splitPoint);

    // T-bağlı çocuk borular ile parent referansını da kurtar (handlePipeSplit'tekine paralel)
    this.manager.pipes.forEach(childPipe => {
        if (childPipe === boru1 || childPipe === boru2) return;
        if (childPipe.baslangicBaglanti?.tip === 'boru' && childPipe.baslangicBaglanti.hedefId === pipe.id) {
            const proj1 = boru1.projectPoint(childPipe.p1);
            const proj2 = boru2.projectPoint(childPipe.p1);
            childPipe.baslangicBaglanti.hedefId = (proj1.distance < proj2.distance) ? boru1.id : boru2.id;
        }
    });
    const parentPipe = this.manager.pipes.find(p =>
        p.bitisBaglanti?.tip === 'boru' && p.bitisBaglanti.hedefId === pipe.id
    );
    if (parentPipe) parentPipe.bitisBaglanti.hedefId = boru1.id;

    // Servis kutusu / sayaç çıkışındaki hedef boru referansını boru1'e taşı
    this.manager.components.forEach(c => {
        if (c.type === 'servis_kutusu' && c.bagliBoruId === pipe.id) c.bagliBoruId = boru1.id;
        if (c.type === 'sayac' && c.cikisBagliBoruId === pipe.id) c.cikisBagliBoruId = boru1.id;
    });

    // Regülatörü boru1'in p2 ucuna sabitle (vana stili)
    const REG_GENISLIGI = 6;
    const fixedDistanceFromEnd = REG_GENISLIGI / 2;
    const boru1Len = Math.hypot(
        boru1.p2.x - boru1.p1.x,
        boru1.p2.y - boru1.p1.y,
        (boru1.p2.z || 0) - (boru1.p1.z || 0)
    );
    const regBoruPos = boru1Len > 0.01 ? Math.max(1 - fixedDistanceFromEnd / boru1Len, 0.05) : 1;

    const regulator = createRegulator(x, y, {
        floorId: state.currentFloor?.id,
        bagliBoruId: boru1.id,
        boruPozisyonu: regBoruPos,
        fromEnd: 'p2',
        fixedDistance: fixedDistanceFromEnd,
    });
    regulator.z = z;
    ensureFloorForElevation(z);
    regulator.floorId = getFloorIdForZ(z);
    regulator.rotation = isVertical ? -45 : pipe.aciDerece;

    initObjectDefaults(regulator, this.manager);
    this.manager.components.push(regulator);

    // Snap pozisyonu boru1'e göre yeniden hesapla
    if (regulator.updatePositionFromPipe) regulator.updatePositionFromPipe(boru1);

    // ── Otomatik kaynak basıncı kuralları ────────────────────────────────
    // Regülatör 21 mbar bir hatta yerleştirildiğinde regülatörün ÜST tarafındaki
    // kaynağın 300 mbar'a yükseltilmesi gerekir. Aşağı tarafta kalan sayaçların
    // basıncı recomputeAllPressures içinde upstream zincirinden türetilir —
    // tüm sayaçları '300'e zorlamak post-regülatör sayaçları yanlış 300 gösterir.
    const hatBasinc = _getPipeUpstreamBasinc(boru1, this.manager);
    if (hatBasinc === '21') {
        const hasServisKutusu = this.manager.components.some(c => c.type === 'servis_kutusu');
        if (hasServisKutusu) {
            this.manager.components.forEach(c => {
                if (c.type === 'servis_kutusu') c.kutuBasinc = '300';
            });
        } else {
            const upstream = _findUpstreamSource(boru1, this.manager);
            if (upstream && upstream.type === 'sayac') upstream.basinc = '300';
        }
    }

    // Boru split nedeniyle topoloji değişti — kök kaynakları yeniden hesapla
    this.manager.recomputePipeParents();

    // Tüm boruların basıncını zincirden yeniden hesapla
    // (sayaçların basıncı da burada upstream zincirinden senkronlanır)
    recomputeAllPressures(this.manager);

    this.manager.saveToState();

    this.regulatorPreview = null;
    this.manager.activeTool = null;
    this.cancelCurrentAction();
    setMode("select");
}

/**
 * Sayaç ekleme işlemleri
 * KURALLAR:
 * - Sayaç SADECE boru uç noktasına eklenebilir
 * - Fleks ile bağlanır
 * - Boru ucunda vana yoksa otomatik vana eklenir
 */
export function handleSayacEndPlacement(meter) {
    //console.log('[handleSayacEndPlacement] Başlıyor');

    // Ghost'tan boru ucu bilgisini al (ghost gösterimde doğru pozisyon belirlendi)
    // Eğer ghost bilgisi yoksa, mevcut pozisyondan bul
    let boruUcu;
    if (meter.ghostConnectionInfo && meter.ghostConnectionInfo.boruUcu) {
        boruUcu = meter.ghostConnectionInfo.boruUcu;
        //console.log('[handleSayacEndPlacement] Ghost connection info bulundu:', boruUcu);
    } else {
        // Fallback: mevcut pozisyondan bul
        const girisNoktasi = meter.getGirisNoktasi();
        boruUcu = this.findBoruUcuAt(girisNoktasi, 50);
        //console.log('[handleSayacEndPlacement] Fallback ile boru ucu bulundu:', boruUcu);
    }

    if (!boruUcu) {
        //console.error('[handleSayacEndPlacement] ✗ Boru ucu bulunamadı!');
        // alert('Sayaç bir boru ucuna yerleştirilmelidir! Lütfen bir boru ucunun yakınına yerleştirin.');
        return false;
    }

    // T JUNCTION KONTROLÜ: Sayaç sadece gerçek uçlara bağlanabilir, T noktasına değil
    // NOT: isTrulyFreeEndpoint 3D mesafe kullanır — 2D'de iniş borusu gibi dikey boruların
    //       alt ucu ekran üst ucuyla aynı pikselde görünse de 3D'de ayrı oldukları için
    //       doğru şekilde serbest uç olarak tanınır.
    if (!this.manager.isTrulyFreeEndpoint(boruUcu.nokta, 5)) {
        // console.error('[handleSayacEndPlacement] ✗ T-junction kontrolü başarısız!');
        // alert('⚠️ Sayaç T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
        return false;
    }

    // SAYAÇ/KUTU TARAFI KONTROLÜ: Borunun bu ucu zaten bir sayaç veya kutuya
    // bağlıysa (baglanti.hedefId) sayaç da eklenemez. Kapalı uçtur.
    const _bagMeter = boruUcu.uc === 'p1' ? boruUcu.boru?.baslangicBaglanti : boruUcu.boru?.bitisBaglanti;
    if (_bagMeter && _bagMeter.hedefId) {
        return false;
    }

    // SAYAÇ VAR MI KONTROLÜ: Bir boru ucunda zaten sayaç varsa başka sayaç eklenemez
    const mevcutSayac = this.hasMeterAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutSayac) {
        //console.error('[handleSayacEndPlacement] ✗ Bu boru ucunda zaten sayaç var!');
        // alert('⚠️ Bu boru ucunda zaten bir sayaç var!\n\nBir boru ucuna sadece bir sayaç eklenebilir.');
        return false;
    }

    // Cihaz var mı kontrolü: Aynı uçta zaten cihaz varsa sayaç eklenemez.
    const mevcutCihazUc = this.hasDeviceAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutCihazUc) {
        return false;
    }

    //console.log('[handleSayacEndPlacement] ✓ Kontroller geçti, vana ve sayaç ekleniyor...');

    // Not: saveState() artık placeComponent'ta çağrılıyor (tüm işlemlerden önce)

    // Boru ucunda vana var mı kontrol et
    const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

    // Vana yoksa otomatik ekle
    if (!vanaVar) {
        // Vana pozisyonunu hesapla
        const boru = boruUcu.boru;
        const VANA_GENISLIGI = 8;  // cm
        const BORU_UCU_BOSLUK = 0; // max 1 cm kalsın boru ucunda
        const centerMargin = VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK; // 5 cm - merkez için toplam

        // Boru yönünü hesapla (boru ucundan içeriye doğru)
        const dx = boru.p2.x - boru.p1.x;
        const dy = boru.p2.y - boru.p1.y;
        const length = Math.hypot(dx, dy);

        // 3D boru yönünü hesapla (düşey borular için Z dahil)
        const dz = (boru.p2.z || 0) - (boru.p1.z || 0);
        const length3D = Math.hypot(dx, dy, dz);

        let vanaX, vanaY, vanaZ;
        if (boruUcu.uc === 'p1') {
            // p1 ucundayız, sayaç tarafına (boru dışına) centerMargin kadar git (3D)
            vanaX = boruUcu.nokta.x - (dx / length3D) * centerMargin;
            vanaY = boruUcu.nokta.y - (dy / length3D) * centerMargin;
            vanaZ = (boruUcu.nokta.z || 0) - (dz / length3D) * centerMargin;
        } else {
            // p2 ucundayız, sayaç tarafına (boru dışına) centerMargin kadar git (3D)
            vanaX = boruUcu.nokta.x + (dx / length3D) * centerMargin;
            vanaY = boruUcu.nokta.y + (dy / length3D) * centerMargin;
            vanaZ = (boruUcu.nokta.z || 0) + (dz / length3D) * centerMargin;
        }

        const vana = createVana(vanaX, vanaY, 'EMNIYET');
        vana.rotation = boruUcu.boru.aciDerece;
        vana.floorId = meter.floorId;
        vana.z = vanaZ;
        // Vana'yı boru üzerindeki pozisyona bağla
        vana.bagliBoruId = boruUcu.boruId;
        // Pozisyonu hesapla (0.0 - 1.0 arası) - 3D mesafe kullan
        const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y, vanaZ - (boru.p1.z || 0));
        vana.boruPozisyonu = vanaToP1Dist / length3D;
        // Uçtan sabit mesafe olarak ayarla
        vana.fromEnd = boruUcu.uc; // 'p1' veya 'p2'
        vana.fixedDistance = centerMargin; // 5 cm

        this.manager.components.push(vana);
        // Kapama sembolü durumunu güncelle
        vana.updateEndCapStatus(this.manager);
        meter.iliskiliVanaId = vana.id;
    } else {
        meter.iliskiliVanaId = vanaVar.id;
        // Mevcut vananın kapama durumunu güncelle (yeni sayaç eklendi)
        vanaVar.updateEndCapStatus(this.manager);
    }
    // Sayaç Z değerini boru ucundan al (eğer ghost'tan gelmediyse)
    if (meter.z === undefined) {
        meter.z = boruUcu.nokta.z || 0;
    }
    // Sayacın katı, bağlantı noktasının Z'sine göre belirlenir.
    // (Cross-floor boru: p1 alt katta, p2 üst katta — sayaç bağlandığı uç hangi
    // kattaysa o katta gözükmeli, borunun floorId'sine değil.)
    meter.floorId = getFloorIdForZ(meter.z) || boruUcu.boru?.floorId || null;
    // Sayaç pozisyonu ve rotation ghost'tan geliyor (mouse konumuna göre ayarlanmış)
    // Ghost'ta zaten doğru pozisyon ve yön belirlendi, burada yeniden hesaplamaya gerek yok
    // meter.x, meter.y ve meter.rotation zaten ghost positioning'den doğru değerlerde

    const fleksUzunluk = 15; // cm
    meter.config.rijitUzunluk = fleksUzunluk;

    // SON OLARAK: Tüm pozisyon/rotation ayarları bittikten sonra fleks bağla
    meter.fleksBagla(boruUcu.boruId, boruUcu.uc);

    // Sayacı components'a ekle (eğer henüz eklenmemişse)
    if (!this.manager.components.includes(meter)) {
        this.manager.components.push(meter);
    }

    return true;
}

/**
 * Cihaz ekleme (Kombi, Ocak, vb.)
 * KURALLAR:
 * - Cihaz SADECE boru uç noktasına eklenebilir
 * - Fleks ile bağlanır
 * - Boru ucunda vana yoksa otomatik vana eklenir
 */
export function handleCihazEkleme(cihaz) {
    //console.log('[handleCihazEkleme] Başlıyor. Cihaz tipi:', cihaz.cihazTipi);

    // Ghost'tan boru ucu bilgisini al (ghost gösterimde doğru pozisyon belirlendi)
    // Eğer ghost bilgisi yoksa, mevcut pozisyondan bul
    let boruUcu;
    if (cihaz.ghostConnectionInfo && cihaz.ghostConnectionInfo.boruUcu) {
        boruUcu = cihaz.ghostConnectionInfo.boruUcu;
        //console.log('[handleCihazEkleme] Ghost connection info bulundu:', boruUcu);
    } else {
        // Fallback: mevcut pozisyondan bul
        const girisNoktasi = cihaz.getGirisNoktasi();
        boruUcu = this.findBoruUcuAt(girisNoktasi, 50);
        //console.log('[handleCihazEkleme] Fallback ile boru ucu bulundu:', boruUcu);
    }

    if (!boruUcu) {
        // console.error('[handleCihazEkleme] ✗ Boru ucu bulunamadı!');
        //alert('Cihaz bir boru ucuna yerleştirilmelidir! Lütfen bir boru ucunun yakınına yerleştirin.');
        // Cihazı components'a ekleme, sadece iptal et
        return false;
    }

    // T JUNCTION KONTROLÜ: Cihaz sadece gerçek uçlara bağlanabilir, T noktasına değil
    // NOT: isTrulyFreeEndpoint 3D mesafe kullanır — 2D'de iniş borusu gibi dikey boruların
    //       alt ucu ekran üst ucuyla aynı pikselde görünse de 3D'de ayrı oldukları için
    //       doğru şekilde serbest uç olarak tanınır.
    if (!this.manager.isTrulyFreeEndpoint(boruUcu.nokta, 5)) {
        // console.error('[handleCihazEkleme] ✗ T-junction kontrolü başarısız!');
        // alert('⚠️ Cihaz T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
        return false;
    }

    // SAYAÇ/KUTU TARAFI KONTROLÜ: Borunun bu ucu sayaç çıkışı veya kutu çıkışı ise
    // (baglanti.hedefId set) cihaz EKLENEMEZ. isTrulyFreeEndpoint sadece komşu
    // boru sayısına bakar; sayaç tarafını yanlışlıkla serbest sayardı.
    const _bag = boruUcu.uc === 'p1' ? boruUcu.boru?.baslangicBaglanti : boruUcu.boru?.bitisBaglanti;
    if (_bag && _bag.hedefId) {
        return false;
    }

    // CİHAZ VAR MI KONTROLÜ: Bir boru ucunda zaten cihaz varsa başka cihaz eklenemez
    const mevcutCihaz = this.hasDeviceAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutCihaz) {
        // console.error('[handleCihazEkleme] ✗ Bu boru ucunda zaten cihaz var!');
        // alert('⚠️ Bu boru ucunda zaten bir cihaz var!\n\nBir boru ucuna sadece bir cihaz eklenebilir.');
        return false;
    }

    // Sayaç var mı kontrolü: Aynı uçta zaten sayaç varsa cihaz eklenemez.
    const mevcutSayacUc = this.hasMeterAtEndpoint(boruUcu.boruId, boruUcu.uc);
    if (mevcutSayacUc) {
        return false;
    }

    // console.log('[handleCihazEkleme] ✓ Kontroller geçti, vana ve cihaz ekleniyor...');

    // Undo için state kaydet
    saveState();

    // Cihazın floorId'si: bağlantı noktasının Z'sine göre belirlenir.
    // (Cross-floor boruya bağlanan cihaz, bağlandığı ucun hangi katta olduğuna
    // göre o katta görünsün — borunun genel floorId'sine değil.)
    const _cihazBagZ = (boruUcu.nokta?.z != null ? boruUcu.nokta.z : (cihaz.z || 0));
    cihaz.floorId = getFloorIdForZ(_cihazBagZ) || boruUcu.boru?.floorId || null;

    // YENİ EKLENEN KISIM: Cihazın 3D Z kotunu, bağlandığı borunun uç noktasına eşitle!
    cihaz.z = _cihazBagZ;

    // Boru ucunda vana var mı kontrol et
    const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

    // Vana yoksa otomatik ekle
    if (!vanaVar) {
        // Vana pozisyonunu hesapla
        const boru = boruUcu.boru;
        const VANA_GENISLIGI = 8;  // cm
        const BORU_UCU_BOSLUK = 0; // max 1 cm kalsın boru ucunda
        const centerMargin = VANA_GENISLIGI / 2 + BORU_UCU_BOSLUK; // 5 cm - merkez için toplam

        // DÜZELTME: 3D boru yönünü hesapla (düşey borular için Z dahil)
        const dx = boru.p2.x - boru.p1.x;
        const dy = boru.p2.y - boru.p1.y;
        const dz = (boru.p2.z || 0) - (boru.p1.z || 0);
        const length3D = Math.hypot(dx, dy, dz);

        let vanaX, vanaY, vanaZ;
        if (boruUcu.uc === 'p1') {
            // p1 ucundayız, cihaz tarafına (boru dışına) centerMargin kadar git (3D)
            vanaX = boruUcu.nokta.x - (dx / length3D) * centerMargin;
            vanaY = boruUcu.nokta.y - (dy / length3D) * centerMargin;
            vanaZ = (boruUcu.nokta.z || 0) - (dz / length3D) * centerMargin;
        } else {
            // p2 ucundayız, cihaz tarafına (boru dışına) centerMargin kadar git (3D)
            vanaX = boruUcu.nokta.x + (dx / length3D) * centerMargin;
            vanaY = boruUcu.nokta.y + (dy / length3D) * centerMargin;
            vanaZ = (boruUcu.nokta.z || 0) + (dz / length3D) * centerMargin;
        }

        const vana = createVana(vanaX, vanaY, 'CIHAZ');
        vana.rotation = boruUcu.boru.aciDerece;
        vana.floorId = cihaz.floorId;
        // Vanaya Z değerini ekle (3D hesaplanmış pozisyon)
        vana.z = vanaZ;
        // Vana'yı boru üzerindeki pozisyona bağla
        vana.bagliBoruId = boruUcu.boruId;
        // Pozisyonu hesapla (0.0 - 1.0 arası) - 3D mesafe kullan
        const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y, vanaZ - (boru.p1.z || 0));
        vana.boruPozisyonu = vanaToP1Dist / length3D;
        // Uçtan sabit mesafe olarak ayarla
        vana.fromEnd = boruUcu.uc; // 'p1' veya 'p2'
        vana.fixedDistance = centerMargin; // 5 cm

        this.manager.components.push(vana);
        // Kapama sembolü durumunu güncelle
        vana.updateEndCapStatus(this.manager);
        cihaz.vanaIliskilendir(vana.id);
    } else {
        cihaz.vanaIliskilendir(vanaVar.id);
        // Mevcut vananın kapama durumunu güncelle (yeni cihaz eklendi)
        vanaVar.updateEndCapStatus(this.manager);
    }

    // Cihaz rotation'unu sabit tut - tutamacı her zaman kuzeyde
    // Fleks bağlantısı cihazın en yakın noktasından otomatik ayarlanacak
    cihaz.rotation = 0;

    // Cihaz pozisyonu ghost'tan geliyor (mouse konumuna göre ayarlanmış)
    // Ghost'ta zaten doğru pozisyon belirlendi, burada yeniden hesaplamaya gerek yok
    // cihaz.x ve cihaz.y zaten ghost positioning'den doğru değerlerde

    // SON OLARAK: Tüm pozisyon/rotation ayarları bittikten sonra fleks bağla
    // boruUcu.uc = 'p1' veya 'p2'
    cihaz.fleksBagla(boruUcu.boruId, boruUcu.uc);

    // Fleks bağlantı noktasını boru ucuna göre yeniden hesapla
    // (Sesli komut akışında ghost updater çalışmaz, bu yüzden burada hesaplanmalı)
    cihaz.yenidenHesaplaGirisOffset(boruUcu.nokta);

    // Fleks uzunluğunu güncelle
    cihaz.fleksGuncelle(boruUcu.nokta);

    // Cihazı components'a ekle (eğer henüz eklenmemişse)
    // Normal icon click workflow'unda placeComponent() ekler,
    // ama K/O shortcuts gibi direkt çağrılarda burada eklemeliyiz
    if (!this.manager.components.includes(cihaz)) {
        //   console.log('[handleCihazEkleme] Cihaz components\'a ekleniyor:', cihaz.cihazTipi);
        this.manager.components.push(cihaz);
    }

    // State'e kaydet
    this.manager.saveToState();

    // Baca gerektiren cihazlar için otomatik baca oluştur (2D ve 3D'de)
    if (cihaz.bacaGerekliMi()) {
        // Baca oluştur - cihaz merkezinden başlayarak sağa doğru 100cm
        const cihazZ = cihaz.z || 0;
        const baca = createBaca(cihaz.x, cihaz.y, cihaz.id, {
            floorId: cihaz.floorId,
            z: cihazZ // Z değerini options'a ekle
        });

        // İlk segment: Sağa doğru 50cm (0.5m) - Z koordinatıyla birlikte
        const ilkSegmentBitis = {
            x: cihaz.x + 80, // 50cm
            y: cihaz.y,
            z: cihazZ // Z değerini ekle
        };
        baca.addSegment(ilkSegmentBitis.x, ilkSegmentBitis.y, ilkSegmentBitis.z);

        // Çizimi bitir - böylece baca seçilebilir ve düzenlenebilir olur
        baca.finishDrawing();

        // Bileşenlere ekle
        this.manager.components.push(baca);

        // Baca dahil state'i kaydet
        this.manager.saveToState();
    }

    // console.log('[handleCihazEkleme] ✓ Cihaz başarıyla eklendi. Toplam components:', this.manager.components.length);
    return true;
}

/**
 * Sayaç/Cihaz boru ortasına ekleme
 * Boruyu böler ve bölünen uç noktaya sayaç/cihaz ekler
 */
export function handleComponentOnPipePlacement(pipe, splitPoint, componentType) {
    // Undo için state kaydet
    saveState();

    // Boruyu böl
    const splitResult = pipe.splitAt(splitPoint);
    if (!splitResult) {
        console.error('Boru bölme başarısız!');
        return false;
    }

    const { boru1, boru2 } = splitResult;

    // Bağlantı: boru1 (gelen) -> sayaç/cihaz -> boru2 (giden)
    boru1.setBitisBaglanti('boru', boru2.id);
    boru2.setBaslangicBaglanti('boru', boru1.id);

    // Listeyi güncelle
    const idx = this.manager.pipes.findIndex(p => p.id === pipe.id);
    if (idx !== -1) this.manager.pipes.splice(idx, 1);
    this.manager.pipes.push(boru1, boru2);
    this.manager.registerPipeNodes(boru1);
    this.manager.registerPipeNodes(boru2);

    // Boru üzerindeki mevcut nesneleri yeni borulara dağıt (vanalar, fleks bağlantılar)
    redistributePipeComponentsInline.call(this, pipe, boru1, boru2, splitPoint);

    // Bölünen noktaya sayaç/cihaz ekle
    if (componentType === 'sayac') {
        // Sayaç ekle - boru2'nin başlangıç noktasına (p1)
        const tempMeter = this.manager.tempComponent;
        if (!tempMeter) return false;

        // Ghost connection bilgisi oluştur (boru2'nin başlangıç ucu)
        tempMeter.ghostConnectionInfo = {
            boruUcu: {
                boruId: boru2.id,
                boru: boru2,
                uc: 'p1',
                nokta: { x: splitPoint.x, y: splitPoint.y, z: splitPoint.z || 0 }
            }
        };

        // Sayaç yerleştirme fonksiyonunu çağır
        const success = this.handleSayacEndPlacement(tempMeter);
        if (success) {
            // Sayaç eklendi — downstream borular artık iç tesisat (TURQUAZ) olmalı
            this.manager.recomputePipeParents();
            recomputeAllPressures(this.manager);
            // Sayacın çıkış noktasından boru çizimi başlat
            const cikisNoktasi = tempMeter.getCikisNoktasi();
            this.startBoruCizim(cikisNoktasi, tempMeter.id, BAGLANTI_TIPLERI.SAYAC);
            this.manager.activeTool = 'boru';
            setMode("plumbingV2", true);
        }
        return success;
    } else if (componentType === 'cihaz') {
        // Cihaz ekle - boru2'nin başlangıç noktasına (p1)
        const tempDevice = this.manager.tempComponent;
        if (!tempDevice) return false;

        // Ghost connection bilgisi oluştur (boru2'nin başlangıç ucu)
        tempDevice.ghostConnectionInfo = {
            boruUcu: {
                boruId: boru2.id,
                boru: boru2,
                uc: 'p1',
                nokta: { x: splitPoint.x, y: splitPoint.y, z: splitPoint.z || 0 }
            }
        };

        // Cihaz yerleştirme fonksiyonunu çağır
        const success = this.handleCihazEkleme(tempDevice);
        if (success) {
            recomputeAllPressures(this.manager);
            // Cihaz eklendikten sonra seç moduna geç
            this.manager.activeTool = null;
            setMode("select", true);
        }
        return success;
    }

    return false;
}

/**
 * Boru bölündüğünde üzerindeki nesneleri (vanalar, fleks bağlantılar) yeni borulara dağıt
 */
function redistributePipeComponentsInline(oldPipe, boru1, boru2, splitPoint) {
    const itemsToReattach = [];

    // Vanalar ve regülatörler (boru üzerinde sabit duranlar)
    const valves = this.manager.components.filter(c => (c.type === 'vana' || c.type === 'regulator') && c.bagliBoruId === oldPipe.id);
    valves.forEach(v => {
        const pos = oldPipe.getPointAt(v.boruPozisyonu !== undefined ? v.boruPozisyonu : 0.5);
        itemsToReattach.push({ comp: v, type: 'vana', worldPos: { x: pos.x, y: pos.y } });
    });

    // Fleks bağlantılar (sayaç/cihaz)
    const flexComponents = this.manager.components.filter(c =>
        (c.type === 'cihaz' || c.type === 'sayac') &&
        c.fleksBaglanti &&
        c.fleksBaglanti.boruId === oldPipe.id
    );
    flexComponents.forEach(c => {
        let pos;
        if (c.fleksBaglanti.endpoint === 'p1') pos = oldPipe.p1;
        else if (c.fleksBaglanti.endpoint === 'p2') pos = oldPipe.p2;
        else {
            const d1 = Math.hypot(c.x - oldPipe.p1.x, c.y - oldPipe.p1.y);
            const d2 = Math.hypot(c.x - oldPipe.p2.x, c.y - oldPipe.p2.y);
            pos = d1 < d2 ? oldPipe.p1 : oldPipe.p2;
        }
        itemsToReattach.push({ comp: c, type: 'fleks', worldPos: { x: pos.x, y: pos.y } });
    });

    // Nesneleri yeni borulara ata
    itemsToReattach.forEach(item => {
        const { comp, type, worldPos } = item;
        const proj1 = boru1.projectPoint(worldPos);
        const proj2 = boru2.projectPoint(worldPos);
        let targetPipe = (proj1.distance < proj2.distance - 0.001) ? boru1 : boru2;
        let targetProj = (targetPipe === boru1) ? proj1 : proj2;

        if (type === 'vana') {
            comp.bagliBoruId = targetPipe.id;
            comp.boruPozisyonu = targetProj.t;
            if (comp.updatePositionFromPipe) comp.updatePositionFromPipe(targetPipe);
        } else if (type === 'fleks') {
            comp.fleksBaglanti.boruId = targetPipe.id;
            const dP1 = Math.hypot(worldPos.x - targetPipe.p1.x, worldPos.y - targetPipe.p1.y);
            const dP2 = Math.hypot(worldPos.x - targetPipe.p2.x, worldPos.y - targetPipe.p2.y);
            comp.fleksBaglanti.endpoint = dP1 < dP2 ? 'p1' : 'p2';
        }
    });

    // Çocuk boruları güncelle (T-bağlantılar)
    this.manager.pipes.forEach(childPipe => {
        if (childPipe.baslangicBaglanti &&
            childPipe.baslangicBaglanti.tip === 'boru' &&
            childPipe.baslangicBaglanti.hedefId === oldPipe.id) {
            // Hangisine daha yakın?
            const proj1 = boru1.projectPoint(childPipe.p1);
            const proj2 = boru2.projectPoint(childPipe.p1);

            if (proj1.distance < proj2.distance) {
                childPipe.baslangicBaglanti.hedefId = boru1.id;
            } else {
                childPipe.baslangicBaglanti.hedefId = boru2.id;
            }
        }
    });

    // Parent boruyu güncelle - eski boruya bağlı olan parent pipe'ın referansını boru1'e güncelle
    const parentPipe = this.manager.pipes.find(p =>
        p.bitisBaglanti &&
        p.bitisBaglanti.tip === 'boru' &&
        p.bitisBaglanti.hedefId === oldPipe.id
    );
    if (parentPipe) {
        parentPipe.bitisBaglanti.hedefId = boru1.id;
    }

    this.manager.saveToState();
}

/**
 * İç tesisat sayaç ekleme - ikinci nokta tıklaması
 * Kesikli boru oluştur + sayacı boru ucuna ekle
 */
export function handleMeterStartPipeSecondClick(endPoint) {
    if (!this.meterStartPoint) return;

    const p1 = this.meterStartPoint;
    // İkinci nokta (sayaç tarafı) ilk noktanın Z kotunu miras alır → hat yatay olsun
    const p2 = { x: endPoint.x, y: endPoint.y, z: p1.z || 0 };

    // Minimum mesafe kontrolü (çok kısa borular olmasın)
    const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (distance < 10) {
        // console.warn('⚠️ Boru çok kısa! En az 10cm olmalı.');
        return;
    }

    // Kesikli temsili boru oluştur
    const temsiliBoru = createBoru(p1, p2);
    temsiliBoru.dagitimTuru = 'KOLON'; // Kolon rengi
    temsiliBoru.lineStyle = 'dashed'; // Kesikli çizim
    temsiliBoru.isTemsiliBoru = true; // Temsili boru işareti

    this.manager.pipes.push(temsiliBoru);
    this.manager.registerPipeNodes(temsiliBoru);

    // Sayaç pozisyon ve rotation hesapla (updateGhostPosition mantığını kullan)
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.hypot(dx, dy);

    // Sayaç her zaman p2 ucunda, p1'e dik konumda
    const fleksUzunluk = 15; // cm

    // Boru açısı
    const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;

    // Sayaç rotasyonu: Boru yönü (p2'den p1'e bakan yön + 90 derece)
    // Sayaç boru hattına dik olacak
    const sayacRotation = boruAci;

    // Geçici sayaç oluştur - POZİSYON ve ROTATION AYARLI
    const tempMeter = createSayac(p2.x, p2.y, {
        floorId: state.currentFloor?.id,
        z: p1.z || 0
    });
    tempMeter.rotation = sayacRotation;

    // Sayacın giriş noktasını hesapla (rotation uygulanmış)
    const girisLocal = tempMeter.getGirisLocalKoordinat();
    const rad = tempMeter.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Giriş noktası boru ucuna (p2) denk gelecek şekilde sayaç merkezini ayarla
    const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
    const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

    // Sayaç merkezi = p2 - giriş_offset - fleks_uzunluk (dik yönde)
    // Perpendicular yön: (-dy/length, dx/length)
    const perpX = -dy / length;
    const perpY = dx / length;

    tempMeter.x = p2.x - girisRotatedX + perpX * fleksUzunluk;
    tempMeter.y = p2.y - girisRotatedY + perpY * fleksUzunluk;

    // Boru p2 ucuna sayaç eklemek için ghost connection bilgisi oluştur
    tempMeter.ghostConnectionInfo = {
        boruUcu: {
            boruId: temsiliBoru.id,
            boru: temsiliBoru,
            uc: 'p2',
            nokta: { x: p2.x, y: p2.y, z: p2.z || 0 }
        }
    };

    // Sayacı boru ucuna ekle (mevcut handleSayacEndPlacement kullan)
    // Bu fonksiyon VANA + FLEKS + SAYAÇ + ÇIKIŞ RİJİT otomatik ekleyecek
    const success = this.handleSayacEndPlacement(tempMeter);

    if (success) {
        // Sayaç eklendi — downstream borular iç tesisat (TURQUAZ) olmalı
        this.manager.recomputePipeParents();

        // Sayacın çıkış noktasından boru çizimi başlat
        const cikisNoktasi = tempMeter.getCikisNoktasi();
        this.startBoruCizim(cikisNoktasi, tempMeter.id, BAGLANTI_TIPLERI.SAYAC);

        // Durumu sıfırla
        this.meterPlacementState = null;
        this.meterStartPoint = null;
        this.meterPreviewEndPoint = null;

        // Boru modunda kal
        this.manager.activeTool = 'boru';
        setMode("plumbingV2", true);

        // console.log('✅ İÇ TESİSAT: Kesikli boru + sayaç başarıyla eklendi.');
    } else {
        // Başarısız olursa temsili boruyu sil
        const index = this.manager.pipes.indexOf(temsiliBoru);
        if (index > -1) {
            this.manager.pipes.splice(index, 1);
        }

        // Durumu sıfırla
        this.meterPlacementState = null;
        this.meterStartPoint = null;
        this.meterPreviewEndPoint = null;

        // console.error('❌ Sayaç eklenemedi!');
    }
}
