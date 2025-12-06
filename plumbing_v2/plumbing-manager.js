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
     * Boş boru uçlarını bul
     */
    getBosBitisBorular() {
        return this.pipes.filter(p => !p.bitisBaglanti.hedefId);
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
                    default:
                        return null;
                }
            }).filter(c => c !== null);
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

        // Bileşenleri kontrol et
        for (const comp of blocks) {
            if (!floorMatches(comp.floorId)) continue;

            const cx = comp.x ?? comp.center?.x;
            const cy = comp.y ?? comp.center?.y;
            if (cx !== undefined && cy !== undefined) {
                const dist = Math.hypot(pos.x - cx, pos.y - cy);
                if (dist < tolerance * 2) {
                    return { type: 'component', object: comp, handle: 'body' };
                }
            }
        }

        // Vanaları kontrol et
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
                    default:
                        return null;
                }
            }).filter(c => c !== null);
        }
    }
}

export const plumbingManager = PlumbingManager.getInstance();

// Export modları da
export { TESISAT_MODLARI };
