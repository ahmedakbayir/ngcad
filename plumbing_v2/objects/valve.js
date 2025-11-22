/**
 * Valve Object (v2)
 * Vana mantığı.
 */

import { PLUMBING_COMPONENT_TYPES } from '../plumbing-types.js';

export class Valve {
    constructor(pipe, position, subType = 'AKV') {
        this.id = `valve_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'valve';
        this.pipe = pipe;
        this.position = position; // 0-1 arası
        this.subType = subType; // AKV, KKV, BRANSMAN, vb.
        this.floorId = pipe.floorId;

        this.config = PLUMBING_COMPONENT_TYPES.VALVE;

        this.updateCoordinates();
    }

    updateCoordinates() {
        if (!this.pipe) return;

        const { p1, p2 } = this.pipe;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;

        this.x = p1.x + dx * this.position;
        this.y = p1.y + dy * this.position;

        this.rotation = Math.atan2(dy, dx) * 180 / Math.PI;
    }

    /**
     * Vana tipini değiştirir (Örn: Sonlanma -> Ara Vana)
     */
    changeType(newSubType) {
        // Geçerlilik kontrolü yapılabilir
        this.subType = newSubType;
    }

    /**
     * Sonlanma vanası mı?
     */
    isTermination() {
        return PLUMBING_COMPONENT_TYPES.VALVE.subTypes.TERMINATION.includes(this.subType);
    }
}
