/**
 * Service Box Object (v2)
 * Servis Kutusu mantığı.
 */

import { PLUMBING_COMPONENT_TYPES } from '../plumbing-types.js';

export class ServiceBox {
    constructor(x, y) {
        this.id = `box_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'service_box';
        this.x = x;
        this.y = y;
        this.rotation = 0;
        this.floorId = null;

        this.config = PLUMBING_COMPONENT_TYPES.SERVICE_BOX;

        // Çıkış noktası (Local koordinat)
        // Default: Sağ kenar, üstten "PIPE_OFFSET" kadar aşağıda
        this.outputLocal = {
            x: this.config.width / 2,
            y: -this.config.height / 2 + 5, // 5cm offset (parametreleşecek)
            label: 'output'
        };

        this.connectedPipe = null; // Tek çıkış olduğu için
    }

    /**
     * Çıkış noktasının dünya koordinatlarını döndürür
     */
    getOutputPoint() {
        const rad = this.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        return {
            x: this.x + this.outputLocal.x * cos - this.outputLocal.y * sin,
            y: this.y + this.outputLocal.x * sin + this.outputLocal.y * cos
        };
    }

    /**
     * Duvara snap olma mantığı (Interaction manager tarafından çağrılır)
     * @param {Object} wall - Snap olunan duvar
     * @param {Object} point - Snap noktası
     */
    snapToWall(wall, point) {
        this.x = point.x;
        this.y = point.y;
        this.rotation = wall.angle; // Duvar açısına dön
    }
}
