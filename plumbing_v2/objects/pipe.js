/**
 * Pipe Object (v2)
 * Boru mantığı.
 */

import { PLUMBING_CONSTANTS, PLUMBING_PIPE_TYPES } from '../plumbing-types.js';

export class Pipe {
    constructor(p1, p2, type = 'STANDARD') {
        this.id = `pipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'pipe';
        this.pipeType = type;
        this.p1 = p1; // {x, y, z}
        this.p2 = p2; // {x, y, z}
        this.floorId = null; // Atandığı kat

        // Bağlantılar
        this.connections = {
            start: null, // { object, pointIndex }
            end: null
        };

        // Üzerindeki elemanlar (Vana, Sayaç vb.)
        this.attachedComponents = [];
    }

    get length() {
        return Math.hypot(this.p2.x - this.p1.x, this.p2.y - this.p1.y);
    }

    get angle() {
        return Math.atan2(this.p2.y - this.p1.y, this.p2.x - this.p1.x);
    }

    /**
     * Verilen nokta boru üzerinde mi?
     */
    containsPoint(point, tolerance = PLUMBING_CONSTANTS.SNAP_DISTANCE) {
        // Basit nokta-doğru parçası uzaklık kontrolü
        const { p1, p2 } = this;
        const l2 = (p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2;
        if (l2 === 0) return Math.hypot(point.x - p1.x, point.y - p1.y) < tolerance;

        let t = ((point.x - p1.x) * (p2.x - p1.x) + (point.y - p1.y) * (p2.y - p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * (p2.x - p1.x);
        const projY = p1.y + t * (p2.y - p1.y);

        return Math.hypot(point.x - projX, point.y - projY) < tolerance;
    }

    /**
     * Boruyu verilen noktadan böler ve iki yeni boru döndürür.
     * (Araya eleman eklemek için kullanılır)
     */
    splitAt(point) {
        // Yeni node oluştur
        const newNode = { x: point.x, y: point.y, z: this.p1.z }; // Z'yi koru

        const pipe1 = new Pipe(this.p1, newNode, this.pipeType);
        const pipe2 = new Pipe(newNode, this.p2, this.pipeType);

        // Özellikleri kopyala (floorId vb.)
        pipe1.floorId = this.floorId;
        pipe2.floorId = this.floorId;

        return [pipe1, pipe2];
    }
}
export function createPlumbingPipe(p1, p2, type) {
    return new Pipe(p1, p2, type);
}
