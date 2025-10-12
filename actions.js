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
    // Yay duvarları kontrol et
    for (const arcWall of state.arcWalls || []) {
        // Kontrol noktasını kontrol et
        const distToControl = Math.hypot(arcWall.control.x - worldPos.x, arcWall.control.y - worldPos.y);
        if (distToControl < handleRadius) {
            return { type: "arcWall", object: arcWall, handle: "control" };
        }
        
        // Başlangıç ve bitiş noktalarını kontrol et
        const distToP1 = Math.hypot(arcWall.p1.x - worldPos.x, arcWall.p1.y - worldPos.y);
        if (distToP1 < handleRadius) {
            return { type: "arcWall", object: arcWall, handle: "p1" };
        }
        const distToP2 = Math.hypot(arcWall.p2.x - worldPos.x, arcWall.p2.y - worldPos.y);
        if (distToP2 < handleRadius) {
            return { type: "arcWall", object: arcWall, handle: "p2" };
        }
        
        // Yay gövdesini kontrol et (yaklaşık)
        const distToArc = distanceToQuadraticBezier(worldPos, arcWall.p1, arcWall.control, arcWall.p2);
        if (distToArc < bodyHitTolerance) {
            return { type: "arcWall", object: arcWall, handle: "body" };
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

    // Mahal alanlarını kontrol et - SADECE MAHAL ADI YAKININDA (30cm çap)
    for (const room of rooms) {
        try {
            if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
            
            const centerX = room.center[0];
            const centerY = room.center[1];
            
            // Sadece mahal adının 30cm yakınındaysa tıklamayı kabul et
            const distanceToCenter = Math.hypot(worldPos.x - centerX, worldPos.y - centerY);
            if (distanceToCenter < 30) {
                return { type: "room", object: room };
            }
        } catch (e) {
            console.error("Mahal kontrol hatası:", e);
        }
    }

    return null;
}

// Kapı boyutunu duvara göre hesapla
export function calculateDoorWidth(wallLength) {
    if (wallLength >= 90) {
        return 70; // Standart kapı
    } else if (wallLength >= 30 && wallLength < 90) {
        return wallLength - 10; // Her iki taraftan 5cm boşluk
    } else if (wallLength >= 20 && wallLength < 30) {
        return 20; // Minimum kapı genişliği
    }
    return 0; // Çok kısa duvar, kapı eklenemez
}


export function getDoorPlacement(wall, mousePos) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
<<<<<<< HEAD
    
    // Duvar kalınlığı
    const wallThickness = wall.thickness || 20;
    
    // Her iki uçtan içeri alınacak mesafe: (duvarKalınlığı/2) + 5cm
    const edgeMargin = (wallThickness / 2) + 5;
    
    // Mouse pozisyonu duvar üzerinde
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    let pos = clampedT * wallLen;
    
    // A bölgesinin başlangıç ve bitiş noktaları
    const aStart = edgeMargin;
    const aEnd = wallLen - edgeMargin;
    
    // Mouse A bölgesinde mi kontrol et
    if (pos < aStart || pos > aEnd) {
=======
    if (wallLen < 20) return null; // Minimum 20cm duvar gerekli

    const doorWidth = calculateDoorWidth(wallLen);
    if (doorWidth === 0) return null;

    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const pos = t * wallLen;

    // Duvar boyutuna göre minimum mesafe
    let minMargin;
    if (wallLen >= 90) {
        minMargin = 10; // Her iki taraftan 10cm
    } else if (wallLen >= 30) {
        minMargin = 5; // Her iki taraftan 5cm
    } else {
        // 20-30cm arası: eşit boşluk bırak
        minMargin = (wallLen - doorWidth) / 2;
    }

    if (pos < doorWidth / 2 + minMargin || pos > wallLen - doorWidth / 2 - minMargin) {
>>>>>>> 38a75a2c09b47d0f12bb6fa362307f8d6930d5de
        return null;
    }
    
    // Mevcut kapıları kontrol et ve boş alanları bul
    const existingDoors = state.doors.filter(d => d.wall === wall);
    
    // Boş bölgeleri hesapla
    const occupiedRanges = existingDoors.map(door => ({
        start: door.pos - door.width / 2 - edgeMargin * 2,
        end: door.pos + door.width / 2 + edgeMargin * 2
    }));
    
    // Mouse'un bulunduğu boş bölgeyi bul
    let availableStart = aStart;
    let availableEnd = aEnd;
    
    for (const range of occupiedRanges) {
        if (pos >= range.start && pos <= range.end) {
            // Mouse kapı bölgesinde, kapı eklenemez
            return null;
        }
        
        if (range.end < pos && range.end > availableStart) {
            availableStart = range.end;
        }
        
        if (range.start > pos && range.start < availableEnd) {
            availableEnd = range.start;
        }
    }
    
    // Kullanılabilir alan
    const availableSpace = availableEnd - availableStart;
    
    // Minimum 20cm gerekli
    if (availableSpace < 20) {
        return null;
    }
    
    // Kapı genişliğini hesapla
    let doorWidth;
    if (availableSpace >= 70) {
        doorWidth = 70;
    } else {
        doorWidth = availableSpace;
    }
    
    // Kapının merkezi için sınırlar
    const minCenterPos = availableStart + doorWidth / 2;
    const maxCenterPos = availableEnd - doorWidth / 2;
    
    // Kapı merkezini hesapla
    let centerPos = pos;
    if (centerPos < minCenterPos) {
        centerPos = minCenterPos;
    }
    if (centerPos > maxCenterPos) {
        centerPos = maxCenterPos;
    }
    
    return { wall, pos: centerPos, width: doorWidth, type: 'door' };
}

// KÖŞE KAPI EKLEME İPTAL - Bu fonksiyon artık null döner
export function getDoorPlacementAtNode(wall, node) {
    return null; // KÖŞEYE KAPI EKLENMESİN
}

export function isSpaceForDoor(doorData, atNode = null) {
    const { wall, pos, width } = doorData;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    
    const doorStart = pos - width / 2;
    const doorEnd = pos + width / 2;
    
<<<<<<< HEAD
    // Duvar kalınlığı
    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;
    
    // Duvar sınırları kontrolü
    if (doorStart < edgeMargin || doorEnd > wallLen - edgeMargin) {
        return false;
    }
    
=======
    // Duvar boyutlarına göre minimum mesafe
    let minDist;
    if (wallLen >= 90) {
        minDist = 10;
    } else if (wallLen >= 30) {
        minDist = 5;
    } else if (wallLen >= 20) {
        // 20-30cm arası: eşit boşluk
        minDist = (wallLen - width) / 2;
    } else {
        return false;
    }

    if (doorStart < minDist || doorEnd > wallLen - minDist) {
        return false;
    }

>>>>>>> 38a75a2c09b47d0f12bb6fa362307f8d6930d5de
    // Diğer kapılarla çakışma kontrolü
    for (const existingDoor of state.doors) {
        if (existingDoor.wall !== wall) continue;
        if (doorData.object && existingDoor === doorData.object) continue;

        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;

        // Kapılar iç içe GİREMEZ ama yanyana olabilir
        // Aralarında en az edgeMargin*2 mesafe olmalı (her kapının kenarı için edgeMargin)
        const minGap = edgeMargin * 2;
        
        if (!(doorEnd + minGap <= existingStart || doorStart >= existingEnd + minGap)) {
            return false;
        }
    }

    return true;
}

// Duvar üzerindeki kapıların toplam genişliğini hesapla
export function getTotalDoorWidth(wall) {
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
<<<<<<< HEAD
    if (doorsOnWall.length === 0) return 20; // Minimum 20cm
    
    const wallThickness = wall.thickness || 20;
    const edgeMargin = (wallThickness / 2) + 5;
    
    const totalDoorWidth = doorsOnWall.reduce((sum, door) => sum + door.width, 0);
    
    // Toplam kapı genişliği + her iki uçtan edgeMargin
    const minLength = totalDoorWidth + (2 * edgeMargin);
    
    return minLength;
}
=======
    return doorsOnWall.reduce((sum, door) => sum + door.width, 0);
}

// Duvarın minimum uzunluğunu hesapla (kapılar + boşluklar)
export function getMinWallLength(wall) {
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    if (doorsOnWall.length === 0) return 20; // Minimum 20cm
    
    const totalDoorWidth = getTotalDoorWidth(wall);
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    
    // Duvar boyutuna göre minimum boşluk
    let minSpacingPerDoor;
    if (wallLen >= 90) {
        minSpacingPerDoor = 20; // Her kapı için 20cm (her iki taraftan 10)
    } else if (wallLen >= 30) {
        minSpacingPerDoor = 10; // Her kapı için 10cm (her iki taraftan 5)
    } else {
        minSpacingPerDoor = 10; // 20-30cm arası minimum
    }
    
    return totalDoorWidth + (doorsOnWall.length * minSpacingPerDoor);
}
// Bezier eğrisine olan mesafeyi hesapla
function distanceToQuadraticBezier(point, p0, p1, p2) {
    let minDist = Infinity;
    const steps = 20;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
        const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
        const dist = Math.hypot(point.x - x, point.y - y);
        minDist = Math.min(minDist, dist);
    }
    
    return minDist;
}
>>>>>>> 38a75a2c09b47d0f12bb6fa362307f8d6930d5de
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