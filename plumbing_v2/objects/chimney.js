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
import { state } from '../../general-files/main.js';

// Baca sabitleri
export const BACA_CONFIG = {
    genislik: 12,           // cm - baca genişliği (12cm)
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
        // Her segment: { x1, y1, z1, x2, y2, z2 }
        this.segments = [];

        // İlk segment başlangıcı (cihaz üstü)
        this.startX = x;
        this.startY = y;
        this.z = options.z || 0; // Z koordinatı ekle

        // Aktif çizim durumu
        this.isDrawing = true;
        this.currentSegmentStart = { x, y, z: this.z };

        // Havalandırma ızgarası (ESC basılınca eklenir)
        this.havalandirma = null;
    }

    /**
     * Yeni segment ekle (mouse click)
     */
    addSegment(x, y, z) {
        const dx = x - this.currentSegmentStart.x;
        const dy = y - this.currentSegmentStart.y;
        const uzunluk = Math.hypot(dx, dy);

        // Minimum uzunluk kontrolü
        if (uzunluk < BACA_CONFIG.minSegmentUzunluk) {
            return false;
        }

        // Z değeri verilmemişse current segment'in Z'sini kullan
        const endZ = z !== undefined ? z : (this.currentSegmentStart.z || this.z || 0);

        // Segment ekle (Z koordinatlarıyla birlikte)
        this.segments.push({
            x1: this.currentSegmentStart.x,
            y1: this.currentSegmentStart.y,
            z1: this.currentSegmentStart.z || this.z || 0,
            x2: x,
            y2: y,
            z2: endZ
        });

        // Yeni segment başlangıcı
        this.currentSegmentStart = { x, y, z: endZ };
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

        // Eksen snap - Sadece X/Y eksenlerine 15° içindeyse snap
        let endX = mouseX;
        let endY = mouseY;

        if (this.currentSegmentStart) {
            const dx = mouseX - this.currentSegmentStart.x;
            const dy = mouseY - this.currentSegmentStart.y;
            const distance = Math.hypot(dx, dy);

            if (distance >= 10) {
                let angleRad = Math.atan2(dy, dx);
                let angleDeg = angleRad * 180 / Math.PI;

                // Eksenlere snap (0°, 90°, 180°, -90° = 270°)
                const SNAP_TOLERANCE = 15; // ±15 derece tolerans
                let snappedAngle = null;

                // 0° (sağ - X pozitif)
                if (Math.abs(angleDeg) <= SNAP_TOLERANCE) {
                    snappedAngle = 0;
                }
                // 90° (yukarı - Y negatif)
                else if (Math.abs(angleDeg - 90) <= SNAP_TOLERANCE) {
                    snappedAngle = 90;
                }
                // 180° veya -180° (sol - X negatif)
                else if (Math.abs(Math.abs(angleDeg) - 180) <= SNAP_TOLERANCE) {
                    snappedAngle = 180;
                }
                // -90° (aşağı - Y pozitif)
                else if (Math.abs(angleDeg + 90) <= SNAP_TOLERANCE) {
                    snappedAngle = -90;
                }

                if (snappedAngle !== null) {
                    const snappedAngleRad = snappedAngle * Math.PI / 180;
                    endX = this.currentSegmentStart.x + distance * Math.cos(snappedAngleRad);
                    endY = this.currentSegmentStart.y + distance * Math.sin(snappedAngleRad);
                }
            }
        }

        return {
            x1: this.currentSegmentStart.x,
            y1: this.currentSegmentStart.y,
            x2: endX,
            y2: endY
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
     * Noktaya en yakın segment endpoint'i bul (sürükleme için)
     * @param {object} point - {x, y} noktası
     * @param {number} tolerance - Tolerans (cm)
     * @returns {object|null} - {segmentIndex, endpoint: 'start'|'end', x, y} veya null
     */
    findNearestEndpoint(point, tolerance = 8) {
        let minDist = tolerance;
        let nearest = null;

        this.segments.forEach((seg, index) => {
            // Segment başlangıcı (x1, y1) - İlk segment başlangıcı cihaza bağlı, sürüklenemez
            if (index > 0) {
                const dist1 = Math.hypot(point.x - seg.x1, point.y - seg.y1);
                if (dist1 < minDist) {
                    minDist = dist1;
                    nearest = {
                        segmentIndex: index,
                        endpoint: 'start',
                        x: seg.x1,
                        y: seg.y1
                    };
                }
            }

            // Segment bitişi (x2, y2)
            const dist2 = Math.hypot(point.x - seg.x2, point.y - seg.y2);
            if (dist2 < minDist) {
                minDist = dist2;
                nearest = {
                    segmentIndex: index,
                    endpoint: 'end',
                    x: seg.x2,
                    y: seg.y2
                };
            }
        });

        return nearest;
    }

    /**
     * Tüm bacayı taşı (delta ile)
     * @param {number} newX - Yeni başlangıç X koordinatı
     * @param {number} newY - Yeni başlangıç Y koordinatı
     */
    move(newX, newY) {
        // Delta hesapla (startX, startY referans noktası)
        const deltaX = newX - this.startX;
        const deltaY = newY - this.startY;

        // Başlangıç noktasını güncelle
        this.startX = newX;
        this.startY = newY;

        // Tüm segmentleri taşı
        this.segments.forEach(seg => {
            seg.x1 += deltaX;
            seg.y1 += deltaY;
            seg.x2 += deltaX;
            seg.y2 += deltaY;
        });

        // Current segment start'ı taşı
        this.currentSegmentStart.x += deltaX;
        this.currentSegmentStart.y += deltaY;

        // Havalandırma varsa onu da taşı
        if (this.havalandirma) {
            this.havalandirma.x += deltaX;
            this.havalandirma.y += deltaY;
        }
    }

    /**
     * Segment endpoint'i taşı
     * @param {number} segmentIndex - Segment indexi
     * @param {string} endpoint - 'start' veya 'end'
     * @param {number} newX - Yeni X koordinatı
     * @param {number} newY - Yeni Y koordinatı
     */
    moveEndpoint(segmentIndex, endpoint, newX, newY) {
        if (segmentIndex < 0 || segmentIndex >= this.segments.length) return;

        const segment = this.segments[segmentIndex];

        if (endpoint === 'start') {
            // Başlangıç taşındı - önceki segmentin bitiş noktasını da güncelle
            segment.x1 = newX;
            segment.y1 = newY;

            if (segmentIndex > 0) {
                this.segments[segmentIndex - 1].x2 = newX;
                this.segments[segmentIndex - 1].y2 = newY;
            }

            // İlk segment başlangıcı değiştiyse, currentSegmentStart'ı güncelle
            if (segmentIndex === 0) {
                this.currentSegmentStart.x = newX;
                this.currentSegmentStart.y = newY;
            }
        } else if (endpoint === 'end') {
            // Bitiş taşındı - sonraki segmentin başlangıç noktasını da güncelle
            segment.x2 = newX;
            segment.y2 = newY;

            if (segmentIndex < this.segments.length - 1) {
                this.segments[segmentIndex + 1].x1 = newX;
                this.segments[segmentIndex + 1].y1 = newY;
            } else {
                // Son segment bitişi - currentSegmentStart'ı güncelle
                this.currentSegmentStart.x = newX;
                this.currentSegmentStart.y = newY;
            }

            // Havalandırma varsa ve son segmentteyse, pozisyonunu güncelle
            if (this.havalandirma && segmentIndex === this.segments.length - 1) {
                this.havalandirma.x = newX;
                this.havalandirma.y = newY;

                // Açıyı da güncelle
                const dx = newX - segment.x1;
                const dy = newY - segment.y1;
                this.havalandirma.angle = Math.atan2(dy, dx);
            }
        }
    }

    /**
     * Segment endpoint'i rigid transform ile taşı (translation + rotation)
     * Taşınan endpoint'ten SONRAKİ tüm segment'ler rigid body gibi birlikte hareket eder
     * Açı değişirse, sonraki segment'ler pivot nokta etrafında döner
     * @param {number} segmentIndex - Segment indexi
     * @param {string} endpoint - 'start' veya 'end'
     * @param {number} newX - Yeni X koordinatı
     * @param {number} newY - Yeni Y koordinatı
     */
    moveEndpointRigid(segmentIndex, endpoint, newX, newY) {
        if (segmentIndex < 0 || segmentIndex >= this.segments.length) return;

        const segment = this.segments[segmentIndex];

        // Eski pozisyonu kaydet
        const oldX = endpoint === 'start' ? segment.x1 : segment.x2;
        const oldY = endpoint === 'start' ? segment.y1 : segment.y2;

        // Pivot nokta (sabit nokta) - taşınan endpoint'in bağlı olduğu nokta
        const pivotX = endpoint === 'start' ? (segmentIndex > 0 ? this.segments[segmentIndex - 1].x1 : segment.x1) : segment.x1;
        const pivotY = endpoint === 'start' ? (segmentIndex > 0 ? this.segments[segmentIndex - 1].y1 : segment.y1) : segment.y1;

        // Eski ve yeni açıları hesapla
        const oldAngle = Math.atan2(oldY - pivotY, oldX - pivotX);
        const newAngle = Math.atan2(newY - pivotY, newX - pivotX);
        const deltaAngle = newAngle - oldAngle;

        // Rotasyon matrisi helper
        const rotatePoint = (px, py, pivotX, pivotY, angle) => {
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const dx = px - pivotX;
            const dy = py - pivotY;
            return {
                x: pivotX + dx * cos - dy * sin,
                y: pivotY + dx * sin + dy * cos
            };
        };

        if (endpoint === 'start') {
            // Başlangıç taşındı
            segment.x1 = newX;
            segment.y1 = newY;

            // Önceki segmentin bitiş noktasını güncelle
            if (segmentIndex > 0) {
                this.segments[segmentIndex - 1].x2 = newX;
                this.segments[segmentIndex - 1].y2 = newY;
            }

            // İlk segment başlangıcı değiştiyse, currentSegmentStart'ı güncelle
            if (segmentIndex === 0) {
                this.currentSegmentStart.x = newX;
                this.currentSegmentStart.y = newY;
            }

            // Translation: dragged endpoint'in hareket vektörü (sadece taşıma, rotation yok)
            const deltaX = newX - oldX;
            const deltaY = newY - oldY;

            // Şu anki segment'in end point'ini sadece translate et
            segment.x2 += deltaX;
            segment.y2 += deltaY;

            // Sonraki segment'leri de sadece translate et (rotation yok)
            for (let i = segmentIndex + 1; i < this.segments.length; i++) {
                this.segments[i].x1 += deltaX;
                this.segments[i].y1 += deltaY;
                this.segments[i].x2 += deltaX;
                this.segments[i].y2 += deltaY;
            }

        } else if (endpoint === 'end') {
            // Bitiş taşındı
            segment.x2 = newX;
            segment.y2 = newY;

            // Translation: dragged endpoint'in hareket vektörü (sadece taşıma, rotation yok)
            const deltaX = newX - oldX;
            const deltaY = newY - oldY;

            // Sonraki segment'leri sadece translate et (rotation yok)
            for (let i = segmentIndex + 1; i < this.segments.length; i++) {
                this.segments[i].x1 += deltaX;
                this.segments[i].y1 += deltaY;
                this.segments[i].x2 += deltaX;
                this.segments[i].y2 += deltaY;
            }

            // Son segment bitişi - currentSegmentStart'ı güncelle
            if (segmentIndex === this.segments.length - 1) {
                this.currentSegmentStart.x = newX;
                this.currentSegmentStart.y = newY;
            }

            // Havalandırma varsa ve son segmentteyse, sadece translate et
            if (this.havalandirma && segmentIndex === this.segments.length - 1) {
                this.havalandirma.x += deltaX;
                this.havalandirma.y += deltaY;
            }
        }
    }

    /**
     * Bacayı verilen noktada böl (çift tıklama için)
     * @param {object} point - {x, y} bölme noktası
     * @returns {object|null} - {segmentIndex, splitPoint} veya null (bölme yapılamadıysa)
     */
    splitAt(point) {
        // Hangi segment üzerindeyiz?
        const MIN_SPLIT_DIST = 10; // Segment uçlarından en az 10cm uzakta olmalı

        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const dx = seg.x2 - seg.x1;
            const dy = seg.y2 - seg.y1;
            const length = Math.hypot(dx, dy);

            if (length < 0.1) continue;

            // Noktayı segment üzerine projekte et
            const t = ((point.x - seg.x1) * dx + (point.y - seg.y1) * dy) / (length * length);

            // Segment dışındaysa devam et
            if (t < 0 || t > 1) continue;

            const projX = seg.x1 + t * dx;
            const projY = seg.y1 + t * dy;
            const dist = Math.hypot(point.x - projX, point.y - projY);

            // Segment genişliği içinde mi?
            if (dist < BACA_CONFIG.genislik / 2 + 10) {
                // Uç noktalara çok yakınsa bölme
                const distToStart = Math.hypot(projX - seg.x1, projY - seg.y1);
                const distToEnd = Math.hypot(projX - seg.x2, projY - seg.y2);

                if (distToStart < MIN_SPLIT_DIST || distToEnd < MIN_SPLIT_DIST) {
                    return null; // Segment uçlarına çok yakın
                }

                // Segmenti böl
                const splitPoint = { x: projX, y: projY };

                // Yeni segment: bölme noktasından eski bitiş noktasına
                const newSegment = {
                    x1: splitPoint.x,
                    y1: splitPoint.y,
                    x2: seg.x2,
                    y2: seg.y2
                };

                // Eski segment: eski başlangıçtan bölme noktasına
                seg.x2 = splitPoint.x;
                seg.y2 = splitPoint.y;

                // Yeni segmenti listeye ekle
                this.segments.splice(i + 1, 0, newSegment);

                return {
                    segmentIndex: i,
                    splitPoint: splitPoint,
                    newSegmentIndex: i + 1
                };
            }
        }

        return null;
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
            z: this.z || 0, // Z koordinatını ekle
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
            floorId: data.floorId,
            z: data.z || 0 // Z koordinatını ekle
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
