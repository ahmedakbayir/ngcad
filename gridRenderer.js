import * as state from './state.js';
import { ctx2d } from './ui.js';
import { screenToWorld } from './geometry.js';

export function drawGrid() {
    if (!state.gridOptions.visible) return;
    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
    const { x: worldRight, y: worldBottom } = screenToWorld(ctx2d.canvas.width, ctx2d.canvas.height);
    const levels = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    let bestLevelIndex = levels.length - 1;
    for (let i = 0; i < levels.length; i++) {
        if (levels[i] * state.zoom > 80) { // MIN_PIXEL_SPACING_MAJOR
            bestLevelIndex = i;
            break;
        }
    }
    const majorSpacing = levels[bestLevelIndex];
    const minorSpacing = bestLevelIndex > 0 ? levels[bestLevelIndex - 1] : -1;
    const hexToRgba = (hex, alpha) => `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${alpha})`;
    const drawLines = (spacing, color, weight) => {
        if (spacing <= 0 || spacing * state.zoom < 10) return; // MIN_PIXEL_SPACING_MINOR / 2
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = weight / state.zoom;
        ctx2d.beginPath();
        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;
        for (let x = startX; x <= worldRight; x += spacing) { ctx2d.moveTo(x, worldTop); ctx2d.lineTo(x, worldBottom); }
        for (let y = startY; y <= worldBottom; y += spacing) { ctx2d.moveTo(worldLeft, y); ctx2d.lineTo(worldRight, y); }
        ctx2d.stroke();
    };
    drawLines(minorSpacing, hexToRgba(state.gridOptions.color, 0.5), state.gridOptions.weight * 0.7);
    drawLines(majorSpacing, state.gridOptions.color, state.gridOptions.weight);
}