/**
 * Interaction Manager (v2)
 * Kullanıcı etkileşimlerini yönetir - yeni bileşenlerle entegre
 */

import { TesisatSnapSystem } from './tesisat-snap.js';
import { ServisKutusu } from '../objects/service-box.js';
import { Boru, createBoru, BAGLANTI_TIPLERI } from '../objects/pipe.js';
import { Sayac, createSayac } from '../objects/meter.js';
import { Vana, createVana } from '../objects/valve.js';
import { Cihaz, createCihaz } from '../objects/device.js';
import { screenToWorld } from '../../draw/geometry.js';
import { dom, state, setMode, setState, setDrawingMode } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { update3DScene } from '../../scene3d/scene3d-update.js';
import { canPlaceValveOnPipe, getObjectsOnPipe } from '../utils/placement-utils.js';

// Tool modları
export const TESISAT_MODLARI = {
    NONE: null,
    SERVIS_KUTUSU: 'servis_kutusu',
    BORU: 'boru',
    SAYAC: 'sayac',
    VANA: 'vana',
    CIHAZ: 'cihaz'
};

export class InteractionManager {
    constructor(manager) {
        this.manager = manager;
        this.snapSystem = new TesisatSnapSystem(manager);
        this.activeSnap = null;

        // Son bilinen mouse pozisyonu (world koordinatlarında)
        this.lastMousePoint = null;

        // Boru çizim durumu
        this.boruCizimAktif = false;
        this.boruBaslangic = null;
        this.geciciBoruBitis = null;

        // Ölçü girişi
        this.measurementInput = '';
        this.measurementActive = false;

        // Sürükleme durumu
        this.isDragging = false;
        this.dragStart = null;
        this.dragObject = null;

        // Döndürme durumu
        this.isRotating = false;
        this.rotationOffset = 0;

        // Seçili nesne
        this.selectedObject = null;
        this.selectedValve = null; // { pipe, vana }

        // Boru uç noktası snap lock (duvar node snap gibi)
        this.pipeEndpointSnapLock = null;
        this.pipeSnapMouseStart = null; // Snap başladığı andaki mouse pozisyonu

        // Pipe splitting preview (boru tool aktif, boruCizimAktif değil)
        this.pipeSplitPreview = null; // { pipe, point }

        // Vana preview (vana tool aktif)
        this.vanaPreview = null; // { pipe, point, t, snapToEnd }

        // İç tesisat (servis kutusu olmadan) sayaç yerleştirme durumu
        this.meterPlacementState = null; // null, 'drawing_start_pipe'
        this.meterStartPoint = null; // Kesikli borunun başlangıç noktası
        this.meterPreviewEndPoint = null; // Preview için geçici bitiş noktası
    }

    /**
     * Mouse hareketi
     */
    handlePointerMove(e) {
        if (!this.manager.activeTool && !this.isDragging && !this.isRotating && !this.boruCizimAktif) {
            return false;
        }

        const rect = dom.c2d.getBoundingClientRect();
        const mouseScreenX = e.clientX - rect.left;
        const mouseScreenY = e.clientY - rect.top;
        const point = screenToWorld(mouseScreenX, mouseScreenY);
        const walls = state.walls;

        // Son mouse pozisyonunu kaydet
        this.lastMousePoint = point;

        // Debug: Mouse koordinatları (sadece cihaz ghost için, ilk 3 kez)
        if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && !this._mouseDebugCount) {
            this._mouseDebugCount = 0;
        }
        if (this.manager.activeTool === 'cihaz' && this.manager.tempComponent && this._mouseDebugCount < 3) {
            console.log('🖱️ MOUSE DEBUG:', {
                'screen (CSS px)': `(${mouseScreenX.toFixed(1)}, ${mouseScreenY.toFixed(1)})`,
                'world': `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
                'canvas size': `${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`
            });
            this._mouseDebugCount++;
        }

        // Snap hesapla
        this.activeSnap = this.snapSystem.getSnapPoint(point, walls);
        const targetPoint = this.activeSnap
            ? { x: this.activeSnap.x, y: this.activeSnap.y }
            : point;

        // 0. İç tesisat sayaç ekleme - kesikli boru çizim modu
        if (this.meterPlacementState === 'drawing_start_pipe' && this.meterStartPoint) {
            // Preview için bitiş noktasını güncelle
            this.meterPreviewEndPoint = targetPoint;

            // Sayaç ghost'unu güncelle (mevcut ghost sistemi)
            if (this.manager.tempComponent && this.manager.tempComponent.type === 'sayac') {
                const p1 = this.meterStartPoint;
                const p2 = targetPoint;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const length = Math.hypot(dx, dy);

                // Boru açısı
                const boruAci = Math.atan2(dy, dx) * 180 / Math.PI;
                const fleksUzunluk = 15; // cm

                // Perpendicular yön
                const perpX = -dy / length;
                const perpY = dx / length;

                // Sayaç rotation
                this.manager.tempComponent.rotation = boruAci;

                // Sayaç pozisyon (giriş noktası p2'de olacak)
                const girisLocal = this.manager.tempComponent.getGirisLocalKoordinat();
                const rad = this.manager.tempComponent.rotation * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const girisRotatedX = girisLocal.x * cos - girisLocal.y * sin;
                const girisRotatedY = girisLocal.x * sin + girisLocal.y * cos;

                // Mouse pozisyonu = fleks ucu (giriş noktası)
                this.manager.tempComponent.x = p2.x - girisRotatedX;
                this.manager.tempComponent.y = p2.y - girisRotatedY;
            }

            return true;
        }

        // 1. Boru çizim modunda
        if (this.boruCizimAktif) {
            // Eğer ölçü girişi aktifse, o ölçüye göre hedef noktayı ayarla
            if (this.measurementActive && this.measurementInput.length > 0) {
                const measurement = parseFloat(this.measurementInput);
                if (!isNaN(measurement) && measurement > 0) {
                    // Yönü hesapla (başlangıçtan mouse'a doğru)
                    const dx = targetPoint.x - this.boruBaslangic.nokta.x;
                    const dy = targetPoint.y - this.boruBaslangic.nokta.y;
                    const currentLength = Math.hypot(dx, dy);

                    if (currentLength > 0) {
                        // Normalize et ve ölçü kadar uzat
                        const dirX = dx / currentLength;
                        const dirY = dy / currentLength;

                        this.geciciBoruBitis = {
                            x: this.boruBaslangic.nokta.x + dirX * measurement,
                            y: this.boruBaslangic.nokta.y + dirY * measurement
                        };
                    } else {
                        this.geciciBoruBitis = targetPoint;
                    }
                } else {
                    this.geciciBoruBitis = targetPoint;
                }
            } else {
                this.geciciBoruBitis = targetPoint;
            }
            return true;
        }

        // 1.5 Boru tool aktif ama çizim modu değil - Pipe splitting preview
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
            // Mouse altında boru var mı kontrol et
            const hoveredPipe = this.findPipeAt(point, 10);
            if (hoveredPipe) {
                // Split noktasını hesapla
                const proj = hoveredPipe.projectPoint(point);
                if (proj && proj.onSegment) {
                    let splitPoint = { x: proj.x, y: proj.y };

                    // Köşelere snap - boru uçlarına yakınsa
                    const CORNER_SNAP_DISTANCE = 10; // 10 cm
                    const distToP1 = Math.hypot(splitPoint.x - hoveredPipe.p1.x, splitPoint.y - hoveredPipe.p1.y);
                    const distToP2 = Math.hypot(splitPoint.x - hoveredPipe.p2.x, splitPoint.y - hoveredPipe.p2.y);

                    if (distToP1 < CORNER_SNAP_DISTANCE) {
                        // p1'e snap
                        splitPoint = { x: hoveredPipe.p1.x, y: hoveredPipe.p1.y };
                    } else if (distToP2 < CORNER_SNAP_DISTANCE) {
                        // p2'ye snap
                        splitPoint = { x: hoveredPipe.p2.x, y: hoveredPipe.p2.y };
                    }

                    this.pipeSplitPreview = {
                        pipe: hoveredPipe,
                        point: splitPoint
                    };
                } else {
                    this.pipeSplitPreview = null;
                }
            } else {
                this.pipeSplitPreview = null;
            }
            return true;
        } else {
            // Boru tool aktif değilse preview'ı temizle
            this.pipeSplitPreview = null;
        }

        // 1.6 Vana tool aktif - Vana preview
        if (this.manager.activeTool === 'vana' && !this.boruCizimAktif) {
            // Ghost pozisyonunu güncelle (tempComponent mouse'u takip etmeli)
            if (this.manager.tempComponent) {
                this.manager.tempComponent.x = point.x;
                this.manager.tempComponent.y = point.y;
            }

            // Mouse altında boru var mı kontrol et (5 cm yakalama mesafesi)
            const hoveredPipe = this.findPipeAt(point, 5);
            if (hoveredPipe) {
                // Boruda vana varsa da preview göster (boru bölünecek)
                // Boru üzerindeki pozisyonu hesapla
                const proj = hoveredPipe.projectPoint(point);
                if (proj && proj.onSegment) {
                    let vanaPoint = { x: proj.x, y: proj.y };
                    let vanaT = proj.t;
                    let snapToEnd = false;

                    // Boru uçlarına snap - 10 cm tolerance
                    const END_SNAP_DISTANCE = 10;
                    const distToP1 = Math.hypot(proj.x - hoveredPipe.p1.x, proj.y - hoveredPipe.p1.y);
                    const distToP2 = Math.hypot(proj.x - hoveredPipe.p2.x, proj.y - hoveredPipe.p2.y);

                    // Vana mesafesi hesapla (armLength + vana genişliği/2)
                    const DIRSEK_KOL_UZUNLUGU = 4; // cm
                    const VANA_GENISLIGI = 8; // cm (vana kare boyutu)
                    const vanaMesafesi = DIRSEK_KOL_UZUNLUGU + VANA_GENISLIGI / 2; // 7 cm
                    const pipeLength = hoveredPipe.uzunluk;

                    if (distToP1 < END_SNAP_DISTANCE) {
                        // p1'e snap - vana içeri alınmış pozisyonda göster
                        const adjustedT = Math.min(vanaMesafesi / pipeLength, 0.95);
                        vanaPoint = hoveredPipe.getPointAt(adjustedT);
                        vanaT = 0; // Snap için t=0 (uç nokta)
                        snapToEnd = true;
                    } else if (distToP2 < END_SNAP_DISTANCE) {
                        // p2'ye snap - vana içeri alınmış pozisyonda göster
                        const adjustedT = Math.max(1 - (vanaMesafesi / pipeLength), 0.05);
                        vanaPoint = hoveredPipe.getPointAt(adjustedT);
                        vanaT = 1; // Snap için t=1 (uç nokta)
                        snapToEnd = true;
                    }

                    this.vanaPreview = {
                        pipe: hoveredPipe,
                        point: vanaPoint,
                        t: vanaT,
                        snapToEnd: snapToEnd
                    };
                } else {
                    this.vanaPreview = null;
                }
            } else {
                this.vanaPreview = null;
            }
            return true;
        } else {
            // Vana tool aktif değilse preview'ı temizle
            this.vanaPreview = null;
        }

        // 2. Ghost eleman yerleştirme
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.updateGhostPosition(this.manager.tempComponent, targetPoint, this.activeSnap);
            return true;
        }

        // 3. Döndürme
        if (this.isRotating && this.dragObject) {
            this.handleRotation(point);
            return true;
        }

        // 4. Sürükleme - raw point kullan (handleDrag içinde gerekli snap yapılır)
        if (this.isDragging && this.dragObject) {
            this.handleDrag(point);
            return true;
        }

        return false;
    }

    /**
     * Mouse tıklama
     */
    handlePointerDown(e) {
        const rect = dom.c2d.getBoundingClientRect();
        const point = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const targetPoint = this.activeSnap
            ? { x: this.activeSnap.x, y: this.activeSnap.y }
            : point;

        //console.log('[POINTER DOWN] activeTool:', this.manager.activeTool, 'tempComponent:', this.manager.tempComponent?.type);

        // 0.4 Vana ekleme - Vana tool aktif ve preview var
        if (this.manager.activeTool === 'vana' && !this.boruCizimAktif && this.vanaPreview) {
            this.handleVanaPlacement(this.vanaPreview);
            return true;
        }

        // 0.5 Pipe splitting - Boru tool aktif ama çizim modu değil
        if (this.manager.activeTool === 'boru' && !this.boruCizimAktif && this.pipeSplitPreview) {
            this.handlePipeSplit(this.pipeSplitPreview.pipe, this.pipeSplitPreview.point);
            return true;
        }

        // 1. Boru çizim modunda tıklama
        if (this.boruCizimAktif) {
            this.handleBoruClick(targetPoint);
            return true;
        }

        // 1.5. İç tesisat sayaç yerleştirme - ikinci nokta tıklaması
        if (this.meterPlacementState === 'drawing_start_pipe' && this.meterStartPoint) {
            // İkinci tıklama: Kesikli boru oluştur + sayaç ekle
            this.handleMeterStartPipeSecondClick(targetPoint);
            return true;
        }

        // 2. Yerleştirme modu (ghost var ve araç aktif)
        if (this.manager.activeTool && this.manager.tempComponent) {
            this.placeComponent(targetPoint);
            return true;
        }

        // 3. Nesne seçimi ve sürükleme - SEÇ, TESİSAT VE KARMA MODLARINDA
        const isSelectionMode = state.currentMode === 'select' ||
            state.currentMode === 'plumbingV2' ||
            state.currentMode === 'MİMARİ-TESİSAT';

        if (isSelectionMode) {
            // Önce seçili nesnenin döndürme tutamacını kontrol et (servis kutusu, cihaz ve sayaç)
            if (this.selectedObject && (this.selectedObject.type === 'servis_kutusu' || this.selectedObject.type === 'cihaz' || this.selectedObject.type === 'sayac')) {
                if (this.findRotationHandleAt(this.selectedObject, point, 12)) {
                    this.startRotation(this.selectedObject, point);
                    return true;
                }
            }

            // --- VANA KONTROLÜ (EN YÜKSEK ÖNCELİK VE HASSASİYET) ---
            // Doğrudan bileşen listesinden, 0 tolerans ile (containsPoint varsayılanı)
            const clickedValve = this.manager.components.find(c => c.type === 'vana' && c.containsPoint(point));

            if (clickedValve) {
                // Vana seçildi
                // Bağlı olduğu boruyu bul
                const pipe = clickedValve.bagliBoruId ? this.manager.pipes.find(p => p.id === clickedValve.bagliBoruId) : null;

                // Vanayı seç
                this.selectValve(pipe, clickedValve);

                // Sürükleme işlemini başlat (Bunu eklemezsek "kilitlendi" gibi hissedilir)
                this.startDrag(clickedValve, point);

                return true;
            }

            // --- SAYAÇ KONTROLÜ (Boru modunda sayaca tıklanırsa çıkış ucundan başla) ---
            if (this.manager.activeTool === 'boru' && !this.boruCizimAktif) {
                const clickedMeter = this.manager.components.find(c =>
                    c.type === 'sayac' && c.containsPoint && c.containsPoint(point)
                );
                if (clickedMeter) {
                    //  console.log('🎯 SAYAÇ BULUNDU, çıkış ucundan boru başlatılıyor:', clickedMeter.id);
                    const cikisNoktasi = clickedMeter.getCikisNoktasi();
                    this.startBoruCizim(cikisNoktasi, clickedMeter.id, BAGLANTI_TIPLERI.SAYAC);
                    return true;
                }
            }

            // Sonra boru uç noktası kontrolü yap (ÖNCE NOKTA - body'den önce)
            const boruUcu = this.findBoruUcuAt(point, 10); // Nokta seçimi için 2.5 cm tolerance (daha hassas)
            if (boruUcu) {
                // console.log('🎯 BORU UCU BULUNDU:', boruUcu.uc, boruUcu.boruId);
                const pipe = this.manager.pipes.find(p => p.id === boruUcu.boruId);
                if (pipe) {
                    // Eğer boru aracı aktifse, o uçtan boru çizimi başlat
                    if (this.manager.activeTool === 'boru') {
                        const deviceVar = this.hasDeviceAtEndpoint(pipe.id, boruUcu.uc);
                        const meterVar = this.hasMeterAtEndpoint(pipe.id, boruUcu.uc);

                        if (deviceVar || meterVar) {
                            console.warn("🚫 Bu uçta Cihaz/Sayaç fleksi var! Tesisat devam ettirilemez.");
                            return true; // Çizimi başlatmadan fonksiyondan çık
                        }
                        const ucNokta = boruUcu.uc === 'p1' ? pipe.p1 : pipe.p2;
                        this.startBoruCizim(ucNokta, pipe.id, BAGLANTI_TIPLERI.BORU);
                        return true;
                    }

                    // Servis kutusuna veya sayaca bağlı boru ucunun taşınmasını engelle
                    const ucBaglanti = boruUcu.uc === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
                    if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                        // Sadece seç, taşıma başlatma
                        this.selectObject(pipe);
                        return true;
                    }

                    // Yoksa boruyu seç ve uç nokta sürüklemesi başlat
                    this.selectObject(pipe);
                    this.startEndpointDrag(pipe, boruUcu.uc, point);
                    return true;
                }
            }

            // Sonra nesne seçimi (Boru vs)
            const hitObject = this.findObjectAt(point);
            if (hitObject) {
                //  console.log('📦 NESNE BULUNDU:', hitObject.type, hitObject.id);
                this.selectObject(hitObject);
                // Boru gövdesi için body sürükleme, diğerleri için normal sürükleme
                if (hitObject.type === 'boru') {
                    // Kutuya bağlı boruların gövdesi taşınmasın
                    const bagliKutu = this.manager.components.find(c =>
                        c.type === 'servis_kutusu' && c.bagliBoruId === hitObject.id
                    );

                    if (bagliKutu) {
                        // Kutuya bağlı boru, gövde sürükleme yapma (ama seçimi koru)
                        return true;
                    }

                    // Sayaca bağlı boruların gövdesi de taşınmasın
                    if (hitObject.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC ||
                        hitObject.bitisBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
                        // Sayaca bağlı boru, gövde sürükleme yapma (ama seçimi koru)
                        return true;
                    }

                    this.startBodyDrag(hitObject, point);
                } else {
                    this.startDrag(hitObject, point);
                }
                return true;
            }
        }

        // Seç modunda çizim başlatma - boş alana tıklandı
        if (isSelectionMode) {
            this.deselectObject();
            return false;
        }

        // 4. Bileşen çıkış noktasından çizim başlat (servis kutusu, sayaç vb.)
        const bilesenCikis = this.findBilesenCikisAt(point);
        if (bilesenCikis) {
            // Bileşen tipine göre bağlantı tipi belirle
            const baglantiTip = bilesenCikis.tip === 'servis_kutusu'
                ? BAGLANTI_TIPLERI.SERVIS_KUTUSU
                : bilesenCikis.tip === 'sayac'
                    ? BAGLANTI_TIPLERI.SAYAC
                    : BAGLANTI_TIPLERI.BORU;
            this.startBoruCizim(bilesenCikis.nokta, bilesenCikis.bilesenId, baglantiTip);
            return true;
        }

        // 5. Boru ucu veya gövdesinden çizim başlat
        const boruUcu = this.findBoruUcuAt(point, 8);
        if (boruUcu) {
            const deviceVar = this.hasDeviceAtEndpoint(boruUcu.boruId, boruUcu.uc);
            const meterVar = this.hasMeterAtEndpoint(boruUcu.boruId, boruUcu.uc);

            if (deviceVar || meterVar) {
                console.warn("🚫 Bu uçta Cihaz/Sayaç fleksi var! Tesisat devam ettirilemez.");
                return true; // Çizimi başlatmadan fonksiyondan çık
            }

            this.startBoruCizim(boruUcu.nokta, boruUcu.boruId, BAGLANTI_TIPLERI.BORU);
            return true;
        }

        // 6. Boru gövdesinden çizim başlat
        const boruGovde = this.findBoruGovdeAt(point);
        if (boruGovde) {
            // ÖNEMLİ: Servis kutusu/sayaç çıkışına bağlı borunun gövdesinden çizim başlatma!
            // (Split olursa p1 noktası kayabilir - yutulma sorunu)
            const targetPipe = this.manager.pipes.find(p => p.id === boruGovde.boruId);
            if (targetPipe) {
                if (targetPipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ||
                    targetPipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
                    console.warn('🚫 ENGEL: Servis kutusu/sayaç çıkışına bağlı borunun gövdesinden çizim başlatılamaz! (Yutulma koruması)');
                    alert('⚠️ Bu boru servis kutusu/sayaç çıkışına bağlı. Gövdesinden yeni hat başlatılamaz!');
                    return true;
                }
            }
            this.startBoruCizim(boruGovde.nokta, boruGovde.boruId, BAGLANTI_TIPLERI.BORU);
            return true;
        }

        // 7. Boş alana tıklama - seçimi kaldır
        this.deselectObject();
        return false;
    }

    /**
     * Mouse bırakma
     */
    handlePointerUp(e) {
        if (this.isRotating) {
            this.endRotation();
            return true;
        }
        if (this.isDragging) {
            this.endDrag();
            return true;
        }
        return false;
    }

    /**
     * Klavye
     */
    handleKeyDown(e) {
        // Input alanlarında yazarken klavye kısayollarını tetikleme
        const activeElement = document.activeElement;
        const isTyping = activeElement && (
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA' ||
            activeElement.contentEditable === 'true'
        );

        // Eğer kullanıcı bir input alanında yazıyorsa, ESC ve Delete dışındaki kısayolları devre dışı bırak
        if (isTyping && e.key !== 'Escape' && e.key !== 'Delete') {
            return false;
        }

        // Boru çizim modunda ölçü girişi
        if (this.boruCizimAktif && this.boruBaslangic) {
            // Rakam girişi (0-9)
            if (/^[0-9]$/.test(e.key)) {
                this.measurementInput += e.key;
                this.measurementActive = true;
                return true;
            }

            // Backspace - son rakamı sil
            if (e.key === 'Backspace' && this.measurementInput.length > 0) {
                this.measurementInput = this.measurementInput.slice(0, -1);
                if (this.measurementInput.length === 0) {
                    this.measurementActive = false;
                }
                return true;
            }

            // Enter - ölçüyü uygula
            if (e.key === 'Enter' && this.measurementInput.length > 0) {
                this.applyMeasurement();
                return true;
            }
        }

        // ESC - iptal ve seç moduna geç
        if (e.key === 'Escape') {
            this.cancelCurrentAction();
            setMode("select");
            return true;
        }

        // K - Kombi ekle (Ghost mod)
        if (e.key === 'k' || e.key === 'K') {
            // Önceki modu kaydet
            this.previousMode = state.currentMode;
            this.previousDrawingMode = state.currentDrawingMode;
            this.previousActiveTool = this.manager.activeTool;

            // TESİSAT moduna geç
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }

            // Mevcut eylemleri iptal et
            this.cancelCurrentAction();

            // DÜZELTİLDİ: Parametre nesne olarak gönderilmeli
            this.manager.startPlacement('cihaz', { cihazTipi: 'KOMBI' });
            setMode("plumbingV2", true);

            return true;
        }

        // O - Ocak ekle (Ghost mod)
        if (e.key === 'o' || e.key === 'O') {
            // Önceki modu kaydet
            this.previousMode = state.currentMode;
            this.previousDrawingMode = state.currentDrawingMode;
            this.previousActiveTool = this.manager.activeTool;
            this.cancelCurrentAction();

            // TESİSAT moduna geç
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }

            // Mevcut eylemleri iptal et
            this.cancelCurrentAction();

            // DÜZELTİLDİ: Parametre nesne olarak gönderilmeli
            // Eskiden sadece 'OCAK' stringi gönderildiği için varsayılan (KOMBI) seçiliyordu.
            this.manager.startPlacement('cihaz', { cihazTipi: 'OCAK' });
            setMode("plumbingV2", true);

            return true;
        }

        // S - Sayaç ekle (Ghost mod)
        if (e.key === 's' || e.key === 'S') {
            // Önceki modu kaydet
            this.previousMode = state.currentMode;
            this.previousDrawingMode = state.currentDrawingMode;
            this.previousActiveTool = this.manager.activeTool;

            // TESİSAT moduna geç
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }

            // Mevcut eylemleri iptal et
            this.cancelCurrentAction();

            // Sayaç ghost modunu başlat
            this.manager.startPlacement(TESISAT_MODLARI.SAYAC);
            setMode("plumbingV2", true);

            return true;
        }

        // V - Vana ekle (Ghost mod)
        if (e.key === 'v' || e.key === 'V') {
            // Önceki modu kaydet
            this.previousMode = state.currentMode;
            this.previousDrawingMode = state.currentDrawingMode;
            this.previousActiveTool = this.manager.activeTool;

            // TESİSAT moduna geç
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }

            // Mevcut eylemleri iptal et
            this.cancelCurrentAction();

            // Vana ghost modunu başlat
            this.manager.startPlacement(TESISAT_MODLARI.VANA);
            setMode("plumbingV2", true);

            return true;
        }

        // T - BORU çizme modu (boru icon'unu aktif et)
        if (e.key === 't' || e.key === 'T') {
            // TESİSAT modunda olduğumuzdan emin ol
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }

            // Boru modunu başlat
            this.manager.startPipeMode();

            // UI ikonunu güncelle
            setMode("plumbingV2", true);
            return true;
        }

        // Delete - seçili nesneyi sil
        if (e.key === 'Delete') {
            // Hem this.selectedObject hem de state.selectedObject'i kontrol et
            if (this.selectedObject) {
                this.deleteSelectedObject();
                return true;
            }
            // Eğer this.selectedObject null ama state.selectedObject varsa, önce seç sonra sil
            if (!this.selectedObject && state.selectedObject) {
                const stateObj = state.selectedObject;
                // V2 plumbing nesnesi mi kontrol et
                if (stateObj && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(stateObj.type)) {
                    // Nesneyi bul ve seç
                    const obj = stateObj.object;
                    if (obj) {
                        // this.selectedObject'i senkronize et
                        this.selectedObject = obj;
                        // Şimdi sil
                        this.deleteSelectedObject();
                        return true;
                    }
                }
            }
        }

        // Ok tuşları - seçili boru navigasyonu
        if (this.selectedObject && this.selectedObject.type === 'boru') {
            const tolerance = 1;
            const selectedPipe = this.selectedObject;

            // ArrowRight veya ArrowUp: sonraki boru (p2'ye bağlı boru)
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                const nextPipe = this.manager.pipes.find(p =>
                    p.id !== selectedPipe.id &&
                    Math.hypot(p.p1.x - selectedPipe.p2.x, p.p1.y - selectedPipe.p2.y) < tolerance
                );
                if (nextPipe) {
                    this.selectObject(nextPipe);
                    return true;
                }
            }

            // ArrowLeft veya ArrowDown: önceki boru (p1'e bağlı boru)
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                const prevPipe = this.manager.pipes.find(p =>
                    p.id !== selectedPipe.id &&
                    Math.hypot(p.p2.x - selectedPipe.p1.x, p.p2.y - selectedPipe.p1.y) < tolerance
                );
                if (prevPipe) {
                    this.selectObject(prevPipe);
                    return true;
                }
            }
        }

        // Ok tuşları - seçili sayacı hareket ettir
        if (this.selectedObject && this.selectedObject.type === 'sayac') {
            const direction = {
                'ArrowUp': 'up',
                'ArrowDown': 'down',
                'ArrowLeft': 'left',
                'ArrowRight': 'right'
            }[e.key];

            if (direction) {
                const result = this.selectedObject.moveByKey(direction);
                this.updateConnectedPipe(result);
                return true;
            }
        }

        // R tuşu - seçili servis kutusunu döndür (çıkış noktası etrafında)
        if (this.selectedObject && this.selectedObject.type === 'servis_kutusu' && e.key === 'r') {
            saveState();
            const deltaDerece = e.shiftKey ? -15 : 15; // Shift ile ters yön
            const result = this.selectedObject.rotate(deltaDerece);
            this.updateConnectedPipe(result);
            this.manager.saveToState();
            return true;
        }

        return false;
    }

    /**
     * Ghost pozisyon güncelleme
     */
    updateGhostPosition(ghost, point, snap) {
        // Debug: İlk 3 güncellemede koordinat sistemi kontrolü
        if (ghost.type === 'cihaz' && !this._debugCount) this._debugCount = 0;
        if (ghost.type === 'cihaz' && this._debugCount < 3) {
            console.log('🐛 CIHAZ GHOST DEBUG:', {
                'zoom': state.zoom,
                'panOffset': `(${state.panOffset.x}, ${state.panOffset.y})`,
                'point (world)': `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
                'DPR': window.devicePixelRatio
            });
            this._debugCount++;
        }

        // Cihaz için: boru ucuna snap yap, fleks etrafında mouse ile hareket et
        if (ghost.type === 'cihaz') {
            // En yakın SERBEST boru ucunu bul (T-junction'ları atla)
            const boruUcu = this.findBoruUcuAt(point, 72, true); // onlyFreeEndpoints = true

            if (boruUcu && boruUcu.boru) {
                // Cihaz rotation'u sabit - tutamacı her zaman kuzeyde
                ghost.rotation = 0;

                // Fleks uzunluğu (minimum ve maksimum mesafe)
                const minFleksUzunluk = 25; // cm - cihazın boru ucundan minimum uzaklığı (vana + fleks görünürlüğü için)
                const maxFleksUzunluk = 72; // cm - cihazın boru ucundan maksimum uzaklığı

                // Boru yönünü hesapla (boru ucundan dışarı doğru)
                const boru = boruUcu.boru;
                const boruUcNokta = boruUcu.uc === 'p1' ? boru.p1 : boru.p2;
                const digerUc = boruUcu.uc === 'p1' ? boru.p2 : boru.p1;

                // Boru yönü: diğer uçtan bu uca doğru (dışarı)
                const boruYonX = boruUcNokta.x - digerUc.x;
                const boruYonY = boruUcNokta.y - digerUc.y;
                const boruYonUzunluk = Math.hypot(boruYonX, boruYonY);

                // Normalize edilmiş boru yönü
                const normBoruYonX = boruYonX / boruYonUzunluk;
                const normBoruYonY = boruYonY / boruYonUzunluk;

                // Mouse'un boru ucundan mesafesini hesapla
                const mouseUcMesafe = Math.hypot(
                    point.x - boruUcu.nokta.x,
                    point.y - boruUcu.nokta.y
                );

                // Cihaz merkezini hesapla
                let merkezX, merkezY;

                if (mouseUcMesafe < minFleksUzunluk) {
                    // Mouse minimum fleks uzunluğundan daha yakın, boru yönünde minimum mesafeye yerleştir
                    merkezX = boruUcu.nokta.x + normBoruYonX * minFleksUzunluk;
                    merkezY = boruUcu.nokta.y + normBoruYonY * minFleksUzunluk;
                } else if (mouseUcMesafe <= maxFleksUzunluk) {
                    // Mouse fleks uzunluğu içinde, mouse pozisyonuna yerleştir
                    merkezX = point.x;
                    merkezY = point.y;
                } else {
                    // Mouse fleks uzunluğundan dışarıda, maksimum mesafeye mouse yönünde yerleştir
                    const oran = maxFleksUzunluk / mouseUcMesafe;
                    merkezX = boruUcu.nokta.x + (point.x - boruUcu.nokta.x) * oran;
                    merkezY = boruUcu.nokta.y + (point.y - boruUcu.nokta.y) * oran;
                }

                // Cihaz merkezini ayarla
                ghost.x = merkezX;
                ghost.y = merkezY;

                // Ghost rendering için bağlantı bilgisini sakla
                ghost.ghostConnectionInfo = {
                    boruUcu: boruUcu,
                    girisNoktasi: boruUcu.nokta // Fleks boru ucundan başlayacak
                };
            } else {
                // Boru ucu bulunamadı, normal cursor pozisyonu
                const girisOffset = ghost.girisOffset || { x: 0, y: 0 };
                ghost.x = point.x - girisOffset.x;
                ghost.y = point.y - girisOffset.y;
                ghost.ghostConnectionInfo = null;
            }
        }
        else if (ghost.type === 'sayac') {
            // En yakın SERBEST boru ucunu bul (T-junction'ları atla)
            const boruUcu = this.findBoruUcuAt(point, 72, true); // onlyFreeEndpoints = true

            if (boruUcu && boruUcu.boru) {
                // Sayaç pozisyonlandırma: Mouse konumuna göre yön belirleme
                const boru = boruUcu.boru;
                const dx = boru.p2.x - boru.p1.x;
                const dy = boru.p2.y - boru.p1.y;
                const length = Math.hypot(dx, dy);

                // Fleks görünen boy
                const fleksUzunluk = 15; // cm

                // Mouse'un boru ekseninin hangi tarafında olduğunu bul
                // Cross product: (mouse - boruUcu) x (boru yönü)
                const mouseVecX = point.x - boruUcu.nokta.x;
                const mouseVecY = point.y - boruUcu.nokta.y;
                const crossProduct = mouseVecX * dy - mouseVecY * dx;

                // Boru yönüne DİK (perpendicular) vektör hesapla
                // 90° saat yönünde (clockwise) döndürülmüş vektör: (-dy, dx)
                let perpX = -dy / length;
                let perpY = dx / length;

                // Cross product negatifse, diğer tarafa dön (180° döndür)
                if (crossProduct > 0) {
                    perpX = -perpX;
                    perpY = -perpY;
                }

                // Sayaç rotation'u: Boru yönü veya ters yön (mouse konumuna göre)
                let baseRotation = Math.atan2(dy, dx) * 180 / Math.PI;
                if (crossProduct > 0) {
                    baseRotation += 180;
                }
                ghost.rotation = baseRotation;

                // Giriş rakorunun lokal koordinatı
                const girisLokal = ghost.getGirisLocalKoordinat();

                // Giriş rakorunun dünya koordinatı (istenen)
                const girisHedefX = boruUcu.nokta.x + perpX * fleksUzunluk;
                const girisHedefY = boruUcu.nokta.y + perpY * fleksUzunluk;

                // Sayaç merkezini hesapla
                const rad = ghost.rotation * Math.PI / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);

                const girisRotatedX = girisLokal.x * cos - girisLokal.y * sin;
                const girisRotatedY = girisLokal.x * sin + girisLokal.y * cos;

                ghost.x = girisHedefX - girisRotatedX;
                ghost.y = girisHedefY - girisRotatedY;

                // Ghost rendering için bağlantı bilgisini sakla
                ghost.ghostConnectionInfo = {
                    boruUcu: boruUcu,
                    girisNoktasi: boruUcu.nokta
                };
            } else {
                // Boru ucu bulunamadı, normal cursor pozisyonu
                ghost.x = point.x;
                ghost.y = point.y;
                ghost.ghostConnectionInfo = null;
            }
        } else {
            ghost.x = point.x;
            ghost.y = point.y;
        }

        // Servis kutusu - duvara snap (yerleştirme için useBoxPosition=false)
        if (ghost.type === 'servis_kutusu') {
            const walls = state.walls;
            const snapDistance = 30; // 30cm içinde snap yap

            // En yakın duvarı bul
            let closestWall = null;
            let minDist = Infinity;

            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const len = Math.hypot(dx, dy);
                if (len === 0) return;

                // Noktayı duvara projeksiyon yap
                const t = Math.max(0, Math.min(1,
                    ((point.x - wall.p1.x) * dx + (point.y - wall.p1.y) * dy) / (len * len)
                ));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;

                const dist = Math.hypot(point.x - projX, point.y - projY);

                if (dist < minDist) {
                    minDist = dist;
                    closestWall = wall;
                }
            });

            // Yakın duvara snap yap (yerleştirme - useBoxPosition=false, mouse pozisyonuna göre taraf belirlenir)
            if (closestWall && minDist < snapDistance) {
                ghost.snapToWall(closestWall, point, false);
            } else {
                ghost.placeFree(point);
            }
        }

        // Sayaç/Vana - boru açısına hizala
        if ((ghost.type === 'sayac' || ghost.type === 'vana') && snap && snap.target) {
            if (snap.target.isPipe) {
                ghost.rotation = snap.target.aciDerece || 0;
            }
        }
    }

    /**
     * Bileşeni yerleştir
     */
    placeComponent(point) {
        if (!this.manager.tempComponent) return;
        const component = this.manager.tempComponent;
        const prevMode = this.previousMode;
        const prevDrawMode = this.previousDrawingMode;
        const prevTool = this.previousActiveTool;

        switch (component.type) {
            case 'servis_kutusu':
                // ... (Mevcut kod) ...
                saveState();
                this.manager.components.push(component);
                this.startBoruCizim(component.getCikisNoktasi(), component.id, BAGLANTI_TIPLERI.SERVIS_KUTUSU);
                this.manager.activeTool = 'boru';
                setMode("plumbingV2", true);
                break;

            case 'sayac':
                // Eğer ghost bağlantısı varsa (boru ucuna snap olmuşsa), normal sayaç ekleme
                if (component.ghostConnectionInfo && component.ghostConnectionInfo.boruUcu) {
                    saveState();
                    const successSayac = this.handleSayacEndPlacement(component);
                    if (successSayac) {
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
                    this.meterStartPoint = { x: point.x, y: point.y };
                    // tempComponent'i TUTUYORUZ - mevcut ghost sistemi kullanacak

                    console.log('✅ İÇ TESİSAT: Kesikli boru başlangıç noktası belirlendi. İkinci nokta için tıklayın.');
                }
                // Eğer ghost bağlantısı yoksa VE servis kutusu varsa, uyarı ver
                else {
                    console.warn('⚠️ Sayaç sadece boru ucuna eklenebilir!');
                    alert('⚠️ Sayaç sadece boru ucuna eklenebilir!\n\nLütfen sayacı bir boru ucuna yerleştirin.');
                }
                break;

            case 'vana':
                if (this.vanaPreview) {
                    this.handleVanaPlacement(this.vanaPreview);
                    return;
                }
                // Vana pozisyonunu tıklanan noktaya ayarla (tempComponent başta 0,0'da oluşturuluyor)
                component.x = point.x;
                component.y = point.y;
                saveState();
                this.manager.components.push(component);
                break;

            case 'cihaz':
                // Cihaz ekleme - Seç moduna geç
                const successCihaz = this.handleCihazEkleme(component);
                if (successCihaz) {
                    // Cihaz eklendikten sonra seç moduna geç
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
    restorePreviousMode(prevMode, prevDrawMode, prevTool) {
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
     * Boru çizim modunu başlat
     */
    startBoruCizim(baslangicNoktasi, kaynakId = null, kaynakTip = null, colorGroup = null) {
        // Kaynak borunun renk grubunu belirle
        let kaynakColorGroup = 'YELLOW'; // Varsayılan: Kolon tesisat

        // Eğer colorGroup parametresi verilmişse onu kullan (split gibi durumlarda)
        if (colorGroup) {
            kaynakColorGroup = colorGroup;
        } else if (kaynakId && kaynakTip) {
            // Parametre yoksa, ataları kontrol et
            // Metafor: K→D→B→A takibi, en başta sayaç var mı?
            if (this.hasAncestorMeter(kaynakId, kaynakTip)) {
                kaynakColorGroup = 'TURQUAZ'; // İç tesisat (sayaç sonrası)
            } else {
                kaynakColorGroup = 'YELLOW'; // Kolon tesisat (sayaç öncesi)
            }
        }

        // ÖNEMLİ: Başlangıç noktası kullanılmış bir servis kutusu/sayaç çıkışına yakın mı?
        // (kaynakTip ne olursa olsun - çünkü ikinci tıklamada kaynakTip 'boru' olabilir)
        const tolerance = 10;
        const problematicServisKutusu = this.manager.components.find(c => {
            if (c.type !== 'servis_kutusu' || !c.cikisKullanildi) return false;

            const cikisNoktasi = c.getCikisNoktasi();
            if (!cikisNoktasi) return false;
            const dist = Math.hypot(baslangicNoktasi.x - cikisNoktasi.x, baslangicNoktasi.y - cikisNoktasi.y);
            console.log('[DEBUG startBoruCizim - SK]', { dist, tolerance, baslangicNoktasi, cikisNoktasi, kaynakId, servisKutusuId: c.id });
            return dist < tolerance;
        });

        const problematicSayac = this.manager.components.find(c => {
            if (c.type !== 'sayac' || !c.cikisBagliBoruId) return false;

            const cikisNoktasi = c.getCikisNoktasi();
            if (!cikisNoktasi) return false;
            const dist = Math.hypot(baslangicNoktasi.x - cikisNoktasi.x, baslangicNoktasi.y - cikisNoktasi.y);
            console.log('[DEBUG startBoruCizim - SAYAÇ]', { dist, tolerance, baslangicNoktasi, cikisNoktasi, kaynakId, sayacId: c.id });
            return dist < tolerance;
        });

        if (problematicServisKutusu || problematicSayac) {
            alert('⚠️ ' + (problematicServisKutusu ? 'Servis kutusu' : 'Sayaç') + ' çıkışından sadece 1 hat ayrılabilir!');
            console.warn('🚫 ENGEL: Başlangıç noktası zaten kullanılmış çıkışa çok yakın!');
            return; // Boru çizimi başlatma
        }

        // Servis kutusu kontrolü - sadece 1 hat ayrılabilir
        if (kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU && kaynakId) {
            const servisKutusu = this.manager.components.find(c => c.id === kaynakId && c.type === 'servis_kutusu');
            if (servisKutusu && servisKutusu.cikisKullanildi) {
                alert('⚠️ Servis kutusu çıkışından sadece 1 hat ayrılabilir!');
                console.warn("🚫 ENGEL: Servis kutusu çıkışından sadece 1 hat ayrılabilir!");
                return;
            }
        }

        // Sayaç çıkış kontrolü - sadece 1 hat ayrılabilir
        if (kaynakTip === BAGLANTI_TIPLERI.SAYAC && kaynakId) {
            const sayac = this.manager.components.find(c => c.id === kaynakId && c.type === 'sayac');
            if (sayac && sayac.cikisBagliBoruId) {
                alert('⚠️ Sayaç çıkışından sadece 1 hat ayrılabilir!');
                console.warn("🚫 ENGEL: Sayaç çıkışından sadece 1 hat ayrılabilir!");
                return;
            }
        }

        // Kaynak boru varsa kontrol et (cihaz/sayaç engelleme için)
        if (kaynakTip === BAGLANTI_TIPLERI.BORU && kaynakId) {
            // Kaynak boruyu bul (manager.pipes içinde ara)
            const kaynakBoru = this.manager.pipes.find(p => p.id === kaynakId);

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
                    const cihazVar = this.hasDeviceAtEndpoint(kaynakId, hedefUc);
                    const sayacVar = this.hasMeterAtEndpoint(kaynakId, hedefUc);

                    if (cihazVar || sayacVar) {
                        console.warn("🚫 ENGEL: Bu uçta Cihaz veya Sayaç fleksi var! Tesisat buradan başlatılamaz.");
                        // İşlemi burada sessizce bitir, çizim modu açılmayacak.
                        return;
                    }
                }
            }
        }

        this.boruCizimAktif = true;
        this.boruBaslangic = {
            nokta: baslangicNoktasi,
            kaynakId: kaynakId,
            kaynakTip: kaynakTip || BAGLANTI_TIPLERI.SERVIS_KUTUSU,
            kaynakColorGroup: kaynakColorGroup // Kaynak borunun renk grubunu sakla
        };
        this.snapSystem.setStartPoint(baslangicNoktasi);

        // Icon güncellemesi için activeTool'u ayarla
        this.manager.activeTool = 'boru';
    }

    /**
     * Vana yerleştir - YENİ STRATEJI
     * Vana boruyu bölmez, boru üzerinde serbest kayabilir bir nesne olarak eklenir
     */
    handleVanaPlacement(vanaPreview) {
        const { pipe, point } = vanaPreview;

        // Undo için state kaydet
        saveState();

        // Boru üzerindeki mevcut nesneleri al
        const existingObjects = getObjectsOnPipe(this.manager.components, pipe.id);

        // Yerleştirme kontrolü yap
        const placementResult = canPlaceValveOnPipe(pipe, point, existingObjects);

        if (!placementResult || placementResult.error) {
            // Hata durumu - mesaj göster
            //alert(placementResult?.message || 'Vana eklenemedi!');
            this.vanaPreview = null;
            return;
        }

        const { t, x, y, adjusted } = placementResult;

        // Kullanıcıya bilgi ver (kaydırma yapıldıysa)
        if (adjusted) {
            // console.log('Vana pozisyonu mesafe kurallarına göre ayarlandı.');
        }

        // ✨ P2 (ileri uç) ucundan sabit mesafe hesapla
        const pipeLength = pipe.uzunluk;
        const distanceFromP2 = pipeLength * (1 - t); // cm cinsinden

        // Bağımsız Vana nesnesi oluştur
        const vana = createVana(x, y, 'AKV', {
            floorId: state.currentFloorId,
            bagliBoruId: pipe.id,
            boruPozisyonu: t,
            fromEnd: 'p2',              // İleri uçtan (p2)
            fixedDistance: distanceFromP2 // Sabit cm mesafe
        });

        // Rotasyonu boru açısına göre ayarla
        vana.rotation = pipe.aciDerece;

        // Manager'ın components dizisine ekle
        this.manager.components.push(vana);

        // State'i senkronize et
        this.manager.saveToState();

        // Preview'ı temizle
        this.vanaPreview = null;

        // Vana eklendikten sonra SEÇ moduna geç
        this.manager.activeTool = null;
        this.cancelCurrentAction();
        setMode("select");
    }

    /**
         * Boruyu belirtilen noktadan böl ve çizime devam et
         * YÖNTEM: Geometrik Snapshot (Bileşenleri fiziksel konumlarına göre en yakın parçaya dağıtır)
         */
    handlePipeSplit(pipe, splitPoint, startDrawing = true) {
        // 1. Köşe kontrolü (Çok yakınsa bölme yapma, direkt uçtan başla)
        const CORNER_THRESHOLD = 0.1;
        const distToP1 = Math.hypot(splitPoint.x - pipe.p1.x, splitPoint.y - pipe.p1.y);
        const distToP2 = Math.hypot(splitPoint.x - pipe.p2.x, splitPoint.y - pipe.p2.y);

        if (distToP1 < CORNER_THRESHOLD) {
            if (startDrawing) {
                this.startBoruCizim(pipe.p1, pipe.id, BAGLANTI_TIPLERI.BORU);
            }
            this.pipeSplitPreview = null;
            return;
        }
        if (distToP2 < CORNER_THRESHOLD) {
            if (startDrawing) {
                this.startBoruCizim(pipe.p2, pipe.id, BAGLANTI_TIPLERI.BORU);
            }
            this.pipeSplitPreview = null;
            return;
        }

        // --- ADIM 1: GEÇİCİ KONUM BELİRLEME (SNAPSHOT) ---
        // Bölünme öncesi, boru üzerindeki tüm bileşenlerin dünya üzerindeki tam konumlarını kaydet.
        // Bu sayede "miras" mantığı yerine "gerçek konum" mantığı kullanılır.
        const itemsToReattach = [];

        // A) Vanaları Kaydet
        const valves = this.manager.components.filter(c =>
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
        const flexComponents = this.manager.components.filter(c =>
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
            const sk = this.manager.components.find(c => c.id === pipe.baslangicBaglanti.hedefId);
            if (sk && sk.bagliBoruId === pipe.id) {
                // Split durumunda direkt güncelle (baglaBoru çağırma - zaten kullanımda hatası verir)
                sk.bagliBoruId = boru1.id;
                // cikisKullanildi zaten true, değiştirmeye gerek yok
            }
        }

        // Sayaç çıkış bağlantısını güncelle
        if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
            const sayac = this.manager.components.find(c => c.id === pipe.baslangicBaglanti.hedefId);
            if (sayac && sayac.cikisBagliBoruId === pipe.id) {
                // Split durumunda direkt güncelle
                sayac.cikisBagliBoruId = boru1.id;
            }
        }

        // Eski boruyu sil, yenileri ekle
        const idx = this.manager.pipes.findIndex(p => p.id === pipe.id);
        if (idx !== -1) this.manager.pipes.splice(idx, 1);
        this.manager.pipes.push(boru1, boru2);

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
        this.manager.saveToState();

        // Split noktasından boru çizimi başlat (akış yönünde devam et -> boru2.id)
        if (startDrawing) {
            this.startBoruCizim(splitPoint, boru2.id, BAGLANTI_TIPLERI.BORU);
        }

        // Preview'ı temizle
        this.pipeSplitPreview = null;
    }
    /**
     * Boru çizimde tıklama
     */
    handleBoruClick(point) {
        if (!this.boruBaslangic) return;

        console.log('[DEBUG handleBoruClick] Başlangıç:', {
            kaynakId: this.boruBaslangic.kaynakId,
            kaynakTip: this.boruBaslangic.kaynakTip,
            SERVIS_KUTUSU_TIP: BAGLANTI_TIPLERI.SERVIS_KUTUSU,
            SAYAC_TIP: BAGLANTI_TIPLERI.SAYAC,
            esitMi_SK: this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU,
            esitMi_Sayac: this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC
        });

        // ÖNEMLİ: Servis kutusu/sayaç çıkışından başlayan hat, AYNI çıkışa bağlı borunun gövdesine bağlanamaz!
        // (Split tetikler ve ikinci bağlantı oluşur - bu yasak!)
        if (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ||
            this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
            // Tıklama noktasında boru gövdesi var mı kontrol et
            const boruGovde = this.findBoruGovdeAt(point, 5);
            if (boruGovde) {
                // Bu borunun servis kutusu/sayaç çıkışına bağlı olup olmadığını kontrol et
                const targetPipe = this.manager.pipes.find(p => p.id === boruGovde.boruId);
                if (targetPipe &&
                    (targetPipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ||
                     targetPipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC)) {
                    // Aynı servis kutusu/sayaç mı kontrol et
                    if (targetPipe.baslangicBaglanti.hedefId === this.boruBaslangic.kaynakId) {
                        console.warn('🚫 ENGEL: Aynı servis kutusu/sayaç çıkışından ikinci hat ayrılamaz! (Split engellendi)');
                        alert('⚠️ Bu boru zaten aynı ' + (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ? 'servis kutusu' : 'sayaç') + ' çıkışına bağlı!\n\nAynı çıkıştan iki hat ayrılamaz.');
                        return; // Boru çizimini iptal et
                    }
                }
            }
        }

        // Undo için state kaydet (her boru için ayrı undo entry)
        saveState();

        const boru = createBoru(this.boruBaslangic.nokta, point, 'STANDART');
        boru.floorId = state.currentFloorId;

        boru.colorGroup = this.boruBaslangic.kaynakColorGroup || 'YELLOW';

        if (this.boruBaslangic.kaynakId) {
            // Servis kutusu bağlantısını kontrol et ve kur
            if (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                const servisKutusu = this.manager.components.find(
                    c => c.id === this.boruBaslangic.kaynakId && c.type === 'servis_kutusu'
                );
                if (servisKutusu) {
                    const baglantiBasarili = servisKutusu.baglaBoru(boru.id);
                    if (!baglantiBasarili) {
                        console.warn("🚫 Servis kutusu çıkışına bağlantı başarısız - zaten kullanımda!");
                        return; // Boru eklenmez
                    }
                }
            }

            // Sayaç bağlantısını kontrol et ve kur
            if (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
                const sayac = this.manager.components.find(
                    c => c.id === this.boruBaslangic.kaynakId && c.type === 'sayac'
                );
                if (sayac) {
                    const baglantiBasarili = sayac.baglaCikis(boru.id);
                    if (!baglantiBasarili) {
                        console.warn("🚫 Sayaç çıkışına bağlantı başarısız - zaten kullanımda!");
                        return; // Boru eklenmez
                    }
                }
            }

            boru.setBaslangicBaglanti(
                this.boruBaslangic.kaynakTip,
                this.boruBaslangic.kaynakId
            );
        }

        this.manager.pipes.push(boru);

        // ✨ Sayaç sonrası boruları TURQUAZ yap (boru eklendikten SONRA)
        if (this.boruBaslangic.kaynakTip === BAGLANTI_TIPLERI.SAYAC) {
            const sayac = this.manager.components.find(
                c => c.id === this.boruBaslangic.kaynakId && c.type === 'sayac'
            );
            if (sayac) {
                this.manager.updatePipeColorsAfterMeter(sayac.id);
            }
        }

        // State'i senkronize et
        this.manager.saveToState();

        this.boruBaslangic = {
            nokta: point,
            kaynakId: boru.id,
            kaynakTip: BAGLANTI_TIPLERI.BORU,
            kaynakColorGroup: boru.colorGroup // ✨ Rengi devret!
        };
        this.snapSystem.setStartPoint(point);
    }

    /**
     * Sayaç ekleme işlemleri
     * KURALLAR:
     * - Sayaç SADECE boru uç noktasına eklenebilir
     * - Fleks ile bağlanır
     * - Boru ucunda vana yoksa otomatik vana eklenir
     */
    handleSayacEndPlacement(meter) {
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
        if (!this.isFreeEndpoint(boruUcu.nokta, 1)) {
            // console.error('[handleSayacEndPlacement] ✗ T-junction kontrolü başarısız!');
            // alert('⚠️ Sayaç T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
            return false;
        }

        // SAYAÇ VAR MI KONTROLÜ: Bir boru ucunda zaten sayaç varsa başka sayaç eklenemez
        const mevcutSayac = this.hasMeterAtEndpoint(boruUcu.boruId, boruUcu.uc);
        if (mevcutSayac) {
            //console.error('[handleSayacEndPlacement] ✗ Bu boru ucunda zaten sayaç var!');
            // alert('⚠️ Bu boru ucunda zaten bir sayaç var!\n\nBir boru ucuna sadece bir sayaç eklenebilir.');
            return false;
        }

        //console.log('[handleSayacEndPlacement] ✓ Kontroller geçti, vana ve sayaç ekleniyor...');

        // Not: saveState() artık placeComponent'ta çağrılıyor (tüm işlemlerden önce)

        // Boru ucunda vana var mı kontrol et
        const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

        // Vana yoksa otomatik ekle
        if (!vanaVar) {
            // Vana pozisyonunu hesapla - vananın KENARI boru ucundan 4 cm içeride olmalı
            const boru = boruUcu.boru;
            const edgeMargin = 4;      // cm - kenar için margin
            const vanaRadius = 4;      // cm - vana yarıçapı (8cm / 2)
            const centerMargin = edgeMargin + vanaRadius; // 8 cm - merkez için toplam

            // Boru yönünü hesapla (boru ucundan içeriye doğru)
            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);

            let vanaX, vanaY;
            if (boruUcu.uc === 'p1') {
                // p1 ucundayız, p2'ye doğru centerMargin kadar ilerle
                vanaX = boruUcu.nokta.x + (dx / length) * centerMargin;
                vanaY = boruUcu.nokta.y + (dy / length) * centerMargin;
            } else {
                // p2 ucundayız, p1'e doğru centerMargin kadar ilerle
                vanaX = boruUcu.nokta.x - (dx / length) * centerMargin;
                vanaY = boruUcu.nokta.y - (dy / length) * centerMargin;
            }

            const vana = createVana(vanaX, vanaY, 'SAYAC');
            vana.rotation = boruUcu.boru.aciDerece;
            vana.floorId = meter.floorId;

            // Vana'yı boru üzerindeki pozisyona bağla
            vana.bagliBoruId = boruUcu.boruId;
            // Pozisyonu hesapla (0.0 - 1.0 arası)
            const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y);
            vana.boruPozisyonu = vanaToP1Dist / length;

            this.manager.components.push(vana);
            meter.iliskiliVanaId = vana.id;
        } else {
            meter.iliskiliVanaId = vanaVar.id;
        }

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
    handleCihazEkleme(cihaz) {
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
        if (!this.isFreeEndpoint(boruUcu.nokta, 1)) {
            // console.error('[handleCihazEkleme] ✗ T-junction kontrolü başarısız!');
            // alert('⚠️ Cihaz T-bağlantısına yerleştirilemez!\n\nLütfen serbest bir hat ucuna yerleştirin.');
            return false;
        }

        // SERVİS KUTUSU/SAYAÇ KONTROLÜ: Cihaz servis kutusu çıkışına veya sayaç giriş/çıkışına eklenemez
        const boru = boruUcu.boru;

        // Servis kutusu çıkışı kontrolü
        if (boru.baslangicBaglanti && boru.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
            if (boruUcu.uc === 'p1') {
                console.warn("🚫 ENGEL: Servis kutusu çıkışına cihaz eklenemez!");
                return false;
            }
        }

        // Sayaç giriş/çıkış kontrolü
        // Sayaç girişini kontrol et (borunun ucunda sayaç mı var?)
        const sayacAtEndpoint = this.manager.components.find(c =>
            c.type === 'sayac' &&
            c.fleksBaglanti &&
            c.fleksBaglanti.boruId === boruUcu.boruId &&
            c.fleksBaglanti.endpoint === boruUcu.uc
        );

        if (sayacAtEndpoint) {
            console.warn("🚫 ENGEL: Sayaç girişine cihaz eklenemez!");
            return false;
        }

        // Sayaç çıkışını kontrol et (borunun başlangıcı sayaç çıkışına mı bağlı?)
        if (boru.baslangicBaglanti && boru.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
            if (boruUcu.uc === 'p1') {
                console.warn("🚫 ENGEL: Sayaç çıkışına cihaz eklenemez!");
                return false;
            }
        }

        // CİHAZ VAR MI KONTROLÜ: Bir boru ucunda zaten cihaz varsa başka cihaz eklenemez
        const mevcutCihaz = this.hasDeviceAtEndpoint(boruUcu.boruId, boruUcu.uc);
        if (mevcutCihaz) {
            // console.error('[handleCihazEkleme] ✗ Bu boru ucunda zaten cihaz var!');
            // alert('⚠️ Bu boru ucunda zaten bir cihaz var!\n\nBir boru ucuna sadece bir cihaz eklenebilir.');
            return false;
        }

        // console.log('[handleCihazEkleme] ✓ Kontroller geçti, vana ve cihaz ekleniyor...');

        // Undo için state kaydet
        saveState();

        // Boru ucunda vana var mı kontrol et
        const vanaVar = this.checkVanaAtPoint(boruUcu.nokta);

        // Vana yoksa otomatik ekle
        if (!vanaVar) {
            // Vana pozisyonunu hesapla - vananın KENARI boru ucundan 4 cm içeride olmalı
            const boru = boruUcu.boru;
            const edgeMargin = 4;      // cm - kenar için margin
            const vanaRadius = 4;      // cm - vana yarıçapı (8cm / 2)
            const centerMargin = edgeMargin + vanaRadius; // 8 cm - merkez için toplam

            // Boru yönünü hesapla (boru ucundan içeriye doğru)
            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);

            let vanaX, vanaY;
            if (boruUcu.uc === 'p1') {
                // p1 ucundayız, p2'ye doğru centerMargin kadar ilerle
                vanaX = boruUcu.nokta.x + (dx / length) * centerMargin;
                vanaY = boruUcu.nokta.y + (dy / length) * centerMargin;
            } else {
                // p2 ucundayız, p1'e doğru centerMargin kadar ilerle
                vanaX = boruUcu.nokta.x - (dx / length) * centerMargin;
                vanaY = boruUcu.nokta.y - (dy / length) * centerMargin;
            }

            const vana = createVana(vanaX, vanaY, 'AKV');
            vana.rotation = boruUcu.boru.aciDerece;
            vana.floorId = cihaz.floorId;

            // Vana'yı boru üzerindeki pozisyona bağla
            vana.bagliBoruId = boruUcu.boruId;
            // Pozisyonu hesapla (0.0 - 1.0 arası)
            const vanaToP1Dist = Math.hypot(vanaX - boru.p1.x, vanaY - boru.p1.y);
            vana.boruPozisyonu = vanaToP1Dist / length;

            this.manager.components.push(vana);
            cihaz.vanaIliskilendir(vana.id);
        } else {
            cihaz.vanaIliskilendir(vanaVar.id);
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

        // Cihazı components'a ekle (eğer henüz eklenmemişse)
        // Normal icon click workflow'unda placeComponent() ekler,
        // ama K/O shortcuts gibi direkt çağrılarda burada eklemeliyiz
        if (!this.manager.components.includes(cihaz)) {
            //   console.log('[handleCihazEkleme] Cihaz components\'a ekleniyor:', cihaz.cihazTipi);
            this.manager.components.push(cihaz);
        }

        // State'e kaydet
        this.manager.saveToState();

        // console.log('[handleCihazEkleme] ✓ Cihaz başarıyla eklendi. Toplam components:', this.manager.components.length);
        return true;
    }

    /**
     * Ölçüyü uygula (Enter tuşuna basıldığında)
     */
    applyMeasurement() {
        if (!this.boruBaslangic) return;

        const measurement = parseFloat(this.measurementInput);
        if (isNaN(measurement) || measurement <= 0) {
            this.measurementInput = '';
            this.measurementActive = false;
            return;
        }

        // Eğer geciciBoruBitis yoksa veya geçersizse, yönü hesapla
        let targetPoint = this.geciciBoruBitis;

        if (!targetPoint) {
            // Varsayılan yön: sağa doğru (pozitif X ekseni)
            targetPoint = {
                x: this.boruBaslangic.nokta.x + measurement,
                y: this.boruBaslangic.nokta.y
            };
        } else {
            // Mevcut yönü kullanarak ölçüyü uygula
            const dx = targetPoint.x - this.boruBaslangic.nokta.x;
            const dy = targetPoint.y - this.boruBaslangic.nokta.y;
            const currentLength = Math.hypot(dx, dy);

            if (currentLength > 0.1) {
                // Yönü normalize et ve ölçü kadar uzat
                const dirX = dx / currentLength;
                const dirY = dy / currentLength;

                targetPoint = {
                    x: this.boruBaslangic.nokta.x + dirX * measurement,
                    y: this.boruBaslangic.nokta.y + dirY * measurement
                };
            } else {
                // Çok kısa mesafe, varsayılan yön kullan
                targetPoint = {
                    x: this.boruBaslangic.nokta.x + measurement,
                    y: this.boruBaslangic.nokta.y
                };
            }
        }

        // Boruyu oluştur
        this.handleBoruClick(targetPoint);

        // Ölçü girişini sıfırla
        this.measurementInput = '';
        this.measurementActive = false;
    }

    /**
     * Mevcut işlemi iptal et
     */
    cancelCurrentAction() {
        if (this.boruCizimAktif) {
            this.boruCizimAktif = false;
            this.boruBaslangic = null;
            this.geciciBoruBitis = null;
            this.snapSystem.clearStartPoint();
        }

        // Ölçü girişini sıfırla
        this.measurementInput = '';
        this.measurementActive = false;

        if (this.manager.tempComponent) {
            this.manager.tempComponent = null;
        }

        this.manager.activeTool = null;

        // Sayaç yerleştirme durumunu sıfırla
        this.meterPlacementState = null;
        this.meterStartPoint = null;
        this.meterPreviewEndPoint = null;

        // Seçimi temizle
        this.deselectObject();
    }

    /**
     * Projede servis kutusu var mı kontrol et
     */
    hasServisKutusu() {
        return this.manager.components.some(c => c.type === 'servis_kutusu');
    }

    /**
     * İç tesisat sayaç ekleme - ikinci nokta tıklaması
     * Kesikli boru oluştur + sayacı boru ucuna ekle
     */
    handleMeterStartPipeSecondClick(endPoint) {
        if (!this.meterStartPoint) return;

        const p1 = this.meterStartPoint;
        const p2 = endPoint;

        // Minimum mesafe kontrolü (çok kısa borular olmasın)
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (distance < 10) {
            console.warn('⚠️ Boru çok kısa! En az 10cm olmalı.');
            return;
        }

        // Kesikli temsili boru oluştur
        const temsiliBoru = createBoru(p1, p2);
        temsiliBoru.dagitimTuru = 'KOLON'; // Kolon rengi
        temsiliBoru.lineStyle = 'dashed'; // Kesikli çizim
        temsiliBoru.isTemsiliBoru = true; // Temsili boru işareti

        this.manager.pipes.push(temsiliBoru);

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
            floorId: state.currentFloorId
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
                nokta: { x: p2.x, y: p2.y }
            }
        };

        // Sayacı boru ucuna ekle (mevcut handleSayacEndPlacement kullan)
        // Bu fonksiyon VANA + FLEKS + SAYAÇ + ÇIKIŞ RİJİT otomatik ekleyecek
        const success = this.handleSayacEndPlacement(tempMeter);

        if (success) {
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

            console.log('✅ İÇ TESİSAT: Kesikli boru + sayaç başarıyla eklendi.');
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

            console.error('❌ Sayaç eklenemedi!');
        }
    }

    selectObject(obj) {
        // Önceki seçimi temizle
        if (this.selectedObject && this.selectedObject !== obj) {
            this.selectedObject.isSelected = false;
        }
        // Vana seçimi temizle
        if (this.selectedValve) {
            // DÜZELTME: pipe.vana yerine doğrudan vana bileşenini hedefle
            if (this.selectedValve.vana) {
                this.selectedValve.vana.isSelected = false;
            }
            this.selectedValve = null;
        }
        this.selectedObject = obj;
        obj.isSelected = true;

        // state.selectedObject'i de set et (DELETE tuşu için)
        setState({
            selectedObject: {
                type: obj.type === 'boru' ? 'pipe' : obj.type,
                object: obj,
                handle: 'body'
            }
        });
    }

    selectValve(pipe, vana) {
        // Önceki seçimi temizle
        if (this.selectedObject) {
            this.selectedObject.isSelected = false;
            this.selectedObject = null;
        }
        // Önceki vana seçimini temizle
        if (this.selectedValve) {
            // DÜZELTME: pipe.vana.isSelected yerine vana.isSelected
            if (this.selectedValve.vana) {
                this.selectedValve.vana.isSelected = false;
            }
        }

        this.selectedValve = { pipe, vana };
        if (vana) vana.isSelected = true;

        // state.selectedObject'i de set et (DELETE tuşu için)
        setState({
            selectedObject: {
                type: 'vana',
                object: vana,
                pipe: pipe,
                handle: 'body'
            }
        });
    }
    deselectObject() {
        if (this.selectedObject) {
            this.selectedObject.isSelected = false;
            this.selectedObject = null;
        }
        if (this.selectedValve) {
            // DÜZELTME: Kilitlenmeye neden olan hatalı referans düzeltildi
            if (this.selectedValve.vana) {
                this.selectedValve.vana.isSelected = false;
            }
            this.selectedValve = null;
        }

        // state.selectedObject'i de temizle
        setState({ selectedObject: null });
    }
    deleteSelectedObject() {
        // Vana silinmesi
        if (this.selectedValve) {
            saveState();
            // Güvenli silme işlemi
            const { pipe, vana } = this.selectedValve;

            // Legacy uyumluluğu için pipe üzerindeki referansı temizle
            if (pipe) {
                pipe.vanaKaldir();
            }

            // Bileşen listesinden vanayı sil (görünümden kalkması için şart)
            if (vana) {
                const idx = this.manager.components.indexOf(vana);
                if (idx !== -1) this.manager.components.splice(idx, 1);
            }

            this.manager.saveToState();
            this.deselectObject();
            return;
        }

        if (!this.selectedObject) return;

        const obj = this.selectedObject;

        // Servis kutusuna bağlı ilk boru silinemesin
        if (obj.type === 'boru') {
            const pipe = obj;
            // Başlangıcı servis kutusuna bağlı mı kontrol et
            /* if (pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) { alert('⚠️ Servis kutusuna bağlı ilk boru silinemez!\n\nÖnce servis kutusunu silin veya başka bir boru ekleyin.'); return; } */

        }

        // Undo için state kaydet
        saveState();

        if (obj.type === 'servis_kutusu') {
            if (confirm(obj.getDeleteInfo().uyari)) {
                this.removeObject(obj);
                this.manager.saveToState();
                this.deselectObject(); // Servis kutusu için seçimi kaldır
            } else {
                // İptal edildi, return
                return;
            }
        } else {
            this.removeObject(obj);
            this.manager.saveToState();
            // Boru için deselectObject çağırma - removeObject içinde zaten akıllı seçim yapılıyor
            if (obj.type !== 'boru') {
                this.deselectObject();
            }
        }
    }

    findObjectAt(point) {
        // ÖNCELİK 1: Bileşenler (Vana, servis kutusu, sayaç, cihaz)
        // Vana tam boyutunda (tolerance 0) burada kontrol edilir.
        // Eğer fare tam vana üzerindeyse bu döngü onu bulur ve döndürür.
        for (const comp of this.manager.components) {
            if (comp.containsPoint && comp.containsPoint(point)) {
                return comp;
            }
        }

        // ÖNCELİK 2: Borular (2cm tolerance - kesin tıklama)
        // Vana bulunamadıysa (yani 1mm bile dışındaysa), buraya düşer ve boruyu arar.
        for (const pipe of this.manager.pipes) {
            if (pipe.containsPoint && pipe.containsPoint(point, 2)) {
                return pipe;
            }
        }

        // ÖNCELİK 3: Borular (daha geniş tolerance - 5cm)
        for (const pipe of this.manager.pipes) {
            if (pipe.containsPoint && pipe.containsPoint(point, 5)) {
                return pipe;
            }
        }

        return null;
    }
    /**
     * Bir noktanın serbest uç olup olmadığını kontrol et (T-junction, dirsek değil)
     * KRITIK: Cihazlar SADECE gerçek boş uçlara (1 borulu) bağlanabilir
     * Dirsek (2 boru), TE (3+ boru) = DOLU UÇ
     */
    isFreeEndpoint(point, tolerance = 1) {
        const currentFloorId = state.currentFloor?.id;
        let pipeCount = 0;

        for (const boru of this.manager.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
                continue;
            }

            const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y);
            const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y);

            if (distP1 < tolerance || distP2 < tolerance) {
                pipeCount++;
            }

            // Erken çıkış: 2+ boru = dirsek veya TE
            if (pipeCount >= 2) {
                return false;
            }
        }

        // SADECE 1 boru varsa gerçek boş uç
        // 2 boru = dirsek, 3+ boru = TE → DOLU UÇ
        return pipeCount === 1;
    }


    /**
     * Bir boru ucunda cihaz olup olmadığını kontrol et
     * @param {string} boruId - Boru ID'si
     * @param {string} endpoint - 'p1' veya 'p2'
     * @returns {object|null} - Varsa cihaz, yoksa null
     */
    hasDeviceAtEndpoint(boruId, endpoint) {
        const currentFloorId = state.currentFloor?.id;

        for (const comp of this.manager.components) {
            // Sadece cihazları kontrol et
            if (comp.type !== 'cihaz') continue;

            // Sadece aktif kattaki cihazları kontrol et
            if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
                continue;
            }

            // Fleks bağlantısı bu boru ucuna mı?
            if (comp.fleksBaglanti &&
                comp.fleksBaglanti.boruId === boruId &&
                comp.fleksBaglanti.endpoint === endpoint) {
                return comp;
            }
        }

        return null;
    }

    hasMeterAtEndpoint(boruId, endpoint) {
        const currentFloorId = state.currentFloor?.id;

        for (const comp of this.manager.components) {
            // Sadece sayaçları kontrol et
            if (comp.type !== 'sayac') continue;

            // Sadece aktif kattaki sayaçları kontrol et
            if (currentFloorId && comp.floorId && comp.floorId !== currentFloorId) {
                continue;
            }

            // Fleks bağlantısı bu boru ucuna mı?
            if (comp.fleksBaglanti &&
                comp.fleksBaglanti.boruId === boruId &&
                comp.fleksBaglanti.endpoint === endpoint) {
                return comp;
            }
        }

        return null;
    }

    /**
     * Bir borunun atalarını takip ederek en başta sayaç var mı kontrol et
     * Metafor: K→D→B→A şeklinde ataları takip et, A sayaç mı kontrol et
     * @param {string} componentId - Boru veya bileşen ID'si
     * @param {string} componentType - 'boru', 'servis_kutusu', 'sayac' vb.
     * @returns {boolean} - Atalarda sayaç varsa true (İç Tesisat = TURQUAZ)
     */
    hasAncestorMeter(componentId, componentType) {
        // Ziyaret edilen ID'leri takip et (sonsuz döngü önleme)
        const visited = new Set();
        const MAX_DEPTH = 100; // Maksimum derinlik
        let depth = 0;

        let currentId = componentId;
        let currentType = componentType;

        while (currentId && !visited.has(currentId) && depth < MAX_DEPTH) {
            visited.add(currentId);
            depth++;

            // Eğer sayaca ulaştıysak, iç tesisat!
            if (currentType === BAGLANTI_TIPLERI.SAYAC || currentType === 'sayac') {
                return true;
            }

            // Eğer servis kutusuna ulaştıysak, kolon tesisat (sayaç yok)
            if (currentType === BAGLANTI_TIPLERI.SERVIS_KUTUSU || currentType === 'servis_kutusu') {
                return false;
            }

            // Boru ise, başlangıç bağlantısını takip et
            if (currentType === BAGLANTI_TIPLERI.BORU || currentType === 'boru') {
                const pipe = this.manager.pipes.find(p => p.id === currentId);
                if (!pipe) break;

                // Başlangıç bağlantısını kontrol et (borunun nereden geldiği)
                const baglanti = pipe.baslangicBaglanti;
                if (!baglanti || !baglanti.hedefId || !baglanti.tip) {
                    // Bağlantı bilgisi yok, dur
                    break;
                }

                // Bir üst seviyeye çık (baba)
                currentId = baglanti.hedefId;
                currentType = baglanti.tip;
            } else {
                // Bilinmeyen tip, dur
                break;
            }
        }

        // Sayaç bulunamadı, kolon tesisat
        return false;
    }

    findBoruUcuAt(point, tolerance = 5, onlyFreeEndpoints = false) {
        const currentFloorId = state.currentFloor?.id;
        const candidates = [];

        for (const boru of this.manager.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
                continue;
            }

            const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y);
            const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y);

            if (distP1 < tolerance) {
                // SADECE gerçek boş uçlar (dirsek, T-junction, cihaz ve sayaç olan uçlar hariç)
                if (!onlyFreeEndpoints ||
                    (this.manager.isTrulyFreeEndpoint(boru.p1, 1) &&
                        !this.hasDeviceAtEndpoint(boru.id, 'p1') &&
                        !this.hasMeterAtEndpoint(boru.id, 'p1'))) {

                    candidates.push({ boruId: boru.id, nokta: boru.p1, uc: 'p1', boru: boru });
                }
            }
            if (distP2 < tolerance) {
                // SADECE gerçek boş uçlar (dirsek, T-junction, cihaz ve sayaç olan uçlar hariç)
                if (!onlyFreeEndpoints ||
                    (this.manager.isTrulyFreeEndpoint(boru.p2, 1) &&
                        !this.hasDeviceAtEndpoint(boru.id, 'p2') &&
                        !this.hasMeterAtEndpoint(boru.id, 'p2'))) {
                    candidates.push({ boruId: boru.id, nokta: boru.p2, uc: 'p2', boru: boru });
                }
            }
        }

        // Hiç aday yoksa null dön
        if (candidates.length === 0) {
            return null;
        }

        // Tek aday varsa direkt dön
        if (candidates.length === 1) {
            const c = candidates[0];
            return { boruId: c.boruId, nokta: c.nokta, uc: c.uc, boru: c.boru };
        }

        // Birden fazla aday varsa, tıklama noktasına en yakın BORU GÖVDESİNİ seç
        // Bu sayede aynı noktayı paylaşan iki borudan tıkladığınız boru seçilir
        let closest = candidates[0];
        let minBodyDist = Infinity;

        for (const candidate of candidates) {
            const proj = candidate.boru.projectPoint(point);
            if (proj && proj.onSegment) {
                const bodyDist = proj.distance;
                if (bodyDist < minBodyDist) {
                    minBodyDist = bodyDist;
                    closest = candidate;
                }
            }
        }

        return { boruId: closest.boruId, nokta: closest.nokta, uc: closest.uc, boru: closest.boru };
    }

    findBoruGovdeAt(point, tolerance = 5) {
        for (const boru of this.manager.pipes) {
            const proj = boru.projectPoint(point);
            if (proj && proj.onSegment && proj.distance < tolerance) {
                return { boruId: boru.id, nokta: { x: proj.x, y: proj.y } };
            }
        }
        return null;
    }

    /**
     * Mouse altındaki boruyu bul (pipe splitting için)
     */
    findPipeAt(point, tolerance = 2) {
        for (const pipe of this.manager.pipes) {
            if (pipe.containsPoint && pipe.containsPoint(point, tolerance)) {
                return pipe;
            }
        }
        return null;
    }

    /**
     * Bileşen çıkış noktasını bul (servis kutusu, sayaç vb.)
     */
    findBilesenCikisAt(point, tolerance = 2) {
        for (const comp of this.manager.components) {
            // Servis kutusu - getCikisNoktasi metodu var ve çıkış kullanılmamışsa
            if (comp.type === 'servis_kutusu' && comp.getCikisNoktasi && !comp.cikisKullanildi) {
                const cikis = comp.getCikisNoktasi();
                if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                    return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
                }
            }
            // Sayaç - çıkış noktası
            if (comp.type === 'sayac' && comp.getCikisNoktasi) {
                const cikis = comp.getCikisNoktasi();
                if (Math.hypot(point.x - cikis.x, point.y - cikis.y) < tolerance) {
                    return { bilesenId: comp.id, nokta: cikis, tip: comp.type };
                }
            }
        }
        return null;
    }

    checkVanaAtPoint(point, tolerance = 2) {
        for (const comp of this.manager.components) {
            if (comp.type === 'vana') {
                if (Math.hypot(point.x - comp.x, point.y - comp.y) < tolerance) {
                    return comp;
                }
            }
        }
        return null;
    }

    /**
     * Boru uç noktasını bul
     */
    findPipeEndpoint(pipe, point) {
        const tolerance = 2; // cm
        const distToP1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y);
        const distToP2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y);

        if (distToP1 <= tolerance && distToP1 <= distToP2) {
            return 'p1';
        }
        if (distToP2 <= tolerance) {
            return 'p2';
        }
        return null;
    }

    /**
     * Uç nokta sürüklemeyi başlat
     */
    startEndpointDrag(pipe, endpoint, point) {
        this.isDragging = true;
        this.dragObject = pipe;
        this.dragEndpoint = endpoint;
        this.dragStart = { ...point };
    }

    startDrag(obj, point) {
        this.isDragging = true;
        this.dragObject = obj;
        this.dragEndpoint = null;
        this.dragStart = { ...point };

        // Vana için bağlı boruyu önceden kaydet (performans optimizasyonu)
        if (obj.type === 'vana' && obj.bagliBoruId) {
            this.dragObjectPipe = this.manager.pipes.find(p => p.id === obj.bagliBoruId);
            this.dragObjectsOnPipe = getObjectsOnPipe(this.manager.components, obj.bagliBoruId);
            console.log('Vana sürükleme başladı - Bağlı boru:', this.dragObjectPipe?.id);
        } else {
            this.dragObjectPipe = null;
            this.dragObjectsOnPipe = null;
        }
    }

    /**
     * Boru body sürüklemeyi başlat (sadece x veya y yönünde)
     */
    startBodyDrag(pipe, point) {
        this.isDragging = true;
        this.dragObject = pipe;
        this.dragEndpoint = null;
        this.dragStart = { ...point };
        this.isBodyDrag = true; // Body drag flag
        // Başlangıç noktalarını kaydet
        this.bodyDragInitialP1 = { ...pipe.p1 };
        this.bodyDragInitialP2 = { ...pipe.p2 };

        // Bağlı boruları ŞİMDİ tespit et (sürükleme başlamadan önce!)
        const TOLERANCE = 10; // 10 cm (çift tıklayarak bölünen borular için)
        const oldP1 = pipe.p1;
        const oldP2 = pipe.p2;

        // p1 tarafındaki bağlı boruyu bul
        this.connectedPipeAtP1 = this.manager.pipes.find(p => {
            if (p === pipe) return false;
            const dist = Math.hypot(p.p2.x - oldP1.x, p.p2.y - oldP1.y);
            return dist < TOLERANCE;
        });

        // p2 tarafındaki bağlı boruyu bul
        this.connectedPipeAtP2 = this.manager.pipes.find(p => {
            if (p === pipe) return false;
            const dist = Math.hypot(p.p1.x - oldP2.x, p.p1.y - oldP2.y);
            return dist < TOLERANCE;
        });

        // ⚠️ DOĞRUSALLIK KONTROLÜ: Sadece 3 boru aynı doğrultudaysa ara boru modu
        this.useBridgeMode = false; // Varsayılan: normal mod

        if (this.connectedPipeAtP1 && this.connectedPipeAtP2) {
            // 3 boru var: A - B - C
            // A.p1 - A.p2(=B.p1) - B.p2(=C.p1) - C.p2 (4 nokta)
            const p1 = this.connectedPipeAtP1.p1;
            const p2 = this.connectedPipeAtP1.p2; // = pipe.p1
            const p3 = pipe.p2; // = this.connectedPipeAtP2.p1
            const p4 = this.connectedPipeAtP2.p2;

            // İlk ve son vektörleri hesapla
            const v1 = { x: p2.x - p1.x, y: p2.y - p1.y }; // A borusu
            const v2 = { x: p3.x - p2.x, y: p3.y - p2.y }; // B borusu (sürüklenen)
            const v3 = { x: p4.x - p3.x, y: p4.y - p3.y }; // C borusu

            // Normalize edilmiş yönler
            const len1 = Math.hypot(v1.x, v1.y);
            const len2 = Math.hypot(v2.x, v2.y);
            const len3 = Math.hypot(v3.x, v3.y);

            if (len1 > 0.1 && len2 > 0.1 && len3 > 0.1) {
                const dir1 = { x: v1.x / len1, y: v1.y / len1 };
                const dir2 = { x: v2.x / len2, y: v2.y / len2 };
                const dir3 = { x: v3.x / len3, y: v3.y / len3 };

                // Dot product kontrolü (paralel mi?)
                const dot12 = dir1.x * dir2.x + dir1.y * dir2.y;
                const dot23 = dir2.x * dir3.x + dir2.y * dir3.y;

                // Aynı yönde mi? (dot product ~1)
                const ANGLE_TOLERANCE = 0.94; // ~20 derece tolerans (daha esnek)
                const isColinear = Math.abs(dot12) > ANGLE_TOLERANCE &&
                    Math.abs(dot23) > ANGLE_TOLERANCE &&
                    Math.sign(dot12) === Math.sign(dot23);

                this.useBridgeMode = isColinear;
            }
        }

        // Borunun açısını hesapla ve drag axis'i belirle (duvar mantığı)
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
        let dragAxis = null;
        if (Math.abs(angle - 45) < 1) {
            dragAxis = null; // 45 derece ise serbest
        } else if (angle < 45) {
            dragAxis = 'y'; // Yatay boru, sadece Y yönünde taşı
        } else {
            dragAxis = 'x'; // Dikey boru, sadece X yönünde taşı
        }
        this.dragAxis = dragAxis;
    }

    handleDrag(point) {
        if (!this.dragObject) return;

        // Uç nokta sürükleme
        if (this.dragEndpoint && this.dragObject.type === 'boru') {
            const pipe = this.dragObject;

            // Servis kutusuna veya sayaca bağlı uç taşınamaz - ekstra güvenlik kontrolü
            const ucBaglanti = this.dragEndpoint === 'p1' ? pipe.baslangicBaglanti : pipe.bitisBaglanti;
            if (ucBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU || ucBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                return; // Taşıma işlemini engelle
            }

            const oldPoint = this.dragEndpoint === 'p1' ? { ...pipe.p1 } : { ...pipe.p2 };

            // DUVAR SNAP SİSTEMİ - Boru açıklığı ile
            const SNAP_DISTANCE = 15; // İlk yakalama mesafesi (cm)
            const SNAP_RELEASE_DISTANCE = 40; // Snap'ten çıkma mesafesi (cm)
            const BORU_CLEARANCE = 5; // Boru-duvar arası minimum mesafe (cm)
            const MAX_WALL_DISTANCE = 20; // 1 metre - bu mesafeden uzak snap noktalarını göz ardı et
            const walls = state.walls || [];
            let finalPos = { x: point.x, y: point.y };


            // Her zaman yeni snap ara (sürekli snap)
            // Maksimum snap mesafesi 1 metre (100 cm)
            let bestSnapX = { diff: MAX_WALL_DISTANCE, value: null };
            let bestSnapY = { diff: MAX_WALL_DISTANCE, value: null };

            // Tüm duvar yüzeylerine snap kontrolü - Boru clearance ekleyerek
            // ÖNCE: Sadece yakındaki ve aynı kattaki duvarları filtrele
            const pipeFloorId = pipe.floorId; // Borunun bulunduğu kat

            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                // Sadece aynı kattaki duvarları kontrol et
                if (pipeFloorId && wall.floorId && wall.floorId !== pipeFloorId) {
                    return; // Farklı kattaki duvarı atla
                }

                // Duvara olan minimum mesafeyi hesapla (nokta-çizgi mesafesi)
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const lengthSq = dx * dx + dy * dy;
                let wallDistance;

                if (lengthSq === 0) {
                    // Duvar bir nokta (dejenere durum)
                    wallDistance = Math.hypot(finalPos.x - wall.p1.x, finalPos.y - wall.p1.y);
                } else {
                    // Nokta-çizgi mesafesi hesabı
                    const t = Math.max(0, Math.min(1, ((finalPos.x - wall.p1.x) * dx + (finalPos.y - wall.p1.y) * dy) / lengthSq));
                    const projX = wall.p1.x + t * dx;
                    const projY = wall.p1.y + t * dy;
                    wallDistance = Math.hypot(finalPos.x - projX, finalPos.y - projY);
                }


                const wallThickness = wall.thickness || state.wallThickness || 20;
                const halfThickness = wallThickness / 2;

                // Snap noktası duvar yüzeyinden offset olduğu için tolerans ekle
                const maxOffset = halfThickness + BORU_CLEARANCE;
                if (wallDistance > MAX_WALL_DISTANCE + maxOffset) return;

                const dxW = wall.p2.x - wall.p1.x;
                const dyW = wall.p2.y - wall.p1.y;
                const isVertical = Math.abs(dxW) < 0.1;
                const isHorizontal = Math.abs(dyW) < 0.1;

                if (isVertical) {
                    const wallX = wall.p1.x;
                    // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                    const snapXPositions = [
                        wallX - halfThickness - BORU_CLEARANCE,  // Sol yüzeyden clearance kadar uzak
                        wallX + halfThickness + BORU_CLEARANCE   // Sağ yüzeyden clearance kadar uzak
                    ];
                    for (const snapX of snapXPositions) {
                        const diff = Math.abs(finalPos.x - snapX);
                        if (diff < bestSnapX.diff) {
                            bestSnapX = { diff, value: snapX };
                        }
                    }
                } else if (isHorizontal) {
                    const wallY = wall.p1.y;
                    // Boru duvar yüzeyinden CLEARANCE kadar uzakta olmalı
                    const snapYPositions = [
                        wallY - halfThickness - BORU_CLEARANCE,  // Üst yüzeyden clearance kadar uzak
                        wallY + halfThickness + BORU_CLEARANCE   // Alt yüzeyden clearance kadar uzak
                    ];
                    for (const snapY of snapYPositions) {
                        const diff = Math.abs(finalPos.y - snapY);
                        if (diff < bestSnapY.diff) {
                            bestSnapY = { diff, value: snapY };
                        }
                    }
                }
            });

            // Snap bulunduysa uygula
            if (bestSnapX.value !== null || bestSnapY.value !== null) {
                // Snap lock'u güncelle
                this.pipeEndpointSnapLock = {
                    x: bestSnapX.value,
                    y: bestSnapY.value
                };
                this.pipeSnapMouseStart = { x: point.x, y: point.y };

                if (bestSnapX.value !== null) finalPos.x = bestSnapX.value;
                if (bestSnapY.value !== null) finalPos.y = bestSnapY.value;
            } else {
                // Snap bulunamadıysa lock'u temizle
                this.pipeEndpointSnapLock = null;
                this.pipeSnapMouseStart = null;
            }

            // BAĞLI BORULARIN DİĞER UÇLARINA VE AYNI BORUNUN DİĞER UCUNA SNAP
            // ÖNCELİKLE: Bağlı boruları tespit et (occupation check için de kullanılacak)
            const connectionTolerance = 1; // Bağlantı tespit toleransı
            const connectedPipes = this.manager.pipes.filter(p => {
                if (p === pipe) return false;
                // p1'e veya p2'ye bağlı mı kontrol et
                const distToP1 = Math.hypot(p.p1.x - oldPoint.x, p.p1.y - oldPoint.y);
                const distToP2 = Math.hypot(p.p2.x - oldPoint.x, p.p2.y - oldPoint.y);
                return distToP1 < connectionTolerance || distToP2 < connectionTolerance;
            });

            // SNAP SİSTEMİ: X-Y hizalaması için snap (üst üste bindirmek değil!)
            const PIPE_ENDPOINT_SNAP_DISTANCE = 10; // cm
            let pipeSnapX = null;
            let pipeSnapY = null;
            let minPipeSnapDistX = PIPE_ENDPOINT_SNAP_DISTANCE;
            let minPipeSnapDistY = PIPE_ENDPOINT_SNAP_DISTANCE;

            // 1) Aynı borunun DİĞER ucunun X ve Y koordinatlarına snap
            const ownOtherEndpoint = this.dragEndpoint === 'p1' ? pipe.p2 : pipe.p1;

            // X hizasına snap
            const ownXDiff = Math.abs(finalPos.x - ownOtherEndpoint.x);
            if (ownXDiff < minPipeSnapDistX) {
                minPipeSnapDistX = ownXDiff;
                pipeSnapX = ownOtherEndpoint.x;
            }

            // Y hizasına snap
            const ownYDiff = Math.abs(finalPos.y - ownOtherEndpoint.y);
            if (ownYDiff < minPipeSnapDistY) {
                minPipeSnapDistY = ownYDiff;
                pipeSnapY = ownOtherEndpoint.y;
            }

            // 2) Bağlı boruların DİĞER uçlarına snap (X-Y hizalaması için)
            connectedPipes.forEach(connectedPipe => {
                // Bağlı borunun DİĞER ucunu bul
                const distToP1 = Math.hypot(connectedPipe.p1.x - oldPoint.x, connectedPipe.p1.y - oldPoint.y);
                const distToP2 = Math.hypot(connectedPipe.p2.x - oldPoint.x, connectedPipe.p2.y - oldPoint.y);

                // Hangi uç bağlı değilse o ucu al
                const otherEndpoint = distToP1 < connectionTolerance ? connectedPipe.p2 : connectedPipe.p1;

                // X hizasına snap kontrolü
                const xDiff = Math.abs(finalPos.x - otherEndpoint.x);
                if (xDiff < minPipeSnapDistX) {
                    minPipeSnapDistX = xDiff;
                    pipeSnapX = otherEndpoint.x;
                }

                // Y hizasına snap kontrolü
                const yDiff = Math.abs(finalPos.y - otherEndpoint.y);
                if (yDiff < minPipeSnapDistY) {
                    minPipeSnapDistY = yDiff;
                    pipeSnapY = otherEndpoint.y;
                }
            });

            // Boru uç snap'i uygula (duvar snap'inden sonra)
            if (pipeSnapX !== null || pipeSnapY !== null) {
                if (pipeSnapX !== null) finalPos.x = pipeSnapX;
                if (pipeSnapY !== null) finalPos.y = pipeSnapY;
            }

            // NOKTA TAŞIMA KISITLAMASI: Hedef noktada başka bir boru ucu var mı kontrol et
            // Bağlı borular hariç (zaten bağlı oldukları için aynı noktada olabilirler)
            const POINT_OCCUPATION_TOLERANCE = 1.5; // cm - sadece gerçek çakışmaları engelle
            const ELBOW_TOLERANCE = 8; // cm - dirsekler (köşe noktaları) arası minimum mesafe
            const elbowConnectionTolerance = 1;

            // Eski pozisyonu al (sürüklenen ucun şu anki pozisyonu)
            //const oldPoint = this.dragEndpoint === 'p1' ? pipe.p1 : pipe.p2;

            // Basit yaklaşım: Her boru ucunu kontrol et
            let occupiedByOtherPipe = false;
            for (const otherPipe of this.manager.pipes) {
                if (otherPipe === pipe) continue;
                if (connectedPipes.includes(otherPipe)) continue;

                // Her iki ucunu kontrol et
                for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                    // Eğer bu uç bizim eski bağlantımızsa atla
                    const distToOld = Math.hypot(endpoint.x - oldPoint.x, endpoint.y - oldPoint.y);
                    if (distToOld < elbowConnectionTolerance) continue;

                    const dist = Math.hypot(endpoint.x - finalPos.x, endpoint.y - finalPos.y);

                    // Bu uç bir dirsek mi?
                    const isElbow = this.manager.pipes.some(p => {
                        if (p === otherPipe) return false;
                        const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                        const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                        return d1 < elbowConnectionTolerance || d2 < elbowConnectionTolerance;
                    });

                    const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                    if (dist < tolerance) {
                        occupiedByOtherPipe = true;
                        break;
                    }
                }
                if (occupiedByOtherPipe) break;
            }

            // Boru üzerindeki vanaları bul
            const valvesOnPipe = this.manager.components.filter(comp =>
                comp.type === 'vana' && comp.bagliBoruId === pipe.id
            );

            // Minimum uzunluk kontrolü
            const ABSOLUTE_MIN_LENGTH_SERVICE_BOX = 10; // cm - Servis kutusu/sayaç çıkış koruması için
            const MIN_EDGE_DISTANCE = 4; // cm - boru uçlarından minimum mesafe (vanalar için)
            const OBJECT_MARGIN = 2; // cm - nesne marginleri
            const VALVE_WIDTH = 6; // cm
            const MIN_PIPE_LENGTH = 2; // cm - Normal boru-boru bağlantıları için minimum

            // Her vana için gereken minimum mesafe
            const spacePerValve = OBJECT_MARGIN + VALVE_WIDTH + OBJECT_MARGIN; // 10 cm
            const totalValveSpace = valvesOnPipe.length * spacePerValve;

            // Servis kutusu/sayaç bağlantısı var mı kontrol et
            const hasServiceBoxOrMeterConnection =
                pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ||
                pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC;

            // Minimum boru uzunluğu hesapla
            let minLength;
            if (hasServiceBoxOrMeterConnection && this.dragEndpoint === 'p2') {
                // Servis kutusu/sayaç çıkışındaki borunun p2'sini çekiyoruz - 10cm minimum
                minLength = Math.max(ABSOLUTE_MIN_LENGTH_SERVICE_BOX, (2 * MIN_EDGE_DISTANCE) + totalValveSpace);
            } else {
                // Normal boru veya p1 çekme - esnek minimum
                minLength = Math.max(MIN_PIPE_LENGTH, (2 * MIN_EDGE_DISTANCE) + totalValveSpace);
            }

            // Yeni uzunluğu hesapla
            let newLength;
            if (this.dragEndpoint === 'p1') {
                newLength = Math.hypot(finalPos.x - pipe.p2.x, finalPos.y - pipe.p2.y);
            } else {
                newLength = Math.hypot(pipe.p1.x - finalPos.x, pipe.p1.y - finalPos.y);
            }

            console.log('[DEBUG ENDPOINT DRAG]', {
                dragEndpoint: this.dragEndpoint,
                newLength: newLength.toFixed(2),
                minLength: minLength.toFixed(2),
                hasServiceBoxOrMeterConnection,
                connectedPipesCount: connectedPipes.length,
                occupiedByOtherPipe,
                kontrolBasarili: newLength >= minLength,
                uygulanacakMi: !occupiedByOtherPipe && newLength >= minLength
            });

            // Eğer nokta dolu değilse VE minimum uzunluk sağlanıyorsa pozisyonu uygula
            if (!occupiedByOtherPipe && newLength >= minLength) {
                const oldLength = pipe.uzunluk;

                if (this.dragEndpoint === 'p1') {
                    pipe.p1.x = finalPos.x;
                    pipe.p1.y = finalPos.y;
                } else {
                    pipe.p2.x = finalPos.x;
                    pipe.p2.y = finalPos.y;
                }

                // Boru uzunluğu değişti - vana pozisyonlarını güncelle
                // ✨ Vanalar HER ZAMAN p2 (ileri uç) ucundan sabit mesafede kalmalı
                valvesOnPipe.forEach(valve => {
                    // P2'den sabit mesafe hesapla
                    const distanceFromP2 = (1 - valve.boruPozisyonu) * oldLength;
                    valve.boruPozisyonu = 1 - (distanceFromP2 / pipe.uzunluk);
                    valve.fromEnd = 'p2';
                    valve.fixedDistance = distanceFromP2;

                    // Pozisyonu güncelle
                    valve.updatePositionFromPipe(pipe);
                });

                // Fleks artık otomatik olarak boru ucundan koordinat alıyor
                // Ekstra güncelleme gerekmiyor

                // Bağlı boruları güncelle (tüm zinciri)
                this.updateConnectedPipesChain(oldPoint, finalPos);
            } else {
                // Nokta doluysa veya minimum uzunluk sağlanmıyorsa eski pozisyonda kalır (sessizce engelle)
            }
            return;
        }

        // Vana için boru üzerinde kayma (PERFORMANS OPTİMİZASYONU)
        if (this.dragObject.type === 'vana') {
            const vana = this.dragObject;

            // Başlangıçta kaydedilmiş boruyu kullan (her frame tüm boruları taramak yerine)
            let targetPipe = this.dragObjectPipe;
            let objectsOnPipe = this.dragObjectsOnPipe;

            // Boru yoksa veya geçersizse hareket etme
            if (!targetPipe) {
                // console.log('Vana sürüklerken boru bulunamadı - hareket engellendi');
                return;
            }

            // Vana'yı boru üzerinde kaydır (margin kontrolü ile)
            const success = vana.moveAlongPipe(targetPipe, point, objectsOnPipe);

            if (!success) {
                //console.log('Vana boru üzerinde kaydırılamadı - yetersiz mesafe veya sınır dışı');
            }

            return;
        }

        // Servis kutusu için duvara snap
        if (this.dragObject.type === 'servis_kutusu') {
            const walls = state.walls;

            // Snap mesafesi - sabit
            const snapDistance = 30; // 30cm

            // En yakın duvarı bul - MOUSE POZİSYONUNA GÖRE
            let closestWall = null;
            let minDist = Infinity;

            // Mouse pozisyonunu kullan (kutu pozisyonu değil!)
            const mousePos = point;

            walls.forEach(wall => {
                if (!wall.p1 || !wall.p2) return;

                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const len = Math.hypot(dx, dy);
                if (len === 0) return;

                // Mouse'u duvara projeksiyon yap
                const t = Math.max(0, Math.min(1,
                    ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (len * len)
                ));
                const projX = wall.p1.x + t * dx;
                const projY = wall.p1.y + t * dy;

                const dist = Math.hypot(mousePos.x - projX, mousePos.y - projY);

                if (dist < minDist) {
                    minDist = dist;
                    closestWall = wall;
                }
            });

            // Yakın duvara snap yap, yoksa serbest yerleştir
            // useBoxPosition=false ile mouse pozisyonuna göre snap yap (sürüklerken)
            if (closestWall && minDist < snapDistance) {
                this.dragObject.snapToWall(closestWall, point, false);
            } else {
                this.dragObject.placeFree(point);
            }

            // Bağlı boru zincirini güncelle
            if (this.dragObject.bagliBoruId) {
                const boru = this.manager.pipes.find(p => p.id === this.dragObject.bagliBoruId);
                if (boru) {
                    const oldP1 = { ...boru.p1 };
                    const newCikis = this.dragObject.getCikisNoktasi();
                    boru.moveP1(newCikis);
                    // Boru zincirini güncelle
                    this.updateConnectedPipesChain(oldP1, newCikis);
                }
            }
            return;
        }

        // Cihaz taşıma (KOMBI, OCAK, vb.)
        if (this.dragObject.type === 'cihaz') {
            // Cihazı yeni pozisyona taşı
            this.dragObject.move(point.x, point.y);
            // Fleks otomatik güncellenir (move metodu içinde)
            return;
        }

        // Sayaç taşıma - vana + fleks bağlantı noktası + sayaç birlikte taşınır
        if (this.dragObject.type === 'sayac') {
            const sayac = this.dragObject;

            // İlk drag frame'inde sayacın başlangıç pozisyonunu kaydet
            if (!this.dragStartObjectPos) {
                this.dragStartObjectPos = { x: sayac.x, y: sayac.y };
            }

            // Sayacın BAŞLANGIÇ pozisyonu (mouse ile tuttuğum andaki)
            const startX = this.dragStartObjectPos.x;
            const startY = this.dragStartObjectPos.y;

            // ✨ AXIS-LOCK with THRESHOLD: 10cm'den fazla sapma olursa serbest bırak

            const AXIS_LOCK_THRESHOLD = 0; // cm
            const totalDx = Math.abs(point.x - startX);
            const totalDy = Math.abs(point.y - startY);
            let newX, newY;
            // Her iki eksenden de 10cm'den fazla sapmışsa → SERBEST HAREKET
            if (totalDx > AXIS_LOCK_THRESHOLD && totalDy > AXIS_LOCK_THRESHOLD) {
                newX = point.x;
                newY = point.y;
            } else if (totalDx > totalDy) {
                // Yatay hareket → X ekseninde kaydır, Y başlangıçta sabit
                newX = point.x;
                newY = startY;
            } else {
                // Dikey hareket → Y ekseninde kaydır, X başlangıçta sabit
                newX = startX;
                newY = point.y;
            }

            // Delta hesapla
            const dx = newX - sayac.x;
            const dy = newY - sayac.y;

            // Sayacı axis-locked pozisyona taşı (SMOOTH!)
            sayac.move(newX, newY);
            // Çıkış borusunu güncelle (GİRİŞ GİBİ DELTA KADAR TAŞI!)
            // Sadece çıkış borusunun p1 ucunu güncelle, p2 ve bağlı borular sabit
            if (sayac.cikisBagliBoruId) {
                const cikisBoru = this.manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
                if (cikisBoru) {
                    // Eski p1 pozisyonunu kaydet
                    const oldP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                    // Çıkış boru ucunu DELTA kadar taşı (giriş ile aynı mantık)
                    cikisBoru.p1.x += dx;
                    cikisBoru.p1.y += dy;

                    // Yeni p1 pozisyonu
                    const newP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                    // Bağlı boru zincirini güncelle (cihazların fleks bağlantıları için kritik!)
                    this.updateConnectedPipesChain(oldP1, newP1);
                }
            }

            return;
        }

        // Boru gövdesi taşıma - sadece x veya y yönünde (duvar mantığı)
        if (this.dragObject.type === 'boru' && this.isBodyDrag) {
            const pipe = this.dragObject;
            const dx = point.x - this.dragStart.x;
            const dy = point.y - this.dragStart.y;

            // Drag axis'e göre hareketi kısıtla (duvar gibi)
            let offsetX = dx;
            let offsetY = dy;

            if (this.dragAxis === 'x') {
                offsetY = 0; // Sadece X yönünde taşı
            } else if (this.dragAxis === 'y') {
                offsetX = 0; // Sadece Y yönünde taşı
            }
            // dragAxis === null ise her iki yönde de taşınabilir

            // ŞU ANKİ pozisyonları kaydet (henüz güncellenmeden önce)
            const oldP1 = { x: pipe.p1.x, y: pipe.p1.y };
            const oldP2 = { x: pipe.p2.x, y: pipe.p2.y };

            // Yeni pozisyonları hesapla (henüz uygulamadan)
            let newP1, newP2;

            // KORUMA: Servis kutusu/sayaç çıkışındaki borunun p1'i SABİT kalmalı
            if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU ||
                pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.SAYAC) {
                // p1 SABİT - hareket ettirme
                newP1 = { x: oldP1.x, y: oldP1.y };
                // Sadece p2 hareket edebilir
                newP2 = {
                    x: this.bodyDragInitialP2.x + offsetX,
                    y: this.bodyDragInitialP2.y + offsetY
                };
            } else {
                // Normal durum - her iki uç da hareket edebilir
                newP1 = {
                    x: this.bodyDragInitialP1.x + offsetX,
                    y: this.bodyDragInitialP1.y + offsetY
                };
                newP2 = {
                    x: this.bodyDragInitialP2.x + offsetX,
                    y: this.bodyDragInitialP2.y + offsetY
                };
            }

            // NOKTA DOLULUK KONTROLÜ: Yeni pozisyonlarda başka boru uçları var mı?
            const POINT_OCCUPATION_TOLERANCE = 1.5; // cm - sadece gerçek çakışmaları engelle
            const ELBOW_TOLERANCE = 8; // cm - dirsekler (köşe noktaları) arası minimum mesafe
            const connectionTolerance = 1; // Bağlantı tespit toleransı

            // Bağlı borular listesi (bridge mode için zaten var)
            const connectedPipes = [];
            if (this.connectedPipeAtP1) connectedPipes.push(this.connectedPipeAtP1);
            if (this.connectedPipeAtP2) connectedPipes.push(this.connectedPipeAtP2);

            // Basit yaklaşım: Her boru ucunu kontrol et, eğer o uç bir dirsekse 4cm, değilse 1.5cm tolerans
            const checkEndpointDistance = (newPos, checkAgainstOldPos = null) => {
                for (const otherPipe of this.manager.pipes) {
                    if (otherPipe === pipe) continue;
                    if (connectedPipes.includes(otherPipe)) continue;

                    // Her iki ucunu kontrol et
                    for (const endpoint of [otherPipe.p1, otherPipe.p2]) {
                        // Eğer checkAgainstOldPos verilmişse ve bu noktaya çok yakınsa (kendi eski pozisyonu), atla
                        if (checkAgainstOldPos) {
                            const distToOld = Math.hypot(endpoint.x - checkAgainstOldPos.x, endpoint.y - checkAgainstOldPos.y);
                            if (distToOld < connectionTolerance) continue; // Bu bizim eski bağlantımız
                        }

                        const dist = Math.hypot(endpoint.x - newPos.x, endpoint.y - newPos.y);

                        // Bu uç bir dirsek mi? (başka borulara bağlı mı?)
                        const isElbow = this.manager.pipes.some(p => {
                            if (p === otherPipe) return false;
                            const d1 = Math.hypot(p.p1.x - endpoint.x, p.p1.y - endpoint.y);
                            const d2 = Math.hypot(p.p2.x - endpoint.x, p.p2.y - endpoint.y);
                            return d1 < connectionTolerance || d2 < connectionTolerance;
                        });

                        const tolerance = isElbow ? ELBOW_TOLERANCE : POINT_OCCUPATION_TOLERANCE;
                        if (dist < tolerance) {
                            return true; // Çok yakın
                        }
                    }
                }
                return false; // Sorun yok
            };

            // p1 ve p2 kontrolü
            if (checkEndpointDistance(newP1, oldP1) || checkEndpointDistance(newP2, oldP2)) {
                return; // Taşımayı engelle
            }

            // Nokta boşsa pozisyonları uygula
            pipe.p1.x = newP1.x;
            pipe.p1.y = newP1.y;
            pipe.p2.x = newP2.x;
            pipe.p2.y = newP2.y;

            // Mod kontrolü: ARA BORU modu mu NORMAL mod mu?
            if (this.useBridgeMode) {
                // ✅ ARA BORU MODU: Bağlı boruları TAŞIMA, ara borular oluştur
                // Ghost ara boruları oluştur (preview için)
                this.ghostBridgePipes = [];
                const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

                // p1 tarafı için ghost boru
                if (this.connectedPipeAtP1) {
                    const dist = Math.hypot(pipe.p1.x - this.bodyDragInitialP1.x, pipe.p1.y - this.bodyDragInitialP1.y);
                    if (dist >= MIN_BRIDGE_LENGTH) {
                        this.ghostBridgePipes.push({
                            p1: { ...this.bodyDragInitialP1 },
                            p2: { ...pipe.p1 },
                            type: 'ghost_bridge'
                        });
                    }
                }

                // p2 tarafı için ghost boru
                if (this.connectedPipeAtP2) {
                    const dist = Math.hypot(pipe.p2.x - this.bodyDragInitialP2.x, pipe.p2.y - this.bodyDragInitialP2.y);
                    if (dist >= MIN_BRIDGE_LENGTH) {
                        this.ghostBridgePipes.push({
                            p1: { ...pipe.p2 },
                            p2: { ...this.bodyDragInitialP2 },
                            type: 'ghost_bridge'
                        });
                    }
                }
            } else {
                // ⚠️ NORMAL MOD: Bağlı boruları da taşı
                this.ghostBridgePipes = []; // Ghost yok
                this.updateConnectedPipesChain(oldP1, pipe.p1);
                this.updateConnectedPipesChain(oldP2, pipe.p2);
            }

            return;
        }

        // Diğer objeler için normal taşıma
        if (this.dragObject.type !== 'boru') {
            const result = this.dragObject.move(point.x, point.y);
            this.updateConnectedPipe(result);
        }
    }

    /**
     * Bağlı boru zincirini günceller - sadece taşınan noktaları güncelle
     */
    updateConnectedPipesChain(oldPoint, newPoint) {
        const tolerance = 2.0; // cm - Daha geniş tolerans (bağlantı kopmaması için)

        let updatedCount = 0;
        // Basit iterative güncelleme - tüm boruları tek geçişte güncelle
        this.manager.pipes.forEach(pipe => {
            // p1'i güncelle (mesafe ile)
            const distP1 = Math.hypot(pipe.p1.x - oldPoint.x, pipe.p1.y - oldPoint.y);
            if (distP1 < tolerance) {
                pipe.p1.x = newPoint.x;
                pipe.p1.y = newPoint.y;
                updatedCount++;
            }

            // p2'yi güncelle (mesafe ile)
            const distP2 = Math.hypot(pipe.p2.x - oldPoint.x, pipe.p2.y - oldPoint.y);
            if (distP2 < tolerance) {
                pipe.p2.x = newPoint.x;
                pipe.p2.y = newPoint.y;
                updatedCount++;
            }
        });

        // ÖNEMLİ: baslangicBaglanti/bitisBaglanti ile bağlı boruları da kontrol et ve düzelt
        // (Mesafe toleransı dışında kalmış bağlantıları yakala)
        this.manager.pipes.forEach(pipe => {
            // baslangicBaglanti ile bağlı başka bir boru var mı?
            if (pipe.baslangicBaglanti?.tip === BAGLANTI_TIPLERI.BORU) {
                const connectedPipe = this.manager.pipes.find(p => p.id === pipe.baslangicBaglanti.hedefId);
                if (connectedPipe) {
                    // Bağlı borunun p2'si bizim p1'imize eşit olmalı
                    const dist = Math.hypot(connectedPipe.p2.x - pipe.p1.x, connectedPipe.p2.y - pipe.p1.y);
                    if (dist > 0.1) {
                        // Bağlantı kopmuş! Düzelt
                        connectedPipe.p2.x = pipe.p1.x;
                        connectedPipe.p2.y = pipe.p1.y;
                        updatedCount++;
                        console.warn('[FIX] Bağlantı kopmuş - baslangicBaglanti düzeltildi:', {
                            pipeId: pipe.id,
                            connectedPipeId: connectedPipe.id,
                            distance: dist.toFixed(2)
                        });
                    }
                }
            }

            // bitisBaglanti ile bağlı başka bir boru var mı?
            if (pipe.bitisBaglanti?.tip === BAGLANTI_TIPLERI.BORU) {
                const connectedPipe = this.manager.pipes.find(p => p.id === pipe.bitisBaglanti.hedefId);
                if (connectedPipe) {
                    // Bağlı borunun p1'i bizim p2'mize eşit olmalı
                    const dist = Math.hypot(connectedPipe.p1.x - pipe.p2.x, connectedPipe.p1.y - pipe.p2.y);
                    if (dist > 0.1) {
                        // Bağlantı kopmuş! Düzelt
                        connectedPipe.p1.x = pipe.p2.x;
                        connectedPipe.p1.y = pipe.p2.y;
                        updatedCount++;
                        console.warn('[FIX] Bağlantı kopmuş - bitisBaglanti düzeltildi:', {
                            pipeId: pipe.id,
                            connectedPipeId: connectedPipe.id,
                            distance: dist.toFixed(2)
                        });
                    }
                }
            }
        });

        if (updatedCount > 0) {
            console.log('[DEBUG updateConnectedPipesChain]', {
                updatedEndpoints: updatedCount,
                oldPoint: { x: oldPoint.x.toFixed(1), y: oldPoint.y.toFixed(1) },
                newPoint: { x: newPoint.x.toFixed(1), y: newPoint.y.toFixed(1) }
            });
        }

        // Fleks artık boruId ve endpoint ('p1'/'p2') saklıyor
        // Koordinatlar her zaman borudan okunuyor, ekstra güncelleme gerekmiyor
    }

    endDrag() {
        // Body drag bittiğinde ara borular oluştur
        if (this.isBodyDrag && this.dragObject && this.dragObject.type === 'boru') {
            const draggedPipe = this.dragObject;
            const oldP1 = this.bodyDragInitialP1;
            const oldP2 = this.bodyDragInitialP2;
            const newP1 = draggedPipe.p1;
            const newP2 = draggedPipe.p2;

            // ⚠️ Sadece BRIDGE MODE ise ara borular oluştur
            if (!this.useBridgeMode) {
                // Normal modda zaten updateConnectedPipesChain çağrıldı
                // Hiçbir şey yapma
            } else {
                // Minimum mesafe kontrolü (ara boru oluşturmaya değer mi?)
                const MIN_BRIDGE_LENGTH = 5; // 5 cm minimum (kısa hatlar için daha esnek)

                // Başlangıçta tespit edilen bağlantıları kullan
                const connectedAtP1 = this.connectedPipeAtP1;
                const connectedAtP2 = this.connectedPipeAtP2;

                // p1 tarafına ara boru ekle
                if (connectedAtP1) {
                    const distP1 = Math.hypot(newP1.x - oldP1.x, newP1.y - oldP1.y);
                    if (distP1 >= MIN_BRIDGE_LENGTH) {
                        const bridgePipe1 = new Boru(
                            { x: oldP1.x, y: oldP1.y, z: oldP1.z || 0 },
                            { x: newP1.x, y: newP1.y, z: newP1.z || 0 },
                            draggedPipe.boruTipi
                        );
                        bridgePipe1.floorId = draggedPipe.floorId;

                        // ✨ DÜZELTME: Rengi kopyala (TURQUAZ ise TURQUAZ kalsın)
                        bridgePipe1.colorGroup = draggedPipe.colorGroup;

                        this.manager.pipes.push(bridgePipe1);
                    }
                }

                // p2 tarafına ara boru ekle
                if (connectedAtP2) {
                    const distP2 = Math.hypot(newP2.x - oldP2.x, newP2.y - oldP2.y);
                    if (distP2 >= MIN_BRIDGE_LENGTH) {
                        const bridgePipe2 = new Boru(
                            { x: newP2.x, y: newP2.y, z: newP2.z || 0 },
                            { x: oldP2.x, y: oldP2.y, z: oldP2.z || 0 },
                            draggedPipe.boruTipi
                        );
                        bridgePipe2.floorId = draggedPipe.floorId;

                        // ✨ DÜZELTME: Rengi kopyala (TURQUAZ ise TURQUAZ kalsın)
                        bridgePipe2.colorGroup = draggedPipe.colorGroup;

                        this.manager.pipes.push(bridgePipe2);
                    }
                }
            } // useBridgeMode if bloğu kapanışı
        }

        this.isDragging = false;
        this.dragObject = null;
        this.dragEndpoint = null;
        this.dragStart = null;
        this.dragStartObjectPos = null; // ✨ Sayaç başlangıç pozisyonunu temizle
        this.isBodyDrag = false;
        this.bodyDragInitialP1 = null;
        this.bodyDragInitialP2 = null;
        this.dragAxis = null;
        this.connectedPipeAtP1 = null; // Bağlantı referanslarını temizle
        this.connectedPipeAtP2 = null; // Bağlantı referanslarını temizle
        this.ghostBridgePipes = []; // Ghost boruları temizle
        this.pipeEndpointSnapLock = null; // Snap lock'u temizle
        this.pipeSnapMouseStart = null; // Mouse start pozisyonunu temizle
        this.manager.saveToState();
        saveState(); // Save to undo history
    }

    /**
     * Döndürme tutamacını bul (çubuğun ucundaki daire) - yukarı yönde
     */
    findRotationHandleAt(obj, point, tolerance = 8) {
        if (!obj) return false;
        if (obj.type !== 'servis_kutusu' && obj.type !== 'cihaz' && obj.type !== 'sayac') return false;

        let handleLength;
        if (obj.type === 'servis_kutusu') {
            const SERVIS_KUTUSU_CONFIG = { width: 40, height: 20 };
            handleLength = SERVIS_KUTUSU_CONFIG.height / 2 + 20;
        } else if (obj.type === 'cihaz') {
            // Cihaz için: 30 cm çapında, handle 20 cm yukarıda (yarıya düşürüldü)
            handleLength = 15 + 20; // radius + 20cm = 35cm
        } else if (obj.type === 'sayac') {
            // Sayaç için: handle merkezden yukarıda
            handleLength = - 20; // 12 + 20 = 32cm
        }

        // Tutamacın world pozisyonunu hesapla (yukarı yönde, rotation dikkate alınarak)
        // Local: (0, -handleLength) → World: dönüşüm matrisi uygula
        const rad = (obj.rotation || 0) * Math.PI / 180;
        const handleX = obj.x + handleLength * Math.sin(rad);
        const handleY = obj.y - handleLength * Math.cos(rad);

        const dist = Math.hypot(point.x - handleX, point.y - handleY);
        return dist < tolerance;
    }

    /**
     * Döndürme başlat
     */
    startRotation(obj, point) {
        saveState();
        this.isRotating = true;
        this.dragObject = obj;

        // Merkez noktası
        const center = { x: obj.x, y: obj.y };

        // Başlangıç açısını hesapla
        const initialAngle = Math.atan2(point.y - center.y, point.x - center.x);
        const initialRotationRad = (obj.rotation || 0) * Math.PI / 180;
        this.rotationOffset = initialRotationRad - initialAngle;

    }

    /**
     * Döndürme işle
     */
    handleRotation(point) {
        if (!this.dragObject) return;

        const obj = this.dragObject;
        const center = { x: obj.x, y: obj.y };

        // Yeni açıyı hesapla
        const mouseAngle = Math.atan2(point.y - center.y, point.x - center.x);
        let newRotationRad = mouseAngle + this.rotationOffset;

        // 1 derecelik snap
        const snapAngleRad = (1 * Math.PI / 180);
        newRotationRad = Math.round(newRotationRad / snapAngleRad) * snapAngleRad;
        let newRotationDeg = newRotationRad * 180 / Math.PI;

        // 90 dereceye snap (5 derece threshold)
        const remainder = newRotationDeg % 90;
        const snapThreshold = 5;
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }

        if (obj.type === 'servis_kutusu') {
            // ÖNEMLI: Çıkış noktası sabit kalmalı, kutu merkezi hareket etmeli
            // Eski çıkış noktasını kaydet
            const eskiCikis = obj.getCikisNoktasi();

            // Rotasyonu değiştir
            obj.rotation = newRotationDeg;

            // Yeni çıkış noktasını hesapla
            const yeniCikis = obj.getCikisNoktasi();

            // Kutu merkezini ayarla (çıkış noktası sabit kalsın)
            obj.x += eskiCikis.x - yeniCikis.x;
            obj.y += eskiCikis.y - yeniCikis.y;

            // Bağlı boruyu güncelle (çıkış noktası değişmedi, güncellemeye gerek yok)
            // Ama yine de çağıralım, emin olmak için
            if (obj.bagliBoruId) {
                const boru = this.manager.pipes.find(p => p.id === obj.bagliBoruId);
                if (boru) {
                    boru.moveP1(obj.getCikisNoktasi());
                }
            }
        } else if (obj.type === 'cihaz') {
            // Cihaz: Merkez sabit, sadece rotation değişir
            // Açıyı 0-360 aralığına normalize et
            let normalizedRotation = newRotationDeg % 360;
            if (normalizedRotation < 0) normalizedRotation += 360;
            obj.rotation = normalizedRotation;

            // Fleks artık her render'da borudan koordinat okuyor
            // Döndürme sonrası ekstra güncelleme gerekmiyor
        } else if (obj.type === 'sayac') {
            // Sayaç: Merkez sabit, rotation değişir
            let normalizedRotation = newRotationDeg % 360;
            if (normalizedRotation < 0) normalizedRotation += 360;
            obj.rotation = normalizedRotation;

            // Çıkış borusunu güncelle (çıkış noktası döndükçe değişir)
            if (obj.cikisBagliBoruId) {
                const cikisBoru = this.manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
                if (cikisBoru) {
                    // Eski p1 pozisyonunu kaydet
                    const oldP1 = { x: cikisBoru.p1.x, y: cikisBoru.p1.y };

                    // Sayaç çıkışı boru p1'e bağlı
                    const yeniCikis = obj.getCikisNoktasi();
                    cikisBoru.moveP1(yeniCikis);

                    // Bağlı boru zincirini güncelle
                    this.updateConnectedPipesChain(oldP1, yeniCikis);
                }
            }
        }
    }

    /**
     * Döndürme bitir
     */
    endRotation() {
        this.isRotating = false;
        this.dragObject = null;
        this.rotationOffset = 0;
        this.manager.saveToState();
        saveState(); // Save to undo history
    }

    updateConnectedPipe(result) {
        if (!result) return;

        if (result.bagliBoruId && result.delta) {
            const boru = this.manager.pipes.find(p => p.id === result.bagliBoruId);
            if (boru) {
                // Eski p1 pozisyonunu kaydet
                const oldP1 = { x: boru.p1.x, y: boru.p1.y };

                boru.moveP1({
                    x: boru.p1.x + result.delta.x,
                    y: boru.p1.y + result.delta.y
                });

                // Yeni p1 pozisyonu
                const newP1 = { x: boru.p1.x, y: boru.p1.y };

                // Bağlı boru zincirini güncelle
                this.updateConnectedPipesChain(oldP1, newP1);
            }
        }

        if (result.cikisBagliBoruId && result.yeniCikis) {
            const boru = this.manager.pipes.find(p => p.id === result.cikisBagliBoruId);
            if (boru) {
                // Eski p1 pozisyonunu kaydet
                const oldP1 = { x: boru.p1.x, y: boru.p1.y };

                boru.moveP1(result.yeniCikis);

                // Bağlı boru zincirini güncelle
                this.updateConnectedPipesChain(oldP1, result.yeniCikis);
            }
        }
    }

    removeObject(obj) {
        if (obj.type === 'boru') {
            // Bağlı boruları bul ve bağlantıyı güncelle
            const deletedPipe = obj;

            // Silme sonrası seçilecek boruyu belirle
            let pipeToSelect = null;

            // p2'ye bağlı boruyu/boruları bul (silinecek borunun devamı)
            const tolerance = 1;
            const nextPipes = this.manager.pipes.filter(p =>
                p.id !== deletedPipe.id &&
                Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < tolerance
            );

            // Eğer tek bir sonraki boru varsa onu seç
            if (nextPipes.length === 1) {
                pipeToSelect = nextPipes[0];
            } else {
                // Sonraki boru yoksa veya birden fazla varsa, önceki boruyu seç
                const prevPipe = this.manager.pipes.find(p =>
                    p.id !== deletedPipe.id &&
                    Math.hypot(p.p2.x - deletedPipe.p1.x, p.p2.y - deletedPipe.p1.y) < tolerance
                );
                if (prevPipe) {
                    pipeToSelect = prevPipe;
                }
            }

            // p2'ye bağlı boruyu bul (silinecek borunun devamı)
            const nextPipe = this.manager.pipes.find(p =>
                p.id !== deletedPipe.id &&
                Math.hypot(p.p1.x - deletedPipe.p2.x, p.p1.y - deletedPipe.p2.y) < 1
            );

            // Eğer devam eden boru varsa, başlangıcını silinecek borunun başlangıcına bağla
            if (nextPipe) {
                const oldP1 = { x: nextPipe.p1.x, y: nextPipe.p1.y };
                const newP1 = { x: deletedPipe.p1.x, y: deletedPipe.p1.y };

                // İlerdeki noktayı gerideki noktaya taşı
                nextPipe.p1.x = newP1.x;
                nextPipe.p1.y = newP1.y;

                // ÖNEMLI: Silinen borunun vanası varsa ve nextPipe'ın başında (t=0) vanası varsa,
                // nextPipe'ın vanasını da sil (çünkü aynı noktada iki vana olamaz)
                if (deletedPipe.vana && nextPipe.vana && nextPipe.vana.t === 0) {
                    nextPipe.vanaKaldir();
                }

                // Bağlantı bilgisini aktar
                if (deletedPipe.baslangicBaglanti.hedefId) {
                    nextPipe.setBaslangicBaglanti(
                        deletedPipe.baslangicBaglanti.tip,
                        deletedPipe.baslangicBaglanti.hedefId,
                        deletedPipe.baslangicBaglanti.noktaIndex
                    );

                    // Servis kutusu bağlantısını güncelle
                    if (deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                        const servisKutusu = this.manager.components.find(
                            c => c.id === deletedPipe.baslangicBaglanti.hedefId
                        );
                        if (servisKutusu) {
                            servisKutusu.baglaBoru(nextPipe.id);
                        }
                    }
                }

                // Bağlı boru zincirini güncelle (ilerdeki tüm borular)
                this.updateConnectedPipesChain(oldP1, newP1);
            } else {
                // nextPipe yok - servis kutusu/sayaç bağlantısını temizle
                if (deletedPipe.baslangicBaglanti && deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SERVIS_KUTUSU) {
                    const servisKutusu = this.manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (servisKutusu) {
                        servisKutusu.boruBaglantisinKaldir();
                    }
                }
                // Sayaç bağlantısını temizle
                if (deletedPipe.baslangicBaglanti && deletedPipe.baslangicBaglanti.tip === BAGLANTI_TIPLERI.SAYAC) {
                    const sayac = this.manager.components.find(
                        c => c.id === deletedPipe.baslangicBaglanti.hedefId
                    );
                    if (sayac) {
                        sayac.cikisBagliBoruId = null;
                    }
                }
            }

            // Boru silindiğinde, bu boruya fleks ile bağlı cihazları da sil
            const devicesToRemove = this.manager.components.filter(comp =>
                comp.type === 'cihaz' && comp.fleksBaglanti && comp.fleksBaglanti.boruId === deletedPipe.id
            );
            devicesToRemove.forEach(device => {
                const idx = this.manager.components.findIndex(c => c.id === device.id);
                if (idx !== -1) this.manager.components.splice(idx, 1);

                // İlişkili vanayı da sil
                if (device.iliskiliVanaId) {
                    const vanaIdx = this.manager.components.findIndex(c => c.id === device.iliskiliVanaId);
                    if (vanaIdx !== -1) this.manager.components.splice(vanaIdx, 1);
                }
            });

            // Bu boruda bağlı vanaları da sil (bağımsız vana nesneleri)
            const valvesToRemove = this.manager.components.filter(comp =>
                comp.type === 'vana' && comp.bagliBoruId === deletedPipe.id
            );
            valvesToRemove.forEach(vana => {
                const idx = this.manager.components.findIndex(c => c.id === vana.id);
                if (idx !== -1) this.manager.components.splice(idx, 1);
            });

            const index = this.manager.pipes.findIndex(p => p.id === obj.id);
            if (index !== -1) this.manager.pipes.splice(index, 1);

            // Boru silindikten sonra seçilecek boruyu seç
            if (pipeToSelect) {
                this.selectObject(pipeToSelect);
            }
        } else if (obj.type === 'servis_kutusu') {
            // Servis kutusu silinirken bağlı tüm boruları da sil
            const bagliBoruId = obj.bagliBoruId;
            if (bagliBoruId) {
                // Bağlı boruyu bul
                const bagliBoruIndex = this.manager.pipes.findIndex(p => p.id === bagliBoruId);
                if (bagliBoruIndex !== -1) {
                    const bagliBoruZinciri = this.findConnectedPipesChain(this.manager.pipes[bagliBoruIndex]);
                    // Tüm zinciri sil
                    bagliBoruZinciri.forEach(pipe => {
                        const idx = this.manager.pipes.findIndex(p => p.id === pipe.id);
                        if (idx !== -1) this.manager.pipes.splice(idx, 1);
                    });
                }
            }

            // Servis kutusunu sil
            const index = this.manager.components.findIndex(c => c.id === obj.id);
            if (index !== -1) this.manager.components.splice(index, 1);
        } else if (obj.type === 'sayac') {
            // 1. Bağlı boruları bul
            const girisBoruId = obj.fleksBaglanti?.boruId;
            const cikisBoruId = obj.cikisBagliBoruId;

            // 2. Hem giriş hem çıkış borusu varsa birleştir
            if (girisBoruId && cikisBoruId) {
                const girisBoru = this.manager.pipes.find(p => p.id === girisBoruId);
                const cikisBoru = this.manager.pipes.find(p => p.id === cikisBoruId);

                if (girisBoru && cikisBoru) {
                    // Giriş borusunun ucu (vananın olduğu yer)
                    const targetPoint = obj.fleksBaglanti.endpoint === 'p1' ? girisBoru.p1 : girisBoru.p2;

                    // Çıkış borusunun başlangıcını (p1) giriş borusunun ucuna taşı
                    cikisBoru.moveP1(targetPoint);

                    // Bağlantı tiplerini güncelle (Artık birbirlerine bağlılar)
                    cikisBoru.setBaslangicBaglanti('boru', girisBoru.id);
                    // Giris borusunun bitiş bağlantısını güncelle
                    if (obj.fleksBaglanti.endpoint === 'p2') {
                        girisBoru.setBitisBaglanti('boru', cikisBoru.id);
                    } else {
                        girisBoru.setBaslangicBaglanti('boru', cikisBoru.id);
                    }
                }
            }

            // Vanayı (iliskiliVanaId) silmiyoruz, kullanıcı isterse manuel silsin.

            // 3. Sayacı components dizisinden sil
            const idx = this.manager.components.findIndex(c => c.id === obj.id);
            if (idx !== -1) this.manager.components.splice(idx, 1);
        }
        else {
            const idx = this.manager.components.findIndex(c => c.id === obj.id);
            if (idx !== -1) this.manager.components.splice(idx, 1);

            const pIdx = this.manager.pipes.findIndex(p => p.id === obj.id);
            if (pIdx !== -1) this.manager.pipes.splice(pIdx, 1);
        }
    }

    /**
     * Bağlı boru ağını bul (BFS - tüm dalları takip eder, T-bağlantıları dahil)
     */
    findConnectedPipesChain(startPipe) {
        const allConnected = [];
        const visited = new Set();
        const queue = [startPipe];
        const tolerance = 1; // 1 cm

        visited.add(startPipe.id);

        while (queue.length > 0) {
            const currentPipe = queue.shift();
            allConnected.push(currentPipe);

            // currentPipe'ın her iki ucuna bağlı boruları bul
            this.manager.pipes.forEach(otherPipe => {
                if (visited.has(otherPipe.id)) return;

                // p1'e bağlı mı?
                const p1ToCurrentP1 = Math.hypot(otherPipe.p1.x - currentPipe.p1.x, otherPipe.p1.y - currentPipe.p1.y);
                const p1ToCurrentP2 = Math.hypot(otherPipe.p1.x - currentPipe.p2.x, otherPipe.p1.y - currentPipe.p2.y);
                const p2ToCurrentP1 = Math.hypot(otherPipe.p2.x - currentPipe.p1.x, otherPipe.p2.y - currentPipe.p1.y);
                const p2ToCurrentP2 = Math.hypot(otherPipe.p2.x - currentPipe.p2.x, otherPipe.p2.y - currentPipe.p2.y);

                // Herhangi bir ucu bağlı mı kontrol et
                if (p1ToCurrentP1 < tolerance || p1ToCurrentP2 < tolerance ||
                    p2ToCurrentP1 < tolerance || p2ToCurrentP2 < tolerance) {
                    visited.add(otherPipe.id);
                    queue.push(otherPipe);
                }
            });
        }

        return allConnected;
    }

    getGeciciBoruCizgisi() {
        if (!this.boruCizimAktif || !this.boruBaslangic || !this.geciciBoruBitis) {
            return null;
        }
        return { p1: this.boruBaslangic.nokta, p2: this.geciciBoruBitis };
    }

}