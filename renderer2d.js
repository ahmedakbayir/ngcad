import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';
// GLOBAL ÖLÇÜ RENKLERİ - Tüm ölçü fonksiyonlarında kullanılır
export const DIMENSION_TEXT_COLOR = "rgba(255, 235, 168, 1)";      // Ölçü yazı rengi (yeşil)
export const DIMENSION_LINE_COLOR = "rgba(100, 150, 200, 0.6)"; // Dış çerçeve çizgi rengi (mavi)

export function drawAngleSymbol(node) {
    const { ctx2d } = dom;
    const { walls, zoom } = state;

    const connectedWalls = walls.filter(w => w.p1 === node || w.p2 === node);

    if (connectedWalls.length < 2) return;

    if (connectedWalls.length === 2) {
        const wall1 = connectedWalls[0];
        const wall2 = connectedWalls[1];

        const v1 = wall1.p1 === node ? { x: wall1.p2.x - node.x, y: wall1.p2.y - node.y } : { x: wall1.p1.x - node.x, y: wall1.p1.y - node.y };
        const v2 = wall2.p1 === node ? { x: wall2.p2.x - node.x, y: wall2.p2.y - node.y } : { x: wall2.p1.x - node.x, y: wall2.p1.y - node.y };

        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        if (len1 < 1 || len2 < 1) return;

        const v1n = { x: v1.x / len1, y: v1.y / len1 };
        const v2n = { x: v2.x / len2, y: v2.y / len2 };

        const dotProduct = v1n.x * v2n.x + v1n.y * v2n.y;
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct)));
        
        const angleDeg = angleRad * 180 / Math.PI;

        const radius = 25;
        ctx2d.strokeStyle = "#8ab4f8";
        ctx2d.fillStyle = "#8ab4f8";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();

        if (Math.abs(angleDeg - 90) < 0.5) {
            const p1 = { x: node.x + v1n.x * radius, y: node.y + v1n.y * radius };
            const p2 = { x: node.x + v2n.x * radius, y: node.y + v2n.y * radius };
            const p3 = { x: p1.x + v2n.x * radius, y: p1.y + v2n.y * radius };
            ctx2d.moveTo(p1.x, p1.y);
            ctx2d.lineTo(p3.x, p3.y);
            ctx2d.lineTo(p2.x, p2.y);
        } else {
            const angle1 = Math.atan2(v1.y, v1.x);
            const angle2 = Math.atan2(v2.y, v2.x);
            const crossProduct = v1.x * v2.y - v1.y * v2.x;
            if (crossProduct > 0) {
                ctx2d.arc(node.x, node.y, radius, angle1, angle2);
            } else {
                ctx2d.arc(node.x, node.y, radius, angle2, angle1);
            }
        }
        ctx2d.stroke();

        const angleBisector = { x: v1n.x + v2n.x, y: v1n.y + v2n.y };
        const lenBisector = Math.hypot(angleBisector.x, angleBisector.y);
        if (lenBisector > 0.1) {
            const textRadius = radius + 15;
            const textX = node.x + (angleBisector.x / lenBisector) * textRadius;
            const textY = node.y + (angleBisector.y / lenBisector) * textRadius;
            
            const baseFontSize = 12;
            const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
            ctx2d.font = `${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            ctx2d.textAlign = "center";
            ctx2d.textBaseline = "middle";
            ctx2d.fillText(`${angleDeg.toFixed(0)}°`, textX, textY);
        }
    }
}

export function drawNodeWallCount(node) {
    const { ctx2d } = dom;
    const { walls, zoom } = state;

    const connectedWalls = walls.filter(w => w.p1 === node || w.p2 === node);
    const wallCount = connectedWalls.length;

    if (wallCount <= 1) return;
const offset = 15;
    const textX = node.x + offset;
    const textY = node.y - offset;

    const baseFontSize = 16;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;

    ctx2d.save();
    ctx2d.restore();
}

export function drawDimension(p1, p2, isPreview = false, mode = 'single') {
    const { ctx2d } = dom;
    const { zoom, gridOptions } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    const roundedLength = Math.round(lengthCm / gridSpacing) * gridSpacing;
    const displayText = `${Math.round(roundedLength)}`;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
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

    const baseFontSize = 18;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
    const yOffset = -8 / zoom;

    ctx2d.font = `500 ${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    
    // GLOBAL RENK DEĞİŞKENİNİ KULLAN
    ctx2d.fillStyle = isPreview ? "#8ab4f8" : DIMENSION_TEXT_COLOR;
    
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.fillText(displayText, 0, yOffset);
    ctx2d.restore();
}

export function drawTotalDimensions() {
    const { ctx2d } = dom;
    const { zoom, rooms, walls, gridOptions } = state;
    
    if (rooms.length === 0) return;
    
    // Standart ölçü formatı
    const baseFontSize = 18;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
    ctx2d.fillStyle = DIMENSION_TEXT_COLOR;
    ctx2d.font = `500 ${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    
    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    
    // TÜM DUVAR GÖSTERİMLERİNİ TOPLA
    const allWallDimensions = [];
    
    rooms.forEach(room => {
        if (!room.polygon || !room.polygon.geometry) return;
        
        const coords = room.polygon.geometry.coordinates[0];
        if (coords.length < 4) return;
        
        // Mahal duvarlarını bul
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
        
        // Duvarları yöne göre grupla
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
        
        // YATAY GRUPLAR
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
        
        // DİKEY GRUPLAR
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
    
    // YATAY DUVARLARI GRUPLA: Aynı X aralığı ve uzunlukta olanlar
    const horizontalDimGroups = new Map();
    allWallDimensions.filter(d => d.type === 'horizontal').forEach(dim => {
        const key = `${Math.round(dim.minX)}_${Math.round(dim.maxX)}_${dim.length}`;
        if (!horizontalDimGroups.has(key)) {
            horizontalDimGroups.set(key, []);
        }
        horizontalDimGroups.get(key).push(dim);
    });
    
    // Her gruptan EN ÜSTTEKİ ve EN AZ BÖLÜNENİ seç
    horizontalDimGroups.forEach(group => {
        // Önce en az bölüneni bul
        const minSegments = Math.min(...group.map(d => d.segments));
        const leastSegmented = group.filter(d => d.segments === minSegments);
        
        // Bunlardan en üsttekini seç (en küçük Y)
        const best = leastSegmented.reduce((top, d) => d.y < top.y ? d : top);
        
        const midX = (best.minX + best.maxX) / 2;
        
        // Mahalin içinde konumlandır
        let finalY = null;
        const testOffsets = [30, 35, 40, 45, 50, 55, 60];
        
        for (const offset of testOffsets) {
            const testY1 = best.y + offset;
            const testY2 = best.y - offset;
            
            const testPoint1 = turf.point([midX, testY1]);
            const testPoint2 = turf.point([midX, testY2]);
            
            try {
                const isInside1 = turf.booleanPointInPolygon(testPoint1, best.room.polygon);
                const isInside2 = turf.booleanPointInPolygon(testPoint2, best.room.polygon);
                
                if (isInside1) {
                    finalY = testY1;
                    break;
                } else if (isInside2) {
                    finalY = testY2;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (finalY) {
            ctx2d.fillStyle = DIMENSION_TEXT_COLOR;
            ctx2d.fillText(Math.round(best.length).toString(), midX, finalY);
        }
    });
    
    // DİKEY DUVARLARI GRUPLA: Aynı Y aralığı ve uzunlukta olanlar
    const verticalDimGroups = new Map();
    allWallDimensions.filter(d => d.type === 'vertical').forEach(dim => {
        const key = `${Math.round(dim.minY)}_${Math.round(dim.maxY)}_${dim.length}`;
        if (!verticalDimGroups.has(key)) {
            verticalDimGroups.set(key, []);
        }
        verticalDimGroups.get(key).push(dim);
    });
    
    // Her gruptan EN SOLDAKİ ve EN AZ BÖLÜNENİ seç
    verticalDimGroups.forEach(group => {
        // Önce en az bölüneni bul
        const minSegments = Math.min(...group.map(d => d.segments));
        const leastSegmented = group.filter(d => d.segments === minSegments);
        
        // Bunlardan en soldakini seç (en küçük X)
        const best = leastSegmented.reduce((left, d) => d.x < left.x ? d : left);
        
        const midY = (best.minY + best.maxY) / 2;
        
        // Mahalin içinde konumlandır
        let finalX = null;
        const testOffsets = [30, 35, 40, 45, 50, 55, 60];
        
        for (const offset of testOffsets) {
            const testX1 = best.x + offset;
            const testX2 = best.x - offset;
            
            const testPoint1 = turf.point([testX1, midY]);
            const testPoint2 = turf.point([testX2, midY]);
            
            try {
                const isInside1 = turf.booleanPointInPolygon(testPoint1, best.room.polygon);
                const isInside2 = turf.booleanPointInPolygon(testPoint2, best.room.polygon);
                
                if (isInside1) {
                    finalX = testX1;
                    break;
                } else if (isInside2) {
                    finalX = testX2;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (finalX) {
            ctx2d.fillStyle = DIMENSION_TEXT_COLOR;
            ctx2d.save();
            ctx2d.translate(finalX, midY);
            ctx2d.rotate(-Math.PI / 2);
            ctx2d.fillText(Math.round(best.length).toString(), 0, 0);
            ctx2d.restore();
        }
    });
    
    // DIŞ ÇERÇEVE İÇİN TOPLAM ÖLÇÜLER
    if (walls.length > 0) {
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
        
        ctx2d.strokeStyle = DIMENSION_LINE_COLOR;
        ctx2d.fillStyle = DIMENSION_LINE_COLOR;
        ctx2d.lineWidth = 1 / zoom;
        
        // ÜST YATAY ÖLÇÜ
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
        
        ctx2d.fillStyle = DIMENSION_TEXT_COLOR;
        ctx2d.font = `500 ${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        
        const roundedWidth = Math.round(totalWidth / gridSpacing) * gridSpacing;
        ctx2d.fillText(Math.round(roundedWidth).toString(), (minX + maxX) / 2, topDimY - 5 / zoom);
        
        // SOL DİKEY ÖLÇÜ
        const leftDimX = minX - dimLineOffset;
        
        ctx2d.strokeStyle = DIMENSION_LINE_COLOR;
        ctx2d.fillStyle = DIMENSION_LINE_COLOR;
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
        
        ctx2d.fillStyle = DIMENSION_TEXT_COLOR;
        const roundedHeight = Math.round(totalHeight / gridSpacing) * gridSpacing;
        ctx2d.save();
        ctx2d.translate(leftDimX - 5 / zoom, (minY + maxY) / 2);
        ctx2d.rotate(-Math.PI / 2);
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        ctx2d.fillText(Math.round(roundedHeight).toString(), 0, 0);
        ctx2d.restore();
    }
}

export function drawDoorSymbol(door, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { wallBorderColor, lineThickness } = state;
    
    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;
    
    const dx = (wall.p2.x - wall.p1.x) / wallLen, dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    const startPos = door.pos - door.width / 2, endPos = door.pos + door.width / 2;
    const doorP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const doorP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;
    let color = isPreview || isSelected ? "#8ab4f8" : wallBorderColor;
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 1.5;
    
    const jamb1_start = { x: doorP1.x - nx * halfWall, y: doorP1.y - ny * halfWall };
    const jamb1_end = { x: doorP1.x + nx * halfWall, y: doorP1.y + ny * halfWall };
    const jamb2_start = { x: doorP2.x - nx * halfWall, y: doorP2.y - ny * halfWall };
    const jamb2_end = { x: doorP2.x + nx * halfWall, y: doorP2.y + ny * halfWall };

    ctx2d.beginPath();
    ctx2d.moveTo(jamb1_start.x, jamb1_start.y); ctx2d.lineTo(jamb1_end.x, jamb1_end.y);
    ctx2d.moveTo(jamb2_start.x, jamb2_start.y); ctx2d.lineTo(jamb2_end.x, jamb2_end.y);
    ctx2d.stroke();

    const insetRatio = 1 / 3;
    const jamb_vec_x = jamb1_end.x - jamb1_start.x, jamb_vec_y = jamb1_end.y - jamb1_start.y;
    const p_line1_start = { x: jamb1_start.x + jamb_vec_x * insetRatio, y: jamb1_start.y + jamb_vec_y * insetRatio };
    const p_line1_end = { x: jamb2_start.x + jamb_vec_x * insetRatio, y: jamb2_start.y + jamb_vec_y * insetRatio };
    const p_line2_start = { x: jamb1_start.x + jamb_vec_x * (1 - insetRatio), y: jamb1_start.y + jamb_vec_y * (1 - insetRatio) };
    const p_line2_end = { x: jamb2_start.x + jamb_vec_x * (1 - insetRatio), y: jamb2_start.y + jamb_vec_y * (1 - insetRatio) };
    
    ctx2d.beginPath();
    ctx2d.moveTo(p_line1_start.x, p_line1_start.y); ctx2d.lineTo(p_line1_end.x, p_line1_end.y);
    ctx2d.moveTo(p_line2_start.x, p_line2_start.y); ctx2d.lineTo(p_line2_end.x, p_line2_end.y);
    ctx2d.stroke();
}

export function drawGrid() {
    const { ctx2d, c2d } = dom;
    const { zoom, gridOptions } = state;
    
    if (!gridOptions.visible) return;
    
    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
    const { x: worldRight, y: worldBottom } = screenToWorld(c2d.width, c2d.height);
    
    const baseSpacing = gridOptions.spacing;
    const MIN_PIXEL_SPACING = 20;
    
    const multipliers = [1, 5, 10, 50, 100];
    const visibleMultipliers = [];
    
    for (const mult of multipliers) {
        const spacing = baseSpacing * mult;
        const pixelSpacing = spacing * zoom;
        
        if (pixelSpacing >= MIN_PIXEL_SPACING) {
            visibleMultipliers.push({ multiplier: mult, spacing: spacing });
        }
    }
    
    if (visibleMultipliers.length === 0) {
        visibleMultipliers.push({ multiplier: 50, spacing: baseSpacing * 50 });
        visibleMultipliers.push({ multiplier: 100, spacing: baseSpacing * 100 });
    } else if (visibleMultipliers.length === 1) {
        const lastMult = visibleMultipliers[0].multiplier;
        const nextMult = multipliers[multipliers.indexOf(lastMult) + 1] || lastMult * 2;
        visibleMultipliers.push({ multiplier: nextMult, spacing: baseSpacing * nextMult });
    }
    
    const drawLines = (spacing, alpha, weight) => {
        if (spacing <= 0) return;
        
        const hexToRgba = (hex, a) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        };
        
        ctx2d.strokeStyle = hexToRgba(gridOptions.color, alpha);
        ctx2d.lineWidth = weight;
        ctx2d.beginPath();
        
        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;
        
        for (let x = startX; x <= worldRight; x += spacing) {
            ctx2d.moveTo(x, worldTop);
            ctx2d.lineTo(x, worldBottom);
        }
        
        for (let y = startY; y <= worldBottom; y += spacing) {
            ctx2d.moveTo(worldLeft, y);
            ctx2d.lineTo(worldRight, y);
        }
        
        ctx2d.stroke();
    };
    
    visibleMultipliers.reverse().forEach((item, index) => {
        const alpha = index === 0 ? 0.3 : (index === 1 ? 0.5 : 1.0);
        const weight = index === 0 ? gridOptions.weight * 0.5 : (index === 1 ? gridOptions.weight * 0.7 : gridOptions.weight);
        drawLines(item.spacing, alpha, weight);
    });
}

export function isMouseOverWall() {
    const bodyHitTolerance = WALL_THICKNESS / 2;
    for (const w of state.walls) {
        if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitTolerance ** 2) {
            return true;
        }
    }
    return false;
}

export function drawWindowSymbol(wall, window) {
    const { ctx2d } = dom;
    const { selectedObject } = state;
    
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;
    
    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    
    const startPos = window.pos - window.width / 2;
    const endPos = window.pos + window.width / 2;
    const windowP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const windowP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    
    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;
    
    const isSelected = selectedObject?.type === "window" && selectedObject.object === window;
    ctx2d.strokeStyle = isSelected ? "#8ab4f8" : "#e7e6d0";
    ctx2d.lineWidth = 1.5;
    
    const line1_start = { x: windowP1.x - nx * halfWall, y: windowP1.y - ny * halfWall };
    const line1_end = { x: windowP2.x - nx * halfWall, y: windowP2.y - ny * halfWall };
    
    const line2_start = { x: windowP1.x, y: windowP1.y };
    const line2_end = { x: windowP2.x, y: windowP2.y };
    
    const line3_start = { x: windowP1.x + nx * halfWall, y: windowP1.y + ny * halfWall };
    const line3_end = { x: windowP2.x + nx * halfWall, y: windowP2.y + ny * halfWall };
    
    ctx2d.beginPath();
    ctx2d.moveTo(line1_start.x, line1_start.y);
    ctx2d.lineTo(line1_end.x, line1_end.y);
    ctx2d.moveTo(line2_start.x, line2_start.y);
    ctx2d.lineTo(line2_end.x, line2_end.y);
    ctx2d.moveTo(line3_start.x, line3_start.y);
    ctx2d.lineTo(line3_end.x, line3_end.y);
    ctx2d.stroke();
    
    ctx2d.beginPath();
    ctx2d.moveTo(line1_start.x, line1_start.y);
    ctx2d.lineTo(line3_start.x, line3_start.y);
    ctx2d.moveTo(line1_end.x, line1_end.y);
    ctx2d.lineTo(line3_end.x, line3_end.y);
    ctx2d.stroke();
}

export function drawVentSymbol(wall, vent) {
    const { ctx2d } = dom;
    const { selectedObject } = state;
    
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;
    
    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    
    const startPos = vent.pos - vent.width / 2;
    const endPos = vent.pos + vent.width / 2;
    const ventP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const ventP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    
    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;
    
    const isSelected = selectedObject?.type === "vent" && selectedObject.object === vent;
    ctx2d.strokeStyle = isSelected ? "#8ab4f8" : "#e57373";
    ctx2d.fillStyle = "rgba(229, 115, 115, 0.2)";
    ctx2d.lineWidth = 1.5;
    
    const box1_start = { x: ventP1.x - nx * halfWall, y: ventP1.y - ny * halfWall };
    const box1_end = { x: ventP1.x + nx * halfWall, y: ventP1.y + ny * halfWall };
    const box2_start = { x: ventP2.x - nx * halfWall, y: ventP2.y - ny * halfWall };
    const box2_end = { x: ventP2.x + nx * halfWall, y: ventP2.y + ny * halfWall };
    
    ctx2d.beginPath();
    ctx2d.moveTo(box1_start.x, box1_start.y);
    ctx2d.lineTo(box1_end.x, box1_end.y);
    ctx2d.lineTo(box2_end.x, box2_end.y);
    ctx2d.lineTo(box2_start.x, box2_start.y);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
    
    const numLines = 3;
    for (let i = 1; i <= numLines; i++) {
        const t = i / (numLines + 1);
        const lineX = ventP1.x + (ventP2.x - ventP1.x) * t;
        const lineY = ventP1.y + (ventP2.y - ventP1.y) * t;
        
        ctx2d.beginPath();
        ctx2d.moveTo(lineX - nx * halfWall * 0.8, lineY - ny * halfWall * 0.8);
        ctx2d.lineTo(lineX + nx * halfWall * 0.8, lineY + ny * halfWall * 0.8);
        ctx2d.stroke();
    }
}

export function drawColumnSymbol(node) {
    const { ctx2d } = dom;
    
    const size = node.columnSize || 30;
    
    ctx2d.fillStyle = "#8ab4f8";
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 2;
    
    ctx2d.beginPath();
    ctx2d.rect(node.x - size / 2, node.y - size / 2, size, size);
    ctx2d.fill();
    ctx2d.stroke();
    
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(node.x - size / 2, node.y - size / 2);
    ctx2d.lineTo(node.x + size / 2, node.y + size / 2);
    ctx2d.moveTo(node.x + size / 2, node.y - size / 2);
    ctx2d.lineTo(node.x - size / 2, node.y + size / 2);
    ctx2d.stroke();
}
