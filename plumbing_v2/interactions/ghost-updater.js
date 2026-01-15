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
        // En yakın SERBEST boru ucunu bul (T-junction'ları atla)
        // 3D modda tolerance artır (Z kaymasını hesaba kat)
        const baseTolerance = 15;
        const tolerance3D = t > 0.5 ? baseTolerance + (100 * t) : baseTolerance;
        const boruUcu = this.findBoruUcuAt(point, tolerance3D, true); // onlyFreeEndpoints = true

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

            let snapPointScreenX = boruUcu.screenPoint ? boruUcu.screenPoint.x : boruUcu.nokta.x;
            let snapPointScreenY = boruUcu.screenPoint ? boruUcu.screenPoint.y : boruUcu.nokta.y;

            // Eğer screenPoint yoksa manuel hesapla
            if (!boruUcu.screenPoint && t > 0) {
                const bz = boruUcu.nokta.z || 0;
                snapPointScreenX = boruUcu.nokta.x + bz * t;
                snapPointScreenY = boruUcu.nokta.y - bz * t;
            }

            const mouseUcMesafe = Math.hypot(
                point.x - snapPointScreenX,
                point.y - snapPointScreenY
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
            // DÜZELTME: Boru ucunun Z değerini al
            // Borunun ucundaki nokta {x, y, z} formatındadır.
            // Boru ucunun Z değerini al
            const targetZ = (boruUcu.nokta.z !== undefined) ? boruUcu.nokta.z : 0;
            ghost.z = targetZ;

            // Cihaz merkezini hesapla (World Coordinates olarak saklayacağız)
            let merkezWorldX, merkezWorldY;

            if (mouseUcMesafe < minFleksUzunluk) {
                // Minimum mesafe (World üzerinde hesapla)
                merkezWorldX = boruUcu.nokta.x + normBoruYonX * minFleksUzunluk;
                merkezWorldY = boruUcu.nokta.y + normBoruYonY * minFleksUzunluk;
            } else if (mouseUcMesafe <= maxFleksUzunluk) {
                // Mouse pozisyonunda (Mouse ekran koordinatıdır, World'e çevirmeliyiz)
                // Inverse Projection: World = Screen - Z_effect
                // x_world = x_screen - z * t
                // y_world = y_screen + z * t
                merkezWorldX = point.x - (targetZ * t);
                merkezWorldY = point.y + (targetZ * t);
            } else {
                // Maksimum mesafe (World üzerinde orantıla)
                // Mouse'un World karşılığını bul
                const mouseWorldX = point.x - (targetZ * t);
                const mouseWorldY = point.y + (targetZ * t);

                const currentDistWorld = Math.hypot(mouseWorldX - boruUcu.nokta.x, mouseWorldY - boruUcu.nokta.y);
                const oran = maxFleksUzunluk / currentDistWorld;

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
        // 3D modda tolerance artır (Z kaymasını hesaba kat)
        const baseTolerance = 15;
        const tolerance3D = t > 0.5 ? baseTolerance + (100 * t) : baseTolerance;
        const boruUcu = this.findBoruUcuAt(point, tolerance3D, true);

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

            // Cross product hesabı
            const mouseVecX = mouseWorldX - boruUcu.nokta.x;
            const mouseVecY = mouseWorldY - boruUcu.nokta.y;
            const crossProduct = mouseVecX * dy - mouseVecY * dx;

            // Dik vektör
            let perpX = -dy / length;
            let perpY = dx / length;

            if (crossProduct > 0) {
                perpX = -perpX;
                perpY = -perpY;
            }

            // Rotasyon
            let baseRotation = Math.atan2(dy, dx) * 180 / Math.PI;
            if (crossProduct > 0) baseRotation += 180;
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

    // Sayaç/Vana - boru açısına hizala
    if ((ghost.type === 'sayac' || ghost.type === 'vana') && snap && snap.target) {
        if (snap.target.isPipe) {
            ghost.rotation = snap.target.aciDerece || 0;
        }
    }
}
