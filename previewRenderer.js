import * as state from './state.js';
import { ctx2d } from './ui.js';
import { drawDimension } from './dimensionRenderer.js';

export function drawPreviews() {
    if (!state.startPoint) return;
    ctx2d.strokeStyle = "#8ab4f8";
    ctx2d.lineWidth = 2 / state.zoom;
    ctx2d.setLineDash([6 / state.zoom, 3 / state.zoom]);
    if (state.currentMode === "drawRoom") {
        ctx2d.strokeRect(state.startPoint.x, state.startPoint.y, state.mousePos.x - state.startPoint.x, state.mousePos.y - state.startPoint.y);
        drawDimension(state.startPoint, { x: state.mousePos.x, y: state.startPoint.y }, true);
        drawDimension({ x: state.mousePos.x, y: state.startPoint.y }, { x: state.mousePos.x, y: state.mousePos.y }, true);
    } else if (state.currentMode === "drawWall") {
        ctx2d.beginPath();
        ctx2d.moveTo(state.startPoint.x, state.startPoint.y);
        ctx2d.lineTo(state.mousePos.x, state.mousePos.y);
        ctx2d.stroke();
        drawDimension(state.startPoint, state.mousePos, true);
    }
    ctx2d.setLineDash([]);
}