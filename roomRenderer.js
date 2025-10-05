import * as state from './state.js';
import { ctx2d } from './ui.js';

export function drawRooms() {
    if (state.rooms.length === 0) return;
    ctx2d.strokeStyle = "rgba(138, 180, 248, 0.3)";
    ctx2d.lineWidth = 1 / state.zoom;
    state.rooms.forEach((room) => {
        const coords = room.polygon.geometry.coordinates[0];
        if (coords.length < 3) return;
        ctx2d.fillStyle = "rgba(138, 180, 248, 0.15)";
        ctx2d.beginPath();
        ctx2d.moveTo(coords[0][0], coords[0][1]);
        for (let i = 1; i < coords.length; i++) {
            ctx2d.lineTo(coords[i][0], coords[i][1]);
        }
        ctx2d.closePath();
        ctx2d.fill();
        ctx2d.stroke();
    });
    ctx2d.fillStyle = "#e8eaed";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    state.rooms.forEach((room) => {
        const fontSize = Math.max(10, 16 / state.zoom);
        ctx2d.font = `500 ${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        ctx2d.fillText(`${room.area.toFixed(2)} m²`, room.center[0], room.center[1]);
    });
}