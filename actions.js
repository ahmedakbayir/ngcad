import { state, WALL_THICKNESS } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { getColumnAtPoint } from './columns.js';  // BU SATIR BÖYLE OLMALI

export function getObjectAtPoint(pos) {
    const { walls, doors, rooms, zoom } = state;
    const tolerance = 8 / zoom;

    // KOLON KONTROLÜ - ÖNCELİKLİ
    const columnHit = getColumnAtPoint(pos);
    if (columnHit) return columnHit;

    // Duvar ucu kontrolü
    for (const wall of [...walls].reverse()) {
        const d1 = Math.hypot(pos.x - wall.p1.x, pos.y - wall.p1.y);
        const d2 = Math.hypot(pos.x - wall.p2.x, pos.y - wall.p2.y);
        if (d1 < tolerance) return { type: "wall", object: wall, handle: "p1" };
        if (d2 < tolerance) return { type: "wall", object: wall, handle: "p2" };
    }

    // Kapı kontrolü
    for (const door of [...doors].reverse()) {
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenterX = wall.p1.x + dx * door.pos;
        const doorCenterY = wall.p1.y + dy * door.pos;
        const distToDoor = Math.hypot(pos.x - doorCenterX, pos.y - doorCenterY);
        if (distToDoor < door.width / 2 + tolerance) {
            return { type: "door", object: door };
        }
    }

    // Pencere kontrolü
    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0) continue;
        for (const window of wall.windows) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
            const distToWindow = Math.hypot(pos.x - windowCenterX, pos.y - windowCenterY);
            if (distToWindow < window.width / 2 + tolerance) {
                return { type: "window", object: window, wall: wall };
            }
        }
    }

    // Menfez kontrolü
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0) continue;
        for (const vent of wall.vents) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const distToVent = Math.hypot(pos.x - ventCenterX, pos.y - ventCenterY);
            if (distToVent < vent.width / 2 + tolerance) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // Mahal ismi/alanı kontrolü
    for (const room of [...rooms].reverse()) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
        if (distToCenter < 30) {
            return { type: 'roomName', object: room };
        }
    }

    // Duvar gövdesi kontrolü
    for (const wall of [...walls].reverse()) {
        const wallPx = wall.thickness || WALL_THICKNESS;
        const bodyHitToleranceSq = (wallPx / 2) ** 2;
        if (distToSegmentSquared(pos, wall.p1, wall.p2) < bodyHitToleranceSq) {
            return { type: "wall", object: wall, handle: "body" };
        }
    }

    // Mahal alanı kontrolü
    for (const room of [...rooms].reverse()) {
        if (!room.polygon || !room.polygon.geometry) continue;
        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                return { type: 'room', object: room };
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

export function getDoorPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const pos = t * wallLen;

    const doorWidth = 90;
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const edgeMargin = (wallThickness / 2) + 5;

    if (pos < doorWidth / 2 + edgeMargin || pos > wallLen - doorWidth / 2 - edgeMargin) {
        return null;
    }

    return { wall: wall, pos: pos, width: doorWidth, type: 'door' };
}

export function isSpaceForDoor(door) {
    const wall = door.wall;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const margin = (wallThickness / 2) + 5;

    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;

    if (doorStart < margin || doorEnd > wallLen - margin) {
        return false;
    }

    const doorsOnWall = state.doors.filter(d => d.wall === wall && d !== door);
    for (const existingDoor of doorsOnWall) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (!(doorEnd + margin <= existingStart || doorStart >= existingEnd + margin)) {
            return false;
        }
    }

    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
        if (!(doorEnd + margin <= windowStart || doorStart >= windowEnd + margin)) {
            return false;
        }
    }

    return true;
}

export function getWindowPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const pos = t * wallLen;

    const windowWidth = 150;
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const margin = (wallThickness / 2) + 5;

    if (pos < windowWidth / 2 + margin || pos > wallLen - windowWidth / 2 - margin) {
        return null;
    }

    return { wall: wall, pos: pos, width: windowWidth };
}

export function isSpaceForWindow(windowData) {
    const wall = windowData.wall;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const margin = (wallThickness / 2) + 5;

    const windowStart = windowData.pos - windowData.width / 2;
    const windowEnd = windowData.pos + windowData.width / 2;

    if (windowStart < margin || windowEnd > wallLen - margin) {
        return false;
    }

    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    for (const door of doorsOnWall) {
        const doorStart = door.pos - door.width / 2;
        const doorEnd = door.pos + door.width / 2;
        if (!(windowEnd + margin <= doorStart || windowStart >= doorEnd + margin)) {
            return false;
        }
    }

    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        if (existingWindow === windowData.object) continue;
        const existingStart = existingWindow.pos - existingWindow.width / 2;
        const existingEnd = existingWindow.pos + existingWindow.width / 2;
        if (!(windowEnd + margin <= existingStart || windowStart >= existingEnd + margin)) {
            return false;
        }
    }

    return true;
}

export function getMinWallLength(wall) {
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const minLength = wallThickness + 10;
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    const windowsOnWall = wall.windows || [];
    const ventsOnWall = wall.vents || [];
    
    let requiredLength = minLength;
    
    doorsOnWall.forEach(door => {
        requiredLength = Math.max(requiredLength, door.width + 2 * ((wallThickness / 2) + 5));
    });
    
    windowsOnWall.forEach(window => {
        requiredLength = Math.max(requiredLength, window.width + 2 * ((wallThickness / 2) + 5));
    });
    
    ventsOnWall.forEach(vent => {
        requiredLength = Math.max(requiredLength, vent.width + 30);
    });
    
    return requiredLength;
}

export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);

    const exploreFrom = (wall) => {
        [wall.p1, wall.p2].forEach(node => {
            state.walls.forEach(w => {
                if (visited.has(w)) return;
                if (w.p1 !== node && w.p2 !== node) return;
                
                const v1 = { x: wall.p2.x - wall.p1.x, y: wall.p2.y - wall.p1.y };
                const v2 = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
                const len1 = Math.hypot(v1.x, v1.y);
                const len2 = Math.hypot(v2.x, v2.y);
                
                if (len1 < 0.1 || len2 < 0.1) return;
                
                v1.x /= len1; v1.y /= len1;
                v2.x /= len2; v2.y /= len2;
                
                const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);
                if (dot > 0.999) {
                    chain.push(w);
                    visited.add(w);
                    exploreFrom(w);
                }
            });
        });
    };

    exploreFrom(startWall);
    return chain;
}