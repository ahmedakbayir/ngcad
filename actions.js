import { state, dom } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { WALL_THICKNESS, DRAG_HANDLE_RADIUS } from './main.js';

export function getObjectAtPoint(worldPos) {
    const { walls, doors, rooms, zoom, dimensionOptions } = state;

    // Düğüm noktalarını kontrol et (en yüksek öncelik)
    const handleRadius = DRAG_HANDLE_RADIUS / zoom;
    for (const wall of walls) {
        if (!wall.p1 || !wall.p2) continue;
        const distToP1 = Math.hypot(wall.p1.x - worldPos.x, wall.p1.y - worldPos.y);
        if (distToP1 < handleRadius) {
            return { type: "wall", object: wall, handle: "p1" };
        }
        const distToP2 = Math.hypot(wall.p2.x - worldPos.x, wall.p2.y - worldPos.y);
        if (distToP2 < handleRadius) {
            return { type: "wall", object: wall, handle: "p2" };
        }
    }

    // Kapıları kontrol et
    for (const door of doors) {
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue; // Güvenlik kontrolü

        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;

        const clickableWidth = door.width * 0.8; // Biraz daha dar bir alan
        const clickableStart = door.pos - clickableWidth / 2;
        const clickableEnd = door.pos + clickableWidth / 2;

        const p1 = { x: wall.p1.x + dx * clickableStart, y: wall.p1.y + dy * clickableStart };
        const p2 = { x: wall.p1.x + dx * clickableEnd, y: wall.p1.y + dy * clickableEnd };

        const distSq = distToSegmentSquared(worldPos, p1, p2);

        // Kapı tıklama hassasiyeti duvar kalınlığına göre
        const wallPx = wall.thickness || WALL_THICKNESS;
        const doorHitToleranceSq = (wallPx / 1.5) ** 2; // Toleransı biraz artır
        if (distSq < doorHitToleranceSq) {
            return { type: "door", object: door };
        }
    }

    // Pencereleri kontrol et (Artık segment kullanarak ve dinamik toleransla)
    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0) continue;
         if (!wall.p1 || !wall.p2) continue; // Güvenlik kontrolü

        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;

        for (const window of wall.windows) {
            // Pencerenin duvar üzerindeki başlangıç ve bitiş noktalarını hesapla
            const startPos = window.pos - window.width / 2;
            const endPos = window.pos + window.width / 2;

            const p1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
            const p2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };

            // Fare pozisyonunun bu segmente olan uzaklığını kontrol et
            const distSq = distToSegmentSquared(worldPos, p1, p2);

            // Pencere tıklama hassasiyeti duvar kalınlığına göre (kapı ile aynı)
            const wallPx = wall.thickness || WALL_THICKNESS;
            const tolerance = wallPx / 1.5;
            const windowHitToleranceSq = tolerance ** 2;

            if (distSq < windowHitToleranceSq) {
                return { type: "window", object: window, wall: wall };
            }
        }
    }


    // Menfezleri kontrol et
    const ventHitTolerance = 10; // Menfez için daha küçük, sabit tolerans
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0) continue;
         if (!wall.p1 || !wall.p2) continue; // Güvenlik kontrolü
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;

        for (const vent of wall.vents) {
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            if (Math.hypot(ventCenterX - worldPos.x, ventCenterY - worldPos.y) < ventHitTolerance / zoom) { // Zoom'a göre ayarla
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // Duvar gövdelerini kontrol et
    for (const wall of [...walls].reverse()) {
         if (!wall.p1 || !wall.p2) continue; // Güvenlik kontrolü
        const wallPx = wall.thickness || WALL_THICKNESS;
        const bodyHitToleranceSq = (wallPx / 2) ** 2;
        const distSq = distToSegmentSquared(worldPos, wall.p1, wall.p2);
        if (distSq < bodyHitToleranceSq) {
            return { type: "wall", object: wall, handle: "body" };
        }
    }

    // Mahal adlarını ve alan bilgilerini kontrol et
    const { ctx2d } = dom;
    const hitPadding = 10 / zoom;
    for (const room of rooms) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;

        const baseNameFontSize = 18;
        const baseAreaFontSize = 14;
        const showArea = dimensionOptions.defaultView > 0; // Basitleştirildi

        let nameFontSize = zoom > 1 ? baseNameFontSize / zoom : baseNameFontSize;
        let areaFontSize = zoom > 1 ? baseAreaFontSize / zoom : baseAreaFontSize;

        ctx2d.font = `500 ${Math.max(3 / zoom, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

        const nameParts = room.name.split(' ');
        let nameHeight;
        let nameWidth = 0;

        if (nameParts.length === 2) {
            const lineGap = nameFontSize * 1.2;
            nameHeight = lineGap * 2;
            nameParts.forEach(part => {
                const metrics = ctx2d.measureText(part);
                nameWidth = Math.max(nameWidth, metrics.width);
            });
        } else {
            const textMetrics = ctx2d.measureText(room.name);
            nameWidth = textMetrics.width;
            nameHeight = nameFontSize; // Tek satır yüksekliği
        }

        const baseNameYOffset = showArea ? 10 : 0; // Alan gösteriliyorsa ismi yukarı kaydır
        const nameYOffset = baseNameYOffset / zoom;

        // İsmin Bounding Box'ını hesapla (iki satır olasılığını düşünerek)
        const nameTop = room.center[1] - nameYOffset - (nameParts.length === 2 ? nameFontSize * 1.2 / 2 : nameHeight / 2) - hitPadding;
        const nameBottom = room.center[1] - nameYOffset + (nameParts.length === 2 ? nameFontSize * 1.2 / 2 : nameHeight / 2) + hitPadding;
        const nameLeft = room.center[0] - nameWidth / 2 - hitPadding;
        const nameRight = room.center[0] + nameWidth / 2 + hitPadding;


        if (worldPos.x >= nameLeft && worldPos.x <= nameRight && worldPos.y >= nameTop && worldPos.y <= nameBottom) {
            return { type: "roomName", object: room };
        }

        if (showArea) {
            ctx2d.font = `400 ${Math.max(2 / zoom, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            const areaText = `${room.area.toFixed(2)} m²`;
            const areaMetrics = ctx2d.measureText(areaText);
            const areaWidth = areaMetrics.width;
            const areaHeight = areaFontSize;

            // Alanın y pozisyonunu hesapla (ismin hemen altına)
            const areaYPos = room.center[1] - nameYOffset + (nameParts.length === 2 ? nameFontSize * 1.2 / 2 : nameHeight / 2) + areaHeight * 0.7; // Biraz boşluk bırak
            const areaTop = areaYPos - areaHeight / 2 - hitPadding;
            const areaBottom = areaYPos + areaHeight / 2 + hitPadding;
            const areaLeft = room.center[0] - areaWidth / 2 - hitPadding;
            const areaRight = room.center[0] + areaWidth / 2 + hitPadding;

            if (worldPos.x >= areaLeft && worldPos.x <= areaRight && worldPos.y >= areaTop && worldPos.y <= areaBottom) {
                return { type: "roomArea", object: room };
            }
        }
    }

    // Mahal alanlarını kontrol et (en düşük öncelik)
    for (const room of rooms) {
        try {
            if (room.polygon && turf.booleanPointInPolygon([worldPos.x, worldPos.y], room.polygon)) { // Polygon var mı kontrol et
                 return { type: "room", object: room };
            }
        } catch (e) {
            // Polygon hatası durumunda logla ama devam et
            // console.error("Mahal kontrol hatası (getObjectAtPoint):", e, room);
        }
    }

    return null; // Hiçbir şey bulunamadı
}

export function getDoorPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5; // Kenar boşluğu

    // Farenin duvara izdüşümünü bul
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    let desiredPos = clampedT * wallLen; // İstenen merkez pozisyonu

    // Varsayılan kapı genişliği
    const defaultDoorWidth = 70;
    const minDoorWidth = 20;

    // Kenar boşlukları dahilinde kullanılabilir aralığı hesapla
    const availableStart = edgeMargin;
    const availableEnd = wallLen - edgeMargin;
    const availableSpace = availableEnd - availableStart;

    // Eğer duvar çok kısaysa (minimum genişlik + boşluklar sığmıyorsa) çık
    if (availableSpace < minDoorWidth) {
        return null;
    }

    // Yerleştirilebilecek maksimum genişliği belirle
    let doorWidth = Math.min(defaultDoorWidth, availableSpace);

    // Minimum pozisyonu hesapla (kenar + yarım genişlik)
    const minPos = availableStart + doorWidth / 2;
    // Maksimum pozisyonu hesapla (bitiş - yarım genişlik)
    const maxPos = availableEnd - doorWidth / 2;

    // İstenen pozisyonu bu aralığa sıkıştır
    let finalPos = Math.max(minPos, Math.min(maxPos, desiredPos));

    // Mevcut kapılarla çakışma kontrolü
    const existingDoors = state.doors.filter(d => d.wall === wall);
    const doorStart = finalPos - doorWidth / 2;
    const doorEnd = finalPos + doorWidth / 2;
    for (const existingDoor of existingDoors) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        // Aralıkların çakışıp çakışmadığını kontrol et (ufak bir boşluk bırakarak)
        if (!(doorEnd + edgeMargin <= existingStart || doorStart >= existingEnd + edgeMargin)) {
            return null; // Çakışma var
        }
    }
    // Pencere ile çakışma kontrolü
    const existingWindows = wall.windows || [];
    for (const existingWindow of existingWindows) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
         if (!(doorEnd + edgeMargin <= windowStart || doorStart >= windowEnd + edgeMargin)) {
            return null; // Pencere ile çakışma var
        }
    }


    return { wall, pos: finalPos, width: doorWidth, type: 'door' };
}


export function isSpaceForDoor(doorData) {
    const { wall, pos, width } = doorData;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return false;

    const doorStart = pos - width / 2;
    const doorEnd = pos + width / 2;

    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5; // Kenar boşluğu

    // Duvarın kenarlarına çok yakın mı?
    if (doorStart < edgeMargin || doorEnd > wallLen - edgeMargin) {
        return false;
    }

    // Diğer kapılarla çakışıyor mu?
    for (const existingDoor of state.doors) {
        // Kendisiyle veya farklı duvardaki kapıyla kontrol etme
        if (existingDoor === doorData || existingDoor.wall !== wall) continue;
        // Eğer doorData bir önizleme ise (object özelliği yoksa)
        // veya mevcut kapı, kontrol edilen kapı değilse çakışmayı kontrol et
        if (!doorData.object || existingDoor !== doorData.object) {
            const existingStart = existingDoor.pos - existingDoor.width / 2;
            const existingEnd = existingDoor.pos + existingDoor.width / 2;
            // Aralıkların çakışıp çakışmadığını kontrol et (ufak bir boşluk bırakarak)
            if (!(doorEnd + edgeMargin <= existingStart || doorStart >= existingEnd + edgeMargin)) {
                return false; // Çakışma var
            }
        }
    }
     // Pencerelerle çakışıyor mu?
    const existingWindows = wall.windows || [];
    for (const existingWindow of existingWindows) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
        if (!(doorEnd + edgeMargin <= windowStart || doorStart >= windowEnd + edgeMargin)) {
            return false; // Pencere ile çakışma var
        }
    }

    return true; // Yer var
}

// getWindowPlacement fonksiyonu güncellendi
export function getWindowPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5; // Kenar boşluğu

    // Farenin duvara izdüşümünü bul
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    let desiredPos = clampedT * wallLen;

    // Varsayılan ve minimum pencere genişliği
    const defaultWindowWidth = 150;
    const minWindowWidth = 40;

    // Kullanılabilir alanı hesapla
    const availableStart = edgeMargin;
    const availableEnd = wallLen - edgeMargin;
    const availableSpace = availableEnd - availableStart;

    // Eğer duvar çok kısaysa çık
    if (availableSpace < minWindowWidth) {
        return null;
    }

    // Pencere genişliğini belirle
    let windowWidth;
    if (wallLen < 300) { // Duvar 300'den kısaysa
        // Duvarın yarısı kadar yap, ama min/max sınırları içinde kalsın
        windowWidth = Math.max(minWindowWidth, Math.min(availableSpace, wallLen / 2));
    } else { // Duvar 300 veya daha uzunsa
        // Varsayılanı kullan, ama kullanılabilir alandan büyük olmasın
        windowWidth = Math.min(defaultWindowWidth, availableSpace);
    }

    // Minimum ve maksimum pozisyonları hesapla
    const minPos = availableStart + windowWidth / 2;
    const maxPos = availableEnd - windowWidth / 2;

    // İstenen pozisyonu bu aralığa sıkıştır
    let finalPos = Math.max(minPos, Math.min(maxPos, desiredPos));

    // Çakışma kontrolleri isSpaceForWindow içinde yapılacak

    return { wall, pos: finalPos, width: windowWidth, type: 'window' };
}


export function isSpaceForWindow(windowData) {
    const { wall, pos, width } = windowData;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
     if (wallLen < 0.1) return false;

    const windowStart = pos - width / 2;
    const windowEnd = pos + width / 2;

    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5; // Kenar boşluğu

    // Duvarın kenarlarına çok yakın mı?
    if (windowStart < edgeMargin || windowEnd > wallLen - edgeMargin) {
        return false;
    }

    // Diğer pencerelerle çakışıyor mu?
    const existingWindows = wall.windows || [];
    for (const existingWindow of existingWindows) {
        // Kendisiyle kontrol etme (eğer sürüklenen bir nesne ise)
        if (windowData.object && existingWindow === windowData.object) continue;

        const existingStart = existingWindow.pos - existingWindow.width / 2;
        const existingEnd = existingWindow.pos + existingWindow.width / 2;
        // Aralıkların çakışıp çakışmadığını kontrol et
        if (!(windowEnd + edgeMargin <= existingStart || windowStart >= existingEnd + edgeMargin)) {
            return false; // Çakışma var
        }
    }

    // Kapılarla çakışıyor mu?
    const existingDoors = state.doors.filter(d => d.wall === wall);
    for (const existingDoor of existingDoors) {
        const doorStart = existingDoor.pos - existingDoor.width / 2;
        const doorEnd = existingDoor.pos + existingDoor.width / 2;
        // Aralıkların çakışıp çakışmadığını kontrol et
        if (!(windowEnd + edgeMargin <= doorStart || windowStart >= doorEnd + edgeMargin)) {
            return false; // Çakışma var
        }
    }

    return true; // Yer var
}


export function getMinWallLength(wall) {
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    const windowsOnWall = wall.windows || [];
    if (doorsOnWall.length === 0 && windowsOnWall.length === 0) return 20; // Minimum duvar uzunluğu

    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;

    // Tüm kapı ve pencerelerin toplam genişliğini ve gerekli boşlukları hesapla
    const totalDoorWidth = doorsOnWall.reduce((sum, door) => sum + door.width, 0);
    const totalWindowWidth = windowsOnWall.reduce((sum, window) => sum + window.width, 0);
    const totalObjectWidth = totalDoorWidth + totalWindowWidth;
    const numberOfObjects = doorsOnWall.length + windowsOnWall.length;

    // Minimum uzunluk: toplam nesne genişliği + 2 kenar boşluğu + (nesne sayısı - 1) * nesneler arası boşluk
    const minLength = totalObjectWidth + (2 * edgeMargin) + Math.max(0, numberOfObjects - 1) * edgeMargin;

    return Math.max(20, minLength); // En az 20cm olmalı
}

export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);

    const checkNode = (node) => {
        const connectedWalls = state.walls.filter(w =>
            !visited.has(w) && (w.p1 === node || w.p2 === node)
        );

        for (const wall of connectedWalls) {
            const dx1 = startWall.p2.x - startWall.p1.x;
            const dy1 = startWall.p2.y - startWall.p1.y;
            const len1 = Math.hypot(dx1, dy1);
            if (len1 < 0.1) continue;

            const dir1 = { x: dx1 / len1, y: dy1 / len1 };

            const dx2 = wall.p2.x - wall.p1.x;
            const dy2 = wall.p2.y - wall.p1.y;
            const len2 = Math.hypot(dx2, dy2);
            if (len2 < 0.1) continue;

            const dir2 = { x: dx2 / len2, y: dy2 / len2 };

            const dotProduct = Math.abs(dir1.x * dir2.x + dir1.y * dir2.y);
            const COLLINEAR_THRESHOLD = Math.cos(5 * Math.PI / 180); // 5 derece tolerans

            if (dotProduct > COLLINEAR_THRESHOLD) {
                visited.add(wall);
                chain.push(wall);
                const nextNode = wall.p1 === node ? wall.p2 : wall.p1;
                checkNode(nextNode);
            }
        }
    };

    checkNode(startWall.p1);
    checkNode(startWall.p2);

    return chain;
}