// draw-arch-descriptions.js
// Duvar, kapı ve pencere üzerindeki kullanıcı açıklamalarını proje üzerine çizer.
// (Oda açıklamaları drawRoomNames içinde isim/alanın altında çizilir.)

import { isLightMode } from '../general-files/main.js';

const ZOOM_EXPONENT = -0.4;

function getDescColor() {
    return isLightMode() ? 'rgb(75, 75, 75)' : 'rgb(180, 190, 195)';
}

function drawCenteredLines(ctx2d, lines, cx, cy, angleRad, fontSize, color) {
    if (!lines.length) return;
    ctx2d.save();
    ctx2d.translate(cx, cy);
    // Yazıyı baş aşağı yazmamak için açıyı düzelt
    let a = angleRad;
    if (a > Math.PI / 2) a -= Math.PI;
    else if (a < -Math.PI / 2) a += Math.PI;
    ctx2d.rotate(a);
    ctx2d.font = `500 ${fontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.fillStyle = color;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    const lineGap = fontSize * 1.2;
    const totalH = (lines.length - 1) * lineGap;
    lines.forEach((line, i) => {
        const y = -totalH / 2 + i * lineGap;
        ctx2d.fillText(line, 0, y);
    });
    ctx2d.restore();
}

export function drawArchitecturalDescriptions(ctx2d, { walls, doors, zoom }) {
    const baseFont = 11;
    const fontSize = Math.max(2, baseFont * Math.pow(zoom, ZOOM_EXPONENT));
    const color = getDescColor();

    // Duvar açıklamaları: duvarın orta noktası, duvar yönüne göre, gövde dışında
    walls.forEach(wall => {
        if (!wall.description || !wall.description.trim()) return;
        if (!wall.p1 || !wall.p2) return;
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;

        const midX = (wall.p1.x + wall.p2.x) / 2;
        const midY = (wall.p1.y + wall.p2.y) / 2;
        const thickness = wall.thickness || 20;
        const offset = thickness / 2 + fontSize * 0.9;
        const cx = midX + nx * offset;
        const cy = midY + ny * offset;

        const angleRad = Math.atan2(dy, dx);
        const lines = wall.description.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
        drawCenteredLines(ctx2d, lines, cx, cy, angleRad, fontSize, color);
    });

    // Kapı açıklamaları: kapının orta noktası, duvar yönüne göre, gövde dışında
    doors.forEach(door => {
        if (!door.description || !door.description.trim()) return;
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) return;
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;

        const cxOnWall = wall.p1.x + ux * door.pos;
        const cyOnWall = wall.p1.y + uy * door.pos;
        const thickness = wall.thickness || 20;
        const offset = thickness / 2 + fontSize * 0.9;
        const cx = cxOnWall + nx * offset;
        const cy = cyOnWall + ny * offset;

        const angleRad = Math.atan2(dy, dx);
        const lines = door.description.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
        drawCenteredLines(ctx2d, lines, cx, cy, angleRad, fontSize, color);
    });

    // Pencere açıklamaları: walls içindeki pencerelerden döner
    walls.forEach(wall => {
        if (!wall.windows || !wall.windows.length) return;
        if (!wall.p1 || !wall.p2) return;
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const thickness = wall.thickness || 20;
        const offset = thickness / 2 + fontSize * 0.9;
        const angleRad = Math.atan2(dy, dx);

        wall.windows.forEach(win => {
            if (!win.description || !win.description.trim()) return;
            const cxOnWall = wall.p1.x + ux * win.pos;
            const cyOnWall = wall.p1.y + uy * win.pos;
            // Pencere açıklaması duvarın diğer tarafında — kapıyla çakışmaması için
            const cx = cxOnWall - nx * offset;
            const cy = cyOnWall - ny * offset;
            const lines = win.description.split('\n').map(l => l.trimEnd()).filter(l => l.length > 0);
            drawCenteredLines(ctx2d, lines, cx, cy, angleRad, fontSize, color);
        });
    });
}
