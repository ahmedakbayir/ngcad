import { state, dom } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { WALL_THICKNESS, DRAG_HANDLE_RADIUS } from './main.js';

export function getObjectAtPoint(worldPos) {
    const { walls, doors, rooms, zoom, dimensionOptions } = state;
    
    // Düğüm noktalarını kontrol et (en yüksek öncelik)
    const handleRadius = DRAG_HANDLE_RADIUS / zoom;
    for (const wall of walls) {
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
        if (!wall) continue;

        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;

        const clickableWidth = door.width * 0.8;
        const clickableStart = door.pos - clickableWidth / 2;
        const clickableEnd = door.pos + clickableWidth / 2;

        const p1 = { x: wall.p1.x + dx * clickableStart, y: wall.p1.y + dy * clickableStart };
        const p2 = { x: wall.p1.x + dx * clickableEnd, y: wall.p1.y + dy * clickableEnd };

        const distSq = distToSegmentSquared(worldPos, p1, p2);
        
        if (distSq < (WALL_THICKNESS / 2) ** 2) {
            return { type: "door", object: door };
        }
    }

    // Pencereleri kontrol et
    const windowHitTolerance = 15;
    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        
        for (const window of wall.windows) {
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
            if (Math.hypot(windowCenterX - worldPos.x, windowCenterY - worldPos.y) < windowHitTolerance) {
                return { type: "window", object: window, wall: wall };
            }
        }
    }

    // Menfezleri kontrol et
    const ventHitTolerance = 10;
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        
        for (const vent of wall.vents) {
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            if (Math.hypot(ventCenterX - worldPos.x, ventCenterY - worldPos.y) < ventHitTolerance) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // Duvar gövdelerini kontrol et
    const bodyHitTolerance = WALL_THICKNESS / 2;
    for (const wall of [...walls].reverse()) {
        const distSq = distToSegmentSquared(worldPos, wall.p1, wall.p2);
        if (distSq < bodyHitTolerance ** 2) {
            return { type: "wall", object: wall, handle: "body" };
        }
    }

    // Mahal adlarını ve alan bilgilerini kontrol et
    const { ctx2d } = dom;
    const hitPadding = 10 / zoom; // Tıklama alanını genişletmek için padding
    for (const room of rooms) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        
        const baseNameFontSize = 18;
        const baseAreaFontSize = 14;
        const showArea = dimensionOptions.defaultView > 0;
        
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
            nameHeight = nameFontSize;
        }
        
        const baseNameYOffset = showArea ? 10 : 0;
        const nameYOffset = baseNameYOffset / zoom;
        
        const baseTextOffset = nameParts.length === 2 ? nameFontSize * 0.6 : 0;

        const nameLeft = room.center[0] - nameWidth / 2 - hitPadding;
        const nameRight = room.center[0] + nameWidth / 2 + hitPadding;
        const nameTop = room.center[1] - nameYOffset - nameHeight + baseTextOffset - hitPadding;
        const nameBottom = room.center[1] - nameYOffset + baseTextOffset + hitPadding;

        if (worldPos.x >= nameLeft && worldPos.x <= nameRight && worldPos.y >= nameTop && worldPos.y <= nameBottom) {
            return { type: "roomName", object: room };
        }
        
        if (showArea) {
            ctx2d.font = `400 ${Math.max(2 / zoom, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            const areaText = `${room.area.toFixed(2)} m²`;
            const areaMetrics = ctx2d.measureText(areaText);
            const areaWidth = areaMetrics.width;
            const areaHeight = areaFontSize;
                        
            let areaTop, areaBottom;
            const areaYOffset = nameParts.length === 2 ? nameFontSize * 1.5 : nameFontSize * 1.1;
            areaTop = room.center[1] - nameYOffset + areaYOffset - areaHeight / 2 - hitPadding;
            areaBottom = areaTop + areaHeight + (hitPadding * 2);
            
            const areaLeft = room.center[0] - areaWidth / 2 - hitPadding;
            const areaRight = room.center[0] + areaWidth / 2 + hitPadding;
            
            if (worldPos.x >= areaLeft && worldPos.x <= areaRight && worldPos.y >= areaTop && worldPos.y <= areaBottom) {
                return { type: "roomArea", object: room };
            }
        }
    }

    // Mahal alanlarını kontrol et
    for (const room of rooms) {
        try {
            if (turf.booleanPointInPolygon([worldPos.x, worldPos.y], room.polygon)) {
                 return { type: "room", object: room };
            }
        } catch (e) {
            console.error("Mahal kontrol hatası:", e);
        }
    }

    return null;
}

export function getDoorPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    
    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;
    
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    let pos = clampedT * wallLen;
    
    const aStart = edgeMargin;
    const aEnd = wallLen - edgeMargin;
    
    if (pos < aStart || pos > aEnd) {
        return null;
    }
    
    const existingDoors = state.doors.filter(d => d.wall === wall);
    
    const occupiedRanges = existingDoors.map(door => ({
        start: door.pos - door.width / 2 - edgeMargin * 2,
        end: door.pos + door.width / 2 + edgeMargin * 2
    }));
    
    let availableStart = aStart;
    let availableEnd = aEnd;
    
    for (const range of occupiedRanges) {
        if (pos >= range.start && pos <= range.end) {
            return null;
        }
        
        if (range.end < pos && range.end > availableStart) {
            availableStart = range.end;
        }
        
        if (range.start > pos && range.start < availableEnd) {
            availableEnd = range.start;
        }
    }
    
    const availableSpace = availableEnd - availableStart;
    
    if (availableSpace < 20) {
        return null;
    }
    
    let doorWidth;
    if (availableSpace >= 70) {
        doorWidth = 70;
    } else {
        doorWidth = availableSpace;
    }
    
    const minCenterPos = availableStart + doorWidth / 2;
    const maxCenterPos = availableEnd - doorWidth / 2;
    
    let centerPos = pos;
    if (centerPos < minCenterPos) {
        centerPos = minCenterPos;
    }
    if (centerPos > maxCenterPos) {
        centerPos = maxCenterPos;
    }
    
    return { wall, pos: centerPos, width: doorWidth, type: 'door' };
}

export function isSpaceForDoor(doorData, atNode = null) {
    const { wall, pos, width } = doorData;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    
    const doorStart = pos - width / 2;
    const doorEnd = pos + width / 2;
    
    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;
    
    if (doorStart < edgeMargin || doorEnd > wallLen - edgeMargin) {
        return false;
    }
    
    for (const existingDoor of state.doors) {
        if (existingDoor.wall !== wall) continue;
        if (doorData.object && existingDoor === doorData.object) continue;

        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;

        const minGap = edgeMargin * 2;
        
        if (!(doorEnd + minGap <= existingStart || doorStart >= existingEnd + minGap)) {
            return false;
        }
    }

    return true;
}

export function getMinWallLength(wall) {
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    if (doorsOnWall.length === 0) return 20;
    
    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;
    
    const totalDoorWidth = doorsOnWall.reduce((sum, door) => sum + door.width, 0);
    
    const minLength = totalDoorWidth + (2 * edgeMargin);
    
    return minLength;
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
            const COLLINEAR_THRESHOLD = Math.cos(5 * Math.PI / 180);
            
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