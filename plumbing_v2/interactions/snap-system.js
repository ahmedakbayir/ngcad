/**
 * Snap System (v2)
 * Tesisat snap kurallarını yönetir.
 */

import { PLUMBING_CONSTANTS, SNAP_TYPES } from '../plumbing-types.js';

export class SnapSystem {
    constructor(manager) {
        this.manager = manager;
    }

    /**
     * Verilen nokta için en uygun snap noktasını bulur.
     * @param {Object} point - Mouse pozisyonu {x, y}
     * @param {Array} walls - Duvar listesi
     * @returns {Object|null} - { x, y, type, target }
     */
    getSnapPoint(point, walls) {
        const snapDistance = PLUMBING_CONSTANTS.SNAP_DISTANCE;
        let bestSnap = null;

        // 1. Kesişim Noktaları (En Yüksek Öncelik)
        const intersectionSnap = this.findIntersectionSnap(point, snapDistance);
        if (intersectionSnap) return intersectionSnap;

        // 2. Diklik (Perpendicular)
        const perpSnap = this.findPerpendicularSnap(point, snapDistance);
        if (perpSnap) return perpSnap;

        // 3. Hat Üzeri (On Line)
        const lineSnap = this.findLineSnap(point, snapDistance);
        if (lineSnap) return lineSnap;

        // 4. Duvar/Tesisat Hattı Snapi (Eğer boru çiziyorsak)
        // Bu kısım duvar referanslı snapleri içerir
        const wallSnap = this.findWallSnap(point, walls, snapDistance);
        if (wallSnap) return wallSnap;

        // Hiçbir şey bulunamazsa ve 10cm dışındaysak -> 90 derece kısıtlaması (dışarıdan yönetilecek)
        return null;
    }

    findIntersectionSnap(point, tolerance) {
        // Mevcut boruların kesişimlerini tara
        // Şimdilik sadece uç nokta kesişimleri (basit)
        // İleride boru-boru kesişimi eklenebilir

        let closest = null;
        let minDist = tolerance;

        this.manager.pipes.forEach(pipe => {
            [pipe.p1, pipe.p2].forEach(node => {
                const dist = Math.hypot(point.x - node.x, point.y - node.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = {
                        x: node.x,
                        y: node.y,
                        type: SNAP_TYPES.INTERSECTION,
                        target: node
                    };
                }
            });
        });

        return closest;
    }

    findPerpendicularSnap(point, tolerance) {
        // Borulara dik inme kontrolü
        let closest = null;
        let minDist = tolerance;

        this.manager.pipes.forEach(pipe => {
            // Boru üzerine dik izdüşüm
            const proj = this.getProjection(point, pipe.p1, pipe.p2);
            if (proj && proj.onSegment) {
                const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = {
                        x: proj.x,
                        y: proj.y,
                        type: SNAP_TYPES.PERPENDICULAR,
                        target: pipe
                    };
                }
            }
        });

        return closest;
    }

    findLineSnap(point, tolerance) {
        // Boru üzerinde herhangi bir nokta
        let closest = null;
        let minDist = tolerance;

        this.manager.pipes.forEach(pipe => {
            const proj = this.getProjection(point, pipe.p1, pipe.p2);
            if (proj && proj.onSegment) {
                const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = {
                        x: proj.x,
                        y: proj.y,
                        type: SNAP_TYPES.ON_LINE,
                        target: pipe
                    };
                }
            }
        });

        return closest;
    }

    findWallSnap(point, walls, tolerance) {
        if (!walls) return null;

        // Duvar tanımları:
        // Ana Hat: Duvar merkezi
        // Duvar Yüzeyi: Merkez +/- Kalınlık/2
        // Tesisat Hattı: Yüzey +/- Boru Açıklığı

        const WALL_THICKNESS = PLUMBING_CONSTANTS.WALL_THICKNESS;
        const PIPE_OFFSET = PLUMBING_CONSTANTS.PIPE_OFFSET;
        const SURFACE_OFFSET = WALL_THICKNESS / 2;
        const PLUMBING_OFFSET = SURFACE_OFFSET + PIPE_OFFSET;

        let closest = null;
        let minDist = tolerance;

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;

            // Duvar vektörü
            const wx = wall.p2.x - wall.p1.x;
            const wy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(wx, wy);
            const nx = -wy / len; // Normal
            const ny = wx / len;

            // Noktanın duvara uzaklığı (Signed distance)
            const dx = point.x - wall.p1.x;
            const dy = point.y - wall.p1.y;
            const dotNormal = dx * nx + dy * ny; // Duvara dik uzaklık
            const dotLine = dx * (wx / len) + dy * (wy / len); // Duvar boyunca izdüşüm

            // Duvar hattı boyunca (uzunluk) içinde miyiz?
            if (dotLine < 0 || dotLine > len) return;

            // Yasak Bölge Kontrolü: Ana hat ile yüzey arası
            if (Math.abs(dotNormal) < SURFACE_OFFSET) {
                // Yasak bölgedeyiz, snap yok
                return;
            }

            // Tesisat Hattı Kontrolü (+ ve - taraflar)
            [PLUMBING_OFFSET, -PLUMBING_OFFSET].forEach(offset => {
                const distToLine = Math.abs(dotNormal - offset);
                if (distToLine < minDist) {
                    minDist = distToLine;

                    // Snap noktası hesapla
                    closest = {
                        x: wall.p1.x + (wx / len) * dotLine + nx * offset,
                        y: wall.p1.y + (wy / len) * dotLine + ny * offset,
                        type: SNAP_TYPES.ON_LINE, // Tesisat hattı
                        target: wall,
                        isPlumbingLine: true,
                        angle: Math.atan2(wy, wx) * 180 / Math.PI // Duvar açısını ekle (Servis kutusu için)
                    };
                }
            });
        });

        return closest;
    }

    // Helper: Noktanın doğru parçasına izdüşümü
    getProjection(p, a, b) {
        const pax = p.x - a.x;
        const pay = p.y - a.y;
        const bax = b.x - a.x;
        const bay = b.y - a.y;
        const l2 = bax * bax + bay * bay;

        if (l2 === 0) return null;

        const t = (pax * bax + pay * bay) / l2;

        return {
            x: a.x + t * bax,
            y: a.y + t * bay,
            t: t,
            onSegment: t >= 0 && t <= 1
        };
    }
}
