import * as state from './state.js';
import { ctx2d, getWallBorderColor } from './ui.js';
import * as geo from './geometry.js';

function drawDoorSymbol(door, isPreview = false, isSelected = false) {
    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;
    const dx = (wall.p2.x - wall.p1.x) / wallLen, dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    const startPos = door.pos - door.width / 2, endPos = door.pos + door.width / 2;
    const doorP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const doorP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const halfWall = (state.WALL_THICKNESS * state.METER_SCALE) / 2;
    ctx2d.strokeStyle = isPreview || isSelected ? "#8ab4f8" : getWallBorderColor();
    ctx2d.lineWidth = 1.5 / state.zoom;
    const jamb1_start = { x: doorP1.x - nx * halfWall, y: doorP1.y - ny * halfWall }, jamb1_end = { x: doorP1.x + nx * halfWall, y: doorP1.y + ny * halfWall };
    const jamb2_start = { x: doorP2.x - nx * halfWall, y: doorP2.y - ny * halfWall }, jamb2_end = { x: doorP2.x + nx * halfWall, y: doorP2.y + ny * halfWall };
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

export function drawDoors() {
    state.doors.forEach(door => {
        const isSelected = state.selectedObject && state.selectedObject.type === 'door' && state.selectedObject.object === door;
        drawDoorSymbol(door, false, isSelected);
    });
}

export function drawDoorPreview() {
    if (state.currentMode !== "drawDoor" || state.isPanning || state.isDragging) return;
    let closestWall = null, minDistSq = Infinity;
    for (const w of [...state.walls].reverse()) {
        const d = geo.distToSegmentSquared(state.mousePos, w.p1, w.p2);
        if (d < (state.WALL_THICKNESS * state.METER_SCALE)**2 && d < minDistSq) {
            minDistSq = d; closestWall = w;
        }
    }
    if (closestWall) {
        const previewDoor = geo.getDoorPlacement(closestWall, state.mousePos);
        if (previewDoor && geo.isSpaceForDoor(previewDoor)) {
            drawDoorSymbol(previewDoor, true);
        }
    }
}