/**
 * Meter Object (v2)
 * Sayaç mantığı.
 */

import { PLUMBING_COMPONENT_TYPES } from '../plumbing-types.js';

export class Meter {
    constructor(pipe, position) {
        this.id = `meter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'meter';
        this.pipe = pipe; // Bağlı olduğu boru
        this.position = position; // Boru üzerindeki normalize pozisyon (0-1) veya mutlak mesafe
        this.rotation = 0;
        this.floorId = pipe.floorId;

        this.config = PLUMBING_COMPONENT_TYPES.METER;

        // Bağlantı durumu
        this.inputPoint = { x: 0, y: 0 }; // Hesaplanan giriş noktası (Esnek)
        this.outputPoint = { x: 0, y: 0 }; // Hesaplanan çıkış noktası (Rijit)

        this.updateCoordinates();
    }

    /**
     * Koordinatları boru üzerindeki pozisyona göre günceller
     */
    updateCoordinates() {
        if (!this.pipe) return;

        const { p1, p2 } = this.pipe;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        // Pozisyon hesapla (Lineer interpolasyon)
        this.x = p1.x + dx * this.position;
        this.y = p1.y + dy * this.position;

        // Boru açısı
        this.rotation = Math.atan2(dy, dx) * 180 / Math.PI;

        // Giriş/Çıkış noktalarını güncelle (Basit model)
        // Gerçekte bu noktalar sayaç geometrisine göre dönecek
        // Şimdilik merkezde varsayıyoruz
    }

    /**
     * Sayaç boru üzerinde hareket ettirildiğinde
     */
    moveOnPipe(newPosition) {
        this.position = Math.max(0, Math.min(1, newPosition));
        this.updateCoordinates();
    }
}
