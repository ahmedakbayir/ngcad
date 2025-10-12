import { state } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { WALL_THICKNESS, DRAG_HANDLE_RADIUS } from './main.js';

export function getObjectAtPoint(worldPos) {
    const { walls, doors, rooms, zoom } = state;
    
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
    const doorHitTolerance = 15;
    for (const door of doors) {
        const wall = door.wall;
        if (!wall) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenterX = wall.p1.x + dx * door.pos;
        const doorCenterY = wall.p1.y + dy * door.pos;
        if (Math.hypot(doorCenterX - worldPos.x, doorCenterY - worldPos.y) < doorHitTolerance) {
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

    // Mahal alanlarını kontrol et - DUVAR KALINLIĞININ YARISI KADAR İÇERİYE ÇEKİLMİŞ
    const ROOM_INSET = WALL_THICKNESS / 2;
    
    for (const room of rooms) {
        try {
            if (!room.polygon || !room.polygon.geometry || !room.polygon.geometry.coordinates) continue;
            
            const coords = room.polygon.geometry.coordinates[0];
            if (!coords || coords.length < 3) continue;

            const insetPolygon = insetPolygonCoords(coords, ROOM_INSET);
            
            if (insetPolygon && insetPolygon.length >= 3) {
                if (isPointInPolygon(worldPos, insetPolygon)) {
                    return { type: "room", object: room };
                }
            }
        } catch (e) {
            console.error("Mahal kontrol hatası:", e);
        }
    }

    return null;
}

// Poligonu içeri çeken yardımcı fonksiyon
function insetPolygonCoords(coords, insetAmount) {
    if (!coords || coords.length < 3) return null;
    
    try {
        const insetCoords = [];
        const n = coords.length - 1;
        
        for (let i = 0; i < n; i++) {
            const prev = coords[(i - 1 + n) % n];
            const curr = coords[i];
            const next = coords[(i + 1) % n];
            
            const dx1 = curr[0] - prev[0];
            const dy1 = curr[1] - prev[1];
            const len1 = Math.hypot(dx1, dy1);
            const nx1 = -dy1 / len1;
            const ny1 = dx1 / len1;
            
            const dx2 = next[0] - curr[0];
            const dy2 = next[1] - curr[1];
            const len2 = Math.hypot(dx2, dy2);
            const nx2 = -dy2 / len2;
            const ny2 = dx2 / len2;
            
            const avgNx = (nx1 + nx2) / 2;
            const avgNy = (ny1 + ny2) / 2;
            const avgLen = Math.hypot(avgNx, avgNy);
            
            if (avgLen > 0.001) {
                const normX = avgNx / avgLen;
                const normY = avgNy / avgLen;
                
                insetCoords.push([
                    curr[0] + normX * insetAmount,
                    curr[1] + normY * insetAmount
                ]);
            } else {
                insetCoords.push([curr[0], curr[1]]);
            }
        }
        
        if (insetCoords.length > 0) {
            insetCoords.push([...insetCoords[0]]);
        }
        
        return insetCoords;
    } catch (e) {
        console.error("Poligon inset hatası:", e);
        return null;
    }
}

function isPointInPolygon(point, polygonCoords) {
    let inside = false;
    const x = point.x;
    const y = point.y;
    
    for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
        const xi = polygonCoords[i][0];
        const yi = polygonCoords[i][1];
        const xj = polygonCoords[j][0];
        const yj = polygonCoords[j][1];
        
        const intersect = ((yi > y) !== (yj > y)) && 
                         (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

export function getDoorPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const pos = t * wallLen;

    const doorWidth = 90;
    const minDist = 15;

    if (pos < doorWidth / 2 + minDist || pos > wallLen - doorWidth / 2 - minDist) {
        return null;
    }

    return { wall, pos, width: doorWidth, type: 'door' };
}

export function getDoorPlacementAtNode(wall, node) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return null;

    const isP1 = wall.p1 === node;
    const doorWidth = 90;
    const minDist = 15;
    const pos = isP1 ? doorWidth / 2 + minDist : wallLen - doorWidth / 2 - minDist;

    if (pos < doorWidth / 2 + minDist || pos > wallLen - doorWidth / 2 - minDist) {
        return null;
    }

    return { wall, pos, width: doorWidth, type: 'door' };
}

export function isSpaceForDoor(doorData, atNode = null) {
    const { wall, pos, width } = doorData;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    
    const doorStart = pos - width / 2;
    const doorEnd = pos + width / 2;
    const minDist = 15;

    if (doorStart < minDist || doorEnd > wallLen - minDist) {
        return false;
    }

    for (const existingDoor of state.doors) {
        if (existingDoor.wall !== wall) continue;
        if (doorData.object && existingDoor === doorData.object) continue;

        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;

        if (!(doorEnd < existingStart - minDist || doorStart > existingEnd + minDist)) {
            return false;
        }
    }

    return true;
}

export function getMinWallLength(wall) {
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    if (doorsOnWall.length === 0) return 30;
    
    const totalDoorWidth = doorsOnWall.reduce((sum, d) => sum + d.width, 0);
    const minSpacing = 15;
    return totalDoorWidth + (doorsOnWall.length + 1) * minSpacing;
}

export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);
    
    const checkNode = (node) => {
        const connectedWalls = state.walls.filter(w => 
            !visited.has(w) && (w.p1 === node || w.p2 === node)
        );
        
        for (const wall of connectedWalls) {
            const v1 = { 
                x: startWall.p2.x - startWall.p1.x, 
                y: startWall.p2.y - startWall.p1.y 
            };
            const v2 = { 
                x: wall.p2.x - wall.p1.x, 
                y: wall.p2.y - wall.p1.y 
            };
            
            const cross = Math.abs(v1.x * v2.y - v1.y * v2.x);
            if (cross < 0.1) {
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
