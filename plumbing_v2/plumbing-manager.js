/**
 * PlumbingManager (v2)
 * Merkezi tesisat yönetim sınıfı - yeni bileşenlerle entegre
 */

import { state } from '../general-files/main.js';
import { InteractionManager, TESISAT_MODLARI } from './interactions/interaction-manager.js';
import { PlumbingRenderer } from './plumbing-renderer.js';
import { ServisKutusu } from './objects/service-box.js';
import { Boru, createBoru } from './objects/pipe.js';
import { Sayac, createSayac } from './objects/meter.js';
import { Vana, createVana } from './objects/valve.js';
import { Cihaz, createCihaz } from './objects/device.js';
import { Baca, createBaca } from './objects/chimney.js';

export class PlumbingManager {
    constructor() {
        this.pipes = [];
        this.components = []; // Servis kutusu, sayaç, vana, cihaz
        this.activeTool = null;
        this.tempComponent = null; // Ghost eleman

        // Alt modüller
        this.interactionManager = new InteractionManager(this);
        this.renderer = new PlumbingRenderer();

        // Singleton
        if (!window.plumbingManager) {
            window.plumbingManager = this;
        }
    }

    static getInstance() {
        return window.plumbingManager || new PlumbingManager();
    }

    init() {
    }

    /**
     * Bileşen yerleştirme modunu başlat
     */
    startPlacement(type, options = {}) {
        this.activeTool = type;

        // Yeni placement başladığında eski mouse pozisyonunu sıfırla
        // Böylece ghost görüntü önceki cihazın konumunda başlamaz
        this.interactionManager.lastMousePoint = null;

        // Ghost bileşen oluştur
        switch (type) {
            case TESISAT_MODLARI.SERVIS_KUTUSU:
                this.tempComponent = new ServisKutusu(0, 0, {
                    floorId: state.currentFloorId,
                    cikisYonu: options.cikisYonu
                });
                break;

            case TESISAT_MODLARI.SAYAC:
                this.tempComponent = createSayac(0, 0, {
                    floorId: state.currentFloorId
                });
                break;

            case TESISAT_MODLARI.VANA:
                this.tempComponent = createVana(0, 0, options.vanaTipi || 'AKV', {
                    floorId: state.currentFloorId
                });
                break;

            case TESISAT_MODLARI.CIHAZ:
                this.tempComponent = createCihaz(0, 0, options.cihazTipi || 'KOMBI', {
                    floorId: state.currentFloorId
                });
                break;

            case TESISAT_MODLARI.BACA:
                // Baca için geçici nesne - henüz cihaza bağlı değil
                this.tempComponent = createBaca(0, 0, null, {
                    floorId: state.currentFloorId
                });
                break;

            default:
                return;
        }

    }

    /**
     * Modu ayarla
     */
    setMode(mode) {
        this.activeTool = mode;

        if (mode === null) {
            this.tempComponent = null;
            this.interactionManager.cancelCurrentAction();
        }
    }

    /**
     * Boru ekleme modunu başlat
     */
    startPipeMode() {
        this.activeTool = TESISAT_MODLARI.BORU;
        // Boru modu InteractionManager tarafından yönetilir
    }

    /**
     * ID ile bileşen bul
     */
    findComponentById(id) {
        return this.components.find(c => c.id === id);
    }

    /**
     * ID ile boru bul
     */
    findPipeById(id) {
        return this.pipes.find(p => p.id === id);
    }

    /**
     * Bileşen sil
     */
    deleteComponent(id) {
        const index = this.components.findIndex(c => c.id === id);
        if (index !== -1) {
            this.components.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Boru sil
     */
    deletePipe(id) {
        const index = this.pipes.findIndex(p => p.id === id);
        if (index !== -1) {
            this.pipes.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Tümünü temizle
     */
    clearAll() {
        this.pipes = [];
        this.components = [];
        this.tempComponent = null;
        this.activeTool = null;
    }

    /**
     * Boş boru uçlarını bul (başlangıç veya bitiş ucu boş olan borular)
     * @returns {Array} Her boru için {pipe, end: 'p1' veya 'p2'} döndürür
     */
    getBosBitisBorular() {
        const bosUclar = [];
        const currentFloorId = state.currentFloor?.id;

        for (const pipe of this.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && pipe.floorId && pipe.floorId !== currentFloorId) {
                continue;
            }

            // p1 ucu kontrol et
            if (!pipe.baslangicBaglanti.hedefId) {
                // Gerçekten boş mu? (T-junction veya başka bir boru bağlı değil mi?)
                if (this.isTrulyFreeEndpoint(pipe.p1)) {
                    bosUclar.push({ pipe, end: 'p1' });
                }
            }

            // p2 ucu kontrol et
            if (!pipe.bitisBaglanti.hedefId) {
                // Gerçekten boş mu? (T-junction veya başka bir boru bağlı değil mi?)
                if (this.isTrulyFreeEndpoint(pipe.p2)) {
                    bosUclar.push({ pipe, end: 'p2' });
                }
            }
        }

        return bosUclar;
    }

    /**
     * Bir noktanın gerçekten boş uç olup olmadığını kontrol eder
     * (T-junction, başka boru bağlantısı yok)
     */
    isTrulyFreeEndpoint(point, tolerance = 1) {
        let pipeCount = 0;
        const currentFloorId = state.currentFloor?.id;

        for (const boru of this.pipes) {
            // Sadece aktif kattaki boruları kontrol et
            if (currentFloorId && boru.floorId && boru.floorId !== currentFloorId) {
                continue;
            }

            const distP1 = Math.hypot(point.x - boru.p1.x, point.y - boru.p1.y);
            const distP2 = Math.hypot(point.x - boru.p2.x, point.y - boru.p2.y);

            if (distP1 < tolerance || distP2 < tolerance) {
                pipeCount++;
            }

            // T-junction veya daha karmaşık (3+ boru) - DOLU UÇ
            if (pipeCount > 2) {
                return false;
            }
        }

        // Sadece 1 boru varsa gerçek boş uç
        // 2 boru varsa birleşim noktası - DOLU sayılır
        return pipeCount === 1;
    }

    /**
     * Çizim döngüsü
     */
    render(ctx) {
        this.renderer.render(ctx, this);
    }

    /**
     * State'e kaydet
     */
    saveToState() {
        state.plumbingPipes = this.pipes.map(p => p.toJSON());
        state.plumbingBlocks = this.components.map(c => c.toJSON());
    }

    /**
     * State'den yükle
     */
    loadFromState() {
        // DEBUG: Track when state is loaded (this might be corrupting positions!)
        // console.log('═'.repeat(80));
        // console.log('[CRITICAL] loadFromState() CALLED - Pipes being reloaded from state!');
        // console.log('  Stack trace:', new Error().stack);
        // console.log('═'.repeat(80));

        // Boruları yükle
        if (state.plumbingPipes) {
            this.pipes = state.plumbingPipes.map(data => Boru.fromJSON(data));
        }

        // Bileşenleri yükle
        if (state.plumbingBlocks) {
            this.components = state.plumbingBlocks.map(data => {
                switch (data.type) {
                    case 'servis_kutusu':
                        return ServisKutusu.fromJSON(data);
                    case 'sayac':
                        return Sayac.fromJSON(data);
                    case 'vana':
                        return Vana.fromJSON(data);
                    case 'cihaz':
                        return Cihaz.fromJSON(data);
                    case 'baca':
                        return Baca.fromJSON(data);
                    default:
                        return null;
                }
            }).filter(c => c !== null);
        }

        // Tüm sayaçlar için renk güncellemesi yap
        const sayaclar = this.components.filter(c => c.type === 'sayac');
        sayaclar.forEach(sayac => {
            if (sayac.cikisBagliBoruId) {
                this.updatePipeColorsAfterMeter(sayac.id);
            }
        });
    }

    /**
     * Belirli bir boruya bağlı vanaların pozisyonlarını güncelle
     * @param {string} pipeId - Boru ID
     */
    updateValvePositionsForPipe(pipeId) {
        const pipe = this.findPipeById(pipeId);
        if (!pipe) return;

        // Boruda bağlı vanaları bul
        const valves = this.components.filter(
            c => c.type === 'vana' && c.bagliBoruId === pipeId
        );

        // Her vananın pozisyonunu güncelle
        valves.forEach(vana => {
            vana.updatePositionFromPipe(pipe);
        });
    }

    /**
     * Tüm vanaların pozisyonlarını güncelle
     */
    updateAllValvePositions() {
        const valves = this.components.filter(c => c.type === 'vana');

        valves.forEach(vana => {
            if (vana.bagliBoruId) {
                const pipe = this.findPipeById(vana.bagliBoruId);
                if (pipe) {
                    vana.updatePositionFromPipe(pipe);
                }
            }
        });
    }

    /**
     * Boş bir boru ucuna "Kombi" veya "Ocak" gibi bir cihaz yerleştirir.
     * handleCihazEkleme ile tam entegre - vana, fleks otomatik eklenir
     * @param {string} deviceType - Yerleştirilecek cihazın tipi ('KOMBI', 'OCAK', vb.)
     * @param {object} boruUcuInfo - Opsiyonel boru ucu bilgisi {pipe, end, point}
     */
    placeDeviceAtOpenEnd(deviceType, boruUcuInfo = null) {
        // Sadece 'KOMBI' ve 'OCAK' tiplerine izin ver
        if (deviceType !== 'KOMBI' && deviceType !== 'OCAK') {
            // console.warn(`Unsupported device type for automatic placement: ${deviceType}`);
            return false;
        }

        let targetPipe, targetEnd, targetPoint;

        // Eğer özel boru ucu bilgisi verilmişse onu kullan
        if (boruUcuInfo) {
            targetPipe = boruUcuInfo.pipe;
            targetEnd = boruUcuInfo.end;
            targetPoint = boruUcuInfo.point;
        } else {
            // Yoksa, boş boru uçlarını bul
            const openEnds = this.getBosBitisBorular();
            if (openEnds.length === 0) {
                // console.log("Otomatik yerleştirme için boşta boru ucu bulunamadı.");
                return false;
            }

            const { pipe, end } = openEnds[0];
            targetPipe = pipe;
            targetEnd = end;
            targetPoint = pipe[end];
        }

        const floorId = targetPipe.floorId || state.currentFloor?.id;

        // Cihazı oluştur (geçici pozisyon, handleCihazEkleme ayarlayacak)
        const newDevice = createCihaz(targetPoint.x, targetPoint.y, deviceType, { floorId });

        if (!newDevice) {
            // console.error("Cihaz oluşturulamadı.");
            return false;
        }

        // Ghost connection info ekle (handleCihazEkleme kullanır)
        newDevice.ghostConnectionInfo = {
            boruUcu: {
                boruId: targetPipe.id,
                nokta: targetPoint,
                uc: targetEnd,
                boru: targetPipe
            }
        };

        // interactionManager'ın handleCihazEkleme metodunu kullan
        // Bu vana, fleks, pozisyon hesaplama gibi her şeyi otomatik yapar
        // console.log(`[placeDeviceAtOpenEnd] Cihaz oluşturuldu: ${deviceType}, boruUcu:`, {
        //     boruId: targetPipe.id,
        //     end: targetEnd,
        //     nokta: targetPoint
        // });

        const success = this.interactionManager.handleCihazEkleme(newDevice);

        if (success) {
            // handleCihazEkleme cihazı components'a ekledi
            // console.log(`✓ ${deviceType} başarıyla boş boru ucuna eklendi (${targetEnd}) - vana ve fleks ile.`);
            return true;
        } else {
            // console.error(`✗ Cihaz ekleme başarısız oldu. handleCihazEkleme false döndü.`);
            return false;
        }
    }


    /**
     * Verilen noktadaki nesneyi bul
     * @param {object} pos - {x, y} koordinatları
     * @param {number} tolerance - Tolerans değeri
     * @returns {object|null} - Bulunan nesne veya null
     */
    getObjectAtPoint(pos, tolerance = 10) {
        if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
            return null;
        }

        const currentFloorId = state.currentFloor?.id;

        // Manager'ın kendi pipe/component dizilerini kullan (renderer bunları çiziyor)
        const pipes = this.pipes || [];
        const blocks = this.components || [];

        // Floor eşleşme kontrolü - floorId yoksa veya eşleşiyorsa true
        const floorMatches = (objFloorId) => {
            if (!currentFloorId) return true;
            if (!objFloorId) return true;
            return objFloorId === currentFloorId;
        };

        // Önce uç noktaları kontrol et (handle'lar) - ÖNCE NOKTA
        const endpointTolerance = 8; // Nokta seçimi için 8 cm
        for (const pipe of pipes) {
            if (!floorMatches(pipe.floorId)) continue;
            if (!pipe.p1 || !pipe.p2) continue;

            const distP1 = Math.hypot(pos.x - pipe.p1.x, pos.y - pipe.p1.y);
            if (distP1 < endpointTolerance) {
                return { type: 'pipe', object: pipe, handle: 'p1' };
            }

            const distP2 = Math.hypot(pos.x - pipe.p2.x, pos.y - pipe.p2.y);
            if (distP2 < endpointTolerance) {
                return { type: 'pipe', object: pipe, handle: 'p2' };
            }
        }

        // Bileşenleri kontrol et (vana, servis kutusu, sayaç, cihaz, baca)
        for (const comp of blocks) {
            if (!floorMatches(comp.floorId)) continue;

            // Baca için özel containsPoint kontrolü
            if (comp.type === 'baca') {
                console.log('🔍 Checking chimney:', {
                    id: comp.id,
                    segments: comp.segments?.length,
                    clickPos: pos,
                    containsResult: comp.containsPoint(pos, tolerance)
                });
                if (comp.containsPoint(pos, tolerance)) {
                    console.log('✅ Chimney detected!', comp);
                    return { type: 'baca', object: comp, handle: 'body' };
                }
                continue;
            }

            const cx = comp.x ?? comp.center?.x;
            const cy = comp.y ?? comp.center?.y;
            if (cx !== undefined && cy !== undefined) {
                const dist = Math.hypot(pos.x - cx, pos.y - cy);

                // Vana için daha hassas seçim (6x6 cm kare)
                const selectTolerance = comp.type === 'vana' ? 6 : tolerance * 2;

                if (dist < selectTolerance) {
                    return { type: 'component', object: comp, handle: 'body' };
                }
            }
        }

        // ESKİ VANA SİSTEMİ (Geriye dönük uyumluluk için - deprecated)
        // Boru üzerindeki vanaları kontrol et (eski pipe.vana yapısı)
        for (const pipe of pipes) {
            if (!floorMatches(pipe.floorId)) continue;
            if (!pipe.vana || !pipe.p1 || !pipe.p2) continue;

            const vanaPos = pipe.getVanaPozisyon();
            if (vanaPos) {
                const dist = Math.hypot(pos.x - vanaPos.x, pos.y - vanaPos.y);
                if (dist < tolerance) {
                    return { type: 'valve', object: pipe.vana, pipe: pipe };
                }
            }
        }

        // Son olarak boru gövdesini kontrol et
        for (const pipe of pipes) {
            if (!floorMatches(pipe.floorId)) continue;
            if (!pipe.p1 || !pipe.p2) continue;

            const dx = pipe.p2.x - pipe.p1.x;
            const dy = pipe.p2.y - pipe.p1.y;
            const length = Math.hypot(dx, dy);
            if (length < 0.1) continue;

            const t = ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / (length * length);
            if (t < 0 || t > 1) continue;

            const projX = pipe.p1.x + t * dx;
            const projY = pipe.p1.y + t * dy;
            const dist = Math.hypot(pos.x - projX, pos.y - projY);
            if (dist < tolerance) {
                return { type: 'pipe', object: pipe, handle: 'body' };
            }
        }

        return null;
    }

    /**
     * JSON'a dönüştür
     */
    toJSON() {
        return {
            pipes: this.pipes.map(p => p.toJSON()),
            components: this.components.map(c => c.toJSON())
        };
    }

    /**
     * JSON'dan yükle
     */
    fromJSON(data) {
        if (data.pipes) {
            this.pipes = data.pipes.map(p => Boru.fromJSON(p));
        }

        if (data.components) {
            this.components = data.components.map(c => {
                switch (c.type) {
                    case 'servis_kutusu':
                        return ServisKutusu.fromJSON(c);
                    case 'sayac':
                        return Sayac.fromJSON(c);
                    case 'vana':
                        return Vana.fromJSON(c);
                    case 'cihaz':
                        return Cihaz.fromJSON(c);
                    case 'baca':
                        return Baca.fromJSON(c);
                    default:
                        return null;
                }
            }).filter(c => c !== null);
        }
    }

    // --- ÖZEL EYLEMLER ---

    /**
     * Sayaç çıkışındaki boruları ve sonrasını TURQUAZ yap
     * @param {string} sayacId - Sayaç ID
     */
    updatePipeColorsAfterMeter(sayacId) {
        const sayac = this.findComponentById(sayacId);
        if (!sayac || sayac.type !== 'sayac') return;

        // Sayaç çıkışına bağlı boruyu bul
        if (!sayac.cikisBagliBoruId) return;

        const cikisBoru = this.findPipeById(sayac.cikisBagliBoruId);
        if (!cikisBoru) return;

        // Çıkış borusundan başlayarak tüm boruları TURQUAZ yap (recursive)
        this.setPipeColorRecursive(cikisBoru, 'TURQUAZ');

       // console.log(`[updatePipeColorsAfterMeter] Sayaç ${sayacId} sonrası borular TURQUAZ yapıldı`);
    }

    /**
     * Bir boruyu ve ondan sonraki tüm boruları belirli renge boyar (recursive)
     * @param {Boru} pipe - Başlangıç borusu
     * @param {string} colorGroup - Renk grubu ('YELLOW' veya 'TURQUAZ')
     * @param {Set} visited - Ziyaret edilen borular (sonsuz döngü önleme)
     */
    setPipeColorRecursive(pipe, colorGroup, visited = new Set()) {
        if (!pipe || visited.has(pipe.id)) return;

        // Bu boruyu işaretle
        visited.add(pipe.id);

        // Rengi değiştir
        pipe.colorGroup = colorGroup;

        // Bitiş bağlantısına göre sonraki boruyu bul
        if (pipe.bitisBaglanti.hedefId && pipe.bitisBaglanti.tip === 'boru') {
            const nextPipe = this.findPipeById(pipe.bitisBaglanti.hedefId);
            if (nextPipe) {
                this.setPipeColorRecursive(nextPipe, colorGroup, visited);
            }
        }

        // T-bağlantıları da kontrol et
        pipe.tBaglantilar.forEach(tBaglanti => {
            const branchPipe = this.findPipeById(tBaglanti.boruId);
            if (branchPipe) {
                this.setPipeColorRecursive(branchPipe, colorGroup, visited);
            }
        });
    }
}

export const plumbingManager = PlumbingManager.getInstance();

// Export modları da
export { TESISAT_MODLARI };