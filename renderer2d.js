import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';

export function drawAngleSymbol(node) {
    const { ctx2d } = dom;
    const { walls, zoom } = state;

    // Bu noktaya bağlı duvarları bul
    const connectedWalls = walls.filter(w => w.p1 === node || w.p2 === node);

    // Açı oluşturmak için en az 2 duvar gerekir
    if (connectedWalls.length < 2) return;

    // Şimdilik sadece 2 duvarlı köşeleri destekleyelim
    if (connectedWalls.length === 2) {
        const wall1 = connectedWalls[0];
        const wall2 = connectedWalls[1];

        // Noktadan dışarı doğru giden vektörleri oluştur
        const v1 = wall1.p1 === node ? { x: wall1.p2.x - node.x, y: wall1.p2.y - node.y } : { x: wall1.p1.x - node.x, y: wall1.p1.y - node.y };
        const v2 = wall2.p1 === node ? { x: wall2.p2.x - node.x, y: wall2.p2.y - node.y } : { x: wall2.p1.x - node.x, y: wall2.p1.y - node.y };

        // Vektörlerin uzunluklarını (magnitudes) bul
        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        if (len1 < 1 || len2 < 1) return;

        // Vektörleri normalize et (birim vektör yap)
        const v1n = { x: v1.x / len1, y: v1.y / len1 };
        const v2n = { x: v2.x / len2, y: v2.y / len2 };

        // Nokta çarpım (dot product) ile aradaki açıyı (radyan cinsinden) bul
        const dotProduct = v1n.x * v2n.x + v1n.y * v2n.y;
        const angleRad = Math.acos(Math.max(-1, Math.min(1, dotProduct))); // Kayan nokta hatalarına karşı koruma
        
        // Açıyı dereceye çevir
        const angleDeg = angleRad * 180 / Math.PI;

        const radius = 25; // Açı sembolünün yarıçapı
        ctx2d.strokeStyle = "#8ab4f8";
        ctx2d.fillStyle = "#8ab4f8";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();

        // Açı 90 derece ise dik açı sembolü çiz
        if (Math.abs(angleDeg - 90) < 0.5) {
            const p1 = { x: node.x + v1n.x * radius, y: node.y + v1n.y * radius };
            const p2 = { x: node.x + v2n.x * radius, y: node.y + v2n.y * radius };
            const p3 = { x: p1.x + v2n.x * radius, y: p1.y + v2n.y * radius };
            ctx2d.moveTo(p1.x, p1.y);
            ctx2d.lineTo(p3.x, p3.y);
            ctx2d.lineTo(p2.x, p2.y);
        } else { // Değilse yay çiz
            const angle1 = Math.atan2(v1.y, v1.x);
            const angle2 = Math.atan2(v2.y, v2.x);
            // Yay yönünü doğru belirlemek için cross product kontrolü
            const crossProduct = v1.x * v2.y - v1.y * v2.x;
            if (crossProduct > 0) {
                ctx2d.arc(node.x, node.y, radius, angle1, angle2);
            } else {
                ctx2d.arc(node.x, node.y, radius, angle2, angle1);
            }
        }
        ctx2d.stroke();

        // Açı değerini yaz
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


export function drawDimension(p1, p2, isPreview = false) {
    const { ctx2d } = dom;
    const { zoom, gridOptions } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    // --- TEK DEĞİŞİKLİK BURADA ---
    // Gösterilecek metni oluşturmadan önce, gerçek uzunluğu grid aralığına yuvarlıyoruz.
    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    const roundedLength = Math.round(lengthCm / gridSpacing) * gridSpacing;
    const displayText = `${Math.round(roundedLength)}`;
    // --- DEĞİŞİKLİK SONU ---

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
    ctx2d.fillStyle = isPreview ? "#ffffff" : "#8ab4f8";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.fillText(displayText, 0, yOffset);
    ctx2d.restore();
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
    const wallPx = WALL_THICKNESS;
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
    const MIN_PIXEL_SPACING_MAJOR = 80, MIN_PIXEL_SPACING_MINOR = 20;
    const levels = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    
    let bestLevelIndex = levels.findIndex(level => level * zoom > MIN_PIXEL_SPACING_MAJOR);
    if (bestLevelIndex === -1) bestLevelIndex = levels.length - 1;
    
    const majorSpacing = levels[bestLevelIndex];
    const minorSpacing = bestLevelIndex > 0 ? levels[bestLevelIndex - 1] : -1;
    
    const drawLines = (spacing, color, weight) => {
        if (spacing <= 0 || spacing * zoom < MIN_PIXEL_SPACING_MINOR / 2) return;
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = weight;
        ctx2d.beginPath();
        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;
        for (let x = startX; x <= worldRight; x += spacing) { ctx2d.moveTo(x, worldTop); ctx2d.lineTo(x, worldBottom); }
        for (let y = startY; y <= worldBottom; y += spacing) { ctx2d.moveTo(worldLeft, y); ctx2d.lineTo(worldRight, y); }
        ctx2d.stroke();
    };
    
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    drawLines(minorSpacing, hexToRgba(gridOptions.color, 0.5), gridOptions.weight * 0.7);
    drawLines(majorSpacing, gridOptions.color, gridOptions.weight);
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