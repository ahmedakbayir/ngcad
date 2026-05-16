/**
 * Ghost Updater
 * Ghost bileşenlerin pozisyon güncellemelerini yönetir
 */

import { state } from '../../general-files/main.js';

export function updateGhostPosition(ghost, point, snap) {
    // Debug: İlk 3 güncellemede koordinat sistemi kontrolü
    const t = state.viewBlendFactor || 0;

    if (ghost.type === 'cihaz' && !this._debugCount) this._debugCount = 0;
    if (ghost.type === 'cihaz' && this._debugCount < 3) {
        // console.log('🐛 CIHAZ GHOST DEBUG:', {
        //     'zoom': state.zoom,
        //     'panOffset': `(${state.panOffset.x}, ${state.panOffset.y})`,
        //     'point (world)': `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`,
        //     'DPR': window.devicePixelRatio
        // });
        this._debugCount++;
    }

    // Cihaz için: boru ucuna snap yap, fleks etrafında mouse ile hareket et
    if (ghost.type === 'cihaz') {
        // En yakın SERBEST boru ucunu bul (T-junction'ları atla, dolu uçlar atlanır)
        // Tolerance: aşırı geniş tutulmamalı, aksi hâlde uzaktaki bir uca yapışır.
        // 3D'de Z projeksiyonu zaten getScreenPoint'e dahil; ekstra çarpan gerekmez.
        const tolerance3D = t > 0.5 ? 40 : 15; // cm
        // DAİMA gerçek mouse noktasını kullan — activeSnap (duvar/kolon) boru ucu
        // detekssiyonunu bozmamalı; öncelik BOŞ HAT UCUNDA olmalıdır.
        const searchPoint = this.lastMousePoint || point;
        const boruUcu = this.findBoruUcuAt(searchPoint, tolerance3D, true); // onlyFreeEndpoints = true

        if (boruUcu && boruUcu.boru) {
            // Cihaz rotation'u sabit - tutamacı her zaman kuzeyde
            ghost.rotation = 0;

            // Fleks uzunluğu (minimum ve maksimum mesafe)
            const minFleksUzunluk = 25; // cm - cihazın boru ucundan minimum uzaklığı (vana + fleks görünürlüğü için)
            const maxFleksUzunluk = 72; // cm - cihazın boru ucundan maksimum uzaklığı

            // Boru yönünü hesapla (boru ucundan dışarı doğru)
            const boru = boruUcu.boru;
            const boruUcNokta = boruUcu.uc === 'p1' ? boru.p1 : boru.p2;
            const digerUc = boruUcu.uc === 'p1' ? boru.p2 : boru.p1;

            // Boru yönü: diğer uçtan bu uca doğru (dışarı)
            const boruYonX = boruUcNokta.x - digerUc.x;
            const boruYonY = boruUcNokta.y - digerUc.y;
            const boruYonUzunluk = Math.hypot(boruYonX, boruYonY);

            // Normalize edilmiş boru yönü
            let normBoruYonX, normBoruYonY;
            if (boruYonUzunluk < 2.0) {
                // Dikey boru: üst ucuna bağlı yatay segmentin yönünü bul
                const otherEnd = boruUcu.uc === 'p1' ? boru.p2 : boru.p1;
                let foundDx = 0, foundDy = 0, foundLen = 0;
                for (const pipe of this.manager.pipes) {
                    if (pipe.id === boru.id) continue;
                    const d1 = Math.hypot(pipe.p1.x - otherEnd.x, pipe.p1.y - otherEnd.y, (pipe.p1.z || 0) - (otherEnd.z || 0));
                    const d2 = Math.hypot(pipe.p2.x - otherEnd.x, pipe.p2.y - otherEnd.y, (pipe.p2.z || 0) - (otherEnd.z || 0));
                    if (Math.min(d1, d2) < 2) {
                        const pDx = pipe.p2.x - pipe.p1.x;
                        const pDy = pipe.p2.y - pipe.p1.y;
                        const pLen = Math.hypot(pDx, pDy);
                        if (pLen > 0.01) {
                            // Bağlantı noktasından dışarı yönü (ucun tersi)
                            const sign = d1 < d2 ? 1 : -1;
                            foundDx = (pDx / pLen) * sign;
                            foundDy = (pDy / pLen) * sign;
                            foundLen = 1;
                            break;
                        }
                    }
                }
                if (foundLen > 0) {
                    normBoruYonX = foundDx;
                    normBoruYonY = foundDy;
                } else {
                    // Fallback: isometrik aşağı-sağ yönü
                    normBoruYonX = 1 / Math.SQRT2;
                    normBoruYonY = 1 / Math.SQRT2;
                }
            } else {
                normBoruYonX = boruYonX / boruYonUzunluk;
                normBoruYonY = boruYonY / boruYonUzunluk;
            }

            // Boru ucunun Z değerini al
            const targetZ = (boruUcu.nokta.z !== undefined) ? boruUcu.nokta.z : 0;
            ghost.z = targetZ;

            // Mouse pozisyonunu world coordinates'e çevir (3D projection tersini al)
            // Inverse Projection: World = Screen - Z_effect
            // x_world = x_screen - z * t
            // y_world = y_screen + z * t
            const mouseWorldX = point.x - (targetZ * t);
            const mouseWorldY = point.y + (targetZ * t);

            // Mouse ile boru ucu arasındaki mesafeyi WORLD coordinates'de hesapla
            const mouseUcMesafe = Math.hypot(
                mouseWorldX - boruUcu.nokta.x,
                mouseWorldY - boruUcu.nokta.y
            );

            // Cihaz merkezini hesapla (World Coordinates)
            let merkezWorldX, merkezWorldY;

            if (mouseUcMesafe < minFleksUzunluk) {
                // Mouse minimum fleks uzunluğundan daha yakın, boru yönünde minimum mesafeye yerleştir
                merkezWorldX = boruUcu.nokta.x + normBoruYonX * minFleksUzunluk;
                merkezWorldY = boruUcu.nokta.y + normBoruYonY * minFleksUzunluk;
            } else if (mouseUcMesafe <= maxFleksUzunluk) {
                // Mouse fleks uzunluğu içinde, mouse pozisyonuna yerleştir (world coordinates)
                merkezWorldX = mouseWorldX;
                merkezWorldY = mouseWorldY;
            } else {
                // Mouse fleks uzunluğundan dışarıda, maksimum mesafeye mouse yönünde yerleştir
                const oran = maxFleksUzunluk / mouseUcMesafe;
                merkezWorldX = boruUcu.nokta.x + (mouseWorldX - boruUcu.nokta.x) * oran;
                merkezWorldY = boruUcu.nokta.y + (mouseWorldY - boruUcu.nokta.y) * oran;
            }

            ghost.x = merkezWorldX;
            ghost.y = merkezWorldY;

            ghost.ghostConnectionInfo = {
                boruUcu: boruUcu,
                girisNoktasi: boruUcu.nokta
            };
        } else {
            // Boru ucu yok, serbest dolaşım
            const girisOffset = ghost.girisOffset || { x: 0, y: 0 };
            const currentZ = ghost.z || 0;

            // DÜZELTME 2: 3D modunda mouse ekran koordinatını dünya koordinatına çevir
            ghost.x = (point.x - girisOffset.x) - (currentZ * t);
            ghost.y = (point.y - girisOffset.y) + (currentZ * t);
            ghost.ghostConnectionInfo = null;
        }
    }
    else if (ghost.type === 'sayac') {
        // Tolerance: makul tut, uzaktaki uçlara yapışmasın
        const tolerance3D = t > 0.5 ? 40 : 50; // cm
        // DAİMA gerçek mouse noktasını kullan — activeSnap (duvar/kolon) boru ucu
        // detekssiyonunu bozmamalı; öncelik BOŞ HAT UCUNDA olmalıdır.
        const searchPoint = this.lastMousePoint || point;
        const boruUcu = this.findBoruUcuAt(searchPoint, tolerance3D, true);

        if (boruUcu && boruUcu.boru) {
            const boru = boruUcu.boru;
            // Z değerini al
            const targetZ = (boruUcu.nokta.z !== undefined) ? boruUcu.nokta.z : 0;
            ghost.z = targetZ;

            // Boru geometrisi
            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);
            const fleksUzunluk = 15;

            // Mouse'un 3D düzeltilmiş pozisyonunu kullan
            const mouseWorldX = point.x - (targetZ * t);
            const mouseWorldY = point.y + (targetZ * t);

            const mouseVecX = mouseWorldX - boruUcu.nokta.x;
            const mouseVecY = mouseWorldY - boruUcu.nokta.y;

            let perpX, perpY, baseRotation;

            if (length < 0.01) {
                // Dikey boru: diğer ucuna bağlı son yatay segmentin yönünü bul
                const otherEnd = boruUcu.uc === 'p1' ? boru.p2 : boru.p1;
                let hdx = 0, hdy = 0, hLength = 0;
                for (const pipe of this.manager.pipes) {
                    if (pipe.id === boru.id) continue;
                    const d1 = Math.hypot(pipe.p1.x - otherEnd.x, pipe.p1.y - otherEnd.y, (pipe.p1.z || 0) - (otherEnd.z || 0));
                    const d2 = Math.hypot(pipe.p2.x - otherEnd.x, pipe.p2.y - otherEnd.y, (pipe.p2.z || 0) - (otherEnd.z || 0));
                    if (Math.min(d1, d2) < 2) {
                        const pDx = pipe.p2.x - pipe.p1.x;
                        const pDy = pipe.p2.y - pipe.p1.y;
                        const pLen = Math.hypot(pDx, pDy);
                        if (pLen > 0.01) { hdx = pDx; hdy = pDy; hLength = pLen; break; }
                    }
                }

                if (hLength > 0.01) {
                    // Yatay borunun yönünü kullan — yatay boru gibi dik yönde yerleştir
                    const crossProduct = mouseVecX * hdy - mouseVecY * hdx;
                    perpX = -hdy / hLength;
                    perpY =  hdx / hLength;
                    if (crossProduct > 0) { perpX = -perpX; perpY = -perpY; }
                    baseRotation = Math.atan2(hdy, hdx) * 180 / Math.PI;
                    if (crossProduct > 0) baseRotation += 180;
                } else {
                    // Fallback: yatay boru bulunamazsa isometrik diagonal
                    const side = mouseVecX + mouseVecY;
                    const sign = side >= 0 ? 1 : -1;
                    perpX = sign / Math.SQRT2;
                    perpY = sign / Math.SQRT2;
                    baseRotation = sign >= 0 ? 45 : -135;
                }
            } else {
                // Normal yatay/eğik boru
                const crossProduct = mouseVecX * dy - mouseVecY * dx;
                perpX = -dy / length;
                perpY =  dx / length;
                if (crossProduct > 0) { perpX = -perpX; perpY = -perpY; }
                baseRotation = Math.atan2(dy, dx) * 180 / Math.PI;
                if (crossProduct > 0) baseRotation += 180;
            }

            ghost.rotation = baseRotation;

            // Pozisyon hesapla
            const girisLokal = ghost.getGirisLocalKoordinat();
            const girisHedefX = boruUcu.nokta.x + perpX * fleksUzunluk;
            const girisHedefY = boruUcu.nokta.y + perpY * fleksUzunluk;

            const rad = ghost.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const girisRotatedX = girisLokal.x * cos - girisLokal.y * sin;
            const girisRotatedY = girisLokal.x * sin + girisLokal.y * cos;

            ghost.x = girisHedefX - girisRotatedX;
            ghost.y = girisHedefY - girisRotatedY;

            ghost.ghostConnectionInfo = {
                boruUcu: boruUcu,
                girisNoktasi: boruUcu.nokta
            };
        } else {
            // Serbest dolaşım
            const currentZ = ghost.z || 0;
            ghost.x = point.x - (currentZ * t);
            ghost.y = point.y + (currentZ * t);
            ghost.ghostConnectionInfo = null;
        }
    }    // Baca için: sadece cihaz üzerine snap yap
    else if (ghost.type === 'baca') {
        // KRITIK: Baca zaten yerleştirilmiş ve çizim modundaysa, cihaz snap yapma!
        // Sadece ilk yerleştirme için cihaz bulmalıyız
        if (ghost.parentCihazId && ghost.isDrawing) {
            // Baca çizim modunda - hiçbir şey yapma
            // Ghost segment renderer tarafından otomatik çizilecek (currentSegmentStart -> mouse)
            return;
        }

        // Cihazları bul (currentFloor'da olan) - SADECE İLK YERLEŞTIRME İÇİN
        const currentFloorId = state.currentFloor?.id;
        const cihazlar = this.manager.components.filter(c =>
            c.type === 'cihaz' &&
            (!currentFloorId || !c.floorId || c.floorId === currentFloorId)
        );

        let snapCihaz = null;
        const snapTolerance = 50; // 50cm içinde snap yap
        let minDist = Infinity;

        // En yakın cihazı bul (sadece ilki değil, en yakın olanı)
        for (const cihaz of cihazlar) {
            const dist = Math.hypot(point.x - cihaz.x, point.y - cihaz.y);
            if (dist < snapTolerance && dist < minDist) {
                minDist = dist;
                snapCihaz = cihaz;
            }
        }

        if (snapCihaz) {
            // Baca cihazın MERKEZİNDEN başlamalı (clipping renderer'da yapılacak)
            ghost.startX = snapCihaz.x;
            ghost.startY = snapCihaz.y;
            ghost.currentSegmentStart = {
                x: snapCihaz.x,
                y: snapCihaz.y
            };

            // Bağlı cihaz bilgisini sakla
            ghost.ghostSnapCihazId = snapCihaz.id;
            ghost.ghostSnapCihaz = snapCihaz;

            
        } else {
            // Cihaz bulunamadı - ghost görünmez (istekten dolayı)
            ghost.ghostSnapCihazId = null;
            ghost.ghostSnapCihaz = null;
        }
    } else {
        const currentZ = ghost.z || 0;
        ghost.x = point.x - (currentZ * t);
        ghost.y = point.y + (currentZ * t);
    }

    // Servis kutusu - duvara snap (yerleştirme için useBoxPosition=false)
    if (ghost.type === 'servis_kutusu') {
        const walls = state.walls;
        const snapDistance = 30; // 30cm içinde snap yap

        // En yakın duvarı bul
        let closestWall = null;
        let minDist = Infinity;

        walls.forEach(wall => {
            if (!wall.p1 || !wall.p2) return;

            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return;

            // Noktayı duvara projeksiyon yap
            const t = Math.max(0, Math.min(1,
                ((point.x - wall.p1.x) * dx + (point.y - wall.p1.y) * dy) / (len * len)
            ));
            const projX = wall.p1.x + t * dx;
            const projY = wall.p1.y + t * dy;

            const dist = Math.hypot(point.x - projX, point.y - projY);

            if (dist < minDist) {
                minDist = dist;
                closestWall = wall;
            }
        });

        // Yakın duvara snap yap (yerleştirme - useBoxPosition=false, mouse pozisyonuna göre taraf belirlenir)
        if (closestWall && minDist < snapDistance) {
            ghost.snapToWall(closestWall, point, false);
        } else {
            ghost.placeFree(point);
        }
    }

    // Sayaç/Vana/Tesisat aksesuarı - boru açısına hizala
    if ((ghost.type === 'sayac' || ghost.type === 'vana'
        || ghost.type === 'regulator' || ghost.type === 'filtre'
        || ghost.type === 'izolasyon_flansi' || ghost.type === 'kompansator'
        || ghost.type === 'manometre') && snap && snap.target) {
        if (snap.target.isPipe) {
            ghost.rotation = snap.target.aciDerece || 0;
        }
    }
}
