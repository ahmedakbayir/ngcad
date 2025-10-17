import { state, dom } from './main.js';
import { screenToWorld } from './geometry.js';

export function drawDimension(p1, p2, isPreview = false, mode = 'single') {
    const { ctx2d } = dom;
    const { zoom, gridOptions, dimensionOptions, walls } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    const roundedLength = Math.round(lengthCm / gridSpacing) * gridSpacing;
    const displayText = `${Math.round(roundedLength)}`;

    // Duvarı bul (p1 ve p2'ye sahip duvar)
    const wall = walls.find(w => 
        (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1)
    );
    const wallThickness = wall?.thickness || 20;

    // Normal vektör hesapla
    const nx = -dy / lengthCm;
    const ny = dx / lengthCm;

    // Özet görünümle aynı mantık: Sol ve üst için yakın, sağ ve alt için uzak
    let actualOffset;
    if (nx < 0 || ny < 0) {
        // Sol veya üst - yakın
        actualOffset = wallThickness / 2 + 5; 
    } else {
        // Sağ veya alt - uzak
        actualOffset = wallThickness / 2 + 18;
    }

    // Metin pozisyonu
    const midX = (p1.x + p2.x) / 2 + nx * actualOffset;
    const midY = (p1.y + p2.y) / 2 + ny * actualOffset;
    
    let ang = Math.atan2(dy, dx);
    const epsilon = 0.001;

    if (Math.abs(dx) < epsilon) {
        ang = -Math.PI / 2;
    } else if (Math.abs(ang) > Math.PI / 2) {
        ang += Math.PI;
    }

    ctx2d.save();
    ctx2d.translate(midX, midY);
    ctx2d.rotate(ang);

    const baseFontSize = dimensionOptions.fontSize;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;

    ctx2d.font = `300 ${Math.max(5 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    
    ctx2d.fillStyle = isPreview ? "#8ab4f8" : dimensionOptions.color;
    
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText(displayText, 0, 0);
    ctx2d.restore();
}

export function drawTotalDimensions() {
    const { ctx2d } = dom;
    const { zoom, rooms, walls, gridOptions, dimensionOptions } = state;
    
    if (rooms.length === 0) return;
    
    const baseFontSize = dimensionOptions.fontSize;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
    ctx2d.fillStyle = dimensionOptions.color;
    ctx2d.font = `300 ${Math.max(5 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    
    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    
    const allWallDimensions = [];
    
    rooms.forEach(room => {
        if (!room.polygon || !room.polygon.geometry) return;
        
        const coords = room.polygon.geometry.coordinates[0];
        if (coords.length < 4) return;
        
        const roomWalls = [];
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i];
            const p2Coord = coords[i + 1];
            
            const wall = walls.find(w => {
                const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) +
                             Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) +
                             Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                return Math.min(dist1, dist2) < 1;
            });
            
            if (wall) {
                roomWalls.push({
                    wall: wall,
                    p1: p1Coord,
                    p2: p2Coord,
                    room: room
                });
            }
        }
        
        const horizontalGroups = [];
        const verticalGroups = [];
        
        roomWalls.forEach(rw => {
            const dx = rw.p2[0] - rw.p1[0];
            const dy = rw.p2[1] - rw.p1[1];
            const isHorizontal = Math.abs(dy) < Math.abs(dx);
            
            if (isHorizontal) {
                let group = horizontalGroups.find(g => Math.abs(g.y - rw.p1[1]) < 1);
                if (!group) {
                    group = { y: rw.p1[1], segments: [], room: rw.room };
                    horizontalGroups.push(group);
                }
                group.segments.push(rw);
            } else {
                let group = verticalGroups.find(g => Math.abs(g.x - rw.p1[0]) < 1);
                if (!group) {
                    group = { x: rw.p1[0], segments: [], room: rw.room };
                    verticalGroups.push(group);
                }
                group.segments.push(rw);
            }
        });
        
        horizontalGroups.forEach(group => {
            const minX = Math.min(...group.segments.map(s => Math.min(s.p1[0], s.p2[0])));
            const maxX = Math.max(...group.segments.map(s => Math.max(s.p1[0], s.p2[0])));
            const totalLength = maxX - minX;
            const roundedLength = Math.round(totalLength / gridSpacing) * gridSpacing;
            
            allWallDimensions.push({
                type: 'horizontal',
                y: group.y,
                minX: minX,
                maxX: maxX,
                length: roundedLength,
                segments: group.segments.length,
                room: group.room
            });
        });
        
        verticalGroups.forEach(group => {
            const minY = Math.min(...group.segments.map(s => Math.min(s.p1[1], s.p2[1])));
            const maxY = Math.max(...group.segments.map(s => Math.max(s.p1[1], s.p2[1])));
            const totalLength = maxY - minY;
            const roundedLength = Math.round(totalLength / gridSpacing) * gridSpacing;
            
            allWallDimensions.push({
                type: 'vertical',
                x: group.x,
                minY: minY,
                maxY: maxY,
                length: roundedLength,
                segments: group.segments.length,
                room: group.room
            });
        });
    });
    
    const horizontalDimGroups = new Map();
    allWallDimensions.filter(d => d.type === 'horizontal').forEach(dim => {
        const key = `${Math.round(dim.minX)}_${Math.round(dim.maxX)}_${dim.length}`;
        if (!horizontalDimGroups.has(key)) {
            horizontalDimGroups.set(key, []);
        }
        horizontalDimGroups.get(key).push(dim);
    });
    
    horizontalDimGroups.forEach(group => {
        const minSegments = Math.min(...group.map(d => d.segments));
        const leastSegmented = group.filter(d => d.segments === minSegments);
        
        const best = leastSegmented.reduce((top, d) => d.y < top.y ? d : top);
        
        const midX = (best.minX + best.maxX) / 2;
        
        // Duvar kalınlığına göre dinamik offset
        const wallThickness = group[0]?.segments?.[0]?.wall?.thickness || 20;
        const offsetTop =  -1.5*wallThickness ;  // Üst için: duvar merkezinden 10 cm
        const offsetBottom = wallThickness;// wallThickness / 2 + 18; // Alt için: duvar merkezinden 18 cm

        const testY1 = best.y - offsetTop;    // Üst tarafa (yakın)
        const testY2 = best.y + offsetBottom; // Alt tarafa (uzak)

        const testPoint1 = turf.point([midX, testY1]);
        const testPoint2 = turf.point([midX, testY2]);

        let finalY = null;
        try {
            const isInside1 = turf.booleanPointInPolygon(testPoint1, best.room.polygon);
            const isInside2 = turf.booleanPointInPolygon(testPoint2, best.room.polygon);
            
            // Dışarıda olanı tercih et, yoksa içeride olanı kullan
            if (!isInside1) {
                finalY = testY1;
            } else if (!isInside2) {
                finalY = testY2;
            } else if (isInside1) {
                finalY = testY1; // İkisi de içerdeyse üsttekini kullan
            } else if (isInside2) {
                finalY = testY2; // İkisi de içerdeyse alttakini kullan
            }
        } catch (e) {
            finalY = testY1;
        }
        
        if (finalY) {
            ctx2d.fillStyle = dimensionOptions.color;
            ctx2d.fillText(Math.round(best.length).toString(), midX, finalY);
        }
    });
    
    const verticalDimGroups = new Map();
    allWallDimensions.filter(d => d.type === 'vertical').forEach(dim => {
        const key = `${Math.round(dim.minY)}_${Math.round(dim.maxY)}_${dim.length}`;
        if (!verticalDimGroups.has(key)) {
            verticalDimGroups.set(key, []);
        }
        verticalDimGroups.get(key).push(dim);
    });
    
    verticalDimGroups.forEach(group => {
        const minSegments = Math.min(...group.map(d => d.segments));
        const leastSegmented = group.filter(d => d.segments === minSegments);
        
        const best = leastSegmented.reduce((left, d) => d.x < left.x ? d : left);
        
        const midY = (best.minY + best.maxY) / 2;
        
        // Duvar kalınlığına göre dinamik offset
        const wallThickness = group[0]?.segments?.[0]?.wall?.thickness || 20;
        const offsetLeft = -1.5*wallThickness;  // Sol için: duvar merkezinden 10 cm
        const offsetRight = wallThickness;//wallThickness / 2 + 18; // Sağ için: duvar merkezinden 18 cm

        const testX1 = best.x - offsetLeft;   // Sol tarafa (yakın)
        const testX2 = best.x + offsetRight;  // Sağ tarafa (uzak)

        const testPoint1 = turf.point([testX1, midY]);
        const testPoint2 = turf.point([testX2, midY]);

        let finalX = null;
        try {
            const isInside1 = turf.booleanPointInPolygon(testPoint1, best.room.polygon);
            const isInside2 = turf.booleanPointInPolygon(testPoint2, best.room.polygon);
            
            // Dışarıda olanı tercih et, yoksa içeride olanı kullan
            if (!isInside1) {
                finalX = testX1;
            } else if (!isInside2) {
                finalX = testX2;
            } else if (isInside1) {
                finalX = testX1; // İkisi de içerdeyse soldakini kullan
            } else if (isInside2) {
                finalX = testX2; // İkisi de içerdeyse sağdakini kullan
            }
        } catch (e) {
            finalX = testX1;
        }
        
        if (finalX) {
            ctx2d.fillStyle = dimensionOptions.color;
            ctx2d.save();
            ctx2d.translate(finalX, midY);
            ctx2d.rotate(-Math.PI / 2);
            ctx2d.fillText(Math.round(best.length).toString(), 0, 0);
            ctx2d.restore();
        }
    });
}

export function drawOuterDimensions() {
    const { ctx2d } = dom;
    const { zoom, walls, gridOptions, dimensionOptions, dimensionMode } = state;

    const showOuterOption = dimensionOptions.showOuter;
    const showOuter = (showOuterOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) || 
                      (showOuterOption === 2 && dimensionMode === 1) ||
                      (showOuterOption === 3 && dimensionMode === 2);

    if (showOuter && walls.length > 0) {
        const allX = walls.flatMap(w => [w.p1.x, w.p2.x]);
        const allY = walls.flatMap(w => [w.p1.y, w.p2.y]);
        
        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);
        const minY = Math.min(...allY);
        const maxY = Math.max(...allY);
        
        const totalWidth = maxX - minX;
        const totalHeight = maxY - minY;
        
        const dimLineOffset = 60 / zoom;
        const extensionOvershoot = 8 / zoom;
        const extensionLineLength = dimLineOffset + extensionOvershoot;
        
        ctx2d.strokeStyle = dimensionOptions.color;
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.lineWidth = 1 / zoom;
        
        const baseFontSize = dimensionOptions.fontSize;
        const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
        const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;

        const topDimY = minY - dimLineOffset;
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, minY);
        ctx2d.lineTo(minX, minY - extensionLineLength);
        ctx2d.moveTo(maxX, minY);
        ctx2d.lineTo(maxX, minY - extensionLineLength);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, topDimY);
        ctx2d.lineTo(maxX, topDimY);
        ctx2d.stroke();
        
        const arrowSize = 4 / zoom;
        ctx2d.beginPath();
        ctx2d.moveTo(minX, topDimY);
        ctx2d.lineTo(minX + arrowSize, topDimY - arrowSize/2);
        ctx2d.lineTo(minX + arrowSize, topDimY + arrowSize/2);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.beginPath();
        ctx2d.moveTo(maxX, topDimY);
        ctx2d.lineTo(maxX - arrowSize, topDimY - arrowSize/2);
        ctx2d.lineTo(maxX - arrowSize, topDimY + arrowSize/2);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.font = `300 ${Math.max(5 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        
        const roundedWidth = Math.round(totalWidth / gridSpacing) * gridSpacing;
        ctx2d.fillText(Math.round(roundedWidth).toString(), (minX + maxX) / 2, topDimY - 5 / zoom);
        
        const leftDimX = minX - dimLineOffset;
        
        ctx2d.strokeStyle = dimensionOptions.color;
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.lineWidth = 1 / zoom;
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, minY);
        ctx2d.lineTo(minX - extensionLineLength, minY);
        ctx2d.moveTo(minX, maxY);
        ctx2d.lineTo(minX - extensionLineLength, maxY);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, minY);
        ctx2d.lineTo(leftDimX, maxY);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, minY);
        ctx2d.lineTo(leftDimX - arrowSize/2, minY + arrowSize);
        ctx2d.lineTo(leftDimX + arrowSize/2, minY + arrowSize);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, maxY);
        ctx2d.lineTo(leftDimX - arrowSize/2, maxY - arrowSize);
        ctx2d.lineTo(leftDimX + arrowSize/2, maxY - arrowSize);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.fillStyle = dimensionOptions.color;
        const roundedHeight = Math.round(totalHeight / gridSpacing) * gridSpacing;
        ctx2d.save();
        ctx2d.translate(leftDimX - 5, (minY + maxY) / 2);
        ctx2d.rotate(-Math.PI / 2);
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        ctx2d.fillText(Math.round(roundedHeight).toString(), 0, 0);
        ctx2d.restore();
    }
}