import * as state from './state.js';
import { ctx2d } from './ui.js';

export function drawDimension(p1, p2, isPreview = false) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;
    const lengthM = lengthCm / 100;
    const displayText = (Math.round(lengthCm) % 10 === 0) ? lengthM.toFixed(1) : lengthM.toFixed(2);
    const midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
    const ang = Math.atan2(dy, dx);
    ctx2d.save();
    ctx2d.translate(midX, midY);
    ctx2d.rotate(ang);
    ctx2d.font = `600 ${16 / state.zoom}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.fillStyle = isPreview ? "#8ab4f8" : "#ffffff";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "bottom";
    ctx2d.fillText(displayText, 0, -6 / state.zoom);
    ctx2d.restore();
}

export function drawAllDimensions() {
    state.walls.forEach(w => {
        const isSelected = (state.selectedObject && state.selectedObject.type === "wall" && state.selectedObject.object === w) || state.selectedGroup.includes(w);
        drawDimension(w.p1, w.p2, isSelected);
    });
}

export function drawSelectedDimension() {
    if (!state.isDragging && state.selectedObject && state.selectedObject.type === 'wall') {
        drawDimension(state.selectedObject.object.p1, state.selectedObject.object.p2, true);
    }
}

export function drawDragDimensions() {
    if (state.isDragging && state.affectedWalls.length > 0) {
        state.affectedWalls.forEach(wall => {
            drawDimension(wall.p1, wall.p2, true);
        });
    }
}