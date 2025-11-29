/**
 * Tesisat Snap Sistemi
 * Kullanıcı kurallarına göre sıfırdan tasarlanmış snap sistemi
 *
 * SNAP GEOMETRİSİ:
 * - Ana snap çizgisi: Duvar merkez hattı
 * - Duvar yüzeyi: Merkez ± WALL_THICKNESS/2
 * - Tesisat hattı: Merkez ± (WALL_THICKNESS/2 + boru_açıklığı)
 *
 * SNAP ÖNCELİKLERİ (10cm içinde):
 * 1. Tesisat hatlarının kesişim noktaları
 * 2. Diklik (tesisat hattına dik gelince)
 * 3. Tesisat hattı üzerinde serbest hareket
 *
 * ÖZEL DURUMLAR:
 * - Duvar içi (merkez ile yüzey arası) → snap yok
 * - 10cm dışında → sadece 90° açılarda snap
 */

import { state } from '../../general-files/main.js';

// Sabitler
export const TESISAT_CONSTANTS = {
    BORU_ACIKLIGI: 5,           // cm - Duvar yüzeyinden boru mesafesi
    SNAP_MESAFESI: 20,          // cm - Snap yakalama mesafesi
    MIN_BORU_UZUNLUGU: 5,       // cm
    ACI_TOLERANSI: 20,           // derece - 90° snap toleransı
};

// Snap Tipleri
export const TESISAT_SNAP_TYPES = {
    KESISIM: { priority: 1, name: 'Kesişim' },
    DIKLIK: { priority: 2, name: 'Diklik' },
    HAT_UZERI: { priority: 3, name: 'Hat Üzeri' },
    ACI_90: { priority: 4, name: '90° Açı' },
};

export class TesisatSnapSystem {
    constructor(manager) {
        this.manager = manager;
        this.lastSnapPoint = null;      // Son snap noktası (diklik için)
        this.currentStartPoint = null;  // Boru çizim başlangıcı
    }

    /**
     * Ana snap fonksiyonu
     * @param {Object} point - Mouse pozisyonu {x, y}
     * @param {Array} walls - Duvar listesi
     * @param {Object} options - Ek seçenekler
     * @returns {Object|null} - { x, y, type, target, angle }
     */
    getSnapPoint(point, walls, options = {}) {
        const snapMesafesi = TESISAT_CONSTANTS.SNAP_MESAFESI;

        // Tesisat hatlarını hesapla
        const tesisatHatlari = this.calculateTesisatHatlari(walls);

        // Debug: Kullanıcının gittiği açıyı hesapla
        let userAngle = null;
        if (this.currentStartPoint) {
            userAngle = Math.atan2(
                point.y - this.currentStartPoint.y,
                point.x - this.currentStartPoint.x
            ) * 180 / Math.PI;
        }
        const isDebugAngle = userAngle !== null && userAngle < -90 && userAngle > -180;

        // 1. KESIŞIM NOKTALARI (En yüksek öncelik)
        const kesisimSnap = this.findKesisimSnap(point, tesisatHatlari, snapMesafesi);
        if (kesisimSnap) {
            // if (isDebugAngle) console.log('🔴 Kesişim snap, açı:', userAngle.toFixed(1));
            return kesisimSnap;
        }

        // 1.5. BORU KESİŞİM NOKTALARI (Mevcut borularla kesişim)
        const boruKesisimSnap = this.findBoruKesisimSnap(point, snapMesafesi);
        if (boruKesisimSnap) {
            // if (isDebugAngle) console.log('🟠 Boru kesişim snap, açı:', userAngle.toFixed(1));
            return boruKesisimSnap;
        }

        // 2. BORU UÇ NOKTALARI (Bağlantı noktaları)
        const boruUcSnap = this.findBoruUcSnap(point, snapMesafesi);
        if (boruUcSnap) {
            // if (isDebugAngle) console.log('🟡 Boru uç snap, açı:', userAngle.toFixed(1));
            return boruUcSnap;
        }

        // 3. DİKLİK KONTROLÜ (Tesisat hattına dik)
        const diklikSnap = this.findDiklikSnap(point, tesisatHatlari, snapMesafesi);
        if (diklikSnap) {
            // if (isDebugAngle) console.log('🟢 Diklik snap, açı:', userAngle.toFixed(1));
            return diklikSnap;
        }

        // 4. BORU ÜZERİNE DİK İNME
        const boruDikSnap = this.findBoruDikSnap(point, snapMesafesi);
        if (boruDikSnap) {
            // if (isDebugAngle) console.log('🔵 Boru dik snap, açı:', userAngle.toFixed(1));
            return boruDikSnap;
        }

        // 5. TESİSAT HATTI ÜZERİ (Serbest hareket)
        const hatSnap = this.findHatUzeriSnap(point, tesisatHatlari, snapMesafesi);
        if (hatSnap) {
            // if (isDebugAngle) console.log('🟣 Hat üzeri snap, açı:', userAngle.toFixed(1));
            return hatSnap;
        }

        // 6. BORU ÜZERİ SNAP
        const boruSnap = this.findBoruUzeriSnap(point, snapMesafesi);
        if (boruSnap) {
            // if (isDebugAngle) console.log('⚪ Boru üzeri snap, açı:', userAngle.toFixed(1));
            return boruSnap;
        }

        // 7. 10cm DIŞINDA - SADECE 90° AÇILARDA SNAP
        if (this.currentStartPoint) {
            const aci90Snap = this.find90DereceSnap(point, this.currentStartPoint);
            if (aci90Snap) {
                // if (isDebugAngle) console.log('⚫ 90° snap, açı:', userAngle.toFixed(1), '→', aci90Snap.angle);
                return aci90Snap;
            }
        }

        // Hiçbir snap bulunamadı - serbest çizim
        // if (isDebugAngle) 
        //     console.log('✅ Serbest çizim, açı:', userAngle.toFixed(1));
        // return null;
    }

    /**
     * Duvarlardan tesisat hatlarını hesapla
     */
    calculateTesisatHatlari(walls) {
        if (!walls || walls.length === 0) return [];

        const hatlar = [];

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;

            const duvarKalinligi = wall.thickness || state.wallThickness || 20;
            const boruAcikligi = TESISAT_CONSTANTS.BORU_ACIKLIGI;

            // Duvar vektörü
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return;

            // Normal vektör (duvara dik)
            const nx = -dy / len;
            const ny = dx / len;

            // Tesisat hattı offset'i
            const offset = (duvarKalinligi / 2) + boruAcikligi;

            // İki taraftaki tesisat hatları
            [-1, 1].forEach(side => {
                const hatOffset = offset * side;
                hatlar.push({
                    p1: {
                        x: wall.p1.x + nx * hatOffset,
                        y: wall.p1.y + ny * hatOffset
                    },
                    p2: {
                        x: wall.p2.x + nx * hatOffset,
                        y: wall.p2.y + ny * hatOffset
                    },
                    wall: wall,
                    side: side,
                    angle: Math.atan2(dy, dx),
                    normal: { x: nx, y: ny },
                    duvarKalinligi: duvarKalinligi
                });
            });
        });

        return hatlar;
    }

    /**
     * 1. Tesisat hatlarının kesişim noktalarını bul
     */
    findKesisimSnap(point, hatlar, tolerance) {
        const kesisimler = [];

        // Her hat çifti için kesişim kontrolü
        for (let i = 0; i < hatlar.length; i++) {
            for (let j = i + 1; j < hatlar.length; j++) {
                // Sadece farklı duvarların hatları için kesişim ara
                if (hatlar[i].wall === hatlar[j].wall) continue;

                // İç köşeler için: segment içi kesişim
                const kesisim = this.lineIntersection(
                    hatlar[i].p1, hatlar[i].p2,
                    hatlar[j].p1, hatlar[j].p2
                );

                if (kesisim) {
                    kesisimler.push({
                        x: kesisim.x,
                        y: kesisim.y,
                        hatlar: [hatlar[i], hatlar[j]],
                        type: 'inner' // İç köşe
                    });
                }

                // Dış köşeler için: genişletilmiş çizgi kesişimi
                // (Aynı tarafta olan hatlar - outer corners)
                if (hatlar[i].side === hatlar[j].side) {
                    const outerKesisim = this.lineIntersectionExtended(
                        hatlar[i].p1, hatlar[i].p2,
                        hatlar[j].p1, hatlar[j].p2
                    );

                    if (outerKesisim) {
                        // Kesişim noktası duvar uçlarına yakın mı kontrol et
                        const maxExtension = 100; // cm - maksimum uzatma mesafesi
                        const dist1 = Math.min(
                            Math.hypot(outerKesisim.x - hatlar[i].p1.x, outerKesisim.y - hatlar[i].p1.y),
                            Math.hypot(outerKesisim.x - hatlar[i].p2.x, outerKesisim.y - hatlar[i].p2.y)
                        );
                        const dist2 = Math.min(
                            Math.hypot(outerKesisim.x - hatlar[j].p1.x, outerKesisim.y - hatlar[j].p1.y),
                            Math.hypot(outerKesisim.x - hatlar[j].p2.x, outerKesisim.y - hatlar[j].p2.y)
                        );

                        // Kesişim noktası her iki hattın uçlarına da makul mesafede ise ekle
                        if (dist1 < maxExtension && dist2 < maxExtension) {
                            kesisimler.push({
                                x: outerKesisim.x,
                                y: outerKesisim.y,
                                hatlar: [hatlar[i], hatlar[j]],
                                type: 'outer' // Dış köşe
                            });
                        }
                    }
                }
            }
        }

        // Kullanıcının gittiği yön
        let userAngle = null;
        if (this.currentStartPoint) {
            userAngle = Math.atan2(
                point.y - this.currentStartPoint.y,
                point.x - this.currentStartPoint.x
            ) * 180 / Math.PI;
        }

        // En yakın kesişimi bul
        let closest = null;
        let minDist = tolerance;

        kesisimler.forEach(k => {
            // Açı kontrolü
            if (userAngle !== null && this.currentStartPoint) {
                const kesisimAngle = Math.atan2(
                    k.y - this.currentStartPoint.y,
                    k.x - this.currentStartPoint.x
                ) * 180 / Math.PI;

                let angleDiff = Math.abs(userAngle - kesisimAngle);
                if (angleDiff > 180) angleDiff = 360 - angleDiff;

                // Kullanıcı bu yöne gitmiyorsa snap yapma (45° tolerans)
                if (angleDiff >= 40) return;
            }

            const dist = Math.hypot(point.x - k.x, point.y - k.y);
            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: k.x,
                    y: k.y,
                    type: TESISAT_SNAP_TYPES.KESISIM,
                    target: k.hatlar
                };
            }
        });

        return closest;
    }

    /**
     * 1.5. Mevcut borularla kesişim noktalarını bul
     */
    findBoruKesisimSnap(point, tolerance) {
        if (!this.manager || !this.manager.pipes || !this.currentStartPoint) return null;

        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön
        const userAngle = Math.atan2(
            point.y - this.currentStartPoint.y,
            point.x - this.currentStartPoint.x
        ) * 180 / Math.PI;

        // Mevcut çizim hattı
        const drawLine = {
            p1: this.currentStartPoint,
            p2: point
        };

        // Her mevcut boru ile kesişim kontrolü
        this.manager.pipes.forEach(pipe => {
            const kesisim = this.lineIntersection(
                drawLine.p1, drawLine.p2,
                pipe.p1, pipe.p2
            );

            if (kesisim) {
                // Açı kontrolü
                const kesisimAngle = Math.atan2(
                    kesisim.y - this.currentStartPoint.y,
                    kesisim.x - this.currentStartPoint.x
                ) * 180 / Math.PI;

                let angleDiff = Math.abs(userAngle - kesisimAngle);
                if (angleDiff > 180) angleDiff = 360 - angleDiff;

                // Kullanıcı bu yöne gitmiyorsa snap yapma (45° tolerans)
                if (angleDiff >= 40) return;

                const dist = Math.hypot(point.x - kesisim.x, point.y - kesisim.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = {
                        x: kesisim.x,
                        y: kesisim.y,
                        type: TESISAT_SNAP_TYPES.KESISIM,
                        target: pipe
                    };
                }
            }
        });

        return closest;
    }

    /**
     * 2. Boru uç noktalarını bul (bağlantı noktaları)
     */
    findBoruUcSnap(point, tolerance) {
        if (!this.manager || !this.manager.pipes) return null;

        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön
        let userAngle = null;
        if (this.currentStartPoint) {
            userAngle = Math.atan2(
                point.y - this.currentStartPoint.y,
                point.x - this.currentStartPoint.x
            ) * 180 / Math.PI;
        }

        this.manager.pipes.forEach(pipe => {
            [pipe.p1, pipe.p2].forEach(node => {
                // Açı kontrolü
                if (userAngle !== null && this.currentStartPoint) {
                    const nodeAngle = Math.atan2(
                        node.y - this.currentStartPoint.y,
                        node.x - this.currentStartPoint.x
                    ) * 180 / Math.PI;

                    let angleDiff = Math.abs(userAngle - nodeAngle);
                    if (angleDiff > 180) angleDiff = 360 - angleDiff;

                    // Kullanıcı bu yöne gitmiyorsa snap yapma (45° tolerans)
                    if (angleDiff >= 40) return;
                }

                const dist = Math.hypot(point.x - node.x, point.y - node.y);
                if (dist < minDist) {
                    minDist = dist;
                    closest = {
                        x: node.x,
                        y: node.y,
                        type: TESISAT_SNAP_TYPES.KESISIM,
                        target: pipe
                    };
                }
            });
        });

        return closest;
    }

    /**
     * 3. Tesisat hattına diklik snap
     */
    findDiklikSnap(point, hatlar, tolerance) {
        if (!this.currentStartPoint) return null;

        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön
        const userAngle = Math.atan2(
            point.y - this.currentStartPoint.y,
            point.x - this.currentStartPoint.x
        ) * 180 / Math.PI;

        hatlar.forEach(hat => {
            // Başlangıç noktasından hatta dik çizgi
            const dikNokta = this.perpendicularPoint(
                this.currentStartPoint,
                hat.p1,
                hat.p2
            );

            if (!dikNokta || !dikNokta.onSegment) return;

            // Diklik yönünü hesapla
            const dikAngle = Math.atan2(
                dikNokta.y - this.currentStartPoint.y,
                dikNokta.x - this.currentStartPoint.x
            ) * 180 / Math.PI;

            // Kullanıcının yönü ile diklik yönü arasındaki fark
            let angleDiff = Math.abs(userAngle - dikAngle);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            // Sadece kullanıcı diklik yönüne yakın gidiyorsa snap uygula (30° tolerans)
            if (angleDiff > 30) return;

            // Mouse bu dik noktaya yakın mı?
            const dist = Math.hypot(point.x - dikNokta.x, point.y - dikNokta.y);
            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: dikNokta.x,
                    y: dikNokta.y,
                    type: TESISAT_SNAP_TYPES.DIKLIK,
                    target: hat,
                    angle: hat.angle
                };
            }
        });

        return closest;
    }

    /**
     * 4. Mevcut borulara dik inme
     */
    findBoruDikSnap(point, tolerance) {
        if (!this.manager || !this.manager.pipes) return null;
        if (!this.currentStartPoint) return null;

        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön
        const userAngle = Math.atan2(
            point.y - this.currentStartPoint.y,
            point.x - this.currentStartPoint.x
        ) * 180 / Math.PI;

        this.manager.pipes.forEach(pipe => {
            const dikNokta = this.perpendicularPoint(
                this.currentStartPoint,
                pipe.p1,
                pipe.p2
            );

            if (!dikNokta || !dikNokta.onSegment) return;

            // Diklik yönünü hesapla
            const dikAngle = Math.atan2(
                dikNokta.y - this.currentStartPoint.y,
                dikNokta.x - this.currentStartPoint.x
            ) * 180 / Math.PI;

            // Kullanıcının yönü ile diklik yönü arasındaki fark
            let angleDiff = Math.abs(userAngle - dikAngle);
            if (angleDiff > 180) angleDiff = 360 - angleDiff;

            // Sadece kullanıcı diklik yönüne yakın gidiyorsa snap uygula (30° tolerans)
            if (angleDiff > 30) return;

            const dist = Math.hypot(point.x - dikNokta.x, point.y - dikNokta.y);
            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: dikNokta.x,
                    y: dikNokta.y,
                    type: TESISAT_SNAP_TYPES.DIKLIK,
                    target: pipe,
                    isPipe: true
                };
            }
        });

        return closest;
    }

    /**
     * 5. Tesisat hattı üzerinde serbest hareket
     */
    findHatUzeriSnap(point, hatlar, tolerance) {
        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön (sadece başlangıç noktası varsa kontrol et)
        let userAngle = null;
        if (this.currentStartPoint) {
            userAngle = Math.atan2(
                point.y - this.currentStartPoint.y,
                point.x - this.currentStartPoint.x
            ) * 180 / Math.PI;
        }

        hatlar.forEach(hat => {
            const proj = this.projectToLine(point, hat.p1, hat.p2);

            if (!proj || !proj.onSegment) return;

            // Yasak bölge kontrolü: Duvar içi
            const duvarMerkez = hat.wall;
            if (this.isInsideWall(point, duvarMerkez)) return;

            // Açı kontrolü: Kullanıcı bu yöne mi gidiyor?
            if (userAngle !== null && this.currentStartPoint) {
                const projAngle = Math.atan2(
                    proj.y - this.currentStartPoint.y,
                    proj.x - this.currentStartPoint.x
                ) * 180 / Math.PI;

                let angleDiff = Math.abs(userAngle - projAngle);
                if (angleDiff > 180) angleDiff = 360 - angleDiff;

                // Sadece kullanıcı bu yöne yakın gidiyorsa snap uygula (30° tolerans)
                if (angleDiff > 30) return;
            }

            const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: proj.x,
                    y: proj.y,
                    type: TESISAT_SNAP_TYPES.HAT_UZERI,
                    target: hat,
                    angle: hat.angle
                };
            }
        });

        return closest;
    }

    /**
     * 6. Mevcut boru üzerinde snap
     */
    findBoruUzeriSnap(point, tolerance) {
        if (!this.manager || !this.manager.pipes) return null;

        let closest = null;
        let minDist = tolerance;

        // Kullanıcının gittiği yön
        let userAngle = null;
        if (this.currentStartPoint) {
            userAngle = Math.atan2(
                point.y - this.currentStartPoint.y,
                point.x - this.currentStartPoint.x
            ) * 180 / Math.PI;
        }

        this.manager.pipes.forEach(pipe => {
            const proj = this.projectToLine(point, pipe.p1, pipe.p2);
            if (!proj || !proj.onSegment) return;

            // Açı kontrolü
            if (userAngle !== null && this.currentStartPoint) {
                const projAngle = Math.atan2(
                    proj.y - this.currentStartPoint.y,
                    proj.x - this.currentStartPoint.x
                ) * 180 / Math.PI;

                let angleDiff = Math.abs(userAngle - projAngle);
                if (angleDiff > 180) angleDiff = 360 - angleDiff;

                if (angleDiff > 30) return;
            }

            const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
            if (dist < minDist) {
                minDist = dist;
                closest = {
                    x: proj.x,
                    y: proj.y,
                    type: TESISAT_SNAP_TYPES.HAT_UZERI,
                    target: pipe,
                    isPipe: true
                };
            }
        });

        return closest;
    }

    /**
     * 7. 10cm dışında sadece 90° açılarda snap
     */
    find90DereceSnap(point, startPoint) {
        const dx = point.x - startPoint.x;
        const dy = point.y - startPoint.y;
        const distance = Math.hypot(dx, dy);

        // Mevcut açı
        const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;

        // En yakın 90° açıyı bul (sadece 4 ana yön)
        const angles = [0, 90, 180, -90];
        let closestAngle = 0;
        let minAngleDiff = 360;

        angles.forEach(angle => {
            let diff = Math.abs(currentAngle - angle);
            // Açı farkını 0-180 aralığına normalize et
            while (diff > 180) diff = Math.abs(360 - diff);
            if (diff < minAngleDiff) {
                minAngleDiff = diff;
                closestAngle = angle;
            }
        });

        // Açı toleransı içinde mi?
        if (minAngleDiff <= TESISAT_CONSTANTS.ACI_TOLERANSI) {
            const rad = closestAngle * Math.PI / 180;
            return {
                x: startPoint.x + Math.cos(rad) * distance,
                y: startPoint.y + Math.sin(rad) * distance,
                type: TESISAT_SNAP_TYPES.ACI_90,
                angle: closestAngle
            };
        }

        return null;
    }

    /**
     * Duvar içinde mi kontrolü (yasak bölge)
     */
    isInsideWall(point, wall) {
        if (!wall || !wall.p1 || !wall.p2) return false;

        const duvarKalinligi = wall.thickness || state.wallThickness || 20;

        // Duvar vektörü
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return false;

        // Normal vektör
        const nx = -dy / len;
        const ny = dx / len;

        // Noktanın duvara uzaklığı
        const px = point.x - wall.p1.x;
        const py = point.y - wall.p1.y;
        const dotNormal = px * nx + py * ny;
        const dotLine = px * (dx / len) + py * (dy / len);

        // Duvar uzunluğu içinde mi?
        if (dotLine < 0 || dotLine > len) return false;

        // Duvar kalınlığının yarısı içinde mi?
        return Math.abs(dotNormal) < (duvarKalinligi / 2);
    }

    /**
     * İki çizginin kesişim noktası (segment içinde)
     */
    lineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.001) return null; // Paralel

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
        const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

        // Segment içinde mi?
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
            return {
                x: x1 + t * (x2 - x1),
                y: y1 + t * (y2 - y1)
            };
        }

        return null;
    }

    /**
     * İki çizginin kesişim noktası (genişletilmiş - dış köşeler için)
     * Segment sınırlarını kontrol etmeden kesişim hesaplar
     */
    lineIntersectionExtended(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y;
        const x4 = p4.x, y4 = p4.y;

        const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(denom) < 0.001) return null; // Paralel

        const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

        // Segment sınırı kontrolü yok - çizgileri uzatarak kesişim hesapla
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }

    /**
     * Noktanın doğruya izdüşümü
     */
    projectToLine(p, a, b) {
        const ax = p.x - a.x;
        const ay = p.y - a.y;
        const bx = b.x - a.x;
        const by = b.y - a.y;
        const len2 = bx * bx + by * by;

        if (len2 === 0) return null;

        const t = (ax * bx + ay * by) / len2;

        return {
            x: a.x + t * bx,
            y: a.y + t * by,
            t: t,
            onSegment: t >= 0 && t <= 1
        };
    }

    /**
     * Bir noktadan doğruya dik nokta
     */
    perpendicularPoint(point, lineStart, lineEnd) {
        return this.projectToLine(point, lineStart, lineEnd);
    }

    /**
     * Boru çizim başlangıç noktasını ayarla
     */
    setStartPoint(point) {
        this.currentStartPoint = point;
    }

    /**
     * Boru çizim başlangıç noktasını temizle
     */
    clearStartPoint() {
        this.currentStartPoint = null;
    }
}

// Singleton export
export function createTesisatSnapSystem(manager) {
    return new TesisatSnapSystem(manager);
}
