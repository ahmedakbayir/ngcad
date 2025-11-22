/**
 * PlumbingManager (v2)
 * Merkezi yönetim sınıfı.
 */

import { state } from '../general-files/main.js';
import { PLUMBING_CONSTANTS } from './plumbing-types.js';
import { InteractionManager } from './interactions/interaction-manager.js';
import { PlumbingRenderer } from './plumbing-renderer.js';

export class PlumbingManager {
    constructor() {
        this.pipes = [];
        this.components = []; // Servis kutusu, sayaç, vana, cihaz hepsi burada
        this.activeTool = null; // 'PIPE', 'BOX', 'METER', etc.
        this.tempComponent = null; // Yerleştirilmekte olan geçici bileşen (Ghost)

        // Alt modüller
        this.interactionManager = new InteractionManager(this);
        this.renderer = new PlumbingRenderer();

        // Singleton instance
        if (!window.plumbingManager) {
            window.plumbingManager = this;
        }
    }

    static getInstance() {
        return window.plumbingManager || new PlumbingManager();
    }

    init() {
        console.log('🔧 PlumbingManager v2 başlatıldı.');
        // Event listener'ları buraya eklenecek
    }

    /**
     * Yeni bir bileşen ekleme işlemini başlatır.
     * @param {string} type - Bileşen tipi (SERVICE_BOX, METER, etc.)
     */
    startPlacement(type) {
        console.log(`Placement started: ${type}`);
        this.activeTool = type;
        // Ghost oluşturma mantığı buraya gelecek
        // Örnek: this.tempComponent = createGhostComponent(type);
    }

    setMode(mode) {
        this.activeTool = mode;
    }

    /**
     * Çizim döngüsü tarafından çağrılır.
     * @param {CanvasRenderingContext2D} ctx 
     */
    render(ctx) {
        this.renderer.render(ctx, this);
    }
}

export const plumbingManager = PlumbingManager.getInstance();
