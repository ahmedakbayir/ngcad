/**
 * Device Object (v2)
 * Cihaz mantığı (Kombi, Ocak vb.)
 */

import { PLUMBING_COMPONENT_TYPES } from '../plumbing-types.js';

export class Device {
    constructor(x, y, deviceType = 'KOMBI') {
        this.id = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'device';
        this.deviceType = deviceType;
        this.x = x;
        this.y = y;
        this.rotation = 0;
        this.floorId = null;

        this.config = PLUMBING_COMPONENT_TYPES.DEVICE;

        // Fleks bağlantısı
        this.flexConnection = {
            pipe: null,
            connectionPoint: null, // Boru üzerindeki nokta
            length: 0
        };
    }

    /**
     * Cihazı bir boruya bağlar (Fleks ile)
     */
    connectToPipe(pipe, point) {
        this.flexConnection.pipe = pipe;
        this.flexConnection.connectionPoint = point;
        this.updateFlex();
    }

    /**
     * Fleks hortumunu günceller
     */
    updateFlex() {
        if (!this.flexConnection.pipe) return;

        const start = this.flexConnection.connectionPoint;
        const end = { x: this.x, y: this.y }; // Cihaz girişi (basitleştirilmiş)

        this.flexConnection.length = Math.hypot(end.x - start.x, end.y - start.y);
    }
}
