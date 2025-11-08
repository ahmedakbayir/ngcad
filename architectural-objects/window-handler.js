// ahmedakbayir/ngcad/ngcad-00d54c478fa934506781fd05812470b2bba6874c/window-handler.js
// window-handler.js
import { distToSegmentSquared } from '../draw/geometry.js';
import { state, setState, BATHROOM_WINDOW_DEFAULT_WIDTH } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { findLargestAvailableSegment, findAvailableSegmentAt, checkOverlapAndGap } from '../wall/wall-item-utils.js';

// Oda adını kontrol etmek için yardımcı fonksiyon (varsa)
function getRoomsAdjacentToWall(wall) {
    const adjacentRooms = [];
    const TOLERANCE = 1;
    if (!state.rooms || state.rooms.length === 0 || !wall || !wall.p1 || !wall.p2) return adjacentRooms;

    const currentFloorId = state.currentFloor?.id;
    const rooms = (state.rooms || []).filter(r => !currentFloorId || !r.floorId || r.floorId === currentFloorId);

    for (const room of rooms) {
        if (!room.polygon || !room.polygon.geometry) continue;
        const coords = room.polygon.geometry.coordinates[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i];
            const p2Coord = coords[i + 1];
            // Duvarın poligon kenarı ile eşleşip eşleşmediğini kontrol et
            const d1 = Math.hypot(wall.p1.x - p1Coord[0], wall.p1.y - p1Coord[1]) + Math.hypot(wall.p2.x - p2Coord[0], wall.p2.y - p2Coord[1]);
            const d2 = Math.hypot(wall.p1.x - p2Coord[0], wall.p1.y - p2Coord[1]) + Math.hypot(wall.p2.x - p1Coord[0], wall.p2.y - p1Coord[1]);
            if (Math.min(d1, d2) < TOLERANCE) {
                adjacentRooms.push(room);
                break; // Bu duvar bu odaya ait, sonraki odaya geç
            }
        }
    }
    return adjacentRooms;
}


/**
 * Verilen noktaya (pos) en yakın pencereyi bulur.
 * @param {object} pos - Dünya koordinatlarında {x, y}
 * @param {number} tolerance - Yakalama toleransı
 * @returns {object | null} - Bulunan pencere nesnesi (seçim için) veya null
 */
export function getWindowAtPoint(pos, tolerance) {
    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId);

    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0 || !wall.p1 || !wall.p2) continue;
        for (const window of wall.windows) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;

            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
            const wallPx = wall.thickness || state.wallThickness;

            const dx_p = pos.x - windowCenterX;
            const dy_p = pos.y - windowCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

             if (distPerpendicular < wallPx / 2 + tolerance && distParallel < window.width / 2 + tolerance) {
                 return { type: "window", object: window, wall: wall, handle: 'body' };
             }
        }
    }
    return null;
}

// Pencereyi duvarın ortasına eklemek için yardımcı fonksiyon (GÜNCELLENDİ)
function addWindowToWallMiddle(wall, roomName = null) { // Oda adı parametresi eklendi
    // Duvar tipini kontrol et
    const wallType = wall.wallType || 'normal';
    if (wallType !== 'normal') {
        // Normal değilse, balkon duvarı mı diye bak
        const adjacentRooms = getRoomsAdjacentToWall(wall);
        const isBalconyWall = adjacentRooms.some(r => r.name === 'BALKON' || r.name === 'AÇIK BALKON' || r.name === 'KAPALI BALKON');
        const isSharedWithNonBalcony = adjacentRooms.some(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
        // Eğer bir balkona bitişikse VE başka bir (balkon olmayan) odaya da bitişikse izin ver.
        if (!(isBalconyWall && isSharedWithNonBalcony)) {
            return false; // Uygun duvar tipi değil
        }
        // Eğer balkon duvarı ise ve normal bir odayla paylaşılıyorsa pencere eklenebilir.
    }


    // Duvarda zaten pencere varsa ekleme
    if (wall.windows && wall.windows.length > 0) {
        return false;
    }

    const largestSegment = findLargestAvailableSegment(wall);
    if (!largestSegment) {
        return false;
    }

    // Banyo odası mı kontrol et
    const isBathroom = roomName === 'BANYO';
    const defaultWidth = isBathroom ? BATHROOM_WINDOW_DEFAULT_WIDTH : 150; // Banyo ise 50, değilse 120
    let windowWidth;
    let windowPos;
    const MIN_ITEM_WIDTH = 20;

    if (largestSegment.length >= defaultWidth) {
        windowWidth = defaultWidth;
        windowPos = largestSegment.start + (largestSegment.length / 2);
    } else {
        if (largestSegment.length >= MIN_ITEM_WIDTH) {
            windowWidth = largestSegment.length;
            windowPos = largestSegment.start + (largestSegment.length / 2);
        } else {
            return false;
        }
    }

    if (!wall.windows) wall.windows = [];
    wall.windows.push({
        pos: windowPos,
        width: windowWidth,
        type: 'window',
        isWidthManuallySet: false,
        // Odanın adını pencere objesine ekleyelim (3D için)
        roomName: roomName // Eğer doğrudan duvara tıklanırsa bu null olabilir
    });
    return true;
}

/**
 * 'drawWindow' modundayken tıklama işlemini yönetir. (GÜNCELLENDİ)
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} clickedObject - Tıklanan nesne (getObjectAtPoint'ten)
 */
export function onPointerDownDraw(pos, clickedObject) {
    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId);

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
        // Duvar tipini kontrol et
        const wallType = previewWall.wallType || 'normal';
        let placementAllowed = (wallType === 'normal');

        if (!placementAllowed) {
            // Balkon duvarı kontrolü
            const adjacentRooms = getRoomsAdjacentToWall(previewWall);
            const isBalconyWall = adjacentRooms.some(r => r.name === 'BALKON' || r.name === 'AÇIK BALKON' || r.name === 'KAPALI BALKON');
             const isSharedWithNonBalcony = adjacentRooms.some(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
            if (isBalconyWall && isSharedWithNonBalcony) {
                placementAllowed = true;
            }
        }

        if (placementAllowed) {
            // Hangi odaya ait olduğunu bulmaya çalış (varsa)
            const adjacentRooms = getRoomsAdjacentToWall(previewWall);
            // Balkon olmayan ilk odayı referans alalım (Banyo kontrolü için)
            const adjacentRoom = adjacentRooms.find(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
            const roomName = adjacentRoom ? adjacentRoom.name : null;
            const isBathroom = roomName === 'BANYO';

            const previewWindowData = getWindowPlacement(previewWall, pos, isBathroom); // isBathroom bilgisini gönder
            if (previewWindowData && isSpaceForWindow(previewWindowData)) {
                if (previewWall.windows && previewWall.windows.length > 0) {
                     return;
                }
                if (!previewWall.windows) previewWall.windows = [];
                previewWall.windows.push({
                    pos: previewWindowData.pos,
                    width: previewWindowData.width,
                    type: 'window',
                    isWidthManuallySet: false,
                    roomName: roomName // Oda adını ekle
                 });
                saveState();
                return;
            }
        }
    }

    // 2. Odaya tıklayarak dış duvarlara pencere ekle
    if (clickedObject && clickedObject.type === 'room') {
        const clickedRoom = clickedObject.object; const TOLERANCE = 1;
        if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return;
        const roomCoords = clickedRoom.polygon.geometry.coordinates[0]; const roomWalls = new Set();
        // ... (odanın duvarlarını bulma kodu - değişiklik yok) ...
        for (let i = 0; i < roomCoords.length - 1; i++) {
             const p1Coord = roomCoords[i]; const p2Coord = roomCoords[i + 1];
             const wall = walls.find(w => {
                 if (!w || !w.p1 || !w.p2) return false;
                 const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                 const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                  return Math.min(d1, d2) < TOLERANCE;
              });
             if (wall) roomWalls.add(wall);
        }

        let windowAdded = false;
        roomWalls.forEach(wall => {
            // Dış duvar VEYA balkon ile paylaşılan duvar kontrolü
            const adjacentRooms = getRoomsAdjacentToWall(wall);
            const isExterior = state.wallAdjacency.get(wall) === 1;
            const isBalconyWall = adjacentRooms.some(r => r.name === 'BALKON' || r.name === 'AÇIK BALKON' || r.name === 'KAPALI BALKON');
            const isSharedWithNonBalcony = adjacentRooms.some(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');

            if (isExterior || (isBalconyWall && isSharedWithNonBalcony)) {
                // Duvar tipinin 'normal' veya (balkonla paylaşılan) 'balcony' olması lazım, ama zaten üstte kontrol ettik.
                // addWindowToWallMiddle zaten tip kontrolü yapıyor.
                if (addWindowToWallMiddle(wall, clickedRoom.name)) { // Oda adını gönder
                    windowAdded = true;
                }
            }
        });
        if (windowAdded) saveState();
        return;
    }

    // Boşluğa tıklandıysa, tüm uygun dış duvarlara ekle
    if (!clickedObject) {
        let windowAdded = false;
        state.wallAdjacency.forEach((count, wall) => {
            if (count === 1) { // Sadece dış duvarlar
                const wallType = wall.wallType || 'normal';
                if (wallType === 'normal') { // Sadece normal tipteki dış duvarlara ekle
                   // Komşu odayı bul (Banyo kontrolü için)
                   const adjacentRooms = getRoomsAdjacentToWall(wall);
                   const room = adjacentRooms[0]; // Dış duvarın tek bir komşusu olmalı
                   if (addWindowToWallMiddle(wall, room ? room.name : null)) { // Oda adını gönder
                        windowAdded = true;
                   }
                }
            }
        });
        if (windowAdded) saveState();
    }
}

/**
 * Bir pencere seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen pencere nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset }
 */
export function onPointerDownSelect(selectedObject, pos) {
    const window = selectedObject.object;
    const wall = selectedObject.wall;

    // --- YENİ EKLENDİ: Sürükleme başlangıcında orijinal genişliği sakla ---
    window.originalWidthBeforeDrag = window.width;
    // --- YENİ EKLENDİ SONU ---

    if (!wall || !wall.p1 || !wall.p2) return { startPointForDragging: pos, dragOffset: { x: 0, y: 0 } };

    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return { startPointForDragging: pos, dragOffset: { x: 0, y: 0 } };

    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const windowCenterX = wall.p1.x + dx * window.pos;
    const windowCenterY = wall.p1.y + dy * window.pos;
    const startPointForDragging = { x: windowCenterX, y: windowCenterY };
    const dragOffset = { x: windowCenterX - pos.x, y: windowCenterY - pos.y };

    return { startPointForDragging, dragOffset };
}

// --- GÜNCELLENDİ: onPointerMove (Geçici daraltma eklendi + Duvar Tipi Kontrolü) ---
/**
 * Seçili bir pencereyi sürüklerken çağrılır.
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(unsnappedPos) {
    const window = state.selectedObject.object;
    const oldWall = state.selectedObject.wall;
    const targetX = unsnappedPos.x + state.dragOffset.x;
    const targetY = unsnappedPos.y + state.dragOffset.y;
    const targetPos = { x: targetX, y: targetY };

    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId);

    let closestWall = null;
    let minDistSq = Infinity;
    const bodyHitTolerance = state.wallThickness * 2;
    const MIN_ITEM_WIDTH = 20;

    // Sürükleme başında saklanan orijinal/manuel genişliği al
    // Banyo kontrolü: Eğer banyo penceresiyse ve elle ayarlanmamışsa, varsayılan banyo genişliğini kullan
    const isBathroomWindow = window.roomName === 'BANYO';
    const defaultNonManualWidth = isBathroomWindow ? BATHROOM_WINDOW_DEFAULT_WIDTH : 150;
    const intendedWidth = window.originalWidthBeforeDrag || (window.isWidthManuallySet ? window.width : defaultNonManualWidth);


    for (const w of walls) {
        if (!w.p1 || !w.p2) continue;

        // --- YENİ: Sadece uygun duvar tiplerini dikkate al ---
        const wallType = w.wallType || 'normal';
        let isEligibleWall = (wallType === 'normal');
        if (!isEligibleWall) {
             const adjacentRooms = getRoomsAdjacentToWall(w);
             const isBalconyWall = adjacentRooms.some(r => r.name === 'BALKON' || r.name === 'AÇIK BALKON' || r.name === 'KAPALI BALKON');
             const isSharedWithNonBalcony = adjacentRooms.some(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
             if (isBalconyWall && isSharedWithNonBalcony) {
                 isEligibleWall = true;
             }
        }
        if (!isEligibleWall) continue; // Uygun değilse bu duvarı atla
        // --- KONTROL SONU ---


        const d = distToSegmentSquared(targetPos, w.p1, w.p2);
        if (d < bodyHitTolerance ** 2 && d < minDistSq) {
            minDistSq = d;
            closestWall = w;
        }
    }

    if (closestWall) {
        const DG = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
         if (DG < 0.1) {
             // Duvar çok kısaysa, genişliği minimuma ayarla (geçici olarak)
             window.width = MIN_ITEM_WIDTH;
             return;
         }

        const dx_pm_w = closestWall.p2.x - closestWall.p1.x;
        const dy_pm_w = closestWall.p2.y - closestWall.p1.y;
        const t_pm_w = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx_pm_w + (targetPos.y - closestWall.p1.y) * dy_pm_w) / (dx_pm_w * dx_pm_w + dy_pm_w * dy_pm_w)));
        const posOnWall = t_pm_w * DG;

        const segmentAtMouse_w = findAvailableSegmentAt(closestWall, posOnWall, window);

        if (segmentAtMouse_w) {
            let finalWidth = intendedWidth; // Başlangıçta hedeflenen genişliği kullan
            let finalPos;

            // Segment, hedeflenen genişlik için yeterli mi?
            if (segmentAtMouse_w.length >= intendedWidth) {
                // Yeterli, hedeflenen genişliği kullan
                finalWidth = intendedWidth;
                const minPos = segmentAtMouse_w.start + finalWidth / 2;
                const maxPos = segmentAtMouse_w.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
            } else if (segmentAtMouse_w.length >= MIN_ITEM_WIDTH) {
                // Yeterli değil AMA minimumdan büyükse, geçici olarak küçült
                finalWidth = segmentAtMouse_w.length; // Segmentin uzunluğuna ayarla
                const minPos = segmentAtMouse_w.start + finalWidth / 2;
                const maxPos = segmentAtMouse_w.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall)); // Ortala
            } else {
                 // Segment minimumdan bile küçükse, genişliği minimum yap ve ortala
                 finalWidth = MIN_ITEM_WIDTH;
                 const minPos = segmentAtMouse_w.start + finalWidth / 2;
                 const maxPos = segmentAtMouse_w.end - finalWidth / 2;
                 // Eğer minPos > maxPos ise (yani min genişlik bile sığmıyorsa) ortala
                 if (minPos > maxPos) {
                     finalPos = segmentAtMouse_w.start + segmentAtMouse_w.length / 2;
                 } else {
                     finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                 }
            }

            // Pencerenin state'ini (geçici olarak) güncelle
            window.pos = finalPos;
            window.width = finalWidth; // Bu, çizim için kullanılır

            // Duvar değiştirme
            if (oldWall !== closestWall) {
                // Eski duvardan kaldır
                if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                // Yeni duvara ekle
                if (!closestWall.windows) closestWall.windows = [];
                closestWall.windows.push(window);
                // selectedObject'teki duvar referansını güncelle (önemli!)
                state.selectedObject.wall = closestWall;
                 // Yeni duvara göre oda adını güncelle (varsa)
                const adjacentRoomsNew = getRoomsAdjacentToWall(closestWall);
                const adjacentRoomNew = adjacentRoomsNew.find(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
                window.roomName = adjacentRoomNew ? adjacentRoomNew.name : null;
            }
        } else {
            // Fare segment üzerinde değilse (ama hala duvara yakınsa)
            // Genişliği orijinal/elle ayarlanmış değere geri getir
            window.width = intendedWidth;
            // Pozisyonu kenara en yakın yere clamp et (genişlik sığıyorsa)
            const wallThickness = closestWall.thickness || state.wallThickness;
            const margin = (wallThickness / 2) + 5;
            const minPosPossible = window.width / 2 + margin;
            const maxPosPossible = DG - window.width / 2 - margin;


             if(minPosPossible <= maxPosPossible){ // Eğer pencere teorik olarak sığıyorsa
                 window.pos = Math.max(minPosPossible, Math.min(maxPosPossible, posOnWall));
             } else { // Sığmıyorsa ortala
                  window.pos = DG / 2;
                  // ve genişliği de küçült (geçici olarak)
                  const availableSpace = DG - 2 * margin;
                  window.width = Math.max(MIN_ITEM_WIDTH, availableSpace);
             }


             // Duvar değiştirme (segment olmasa da duvar değişebilir)
             if (oldWall !== closestWall) {
                 if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                 if (!closestWall.windows) closestWall.windows = [];
                 closestWall.windows.push(window);
                 state.selectedObject.wall = closestWall;
                 // Yeni duvara göre oda adını güncelle
                 const adjacentRoomsNew = getRoomsAdjacentToWall(closestWall);
                 const adjacentRoomNew = adjacentRoomsNew.find(r => r.name !== 'BALKON' && r.name !== 'AÇIK BALKON' && r.name !== 'KAPALI BALKON');
                 window.roomName = adjacentRoomNew ? adjacentRoomNew.name : null;
             }

        }
    } else {
        // Eğer hiçbir duvara yakın değilse, genişliği orijinal/elle ayarlanmış değere geri getir
        window.width = intendedWidth;
        // Pozisyonu veya duvarı değiştirme
    }
}


// --- getWindowPlacement (GÜNCELLENDİ: isBathroom parametresi eklendi) ---
export function getWindowPlacement(wall, mousePos, isBathroom = false) { // isBathroom parametresi
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const MIN_ITEM_WIDTH = 20;
    if (DG < MIN_ITEM_WIDTH) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    const segmentAtMouse = findAvailableSegmentAt(wall, posOnWall);
    if (!segmentAtMouse) return null;

    const windowWidth = isBathroom ? BATHROOM_WINDOW_DEFAULT_WIDTH : 150; // Banyo ise 50, değilse 120
    if (segmentAtMouse.length < windowWidth) {
        const smallerWidth = segmentAtMouse.length;
        if (smallerWidth < MIN_ITEM_WIDTH) return null;
        const minPos = segmentAtMouse.start + smallerWidth / 2;
        const maxPos = segmentAtMouse.end - smallerWidth / 2;
        const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
        // Dönen objeye wall referansı ve isWidthManuallySet ekle
        return { wall: wall, pos: clampedPos, width: smallerWidth, isWidthManuallySet: false };
    }

    const minPos = segmentAtMouse.start + windowWidth / 2;
    const maxPos = segmentAtMouse.end - windowWidth / 2;
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
    // Dönen objeye wall referansı ve isWidthManuallySet ekle
    return { wall: wall, pos: clampedPos, width: windowWidth, isWidthManuallySet: false };
}

// isSpaceForWindow artık selectedObject veya windowData bekliyor
export function isSpaceForWindow(windowDataOrSelectedObject) {
    // Gelen argümanın selectedObject mi yoksa getWindowPlacement'ten gelen veri mi olduğunu kontrol et
    const window = windowDataOrSelectedObject.object || windowDataOrSelectedObject;
    const wall = windowDataOrSelectedObject.wall; // Her iki durumda da wall burada olmalı
    if (!wall || !wall.p1 || !wall.p2) return false; // Duvar geçerli değilse false
    const MIN_GAP = 0.1;

    const windowStart = window.pos - window.width / 2;
    const windowEnd = window.pos + window.width / 2;

    // Duvarın uç boşluklarını kontrol et
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
     if (wallLen < 0.1) return false; // Duvar çok kısaysa false
    const wallThickness = wall.thickness || state.wallThickness;
    const UM = (wallThickness / 2) + 5; // Uç marjı
    if (windowStart < UM - 0.01 || windowEnd > wallLen - UM + 0.01) { // Küçük tolerans eklendi
        return false;
    }


    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    for (const door of doorsOnWall) {
        const doorStart = door.pos - door.width / 2;
        const doorEnd = door.pos + door.width / 2;
        if (checkOverlapAndGap(windowStart, windowEnd, doorStart, doorEnd, MIN_GAP)) {
            return false;
        }
    }

    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        // Kendisiyle karşılaştırmayı atla
        if (existingWindow === window) continue;
        const existingStart = existingWindow.pos - existingWindow.width / 2;
        const existingEnd = existingWindow.pos + existingWindow.width / 2;
         if (checkOverlapAndGap(windowStart, windowEnd, existingStart, existingEnd, MIN_GAP)) {
            return false;
        }
    }

    const ventsOnWall = wall.vents || [];
     for (const existingVent of ventsOnWall) {
         const ventStart = existingVent.pos - existingVent.width / 2;
         const ventEnd = existingVent.pos + existingVent.width / 2;
         if (checkOverlapAndGap(windowStart, windowEnd, ventStart, ventEnd, MIN_GAP)) {
             return false;
         }
     }
    return true;
}