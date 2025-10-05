import * as state from './state.js';
import { ctx2d, getWallBorderColor } from './ui.js';

function drawSegments(segmentList, color) {
    if (segmentList.length === 0) return;
    const wallPx = state.WALL_THICKNESS * state.METER_SCALE;
    ctx2d.beginPath();
    segmentList.forEach(seg => {
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) < 1) return;
        ctx2d.moveTo(seg.p1.x, seg.p1.y);
        ctx2d.lineTo(seg.p2.x, seg.p2.y);
    });
    ctx2d.lineWidth = wallPx;
    ctx2d.strokeStyle = color;
    ctx2d.stroke();
    ctx2d.beginPath();
    segmentList.forEach(seg => {
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) < 1) return;
        ctx2d.moveTo(seg.p1.x, seg.p1.y);
        ctx2d.lineTo(seg.p2.x, seg.p2.y);
    });
    const innerPx = Math.max(1 / state.zoom, wallPx - 3 / state.zoom);
    ctx2d.lineWidth = innerPx;
    ctx2d.strokeStyle = state.BG;
    ctx2d.stroke();
}

export function drawWalls() {
    const wallPx = state.WALL_THICKNESS * state.METER_SCALE;
    ctx2d.lineJoin = "miter";
    ctx2d.miterLimit = 4;
    ctx2d.lineCap = "square";
    const unselectedSegments = [], selectedSegments = [];
    state.walls.forEach(w => {
        const isSelected = (state.selectedObject && state.selectedObject.type === "wall" && state.selectedObject.object === w) || state.selectedGroup.includes(w);
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        if (wallLen < 0.1) return;
        const wallDoors = state.doors.filter(d => d.wall === w).sort((a, b) => a.pos - b.pos);
        let currentSegments = [], lastPos = 0;
        wallDoors.forEach(door => {
            const doorStart = door.pos - door.width / 2;
            if (doorStart > lastPos) currentSegments.push({ start: lastPos, end: doorStart });
            lastPos = door.pos + door.width / 2;
        });
        if (lastPos < wallLen) currentSegments.push({ start: lastPos, end: wallLen });
        const dx = (w.p2.x - w.p1.x) / wallLen, dy = (w.p2.y - w.p1.y) / wallLen;
        currentSegments.forEach(seg => {
            let p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            let p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };
            (isSelected ? selectedSegments : unselectedSegments).push({ p1, p2 });
        });
    });
    drawSegments(unselectedSegments, getWallBorderColor());
    drawSegments(selectedSegments, "#8ab4f8");
    if (state.selectedObject && state.selectedObject.type === "wall" && !state.isDragging) {
        const w = state.selectedObject.object;
        ctx2d.fillStyle = "#ffffff";
        ctx2d.beginPath(); ctx2d.arc(w.p1.x, w.p1.y, 3 / state.zoom, 0, 2 * Math.PI); ctx2d.fill();
        ctx2d.beginPath(); ctx2d.arc(w.p2.x, w.p2.y, 3 / state.zoom, 0, 2 * Math.PI); ctx2d.fill();
    }
}