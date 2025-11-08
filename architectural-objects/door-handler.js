// door-handler.js
import { distToSegmentSquared } from '../draw/geometry.js';
import { state, setState } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { findAvailableSegmentAt, checkOverlapAndGap } from '../wall/wall-item-utils.js';

/**
 * Verilen noktaya (pos) en yakın kapıyı bulur.
 * @param {object} pos - Dünya koordinatlarında {x, y}
 * @param {number} tolerance - Yakalama toleransı
 * @returns {object | null} - Bulunan kapı nesnesi (seçim için) veya null
 */
export function getDoorAtPoint(pos, tolerance) {
    const currentFloorId = state.currentFloor?.id;
    const doors = (state.doors || []).filter(d => !currentFloorId || d.floorId === currentFloorId);

    for (const door of [...doors].reverse()) {
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenterX = wall.p1.x + dx * door.pos;
        const doorCenterY = wall.p1.y + dy * door.pos;
        const wallPx = wall.thickness || state.wallThickness;

        const dx_p = pos.x - doorCenterX;
        const dy_p = pos.y - doorCenterY;
        const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
        const distParallel = Math.abs(dx_p * dx + dy_p * dy);

        if (distPerpendicular < wallPx / 2 + tolerance && distParallel < door.width / 2 + tolerance) {
             return { type: "door", object: door, handle: 'body' };
        }
    }
    return null;
}

/**
 * 'drawDoor' modundayken tıklama işlemini yönetir.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} clickedObject - Tıklanan nesne (getObjectAtPoint'ten)
 */
export function onPointerDownDraw(pos, clickedObject) {
    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || w.floorId === currentFloorId);
    const rooms = (state.rooms || []).filter(r => !currentFloorId || r.floorId === currentFloorId);

    // 1. Direkt duvara yerleştirmeyi dene
    let previewWall = null, minDistSqPreview = Infinity;
    const bodyHitTolerancePreview = (state.wallThickness * 1.5) ** 2;
    for (const w of [...walls].reverse()) {
         if (!w.p1 || !w.p2) continue;
         const distSq = distToSegmentSquared(pos, w.p1, w.p2);
         if (distSq < bodyHitTolerancePreview && distSq < minDistSqPreview) {
             minDistSqPreview = distSq; previewWall = w;
         }
    }
    if (previewWall) {
        const previewDoor = getDoorPlacement(previewWall, pos);
        if (previewDoor && isSpaceForDoor(previewDoor)) {
            state.doors.push(previewDoor);
            saveState();
            return;
        }
    }

    // 2. Odaya tıklayarak komşulara kapı eklemeyi dene
    if (clickedObject && clickedObject.type === 'room') {
        const clickedRoom = clickedObject.object;
        if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return;
        const coords = clickedRoom.polygon.geometry.coordinates[0];
        const roomWalls = [];
        // Tıklanan odanın duvarlarını bul
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i]; const p2Coord = coords[i + 1];
            const wall = walls.find(w => {
                if (!w || !w.p1 || !w.p2) return false;
               const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
               const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
               return Math.min(dist1, dist2) < 1;
            });
            if (wall) roomWalls.push(wall);
        }

        const neighborRooms = [];
        // Komşu odaları bul
        rooms.forEach(otherRoom => {
            if (otherRoom === clickedRoom || !otherRoom.polygon || !otherRoom.polygon.geometry) return;
            const otherCoords = otherRoom.polygon.geometry.coordinates[0];
            const otherWalls = [];
            for (let i = 0; i < otherCoords.length - 1; i++) {
                 const p1Coord = otherCoords[i]; const p2Coord = otherCoords[i + 1];
                 const wall = walls.find(w => {
                     if (!w || !w.p1 || !w.p2) return false;
                    const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                    const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                    return Math.min(dist1, dist2) < 1;
                 });
                 if (wall) otherWalls.push(wall);
            }
            const sharedWalls = roomWalls.filter(w => otherWalls.includes(w));
            if (sharedWalls.length > 0) {
                neighborRooms.push({ room: otherRoom, sharedWalls: sharedWalls });
            }
        });

        let doorsAdded = 0;
        // Komşularla paylaşılan en uzun duvarlara kapı ekle
        neighborRooms.forEach(neighbor => {
            const sharedWalls = neighbor.sharedWalls;
            let longestWall = sharedWalls[0];
            let maxLength = 0;
             if(longestWall && longestWall.p1 && longestWall.p2) maxLength = Math.hypot(longestWall.p2.x - longestWall.p1.x, longestWall.p2.y - longestWall.p1.y);

            sharedWalls.forEach(wall => {
                 if (!wall || !wall.p1 || !wall.p2) return;
                const len = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                if (len > maxLength) { maxLength = len; longestWall = wall; }
            });

            if(!longestWall || !longestWall.p1 || !longestWall.p2) return;

            const existingDoor = state.doors.find(d => d.wall === longestWall);
            if (!existingDoor) {
                const midX = (longestWall.p1.x + longestWall.p2.x) / 2;
                const midY = (longestWall.p1.y + longestWall.p2.y) / 2;
                const newDoor = getDoorPlacement(longestWall, { x: midX, y: midY });
                if (newDoor && isSpaceForDoor(newDoor)) {
                    state.doors.push(newDoor); doorsAdded++;
                }
            }
        });
        if (doorsAdded > 0) saveState();
    }
}

/**
 * Bir kapı seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen kapı nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset }
 */
export function onPointerDownSelect(selectedObject, pos) {
    const door = selectedObject.object;
    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) return { startPointForDragging: pos, dragOffset: { x: 0, y: 0 } };

    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return { startPointForDragging: pos, dragOffset: { x: 0, y: 0 } };

    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const doorCenterX = wall.p1.x + dx * door.pos;
    const doorCenterY = wall.p1.y + dy * door.pos;
    const startPointForDragging = { x: doorCenterX, y: doorCenterY };
    const dragOffset = { x: doorCenterX - pos.x, y: doorCenterY - pos.y };

    return { startPointForDragging, dragOffset };
}

// --- GÜNCELLENDİ: onPointerMove (isWidthManuallySet kontrolü eklendi) ---
/**
 * Seçili bir kapıyı sürüklerken çağrılır.
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(unsnappedPos) {
    const door = state.selectedObject.object;
    const targetX = unsnappedPos.x + state.dragOffset.x;
    const targetY = unsnappedPos.y + state.dragOffset.y;
    const targetPos = { x: targetX, y: targetY };

    let closestWall = null;
    let minDistSq = Infinity;
    const bodyHitTolerance = state.wallThickness * 2;

    for (const w of state.walls) {
        if (!w.p1 || !w.p2) continue; // Geçersiz duvarları atla
        const d = distToSegmentSquared(targetPos, w.p1, w.p2);
        if (d < bodyHitTolerance ** 2 && d < minDistSq) {
            minDistSq = d;
            closestWall = w;
        }
    }

    if (closestWall) {
        const DG = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
        if (DG < 0.1) return; // Çok kısa duvarı atla

        const dx_pm = closestWall.p2.x - closestWall.p1.x;
        const dy_pm = closestWall.p2.y - closestWall.p1.y;
        const t_pm = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx_pm + (targetPos.y - closestWall.p1.y) * dy_pm) / (dx_pm * dx_pm + dy_pm * dy_pm)));
        const posOnWall = t_pm * DG;

        const segmentAtMouse = findAvailableSegmentAt(closestWall, posOnWall, door);

        if (segmentAtMouse) {
            // Kullanılacak genişliği belirle: Elle ayarlanmışsa onu, değilse varsayılanı al
            const targetWidth = door.isWidthManuallySet ? door.width : 70;
            const MIN_ITEM_WIDTH = 20;

            let finalWidth = targetWidth;
            let finalPos;

            // Segment, hedeflenen genişlik için yeterli mi?
            if (segmentAtMouse.length >= targetWidth) {
                // Yeterli, hedeflenen genişliği kullan
                finalWidth = targetWidth;
                const minPos = segmentAtMouse.start + finalWidth / 2;
                const maxPos = segmentAtMouse.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
            } else if (!door.isWidthManuallySet && segmentAtMouse.length >= MIN_ITEM_WIDTH) {
                // Yeterli değil AMA elle ayarlanmamış ve minimumdan büyükse, küçült
                finalWidth = segmentAtMouse.length;
                const minPos = segmentAtMouse.start + finalWidth / 2;
                const maxPos = segmentAtMouse.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                // Elle ayarlanmadığı için küçülttükten sonra işaretlemeye gerek yok
            } else {
                 // Yeterli değil VE (elle ayarlanmış VEYA minimumdan küçükse)
                 // Kapıyı bu segmente yerleştirme (veya pozisyonu/genişliği güncelleme)
                 // Şimdilik sadece pozisyonu kenara en yakın yere clamp edelim, genişlik kalsın
                 // (Elle ayarlıysa elle ayarlanan, değilse bir önceki frame'deki genişlik)
                 const minPos = segmentAtMouse.start + door.width / 2;
                 const maxPos = segmentAtMouse.end - door.width / 2;
                 finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                 finalWidth = door.width; // Mevcut genişliği koru
            }

            // Kapının state'ini güncelle
            door.wall = closestWall;
            door.pos = finalPos;
            door.width = finalWidth;

        }
    } else {
        // Eğer hiçbir duvara yakın değilse, genişliği sıfırla (eğer elle ayarlanmamışsa)
        if (!door.isWidthManuallySet) {
             door.width = 70; // Varsayılana dön
        }
        // Pozisyonu veya duvarı değiştirme
    }
}


// --- 'actions.js' dosyasından taşınan yardımcılar ---

export function getDoorPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const MIN_ITEM_WIDTH = 20;
    if (DG < MIN_ITEM_WIDTH) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    const segmentAtMouse = findAvailableSegmentAt(wall, posOnWall);
    if (!segmentAtMouse) return null;

    const doorWidth = 70; // Varsayılan kapı genişliği
    if (segmentAtMouse.length < doorWidth) {
        const smallerWidth = segmentAtMouse.length;
        if (smallerWidth < MIN_ITEM_WIDTH) return null;
        const minPos = segmentAtMouse.start + smallerWidth / 2;
        const maxPos = segmentAtMouse.end - smallerWidth / 2;
        const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
        return { wall: wall, pos: clampedPos, width: smallerWidth, type: 'door', isWidthManuallySet: false, floorId: wall.floorId }; // İşareti false başlat
    }

    const minPos = segmentAtMouse.start + doorWidth / 2;
    const maxPos = segmentAtMouse.end - doorWidth / 2;
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
    return { wall: wall, pos: clampedPos, width: doorWidth, type: 'door', isWidthManuallySet: false, floorId: wall.floorId }; // İşareti false başlat
}

export function isSpaceForDoor(door) {
    const wall = door.wall;
    if (!wall) return false;
    const MIN_GAP = 0.1;

    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;

    // Duvarın uç boşluklarını kontrol et
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || state.wallThickness;
    const UM = (wallThickness / 2) + 5; // Uç marjı
    if (doorStart < UM || doorEnd > wallLen - UM) {
        return false;
    }

    const doorsOnWall = state.doors.filter(d => d.wall === wall && d !== door);
    for (const existingDoor of doorsOnWall) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (checkOverlapAndGap(doorStart, doorEnd, existingStart, existingEnd, MIN_GAP)) {
            return false;
        }
    }

    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
        if (checkOverlapAndGap(doorStart, doorEnd, windowStart, windowEnd, MIN_GAP)) {
            return false;
        }
    }

    const ventsOnWall = wall.vents || [];
    for (const existingVent of ventsOnWall) {
        const ventStart = existingVent.pos - existingVent.width / 2;
        const ventEnd = existingVent.pos + existingVent.width / 2;
         if (checkOverlapAndGap(doorStart, doorEnd, ventStart, ventEnd, MIN_GAP)) {
             return false;
         }
    }
    return true;
}