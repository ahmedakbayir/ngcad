/**
 * Ghost Updater
 * Ghost bileşenlerin pozisyon güncellemelerini yönetir
 */

import { state } from '../../../general-files/main.js';

export function updateGhostPosition(ghost, point, snap) {
    // Debug: İlk 3 güncellemede koordinat sistemi kontrolü
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
        // En yakın SERBEST boru ucunu bul (T-junction'ları atla)
        const boruUcu = this.findBoruUcuAt(point, 72, true); // onlyFreeEndpoints = true

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
            const normBoruYonX = boruYonX / boruYonUzunluk;
            const normBoruYonY = boruYonY / boruYonUzunluk;

            // Mouse'un boru ucundan mesafesini hesapla
            const mouseUcMesafe = Math.hypot(
                point.x - boruUcu.nokta.x,
                point.y - boruUcu.nokta.y
            );

            // Cihaz merkezini hesapla
            let merkezX, merkezY;

            if (mouseUcMesafe < minFleksUzunluk) {
                // Mouse minimum fleks uzunluğundan daha yakın, boru yönünde minimum mesafeye yerleştir
                merkezX = boruUcu.nokta.x + normBoruYonX * minFleksUzunluk;
                merkezY = boruUcu.nokta.y + normBoruYonY * minFleksUzunluk;
            } else if (mouseUcMesafe <= maxFleksUzunluk) {
                // Mouse fleks uzunluğu içinde, mouse pozisyonuna yerleştir
                merkezX = point.x;
                merkezY = point.y;
            } else {
                // Mouse fleks uzunluğundan dışarıda, maksimum mesafeye mouse yönünde yerleştir
                const oran = maxFleksUzunluk / mouseUcMesafe;
                merkezX = boruUcu.nokta.x + (point.x - boruUcu.nokta.x) * oran;
                merkezY = boruUcu.nokta.y + (point.y - boruUcu.nokta.y) * oran;
            }

            // Cihaz merkezini ayarla
            ghost.x = merkezX;
            ghost.y = merkezY;

            // Ghost rendering için bağlantı bilgisini sakla
            ghost.ghostConnectionInfo = {
                boruUcu: boruUcu,
                girisNoktasi: boruUcu.nokta // Fleks boru ucundan başlayacak
            };
        } else {
            // Boru ucu bulunamadı, normal cursor pozisyonu
            const girisOffset = ghost.girisOffset || { x: 0, y: 0 };
            ghost.x = point.x - girisOffset.x;
            ghost.y = point.y - girisOffset.y;
            ghost.ghostConnectionInfo = null;
        }
    }
    else if (ghost.type === 'sayac') {
        // En yakın SERBEST boru ucunu bul (T-junction'ları atla)
        const boruUcu = this.findBoruUcuAt(point, 72, true); // onlyFreeEndpoints = true

        if (boruUcu && boruUcu.boru) {
            // Sayaç pozisyonlandırma: Mouse konumuna göre yön belirleme
            const boru = boruUcu.boru;
            const dx = boru.p2.x - boru.p1.x;
            const dy = boru.p2.y - boru.p1.y;
            const length = Math.hypot(dx, dy);

            // Fleks görünen boy
            const fleksUzunluk = 15; // cm

            // Mouse'un boru ekseninin hangi tarafında olduğunu bul
            // Cross product: (mouse - boruUcu) x (boru yönü)
            const mouseVecX = point.x - boruUcu.nokta.x;
            const mouseVecY = point.y - boruUcu.nokta.y;
            const crossProduct = mouseVecX * dy - mouseVecY * dx;

            // Boru yönüne DİK (perpendicular) vektör hesapla
            // 90° saat yönünde (clockwise) döndürülmüş vektör: (-dy, dx)
            let perpX = -dy / length;
            let perpY = dx / length;

            // Cross product negatifse, diğer tarafa dön (180° döndür)
            if (crossProduct > 0) {
                perpX = -perpX;
                perpY = -perpY;
            }

            // Sayaç rotation'u: Boru yönü veya ters yön (mouse konumuna göre)
            let baseRotation = Math.atan2(dy, dx) * 180 / Math.PI;
            if (crossProduct > 0) {
                baseRotation += 180;
            }
            ghost.rotation = baseRotation;

            // Giriş rakorunun lokal koordinatı
            const girisLokal = ghost.getGirisLocalKoordinat();

            // Giriş rakorunun dünya koordinatı (istenen)
            const girisHedefX = boruUcu.nokta.x + perpX * fleksUzunluk;
            const girisHedefY = boruUcu.nokta.y + perpY * fleksUzunluk;

            // Sayaç merkezini hesapla
            const rad = ghost.rotation * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const girisRotatedX = girisLokal.x * cos - girisLokal.y * sin;
            const girisRotatedY = girisLokal.x * sin + girisLokal.y * cos;

            ghost.x = girisHedefX - girisRotatedX;
            ghost.y = girisHedefY - girisRotatedY;

            // Ghost rendering için bağlantı bilgisini sakla
            ghost.ghostConnectionInfo = {
                boruUcu: boruUcu,
                girisNoktasi: boruUcu.nokta
            };
        } else {
            // Boru ucu bulunamadı, normal cursor pozisyonu
            ghost.x = point.x;
            ghost.y = point.y;
            ghost.ghostConnectionInfo = null;
        }
    }
    // Baca için: sadece cihaz üzerine snap yap
    else if (ghost.type === 'baca') {
        // Cihazları bul (currentFloor'da olan)
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
        ghost.x = point.x;
        ghost.y = point.y;
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

    // Sayaç/Vana - boru açısına hizala
    if ((ghost.type === 'sayac' || ghost.type === 'vana') && snap && snap.target) {
        if (snap.target.isPipe) {
            ghost.rotation = snap.target.aciDerece || 0;
        }
    }
}
