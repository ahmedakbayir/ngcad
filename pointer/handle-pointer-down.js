/**
 * Pointer Down Handler
 * Mouse tıklama işlemlerini yönetir
 */

import { screenToWorld } from '../draw/geometry.js';
import { dom, state } from '../general-files/main.js';
import { BAGLANTI_TIPLERI } from '../plumbing_v2/objects/pipe.js';
import { TESISAT_CONSTANTS } from '../plumbing_v2/interactions/tesisat-snap.js';
import { pixelsToWorld } from '../plumbing_v2/interactions/finders.js';

export function handlePointerDown(e) {
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
        // Piksel bazlı tolerance - zoom bağımsız
        const worldTolerance = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
        const boruUcu = this.findBoruUcuAt(point, worldTolerance);
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
    // Piksel bazlı tolerance - zoom bağımsız
    const worldTolerance2 = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    const boruUcu2 = this.findBoruUcuAt(point, worldTolerance2);
    if (boruUcu2) {
        const deviceVar = this.hasDeviceAtEndpoint(boruUcu2.boruId, boruUcu2.uc);
        const meterVar = this.hasMeterAtEndpoint(boruUcu2.boruId, boruUcu2.uc);

        if (deviceVar || meterVar) {
            console.warn("🚫 Bu uçta Cihaz/Sayaç fleksi var! Tesisat devam ettirilemez.");
            return true; // Çizimi başlatmadan fonksiyondan çık
        }

        this.startBoruCizim(boruUcu2.nokta, boruUcu2.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    // 6. Boru gövdesinden çizim başlat
    // Piksel bazlı tolerance - zoom bağımsız
    const worldTolerance3 = pixelsToWorld(TESISAT_CONSTANTS.SELECTION_TOLERANCE_PIXELS);
    const boruGovde = this.findBoruGovdeAt(point, worldTolerance3);
    if (boruGovde) {
        this.startBoruCizim(boruGovde.nokta, boruGovde.boruId, BAGLANTI_TIPLERI.BORU);
        return true;
    }

    // 7. Boş alana tıklama - seçimi kaldır
    this.deselectObject();
    return false;
}
