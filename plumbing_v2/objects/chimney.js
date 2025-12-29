/**
 * Baca (Chimney) Bileşeni
 * Cihazlara (Kombi, Soba vb.) bağlı baca sistemi
 *
 * ÖZELLİKLER:
 * - Cihaza bağlı, cihazla taşınır/silinir
 * - Segment tabanlı çizim (her tıklamada yeni segment)
 * - 20cm genişlik, mouse tıklamasıyla köşe vererek devam eder
 * - ESC ile bitince son parçaya ızgaralı havalandırma eklenir (30x10cm)
 */

import { TESISAT_CONSTANTS } from '../interactions/tesisat-snap.js';

// Baca sabitleri
export const BACA_CONFIG = {
    genislik: 16,           // cm - baca genişliği (16cm)
    minSegmentUzunluk: 10,  // cm - minimum segment uzunluğu
    havalandirmaGenislik: 10, // cm - havalandırma genişliği (ince kenar)
    havalandirmaUzunluk: 30,  // cm - havalandırma uzunluğu (geniş kenar)
    izgaraSayisi: 5,          // ızgara çubuk sayısı
    renk: 0x808080,           // Gri
    strokeColor: '#666666'
};

export class Baca {
    constructor(x, y, parentCihazId, options = {}) {
        this.id = `baca_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.type = 'baca';

        // Bağlı cihaz
        this.parentCihazId = parentCihazId;
        this.floorId = options.floorId || null;

        // Segment listesi - her segment bir dikdörtgen boru parçası
        // Her segment: { x1, y1, x2, y2 }
        this.segments = [];

        // İlk segment başlangıcı (cihaz üstü)
        this.startX = x;
        this.startY = y;

        // Aktif çizim durumu
        this.isDrawing = true;
        this.currentSegmentStart = { x, y };

        // Havalandırma ızgarası (ESC basılınca eklenir)
        this.havalandirma = null;
    }

    /**
     * Yeni segment ekle (mouse click)
     */
    addSegment(x, y) {
        const dx = x - this.currentSegmentStart.x;
        const dy = y - this.currentSegmentStart.y;
        const uzunluk = Math.hypot(dx, dy);

        // Minimum uzunluk kontrolü
        if (uzunluk < BACA_CONFIG.minSegmentUzunluk) {
            return false;
        }

        // Segment ekle
        this.segments.push({
            x1: this.currentSegmentStart.x,
            y1: this.currentSegmentStart.y,
            x2: x,
            y2: y
        });

        // Yeni segment başlangıcı
        this.currentSegmentStart = { x, y };
        return true;
    }

    /**
     * Çizimi bitir (ESC tuşu)
     */
    finishDrawing() {
        this.isDrawing = false;

        // Son segment varsa, ona havalandırma ızgarası ekle
        if (this.segments.length > 0) {
            const lastSegment = this.segments[this.segments.length - 1];

            // Son segment yönü
            const dx = lastSegment.x2 - lastSegment.x1;
            const dy = lastSegment.y2 - lastSegment.y1;
            const angle = Math.atan2(dy, dx);

            // Havalandırma dikdörtgeni
            this.havalandirma = {
                x: lastSegment.x2, // Merkez
                y: lastSegment.y2,
                width: BACA_CONFIG.havalandirmaGenislik,
                height: BACA_CONFIG.havalandirmaUzunluk,
                angle: angle
            };
        }
    }

    /**
     * Ghost segment (çizim sırasında mouse pozisyonu)
     */
    getGhostSegment(mouseX, mouseY) {
        if (!this.isDrawing) return null;

        return {
            x1: this.currentSegmentStart.x,
            y1: this.currentSegmentStart.y,
            x2: mouseX,
            y2: mouseY
        };
    }

    /**
     * Bounding box hesapla
     */
    getBoundingBox() {
        if (this.segments.length === 0) {
            return {
                minX: this.startX - BACA_CONFIG.genislik / 2,
                maxX: this.startX + BACA_CONFIG.genislik / 2,
                minY: this.startY - BACA_CONFIG.genislik / 2,
                maxY: this.startY + BACA_CONFIG.genislik / 2
            };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        this.segments.forEach(seg => {
            minX = Math.min(minX, seg.x1, seg.x2);
            maxX = Math.max(maxX, seg.x1, seg.x2);
            minY = Math.min(minY, seg.y1, seg.y2);
            maxY = Math.max(maxY, seg.y1, seg.y2);
        });

        // Havalandırma varsa onu da dahil et
        if (this.havalandirma) {
            const hw = this.havalandirma.width / 2;
            const hh = this.havalandirma.height / 2;
            minX = Math.min(minX, this.havalandirma.x - hw);
            maxX = Math.max(maxX, this.havalandirma.x + hw);
            minY = Math.min(minY, this.havalandirma.y - hh);
            maxY = Math.max(maxY, this.havalandirma.y + hh);
        }

        return { minX, maxX, minY, maxY };
    }

    /**
     * Noktanın baca üzerinde olup olmadığını kontrol et
     */
    containsPoint(point, tolerance = 10) {
        const bbox = this.getBoundingBox();

        // Önce bounding box kontrolü
        if (point.x < bbox.minX - tolerance || point.x > bbox.maxX + tolerance ||
            point.y < bbox.minY - tolerance || point.y > bbox.maxY + tolerance) {
            return false;
        }

        // Segment üzerinde mi kontrol et
        for (const seg of this.segments) {
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const length = Math.hypot(dx, dy);

            if (length < 0.1) continue;

            const t = ((point.x - seg.x1) * dx + (point.y - seg.y1) * dy) / (length * length);
            if (t < 0 || t > 1) continue;

            const projX = seg.x1 + t * dx;
            const projY = seg.y1 + t * dy;
            const dist = Math.hypot(point.x - projX, point.y - projY);

            if (dist < BACA_CONFIG.genislik / 2 + tolerance) {
                return true;
            }
        }

        return false;
    }

    /**
     * Serialize
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            parentCihazId: this.parentCihazId,
            floorId: this.floorId,
            startX: this.startX,
            startY: this.startY,
            segments: this.segments.map(s => ({ ...s })),
            isDrawing: this.isDrawing,
            currentSegmentStart: { ...this.currentSegmentStart },
            havalandirma: this.havalandirma ? { ...this.havalandirma } : null
        };
    }

    /**
     * Deserialize
     */
    static fromJSON(data) {
        const baca = new Baca(data.startX, data.startY, data.parentCihazId, {
            floorId: data.floorId
        });

        baca.id = data.id;
        baca.segments = data.segments.map(s => ({ ...s }));
        baca.isDrawing = data.isDrawing;
        baca.currentSegmentStart = { ...data.currentSegmentStart };
        baca.havalandirma = data.havalandirma ? { ...data.havalandirma } : null;

        return baca;
    }
}

/**
 * Factory fonksiyon
 */
export function createBaca(x, y, parentCihazId, options = {}) {
    return new Baca(x, y, parentCihazId, options);
}
