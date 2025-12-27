/**
 * Pipe Drawing Handler
 * Boru çizim işlemlerini yönetir
 */

import { createBoru, BAGLANTI_TIPLERI } from '../../objects/pipe.js';
import { createVana } from '../../objects/valve.js';
import { saveState } from '../../../general-files/history.js';
import { setMode } from '../../../general-files/main.js';
import { getObjectsOnPipe, canPlaceValveOnPipe } from '../../utils/placement-utils.js';
import { state } from '../../../general-files/main.js';

/**
 * Boru çizim modunu başlat
 */
export function startBoruCizim(interactionManager, baslangicNoktasi, kaynakId = null, kaynakTip = null, colorGroup = null) {
    // Kaynak borunun renk grubunu belirle
    let kaynakColorGroup = 'YELLOW'; // Varsayılan: Kolon tesisat

    // Eğer colorGroup parametresi verilmişse onu kullan (split gibi durumlarda)
    if (colorGroup) {
        kaynakColorGroup = colorGroup;
    } else if (kaynakId && kaynakTip) {
        // Parametre yoksa, ataları kontrol et
        // Metafor: K→D→B→A takibi, en başta sayaç var mı?
        if (interactionManager.hasAncestorMeter(kaynakId, kaynakTip)) {
            kaynakColorGroup = 'TURQUAZ'; // İç tesisat (sayaç sonrası)
        } else {
            kaynakColorGroup = 'YELLOW'; // Kolon tesisat (sayaç öncesi)
        }
    }

    // Kaynak boru varsa kontrol et (cihaz/sayaç engelleme için)
    if (kaynakTip === BAGLANTI_TIPLERI.BORU && kaynakId) {
        // Kaynak boruyu bul (manager.pipes içinde ara)
        const kaynakBoru = interactionManager.manager.pipes.find(p => p.id === kaynakId);

        if (kaynakBoru) {
            // Tıklanan noktanın hangi uç (p1 mi p2 mi) olduğunu anla
            // Gelen nokta zaten borunun ucu olduğu için mesafe neredeyse 0'dır.
            let hedefUc = null;
            if (Math.hypot(baslangicNoktasi.x - kaynakBoru.p1.x, baslangicNoktasi.y - kaynakBoru.p1.y) < 1) {
                hedefUc = 'p1';
            } else if (Math.hypot(baslangicNoktasi.x - kaynakBoru.p2.x, baslangicNoktasi.y - kaynakBoru.p2.y) < 1) {
                hedefUc = 'p2';
            }

            if (hedefUc) {
                // Cihaz veya Sayaç kontrolü yap
                const cihazVar = interactionManager.hasDeviceAtEndpoint(kaynakId, hedefUc);
                const sayacVar = interactionManager.hasMeterAtEndpoint(kaynakId, hedefUc);

                if (cihazVar || sayacVar) {
                    console.warn("🚫 ENGEL: Bu uçta Cihaz veya Sayaç fleksi var! Tesisat buradan başlatılamaz.");
                    // İşlemi burada sessizce bitir, çizim modu açılmayacak.
                    return;
                }
            }
        }
    }

    interactionManager.boruCizimAktif = true;
    interactionManager.boruBaslangic = {
        nokta: baslangicNoktasi,
        kaynakId: kaynakId,
        kaynakTip: kaynakTip || BAGLANTI_TIPLERI.SERVIS_KUTUSU,
        kaynakColorGroup: kaynakColorGroup // Kaynak borunun renk grubunu sakla
    };
    interactionManager.snapSystem.setStartPoint(baslangicNoktasi);

    // Icon güncellemesi için activeTool'u ayarla
    interactionManager.manager.activeTool = 'boru';
}

/**
 * Boruyu belirtilen noktadan böl ve çizime devam et
 * YÖNTEM: Geometrik Snapshot (Bileşenleri fiziksel konumlarına göre en yakın parçaya dağıtır)
 */
export function handlePipeSplit(interactionManager, pipe, splitPoint, startDrawing = true) {
    // 1. Köşe kontrolü (Çok yakınsa bölme yapma, direkt uçtan başla)
    const CORNER_THRESHOLD = 0.1;
    const distToP1 = Math.hypot(splitPoint.x - pipe.p1.x, splitPoint.y - pipe.p1.y);
    const distToP2 = Math.hypot(splitPoint.x - pipe.p2.x, splitPoint.y - pipe.p2.y);

    if (distToP1 < CORNER_THRESHOLD) {
        if (startDrawing) {
            startBoruCizim(interactionManager, pipe.p1, pipe.id, BAGLANTI_TIPLERI.BORU);
        }
        interactionManager.pipeSplitPreview = null;
        return;
    }
    if (distToP2 < CORNER_THRESHOLD) {
        if (startDrawing) {
            startBoruCizim(interactionManager, pipe.p2, pipe.id, BAGLANTI_TIPLERI.BORU);
        }
        interactionManager.pipeSplitPreview = null;
        return;
    }

    // --- ADIM 1: GEÇİCİ KONUM BELİRLEME (SNAPSHOT) ---
    // Bölünme öncesi, boru üzerindeki tüm bileşenlerin dünya üzerindeki tam konumlarını kaydet.
    // Bu sayede "miras" mantığı yerine "gerçek konum" mantığı kullanılır.
    const itemsToReattach = [];

    // A) Vanaları Kaydet
    const valves = interactionManager.manager.components.filter(c =>
        c.type === 'vana' && c.bagliBoruId === pipe.id
    );
    valves.forEach(v => {
        // Vananın o anki fiziksel konumunu al
        // (getVanaPozisyon yoksa boru üzerindeki orandan hesapla)
        const pos = (pipe.getVanaPozisyon && pipe.getVanaPozisyon()) || pipe.getPointAt(v.boruPozisyonu !== undefined ? v.boruPozisyonu : 0.5);
        itemsToReattach.push({
            comp: v,
            type: 'vana',
            worldPos: { x: pos.x, y: pos.y }
        });
    });

    // B) Cihaz ve Sayaç Flekslerini Kaydet
    const flexComponents = interactionManager.manager.components.filter(c =>
        (c.type === 'cihaz' || c.type === 'sayac') &&
        c.fleksBaglanti && c.fleksBaglanti.boruId === pipe.id
    );
    flexComponents.forEach(c => {
        // Fleksin boruya temas ettiği tam noktayı bul
        let pos;
        if (c.fleksBaglanti.endpoint === 'p1') pos = pipe.p1;
        else if (c.fleksBaglanti.endpoint === 'p2') pos = pipe.p2;
        else {
            // Endpoint verisi bozuksa, cihazın merkezine en yakın boru ucunu al
            const d1 = Math.hypot(c.x - pipe.p1.x, c.y - pipe.p1.y);
            const d2 = Math.hypot(c.x - pipe.p2.x, c.y - pipe.p2.y);
            pos = d1 < d2 ? pipe.p1 : pipe.p2;
        }

        itemsToReattach.push({
            comp: c,
            type: 'fleks',
            worldPos: { x: pos.x, y: pos.y }
        });
    });

    // Undo için state kaydet
    saveState();

    // --- ADIM 2: BÖLME İŞLEMİ ---
    const result = pipe.splitAt(splitPoint);
    if (!result) return;
    const { boru1, boru2, splitT } = result;

    console.log(`[SPLIT] Boru bölündü. SplitT: ${splitT.toFixed(2)}`);

    // Zinciri bağla: boru1 sonu -> boru2 başı
    boru1.setBitisBaglanti('boru', boru2.id);
    boru2.setBaslangicBaglanti('boru', boru1.id);

    // Servis kutusu bağlantısını güncelle (Her zaman başlangıca bağlıdır)
    if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
        const sk = interactionManager.manager.components.find(c => c.id === pipe.baslangicBaglanti.hedefId);
        if (sk && sk.bagliBoruId === pipe.id) {
            sk.baglaBoru(boru1.id);
        }
    }

    // Eski boruyu sil, yenileri ekle
    const idx = interactionManager.manager.pipes.findIndex(p => p.id === pipe.id);
    if (idx !== -1) interactionManager.manager.pipes.splice(idx, 1);
    interactionManager.manager.pipes.push(boru1, boru2);

    // --- ADIM 3: YENİDEN DAĞITIM (Mesafe Bazlı) ---
    // Her bileşeni, kaydettiğimiz konumuna en yakın olan yeni boruya bağla
    itemsToReattach.forEach(item => {
        const { comp, type, worldPos } = item;

        // worldPos noktasının boru1 ve boru2 üzerindeki izdüşümlerini bul
        // projectPoint metodu, noktaya en yakın segment üzerindeki noktayı verir
        const proj1 = boru1.projectPoint(worldPos);
        const proj2 = boru2.projectPoint(worldPos);

        const dist1 = proj1.distance;
        const dist2 = proj2.distance;

        // Hangi boruya daha yakın?
        // Epsilon (0.001) toleransı ile karşılaştır.
        // Eşitlik durumunda (tam kesim noktasında) `boru2` (akış yönündeki sonraki parça) tercih edilir.
        let targetPipe, targetProj;

        if (dist1 < dist2 - 0.001) {
            targetPipe = boru1;
            targetProj = proj1;
        } else {
            targetPipe = boru2;
            targetProj = proj2;
        }

        if (type === 'vana') {
            // Vanayı hedef boruya bağla
            comp.bagliBoruId = targetPipe.id;
            // Yeni boru üzerindeki konumunu (t) güncelle
            comp.boruPozisyonu = targetProj.t;

            // Görsel konumu güncelle (emin olmak için)
            if (comp.updatePositionFromPipe) {
                comp.updatePositionFromPipe(targetPipe);
            }
            console.log(`[SPLIT-REMAP] Vana -> ${targetPipe === boru1 ? 'Parça 1' : 'Parça 2'}`);
        }
        else if (type === 'fleks') {
            // Cihaz/Sayaç fleks bağlantısı
            comp.fleksBaglanti.boruId = targetPipe.id;

            // Hedef borunun HANGİ UCUNA daha yakın? (p1 mi p2 mi?)
            const dP1 = Math.hypot(worldPos.x - targetPipe.p1.x, worldPos.y - targetPipe.p1.y);
            const dP2 = Math.hypot(worldPos.x - targetPipe.p2.x, worldPos.y - targetPipe.p2.y);

            comp.fleksBaglanti.endpoint = dP1 < dP2 ? 'p1' : 'p2';

            console.log(`[SPLIT-REMAP] ${comp.type} -> ${targetPipe === boru1 ? 'Parça 1' : 'Parça 2'} (${comp.fleksBaglanti.endpoint})`);
        }
    });

    // State'i senkronize et
    interactionManager.manager.saveToState();

    // Split noktasından boru çizimi başlat (akış yönünde devam et -> boru2.id)
    if (startDrawing) {
        startBoruCizim(interactionManager, splitPoint, boru2.id, BAGLANTI_TIPLERI.BORU);
    }

    // Preview'ı temizle
    interactionManager.pipeSplitPreview = null;
}

/**
 * Boru çizimde tıklama
 */
export function handleBoruClick(interactionManager, point) {
    if (!interactionManager.boruBaslangic) return;

    // Undo için state kaydet (her boru için ayrı undo entry)
    saveState();

    const boru = createBoru(interactionManager.boruBaslangic.nokta, point, 'STANDART');
    boru.floorId = state.currentFloorId;

    boru.colorGroup = interactionManager.boruBaslangic.kaynakColorGroup || 'YELLOW';


    if (interactionManager.boruBaslangic.kaynakId) {
        boru.setBaslangicBaglanti(
            interactionManager.boruBaslangic.kaynakTip,
            interactionManager.boruBaslangic.kaynakId
        );

        // Servis kutusu bağlantısını kur
        if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
            const servisKutusu = interactionManager.manager.components.find(
                c => c.id === interactionManager.boruBaslangic.kaynakId && c.type === 'servis_kutusu'
            );
            if (servisKutusu) {
                servisKutusu.baglaBoru(boru.id);
            }
        }

        // Sayaç bağlantısını kur
        if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
            const sayac = interactionManager.manager.components.find(
                c => c.id === interactionManager.boruBaslangic.kaynakId && c.type === 'sayac'
            );
            if (sayac) {
                sayac.baglaCikis(boru.id);
            }
        }
    }

    interactionManager.manager.pipes.push(boru);

    // ✨ Sayaç sonrası boruları TURQUAZ yap (boru eklendikten SONRA)
    if (interactionManager.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
        const sayac = interactionManager.manager.components.find(
            c => c.id === interactionManager.boruBaslangic.kaynakId && c.type === 'sayac'
        );
        if (sayac) {
            interactionManager.manager.updatePipeColorsAfterMeter(sayac.id);
        }
    }

    // State'i senkronize et
    interactionManager.manager.saveToState();

    interactionManager.boruBaslangic = {
        nokta: point,
        kaynakId: boru.id,
        kaynakTip: BAGLANTI_TIPLERI.BORU,
        kaynakColorGroup: boru.colorGroup // ✨ Rengi devret!
    };
    interactionManager.snapSystem.setStartPoint(point);
}

/**
 * Ölçüyü uygula (Enter tuşuna basıldığında)
 */
export function applyMeasurement(interactionManager) {
    if (!interactionManager.boruBaslangic) return;

    const measurement = parseFloat(interactionManager.measurementInput);
    if (isNaN(measurement) || measurement <= 0) {
        interactionManager.measurementInput = '';
        interactionManager.measurementActive = false;
        return;
    }

    // Eğer geciciBoruBitis yoksa veya geçersizse, yönü hesapla
    let targetPoint = interactionManager.geciciBoruBitis;

    if (!targetPoint) {
        // Varsayılan yön: sağa doğru (pozitif X ekseni)
        targetPoint = {
            x: interactionManager.boruBaslangic.nokta.x + measurement,
            y: interactionManager.boruBaslangic.nokta.y
        };
    } else {
        // Mevcut yönü kullanarak ölçüyü uygula
        const dx = targetPoint.x - interactionManager.boruBaslangic.nokta.x;
        const dy = targetPoint.y - interactionManager.boruBaslangic.nokta.y;
        const currentLength = Math.hypot(dx, dy);

        if (currentLength > 0.1) {
            // Yönü normalize et ve ölçü kadar uzat
            const dirX = dx / currentLength;
            const dirY = dy / currentLength;

            targetPoint = {
                x: interactionManager.boruBaslangic.nokta.x + dirX * measurement,
                y: interactionManager.boruBaslangic.nokta.y + dirY * measurement
            };
        } else {
            // Çok kısa mesafe, varsayılan yön kullan
            targetPoint = {
                x: interactionManager.boruBaslangic.nokta.x + measurement,
                y: interactionManager.boruBaslangic.nokta.y
            };
        }
    }

    // Boruyu oluştur
    handleBoruClick(interactionManager, targetPoint);

    // Ölçü girişini sıfırla
    interactionManager.measurementInput = '';
    interactionManager.measurementActive = false;
}

/**
 * Mevcut işlemi iptal et
 */
export function cancelCurrentAction(interactionManager) {
    if (interactionManager.boruCizimAktif) {
        interactionManager.boruCizimAktif = false;
        interactionManager.boruBaslangic = null;
        interactionManager.geciciBoruBitis = null;
        interactionManager.snapSystem.clearStartPoint();
    }

    // Ölçü girişini sıfırla
    interactionManager.measurementInput = '';
    interactionManager.measurementActive = false;

    if (interactionManager.manager.tempComponent) {
        interactionManager.manager.tempComponent = null;
    }

    interactionManager.manager.activeTool = null;

    // Sayaç yerleştirme durumunu sıfırla
    interactionManager.meterPlacementState = null;
    interactionManager.meterStartPoint = null;
    interactionManager.meterPreviewEndPoint = null;

    // Seçimi temizle
    interactionManager.deselectObject();
}

/**
 * Projede servis kutusu var mı kontrol et
 */
export function hasServisKutusu(interactionManager) {
    return interactionManager.manager.components.some(c => c.type === 'servis_kutusu');
}

/**
 * Geçici boru çizgisi bilgisini al
 */
export function getGeciciBoruCizgisi(interactionManager) {
    if (!interactionManager.boruCizimAktif || !interactionManager.boruBaslangic || !interactionManager.geciciBoruBitis) {
        return null;
    }
    return { p1: interactionManager.boruBaslangic.nokta, p2: interactionManager.geciciBoruBitis };
}
