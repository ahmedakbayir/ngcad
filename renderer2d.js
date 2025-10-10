import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';

export function drawDimension(p1, p2, isPreview = false) {
    const { ctx2d } = dom;
    const { zoom } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    const displayText = `${Math.round(lengthCm)}`;
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

    const baseFontSize = 14;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
    const yOffset = -8 / zoom;

    ctx2d.font = `300 ${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
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