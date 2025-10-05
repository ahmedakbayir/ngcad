import * as state from './state.js';
import { ctx2d } from './ui.js';
import { drawGrid } from './gridRenderer.js';
import { drawRooms } from './roomRenderer.js';
import { drawWalls } from './wallRenderer.js';
import { drawDoors, drawDoorPreview } from './doorRenderer.js';
import { drawAllDimensions, drawSelectedDimension, drawDragDimensions } from './dimensionRenderer.js';
import { drawPreviews } from './previewRenderer.js';
import { drawSnapIndicators } from './snapRenderer.js';

export function draw() {
    ctx2d.fillStyle = state.BG;
    ctx2d.fillRect(0, 0, ctx2d.canvas.width, ctx2d.canvas.height);
    ctx2d.save();
    ctx2d.translate(state.panOffset.x, state.panOffset.y);
    ctx2d.scale(state.zoom, state.zoom);

    // Çizim katmanlarını sırayla çağır
    drawGrid();
    drawRooms();
    drawWalls();
    drawDoors();
    drawDoorPreview();

    if (state.showDimensions) {
        drawAllDimensions();
    } else {
        drawSelectedDimension();
    }
    drawDragDimensions();

    drawPreviews();
    drawSnapIndicators();

    ctx2d.restore();
}