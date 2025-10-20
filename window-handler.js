// window-handler.js
import { state, setState, WALL_THICKNESS } from './main.js';
import { saveState } from './history.js';
import { distToSegmentSquared } from './geometry.js';
import { findLargestAvailableSegment, findAvailableSegmentAt, checkOverlapAndGap } from './wall-item-utils.js';

/**
 * Verilen noktaya (pos) en yakın pencereyi bulur.
 * @param {object} pos - Dünya koordinatlarında {x, y}
 * @param {number} tolerance - Yakalama toleransı
 * @returns {object | null} - Bulunan pencere nesnesi (seçim için) veya null
 */
export function getWindowAtPoint(pos, tolerance) {
    for (const wall of state.walls) {
        if (!wall.windows || wall.windows.length === 0 || !wall.p1 || !wall.p2) continue;
        for (const window of wall.windows) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;

            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
            const wallPx = wall.thickness || WALL_THICKNESS;

            const dx_p = pos.x - windowCenterX;
            const dy_p = pos.y - windowCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

             if (distPerpendicular < wallPx / 2 + tolerance && distParallel < window.width / 2 + tolerance) {
                 return { type: "window", object: window, wall: wall };
             }
        }
    }
    return null;
}

// Pencereyi duvarın ortasına eklemek için yardımcı fonksiyon
function addWindowToWallMiddle(wall) {
    const largestSegment = findLargestAvailableSegment(wall);
    if (!largestSegment) {
        return false;
    }

    const defaultWidth = 120; // Varsayılan pencere genişliği
    let windowWidth;
    let windowPos;

    if (largestSegment.length >= defaultWidth) {
        windowWidth = defaultWidth;
        windowPos = largestSegment.start + (largestSegment.length / 2);
    } else {
        // En büyük segment varsayılan genişlikten küçükse, segment kadar yap
        const MIN_ITEM_WIDTH = 20;
        if (largestSegment.length >= MIN_ITEM_WIDTH) {
            windowWidth = largestSegment.length;
            windowPos = largestSegment.start + (largestSegment.length / 2);
        } else {
            return false; // Minimum genişlikten de küçükse ekleme
        }
    }

    if (!wall.windows) wall.windows = [];
    wall.windows.push({
        pos: windowPos,
        width: windowWidth,
        type: 'window',
        isWidthManuallySet: false // İşareti false başlat
    });
    return true;
}

/**
 * 'drawWindow' modundayken tıklama işlemini yönetir.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} clickedObject - Tıklanan nesne (getObjectAtPoint'ten)
 */
export function onPointerDownDraw(pos, clickedObject) {
    // 1. Direkt duvara yerleştirmeyi dene
    let previewWall = null, minDistSqPreview = Infinity;
    const bodyHitTolerancePreview = (WALL_THICKNESS * 1.5) ** 2;
    for (const w of [...state.walls].reverse()) {
        if (!w.p1 || !w.p2) continue;
        const distSq = distToSegmentSquared(pos, w.p1, w.p2);
        if (distSq < bodyHitTolerancePreview && distSq < minDistSqPreview) {
            minDistSqPreview = distSq; previewWall = w;
        }
    }
    if (previewWall) {
        const previewWindowData = getWindowPlacement(previewWall, pos);
        // isSpaceForWindow'un previewWindowData'yı alması gerekiyor
        if (previewWindowData && isSpaceForWindow(previewWindowData)) {
            if (!previewWall.windows) previewWall.windows = [];
            // getWindowPlacement'ten dönen width ve pos'u kullan, işareti ekle
            previewWall.windows.push({
                pos: previewWindowData.pos,
                width: previewWindowData.width,
                type: 'window',
                isWidthManuallySet: false
             });
            saveState();
            return;
        }
    }

    // 2. Odaya veya boşluğa tıklayarak dış duvarlara pencere ekle
    if (clickedObject && clickedObject.type === 'room') {
        const clickedRoom = clickedObject.object; const TOLERANCE = 1;
        if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return;
        const roomCoords = clickedRoom.polygon.geometry.coordinates[0]; const roomWalls = new Set();
        for (let i = 0; i < roomCoords.length - 1; i++) {
             const p1Coord = roomCoords[i]; const p2Coord = roomCoords[i + 1];
             const wall = state.walls.find(w => {
                 if (!w || !w.p1 || !w.p2) return false;
                 const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                 const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                  return Math.min(d1, d2) < TOLERANCE;
              });
             if (wall) roomWalls.add(wall);
        }
        let windowAdded = false;
        roomWalls.forEach(wall => {
            if (state.wallAdjacency.get(wall) === 1) { // Sadece dış duvarlar
                if (addWindowToWallMiddle(wall)) windowAdded = true;
            }
        });
        if (windowAdded) saveState();
        return;
    }

    // Boşluğa tıklandıysa, tüm dış duvarlara ekle
    if (!clickedObject) {
        let windowAdded = false;
        state.wallAdjacency.forEach((count, wall) => {
            if (count === 1) { // Sadece dış duvarlar
                if (addWindowToWallMiddle(wall)) windowAdded = true;
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

// --- GÜNCELLENDİ: onPointerMove (isWidthManuallySet kontrolü eklendi) ---
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

    let closestWall = null;
    let minDistSq = Infinity;
    const bodyHitTolerance = WALL_THICKNESS * 2;

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

        const dx_pm_w = closestWall.p2.x - closestWall.p1.x;
        const dy_pm_w = closestWall.p2.y - closestWall.p1.y;
        const t_pm_w = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx_pm_w + (targetPos.y - closestWall.p1.y) * dy_pm_w) / (dx_pm_w * dx_pm_w + dy_pm_w * dy_pm_w)));
        const posOnWall = t_pm_w * DG;

        const segmentAtMouse_w = findAvailableSegmentAt(closestWall, posOnWall, window);

        if (segmentAtMouse_w) {
            // Kullanılacak genişliği belirle: Elle ayarlanmışsa onu, değilse varsayılanı al
            const targetWidth = window.isWidthManuallySet ? window.width : 120;
            const MIN_ITEM_WIDTH = 20;

            let finalWidth = targetWidth;
            let finalPos;

            // Segment, hedeflenen genişlik için yeterli mi?
            if (segmentAtMouse_w.length >= targetWidth) {
                // Yeterli, hedeflenen genişliği kullan
                finalWidth = targetWidth;
                const minPos = segmentAtMouse_w.start + finalWidth / 2;
                const maxPos = segmentAtMouse_w.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
            } else if (!window.isWidthManuallySet && segmentAtMouse_w.length >= MIN_ITEM_WIDTH) {
                // Yeterli değil AMA elle ayarlanmamış ve minimumdan büyükse, küçült
                finalWidth = segmentAtMouse_w.length;
                const minPos = segmentAtMouse_w.start + finalWidth / 2;
                const maxPos = segmentAtMouse_w.end - finalWidth / 2;
                finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
            } else {
                 // Yeterli değil VE (elle ayarlanmış VEYA minimumdan küçükse)
                 // Pencereyi bu segmente yerleştirme (veya pozisyonu/genişliği güncelleme)
                 // Şimdilik sadece pozisyonu kenara en yakın yere clamp edelim, genişlik kalsın
                 const minPos = segmentAtMouse_w.start + window.width / 2;
                 const maxPos = segmentAtMouse_w.end - window.width / 2;
                 finalPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                 finalWidth = window.width; // Mevcut genişliği koru
            }

            // Pencerenin state'ini güncelle
            window.pos = finalPos;
            window.width = finalWidth;

            // Duvar değiştirme
            if (oldWall !== closestWall) {
                // Eski duvardan kaldır
                if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                // Yeni duvara ekle
                if (!closestWall.windows) closestWall.windows = [];
                closestWall.windows.push(window);
                // selectedObject'teki duvar referansını güncelle (önemli!)
                state.selectedObject.wall = closestWall;
            }
        }
    } else {
        // Eğer hiçbir duvara yakın değilse, genişliği sıfırla (eğer elle ayarlanmamışsa)
        if (!window.isWidthManuallySet) {
             window.width = 120; // Varsayılana dön
        }
         // Pozisyonu veya duvarı değiştirme
    }
}

// --- 'actions.js' dosyasından taşınan yardımcılar ---

export function getWindowPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const MIN_ITEM_WIDTH = 20;
    if (DG < MIN_ITEM_WIDTH) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    const segmentAtMouse = findAvailableSegmentAt(wall, posOnWall);
    if (!segmentAtMouse) return null;

    const windowWidth = 120; // Varsayılan pencere genişliği
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
    if (!wall) return false;
    const MIN_GAP = 0.1;

    const windowStart = window.pos - window.width / 2;
    const windowEnd = window.pos + window.width / 2;

    // Duvarın uç boşluklarını kontrol et
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const UM = (wallThickness / 2) + 5; // Uç marjı
    if (windowStart < UM || windowEnd > wallLen - UM) {
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