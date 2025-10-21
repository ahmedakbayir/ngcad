import { state, dom, BG } from './main.js';

function darkenColor(hex, percent) {
    let color = hex.startsWith('#') ? hex.slice(1) : hex;
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);
    r = parseInt(r * (100 - percent) / 100);
    g = parseInt(g * (100 - percent) / 100);
    b = parseInt(b * (100 - percent) / 100);
    r = (r < 0) ? 0 : r;
    g = (g < 0) ? 0 : g;
    b = (b < 0) ? 0 : b;
    const rStr = (r.toString(16).length < 2) ? '0' + r.toString(16) : r.toString(16);
    const gStr = (g.toString(16).length < 2) ? '0' + g.toString(16) : g.toString(16);
    const bStr = (b.toString(16).length < 2) ? '0' + b.toString(16) : b.toString(16);
    return `#${rStr}${gStr}${bStr}`;
}

// --- DUVAR ÇİZİM YARDIMCI FONKSİYONLARI ---
// Bu fonksiyonlar bu modüle özeldir ve dışa aktarılmaz.

const drawNormalSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG) => {
    if (segmentList.length === 0) return;

    ctx2d.beginPath();
    segmentList.forEach((seg) => { 
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 1) { 
            ctx2d.moveTo(seg.p1.x, seg.p1.y); 
            ctx2d.lineTo(seg.p2.x, seg.p2.y); 
        } 
    });
    const thickness = segmentList[0]?.wall?.thickness || wallPx;
    ctx2d.lineWidth = thickness; 
    ctx2d.strokeStyle = color; 
    ctx2d.stroke();

    ctx2d.beginPath();
    segmentList.forEach((seg) => { 
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 1) { 
            ctx2d.moveTo(seg.p1.x, seg.p1.y); 
            ctx2d.lineTo(seg.p2.x, seg.p2.y); 
        } 
    });
    const innerPx = Math.max(0.5, thickness - lineThickness);
    ctx2d.lineWidth = innerPx; 
    ctx2d.strokeStyle = BG; 
    ctx2d.stroke();
};

const drawGlassSegments = (ctx2d, segmentList, color, wallPx) => {
    if (segmentList.length === 0) return;

    const thickness = segmentList[0]?.wall?.thickness || wallPx;
    const spacing = 4;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 2;

    segmentList.forEach((seg) => { 
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) < 1) return;

        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const length = Math.hypot(dx, dy);
        const dirX = dx / length;
        const dirY = dy / length;
        const normalX = -dirY;
        const normalY = dirX;

        const offset = spacing / 2;

        ctx2d.beginPath();
        ctx2d.moveTo(seg.p1.x + normalX * offset, seg.p1.y + normalY * offset);
        ctx2d.lineTo(seg.p2.x + normalX * offset, seg.p2.y + normalY * offset);
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.moveTo(seg.p1.x - normalX * offset, seg.p1.y - normalY * offset);
        ctx2d.lineTo(seg.p2.x - normalX * offset, seg.p2.y - normalY * offset);
        ctx2d.stroke();

        const connectionSpacing = 30;
        const numConnections = Math.floor(length / connectionSpacing);

        for (let i = 0; i <= numConnections; i++) {
            const t = i / numConnections;
            if (t > 1) continue;
            const midX = seg.p1.x + dirX * length * t;
            const midY = seg.p1.y + dirY * length * t;

            ctx2d.beginPath();
            ctx2d.moveTo(midX + normalX * offset, midY + normalY * offset);
            ctx2d.lineTo(midX - normalX * offset, midY - normalY * offset);
            ctx2d.stroke();
        }
    });
};

const drawBalconySegments = (ctx2d, segmentList, color) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1.5;

    ctx2d.beginPath();
    segmentList.forEach((seg) => { 
        if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 1) { 
            ctx2d.moveTo(seg.p1.x, seg.p1.y); 
            ctx2d.lineTo(seg.p2.x, seg.p2.y); 
        } 
    });
    ctx2d.stroke();
};

const drawHalfSegments = (ctx2d, segmentList, color, wallPx) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.fillStyle = "rgba(231, 230, 208, 0.3)";
    ctx2d.lineWidth = 1.5;

    segmentList.forEach((seg) => {
        const dx = seg.p2.x - seg.p1.x;
        const dy = seg.p2.y - seg.p1.y;
        const length = Math.hypot(dx, dy);

        if (length < 1) return;

        const dirX = dx / length;
        const dirY = dy / length;
        const normalX = -dirY;
        const normalY = dirX;

        const thickness = seg.wall.thickness || wallPx;
        const brickHeight = thickness;
        const brickWidth = 20;

        const numBricks = Math.ceil(length / brickWidth);
        const actualBrickWidth = length / numBricks;

        for (let i = 0; i < numBricks; i++) {
            const startT = i * actualBrickWidth;
            const endT = (i + 1) * actualBrickWidth;

            const brick1 = { x: seg.p1.x + dirX * startT, y: seg.p1.y + dirY * startT };
            const brick2 = { x: seg.p1.x + dirX * endT, y: seg.p1.y + dirY * endT };

            const corner1 = { x: brick1.x - normalX * brickHeight / 2, y: brick1.y - normalY * brickHeight / 2 };
            const corner2 = { x: brick1.x + normalX * brickHeight / 2, y: brick1.y + normalY * brickHeight / 2 };
            const corner3 = { x: brick2.x + normalX * brickHeight / 2, y: brick2.y + normalY * brickHeight / 2 };
            const corner4 = { x: brick2.x - normalX * brickHeight / 2, y: brick2.y - normalY * brickHeight / 2 };

            ctx2d.beginPath();
            ctx2d.moveTo(corner1.x, corner1.y);
            ctx2d.lineTo(corner2.x, corner2.y);
            ctx2d.lineTo(corner3.x, corner3.y);
            ctx2d.lineTo(corner4.x, corner4.y);
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.stroke();
        }
    });
};

// --- ANA EXPORT FONKSİYONU ---

export function drawWallGeometry(ctx2d, state, BG) {
    const {
        walls, doors, selectedObject, selectedGroup, wallBorderColor, lineThickness
    } = state;

    const wallPx = state.wallThickness || 20; // GÜNCELLENDİ
    ctx2d.lineJoin = "miter"; 
    ctx2d.miterLimit = 10;
    ctx2d.lineCap = "square";

    const normalSegments = { ortho: [], nonOrtho: [], selected: [] };
    const balconySegments = { ortho: [], nonOrtho: [], selected: [] };
    const glassSegments = { ortho: [], nonOrtho: [], selected: [] };
    const halfSegments = { ortho: [], nonOrtho: [], selected: [] };

    walls.forEach((w) => {
        const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w);
        const isOrthogonal = Math.abs(w.p1.x - w.p2.x) < 0.1 || Math.abs(w.p1.y - w.p2.y) < 0.1;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        if (wallLen < 0.1) return;

        const wallDoors = doors.filter((d) => d.wall === w).sort((a, b) => a.pos - b.pos);
        let currentSegments = [];
        let lastPos = 0;

        wallDoors.forEach((door) => {
            const doorStart = door.pos - door.width / 2;
            if (doorStart > lastPos) currentSegments.push({ start: lastPos, end: doorStart });
            lastPos = door.pos + door.width / 2;
        });

        if (lastPos < wallLen) currentSegments.push({ start: lastPos, end: wallLen });

        const dx = (w.p2.x - w.p1.x) / wallLen, dy = (w.p2.y - w.p1.y) / wallLen;
        const halfWallPx = wallPx / 2;

        const wallType = w.wallType || 'normal';
        let targetList;

        if (wallType === 'balcony') targetList = balconySegments;
        else if (wallType === 'glass') targetList = glassSegments;
        else if (wallType === 'half') targetList = halfSegments;
        else targetList = normalSegments;

        currentSegments.forEach((seg) => {
            let p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            let p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };

            if (seg.start > 0) { p1.x += dx * halfWallPx; p1.y += dy * halfWallPx; }
            if (seg.end < wallLen) { p2.x -= dx * halfWallPx; p2.y -= dy * halfWallPx; }

            const segmentData = { p1, p2, wall: w };

            if (isSelected) {
                targetList.selected.push(segmentData);
            } else if (isOrthogonal) {
                targetList.ortho.push(segmentData);
            } else {
                targetList.nonOrtho.push(segmentData);
            }
        });
    });

    drawNormalSegments(ctx2d, normalSegments.ortho, wallBorderColor, lineThickness, wallPx, BG);
    drawNormalSegments(ctx2d, normalSegments.nonOrtho, "#e57373", lineThickness, wallPx, BG);
    drawNormalSegments(ctx2d, normalSegments.selected, "#8ab4f8", lineThickness, wallPx, BG);

    drawBalconySegments(ctx2d, balconySegments.ortho, wallBorderColor);
    drawBalconySegments(ctx2d, balconySegments.nonOrtho, "#e57373");
    drawBalconySegments(ctx2d, balconySegments.selected, "#8ab4f8");

    drawGlassSegments(ctx2d, glassSegments.ortho, wallBorderColor, wallPx);
    drawGlassSegments(ctx2d, glassSegments.nonOrtho, "#e57373", wallPx);
    drawGlassSegments(ctx2d, glassSegments.selected, "#8ab4f8", wallPx);

    drawHalfSegments(ctx2d, halfSegments.ortho, wallBorderColor, wallPx);
    drawHalfSegments(ctx2d, halfSegments.nonOrtho, "#e57373", wallPx);
    drawHalfSegments(ctx2d, halfSegments.selected, "#8ab4f8", wallPx);
}