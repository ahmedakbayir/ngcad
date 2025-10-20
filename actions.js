// ahmedakbayir/ngcad/ngcad-54ad8bf2d516757e62115ea4acba62ce8c974e7f/actions.js
// GÜNCELLENMİŞ: Bu dosya artık sadece bir "hit testing" yönlendiricisi
// ve birkaç genel yardımcı fonksiyon içeriyor.

import { state, WALL_THICKNESS } from './main.js';
import { getColumnAtPoint } from './columns.js';
import { getWallAtPoint } from './wall-handler.js';
import { getDoorAtPoint } from './door-handler.js';
import { getWindowAtPoint } from './window-handler.js';
// getVentAtPoint ve getRoomAtPoint için de benzer importlar gerekir.
// Şimdilik, bu mantığı basitleştirmek için burada bırakıyorum.
import { distToSegmentSquared } from './geometry.js';


/**
 * Verilen noktadaki (pos) en üstteki nesneyi bulur.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @returns {object | null} - Bulunan nesne (seçim için) veya null
 */
export function getObjectAtPoint(pos) {
    const { walls, doors, rooms, zoom } = state;
    const tolerance = 8 / zoom;

    // 1. Kolon Kontrolü (En Yüksek Öncelik)
    const columnHit = getColumnAtPoint(pos);
    if (columnHit) return columnHit;

    // 2. Duvar Ucu (Node) Kontrolü
    const wallHit = getWallAtPoint(pos, tolerance);
    if (wallHit && wallHit.handle !== 'body') return wallHit;

    // 3. Kapı Kontrolü
    const doorHit = getDoorAtPoint(pos, tolerance);
    if (doorHit) return doorHit;
    
    // 4. Pencere Kontrolü
    const windowHit = getWindowAtPoint(pos, tolerance);
    if (windowHit) return windowHit;

    // 5. Menfez Kontrolü (Hala burada, `vent-handler.js`'e taşınabilir)
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0 || !wall.p1 || !wall.p2) continue;
        for (const vent of wall.vents) {
            // ... (menfez bulma mantığı)
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const wallPx = wall.thickness || WALL_THICKNESS;
            const dx_p = pos.x - ventCenterX;
            const dy_p = pos.y - ventCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

            if (distPerpendicular < wallPx / 2 + tolerance && distParallel < vent.width / 2 + tolerance) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // 6. Mahal İsmi/Alanı Kontrolü (Hala burada, `room-handler.js`'e taşınabilir)
    for (const room of [...rooms].reverse()) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
        if (distToCenter < 30) {
             return { type: 'roomName', object: room };
        }
    }

    // 7. Duvar Gövdesi Kontrolü (Diğer her şeyden sonra)
    if (wallHit && wallHit.handle === 'body') return wallHit;

    // 8. Mahal Alanı Kontrolü (Hala burada, `room-handler.js`'e taşınabilir)
    for (const room of [...rooms].reverse()) {
        if (!room.polygon || !room.polygon.geometry) continue;
        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                let isOverName = false;
                 if (room.center && Array.isArray(room.center) && room.center.length >= 2) {
                    const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
                    if (distToCenter < 30) {
                        isOverName = true;
                    }
                 }
                 if (!isOverName) {
                    return { type: 'room', object: room };
                 }
            }
        } catch (e) { continue; }
    }

    return null;
}

/**
 * Bir duvarın sahip olabileceği minimum uzunluğu hesaplar.
 * (Diğer modüller buna ihtiyaç duyduğu için şimdilik burada kalabilir)
 * @param {object} wall - Duvar nesnesi
 * @returns {number} - Minimum uzunluk (cm)
 */
export function getMinWallLength(wall) {
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const UM = (wallThickness / 2) + 5;
    const MIN_ITEM_WIDTH = 20;
    const MIN_GAP = 0.1;
    const minLength = 2 * UM + MIN_ITEM_WIDTH;

    let requiredByItems = 0;
    const items = [
        ...(state.doors.filter(d => d.wall === wall)),
        ...(wall.windows || []),
        ...(wall.vents || [])
    ];
    if (items.length > 0) {
        items.sort((a,b)=> a.pos - b.pos);
        const firstItemStart = items[0].pos - items[0].width / 2;
        const lastItemEnd = items[items.length - 1].pos + items[items.length - 1].width / 2;
        requiredByItems = (firstItemStart - UM)
                         + (lastItemEnd - firstItemStart)
                         + (UM)
                         + (items.length - 1) * MIN_GAP;
        requiredByItems = Math.max(0, requiredByItems);
    }

    return Math.max(minLength, requiredByItems);
}

// Kalan fonksiyonlar (findLargestAvailableSegment, findAvailableSegmentAt, checkOverlapAndGap, 
// getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, findCollinearChain)
// ilgili handler dosyalarına (wall-item-utils.js, door-handler.js, window-handler.js, wall-handler.js) taşındı.