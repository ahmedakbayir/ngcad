import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';

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

        const radius = 25 / zoom; // Zoom'a göre ayarla
        ctx2d.strokeStyle = "#8ab4f8";
        ctx2d.fillStyle = "#8ab4f8";
        ctx2d.lineWidth = 1 / zoom;
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
            const textRadius = radius + 15 / zoom; // Zoom'a göre ayarla
            const textX = node.x + (angleBisector.x / lenBisector) * textRadius;
            const textY = node.y + (angleBisector.y / lenBisector) * textRadius;

            const baseFontSize = 12;
            const fontSize = Math.max(2, baseFontSize / zoom); // Minimum boyut 2
            ctx2d.font = `${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
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

    // Bu fonksiyonun içeriği önceki versiyonlarda da boştu, şimdilik kaldırıldı.
    // Gerekirse tekrar eklenebilir.
    // if (wallCount <= 1) return;
    // ...
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
    let color = isPreview ? "#8ab4f8" : (isSelected ? "#8ab4f8" : wallBorderColor); // Önizleme rengi
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 1.5; // Kapı çizgileri biraz daha ince

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
        // En azından bir grid seviyesi göster
        visibleMultipliers.push({ multiplier: multipliers[multipliers.length -1], spacing: baseSpacing * multipliers[multipliers.length -1] });
         if(multipliers.length > 1) {
              visibleMultipliers.push({ multiplier: multipliers[multipliers.length - 2], spacing: baseSpacing * multipliers[multipliers.length - 2] });
         }
    } else if (visibleMultipliers.length === 1 && multipliers.indexOf(visibleMultipliers[0].multiplier) < multipliers.length - 1) {
        // Sadece bir seviye görünüyorsa bir üst seviyeyi de ekle (varsa)
        const currentMultIndex = multipliers.indexOf(visibleMultipliers[0].multiplier);
        const nextMult = multipliers[currentMultIndex + 1];
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
        ctx2d.lineWidth = weight / zoom; // Grid kalınlığını zoom'a göre ayarla
        ctx2d.beginPath();

        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;

        // Çizgileri ekranın biraz dışına taşırarak kenarlarda kaybolmayı önle
        const buffer = spacing;
        for (let x = startX; x <= worldRight + buffer; x += spacing) {
            ctx2d.moveTo(x, worldTop - buffer);
            ctx2d.lineTo(x, worldBottom + buffer);
        }

        for (let y = startY; y <= worldBottom + buffer; y += spacing) {
            ctx2d.moveTo(worldLeft - buffer, y);
            ctx2d.lineTo(worldRight + buffer, y);
        }

        ctx2d.stroke();
    };

    // Grid seviyelerini çiz (en kalın en altta)
    visibleMultipliers.reverse().forEach((item, index) => {
         const numVisible = visibleMultipliers.length;
         // Alfa ve kalınlık ayarları
         let alpha = 0.15; // En ince
         let weight = gridOptions.weight * 0.5;
         if (numVisible > 1 && index === numVisible - 2) { // Ortanca
             alpha = 0.3;
             weight = gridOptions.weight * 0.7;
         } else if (index === numVisible - 1) { // En kalın
             alpha = 0.5;
             weight = gridOptions.weight;
         }

        drawLines(item.spacing, alpha, weight);
    });
}

export function isMouseOverWall() {
    // Duvar kalınlığına göre kontrol et
    for (const w of state.walls) {
         const wallPx = w.thickness || WALL_THICKNESS;
         const bodyHitToleranceSq = (wallPx / 2)**2;
        if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
            return true;
        }
    }
    return false;
}

// isPreview parametresi eklendi
export function drawWindowSymbol(wall, window, isPreview = false) {
    const { ctx2d } = dom;
    const { selectedObject, wallBorderColor, lineThickness } = state;

    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return; // Çok kısa duvarları atla

    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx; // Normal vector

    // Window start and end points along the wall's center line
    const startPos = window.pos - window.width / 2;
    const endPos = window.pos + window.width / 2;
    const windowP1_geom = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const windowP2_geom = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };

    // Use the actual thickness of the wall
    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;

    const isSelected = selectedObject?.type === "window" && selectedObject.object === window;
    // Önizleme rengi ayarı
    ctx2d.strokeStyle = isPreview ? "#8ab4f8" : (isSelected ? "#8ab4f8" : wallBorderColor);

    // Visual line thickness matching the wall outline effect
    const visualLineThickness = lineThickness / 2;
    ctx2d.lineWidth = visualLineThickness;
    // Inset amount to prevent lines visually exceeding wall boundaries
    const inset = visualLineThickness / 2;

    // --- Calculate Line Positions with Inset ---

    // Calculate inset start/end points along the wall direction for jambs and inner lines
    const jambP1 = { x: windowP1_geom.x + dx * inset, y: windowP1_geom.y + dy * inset };
    const jambP2 = { x: windowP2_geom.x - dx * inset, y: windowP2_geom.y - dy * inset };

    // Offsets for the 4 parallel lines, adjusted for inset
    const line1_offset = -halfWall + inset; // Outer line (0%) offset
    const line4_offset = halfWall - inset;  // Inner line (100%) offset
    const effectiveWidth = wallPx - 2 * inset; // The width between the inset outer/inner lines
    const offset25 = line1_offset + effectiveWidth * 0.25; // 25% line offset
    const offset75 = line1_offset + effectiveWidth * 0.75; // 75% line offset

    // Line 1: Outer edge (0%), using original geom points but inset offset
    const line1_start = { x: windowP1_geom.x + nx * line1_offset, y: windowP1_geom.y + ny * line1_offset };
    const line1_end = { x: windowP2_geom.x + nx * line1_offset, y: windowP2_geom.y + ny * line1_offset };

    // Line 4: Inner edge (100%), using original geom points but inset offset
    const line4_start = { x: windowP1_geom.x + nx * line4_offset, y: windowP1_geom.y + ny * line4_offset };
    const line4_end = { x: windowP2_geom.x + nx * line4_offset, y: windowP2_geom.y + ny * line4_offset };

    // Line 2: 25% inwards, using INSET geom points (jambP1/jambP2)
    const line2_start = { x: jambP1.x + nx * offset25, y: jambP1.y + ny * offset25 };
    const line2_end = { x: jambP2.x + nx * offset25, y: jambP2.y + ny * offset25 };

    // Line 3: 75% inwards, using INSET geom points (jambP1/jambP2)
    const line3_start = { x: jambP1.x + nx * offset75, y: jambP1.y + ny * offset75 };
    const line3_end = { x: jambP2.x + nx * offset75, y: jambP2.y + ny * offset75 };

    // --- Draw the 4 Parallel Lines ---
    ctx2d.beginPath();
    ctx2d.moveTo(line1_start.x, line1_start.y); ctx2d.lineTo(line1_end.x, line1_end.y); // 0%
    ctx2d.moveTo(line2_start.x, line2_start.y); ctx2d.lineTo(line2_end.x, line2_end.y); // 25%
    ctx2d.moveTo(line3_start.x, line3_start.y); ctx2d.lineTo(line3_end.x, line3_end.y); // 75%
    ctx2d.moveTo(line4_start.x, line4_start.y); ctx2d.lineTo(line4_end.x, line4_end.y); // 100%
    ctx2d.stroke(); // Draw the 4 parallel lines

    // --- Draw Vertical Jamb Lines (using inset points) ---
    const jamb1_outer = { x: jambP1.x + nx * line1_offset, y: jambP1.y + ny * line1_offset };
    const jamb1_inner = { x: jambP1.x + nx * line4_offset, y: jambP1.y + ny * line4_offset };
    const jamb2_outer = { x: jambP2.x + nx * line1_offset, y: jambP2.y + ny * line1_offset };
    const jamb2_inner = { x: jambP2.x + nx * line4_offset, y: jambP2.y + ny * line4_offset };

    ctx2d.beginPath();
    ctx2d.moveTo(jamb1_outer.x, jamb1_outer.y); ctx2d.lineTo(jamb1_inner.x, jamb1_inner.y); // Start Jamb
    ctx2d.moveTo(jamb2_outer.x, jamb2_outer.y); ctx2d.lineTo(jamb2_inner.x, jamb2_inner.y); // End Jamb
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