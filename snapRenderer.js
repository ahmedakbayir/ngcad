import * as state from './state.js';
import { ctx2d } from './ui.js';
import { screenToWorld } from './geometry.js';

export function drawSnapIndicators() {
    if (!state.mousePos.isSnapped) return;
    ctx2d.strokeStyle = "rgba(138,180,248,.5)";
    ctx2d.lineWidth = 1 / state.zoom;
    ctx2d.setLineDash([4 / state.zoom, 4 / state.zoom]);
    const wc = screenToWorld(ctx2d.canvas.width, ctx2d.canvas.height);
    ctx2d.beginPath();
    state.mousePos.snapLines.h.forEach((y) => {
        ctx2d.moveTo(-state.panOffset.x / state.zoom, y);
        ctx2d.lineTo(wc.x, y);
    });
    state.mousePos.snapLines.v.forEach((x) => {
        ctx2d.moveTo(x, -state.panOffset.y / state.zoom);
        ctx2d.lineTo(x, wc.y);
    });
    ctx2d.stroke();
    ctx2d.setLineDash([]);
    ctx2d.beginPath();
    ctx2d.arc(state.mousePos.x, state.mousePos.y, state.SNAP_DISTANCE_EXTENSION / state.zoom, 0, Math.PI * 2);
    ctx2d.stroke();
}