import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { getDoorPlacementAtNode, getDoorPlacement, isSpaceForDoor } from './actions.js';

function drawDimension(p1, p2, isPreview = false) {
    const { ctx2d } = dom;
    const { zoom } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    const nx = -dy / lengthCm;
    const ny = dx / lengthCm;

    const offset = 20 / zoom;

    let midX = (p1.x + p2.x) / 2;
    let midY = (p1.y + p2.y) / 2;
    
    midX += nx * offset;
    midY += ny * offset;

    const displayText = `${Math.round(lengthCm)}`;
    
    let ang = Math.atan2(dy, dx);
    if (Math.abs(ang) > Math.PI / 2) {
        ang += Math.PI;
    }

    ctx2d.save();
    ctx2d.translate(midX, midY);
    ctx2d.rotate(ang);

    const baseFontSize = 14;
    const fontSize = zoom > 1 ? baseFontSize / zoom : baseFontSize;
    const yOffset = 0;

    ctx2d.font = `300 ${Math.max(2 / zoom, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.fillStyle = isPreview ? "#8ab4f8" : "#ffffff";
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";

    ctx2d.fillText(displayText, 0, yOffset);
    ctx2d.restore();
}

function drawDoorSymbol(door, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { wallBorderColor, lineThickness } = state;
    
    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;
    
    const dx = (wall.p2.x - wall.p1.x) / wallLen, dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    const startPos = door.pos - door.width / 2, endPos = door.pos + door.width / 2;
    const doorP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const doorP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = WALL_THICKNESS;
    const halfWall = wallPx / 2;
    let color = isPreview || isSelected ? "#8ab4f8" : wallBorderColor;
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 1.5;
    
    const jamb1_start = { x: doorP1.x - nx * halfWall, y: doorP1.y - ny * halfWall };
    const jamb1_end = { x: doorP1.x + nx * halfWall, y: doorP1.y + ny * halfWall };
    const jamb2_start = { x: doorP2.x - nx * halfWall, y: doorP2.y - ny * halfWall };
    const jamb2_end = { x: doorP2.x + nx * halfWall, y: doorP2.y + ny * halfWall };
    
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

function drawGrid() {
    const { ctx2d, c2d } = dom;
    const { zoom, panOffset, gridOptions } = state;
    
    if (!gridOptions.visible) return;
    
    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
    const { x: worldRight, y: worldBottom } = screenToWorld(c2d.width, c2d.height);
    const MIN_PIXEL_SPACING_MAJOR = 80, MIN_PIXEL_SPACING_MINOR = 20;
    const levels = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
    
    let bestLevelIndex = levels.findIndex(level => level * zoom > MIN_PIXEL_SPACING_MAJOR);
    if (bestLevelIndex === -1) bestLevelIndex = levels.length - 1;
    
    const majorSpacing = levels[bestLevelIndex];
    const minorSpacing = bestLevelIndex > 0 ? levels[bestLevelIndex - 1] : -1;
    
    const drawLines = (spacing, color, weight) => {
        if (spacing <= 0 || spacing * zoom < MIN_PIXEL_SPACING_MINOR / 2) return;
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = weight;
        ctx2d.beginPath();
        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;
        for (let x = startX; x <= worldRight; x += spacing) { ctx2d.moveTo(x, worldTop); ctx2d.lineTo(x, worldBottom); }
        for (let y = startY; y <= worldBottom; y += spacing) { ctx2d.moveTo(worldLeft, y); ctx2d.lineTo(worldRight, y); }
        ctx2d.stroke();
    };
    
    const hexToRgba = (hex, alpha) => {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    drawLines(minorSpacing, hexToRgba(gridOptions.color, 0.5), gridOptions.weight * 0.7);
    drawLines(majorSpacing, gridOptions.color, gridOptions.weight);
}

function isMouseOverWall() {
    const bodyHitTolerance = WALL_THICKNESS / 2;
    for (const w of state.walls) {
        if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitTolerance ** 2) {
            return true;
        }
    }
    return false;
}

export function draw2D() {
    const { ctx2d, c2d } = dom;
    const { 
        panOffset, zoom, rooms, roomFillColor, walls, doors, selectedObject, 
        selectedGroup, wallBorderColor, lineThickness, showDimensions, 
        affectedWalls, startPoint, currentMode, mousePos, gridOptions,
        isStretchDragging, stretchWallOrigin, isDragging, isPanning
    } = state;

    ctx2d.fillStyle = BG;
    ctx2d.fillRect(0, 0, c2d.width, c2d.height);
    ctx2d.save();
    ctx2d.translate(panOffset.x, panOffset.y);
    ctx2d.scale(zoom, zoom);
    ctx2d.lineWidth = 1 / zoom;
    
    drawGrid();

    const wallPx = WALL_THICKNESS;
    ctx2d.lineJoin = "miter"; ctx2d.miterLimit = 4; ctx2d.lineCap = "square";

    ctx2d.fillStyle = "#4a4a4f";
    const epsilon = 0.1;
    walls.forEach(wall => {
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        if (Math.abs(dx) > epsilon && Math.abs(dy) > epsilon) {
            const length = Math.hypot(dx, dy);
            if (length < 1) return;
            const nx = -dy / length;
            const ny = dx / length;
            const halfThick = wallPx / 2;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x + nx * halfThick, wall.p1.y + ny * halfThick);
            ctx2d.lineTo(wall.p2.x + nx * halfThick, wall.p2.y + ny * halfThick);
            ctx2d.lineTo(wall.p2.x - nx * halfThick, wall.p2.y - ny * halfThick);
            ctx2d.lineTo(wall.p1.x - nx * halfThick, wall.p1.y - ny * halfThick);
            ctx2d.closePath();
            ctx2d.fill();
        }
    });

    if (rooms.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.3)";
        ctx2d.lineWidth = 1;
        rooms.forEach((room) => {
            const coords = room.polygon.geometry.coordinates[0];
            if (coords.length < 3) return;
            ctx2d.fillStyle = roomFillColor;
            ctx2d.beginPath();
            ctx2d.moveTo(coords[0][0], coords[0][1]);
            for (let i = 1; i < coords.length; i++) ctx2d.lineTo(coords[i][0], coords[i][1]);
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.stroke();
        });
    }

    const unselectedSegments = [], selectedSegments = [];
    walls.forEach((w) => {
        const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w);
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        if (wallLen < 0.1) return;
        const wallDoors = doors.filter((d) => d.wall === w).sort((a, b) => a.pos - b.pos);
        let currentSegments = []; let lastPos = 0;
        wallDoors.forEach((door) => {
            const doorStart = door.pos - door.width / 2;
            if (doorStart > lastPos) currentSegments.push({ start: lastPos, end: doorStart });
            lastPos = door.pos + door.width / 2;
        });
        if (lastPos < wallLen) currentSegments.push({ start: lastPos, end: wallLen });
        const dx = (w.p2.x - w.p1.x) / wallLen, dy = (w.p2.y - w.p1.y) / wallLen;
        currentSegments.forEach((seg) => {
            const p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            const p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };
            const segmentData = { p1, p2 };
            if (isSelected) selectedSegments.push(segmentData); else unselectedSegments.push(segmentData);
        });
    });

    const drawSegments = (segmentList, color) => {
        if (segmentList.length === 0) return;
        ctx2d.beginPath();
        segmentList.forEach((seg) => { if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 1) { ctx2d.moveTo(seg.p1.x, seg.p1.y); ctx2d.lineTo(seg.p2.x, seg.p2.y); } });
        ctx2d.lineWidth = wallPx; ctx2d.strokeStyle = color; ctx2d.stroke();
        ctx2d.beginPath();
        segmentList.forEach((seg) => { if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 1) { ctx2d.moveTo(seg.p1.x, seg.p1.y); ctx2d.lineTo(seg.p2.x, seg.p2.y); } });
        const innerPx = Math.max(0.5, wallPx - lineThickness);
        ctx2d.lineWidth = innerPx; ctx2d.strokeStyle = BG; ctx2d.stroke();
    };

    drawSegments(unselectedSegments, wallBorderColor);
    drawSegments(selectedSegments, "#8ab4f8");

    if (rooms.length > 0) {
        ctx2d.textAlign = "center";
        rooms.forEach((room) => {
            if (!room.center || !Array.isArray(room.center) || room.center.length < 2) return;
            const baseNameFontSize = 16, baseAreaFontSize = 12;
            const baseNameYOffset = showDimensions ? 8 : 0;
            const nameYOffset = baseNameYOffset / zoom;
            ctx2d.fillStyle = room.name === 'TANIMSIZ' ? '#e57373' : '#e8eaed';
            let nameFontSize = zoom > 1 ? baseNameFontSize / zoom : baseNameFontSize;
            ctx2d.font = `500 ${Math.max(3 / zoom, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            ctx2d.textBaseline = showDimensions ? "bottom" : "middle";
            ctx2d.fillText(room.name, room.center[0], room.center[1] - nameYOffset);
            if (showDimensions) {
                ctx2d.fillStyle = "#e8eaed";
                let areaFontSize = zoom > 1 ? baseAreaFontSize / zoom : baseAreaFontSize;
                ctx2d.font = `400 ${Math.max(2 / zoom, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
                ctx2d.textBaseline = "top";
                const text = `${room.area.toFixed(2)} m²`;
                ctx2d.fillText(text, room.center[0], room.center[1] - nameYOffset);
            }
        });
    }

    doors.forEach((door) => { 
        const isSelected = selectedObject?.type === "door" && selectedObject.object === door;
        drawDoorSymbol(door, false, isSelected);
    });

    if (currentMode === "drawDoor" && !isPanning && !isDragging) {
        const doorsToPreview = [];
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);

        if (hoveredNode) {
            const connectedWalls = walls.filter(w => w.p1 === hoveredNode || w.p2 === hoveredNode);
            connectedWalls.forEach(wall => {
                const newDoor = getDoorPlacementAtNode(wall, hoveredNode);
                if (newDoor) doorsToPreview.push(newDoor);
            });
        } else {
            let closestWall = null, minDistSq = Infinity;
            const bodyHitToleranceSq = (WALL_THICKNESS * 1.5) ** 2;
            for (const w of [...walls].reverse()) {
                const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
                if (distSq < bodyHitToleranceSq && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestWall = w;
                }
            }
            if (closestWall) {
                const previewDoor = getDoorPlacement(closestWall, mousePos);
                if (previewDoor) doorsToPreview.push(previewDoor);
            }
        }

        doorsToPreview.forEach(door => {
            if (isSpaceForDoor(door, hoveredNode)) {
                drawDoorSymbol(door, true);
            }
        });
    }

    if (showDimensions) { walls.forEach((w) => { const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w); drawDimension(w.p1, w.p2, isSelected); }); }
    else if (!isDragging && selectedObject?.type === "wall") { drawDimension(selectedObject.object.p1, selectedObject.object.p2, true); }
    if (isDragging && affectedWalls.length > 0) { affectedWalls.forEach((wall) => { drawDimension(wall.p1, wall.p2, true); }); }

    if (selectedObject?.type === "wall" && !isDragging) {
        const w = selectedObject.object;
        ctx2d.fillStyle = "#ffffff";
        ctx2d.beginPath(); ctx2d.arc(w.p1.x, w.p1.y, 3, 0, 2 * Math.PI); ctx2d.fill();
        ctx2d.beginPath(); ctx2d.arc(w.p2.x, w.p2.y, 3, 0, 2 * Math.PI); ctx2d.fill();
    }

    if (startPoint) {
        ctx2d.strokeStyle = "#8ab4f8"; ctx2d.lineWidth = 2; ctx2d.setLineDash([6, 3]);
        if (currentMode === "drawRoom") {
            ctx2d.strokeRect(startPoint.x, startPoint.y, mousePos.x - startPoint.x, mousePos.y - startPoint.y);
            const snappedX = Math.round(mousePos.x / gridOptions.spacing) * gridOptions.spacing;
            const snappedY = Math.round(mousePos.y / gridOptions.spacing) * gridOptions.spacing;
            drawDimension(startPoint, { x: snappedX, y: startPoint.y }, true);
            drawDimension({ x: snappedX, y: startPoint.y }, { x: snappedX, y: snappedY }, true);
        } else if (currentMode === "drawWall") {
            ctx2d.beginPath(); ctx2d.moveTo(startPoint.x, startPoint.y); ctx2d.lineTo(mousePos.x, mousePos.y); ctx2d.stroke();
            let dimensionEndPoint = { x: mousePos.x, y: mousePos.y };
            const spacing = gridOptions.spacing;
            const dx = Math.abs(dimensionEndPoint.x - startPoint.x), dy = Math.abs(dimensionEndPoint.y - startPoint.y);
            if (dx > dy) dimensionEndPoint.y = startPoint.y; else dimensionEndPoint.x = startPoint.x;
            dimensionEndPoint.x = Math.round(dimensionEndPoint.x / spacing) * spacing;
            dimensionEndPoint.y = Math.round(dimensionEndPoint.y / spacing) * spacing;
            drawDimension(startPoint, dimensionEndPoint, true);
        }
        ctx2d.setLineDash([]);
    }

    if (isStretchDragging) {
        const displacementVec = { x: mousePos.x - state.dragStartPoint.x, y: mousePos.y - state.dragStartPoint.y };
        const wallVec = { x: stretchWallOrigin.p2.x - stretchWallOrigin.p1.x, y: stretchWallOrigin.p2.y - stretchWallOrigin.p1.y };
        const normalVec = { x: -wallVec.y, y: wallVec.x };
        const len = Math.hypot(normalVec.x, normalVec.y);
        if (len > 0.1) { normalVec.x /= len; normalVec.y /= len; }
        const distance = displacementVec.x * normalVec.x + displacementVec.y * normalVec.y;
        const dx = distance * normalVec.x, dy = distance * normalVec.y;
        const t1 = { x: stretchWallOrigin.p1.x + dx, y: stretchWallOrigin.p1.y + dy };
        const t2 = { x: stretchWallOrigin.p2.x + dx, y: stretchWallOrigin.p2.y + dy };
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)"; ctx2d.lineWidth = 2; ctx2d.setLineDash([6, 3]);
        ctx2d.beginPath();
        ctx2d.moveTo(stretchWallOrigin.p1.x, stretchWallOrigin.p1.y); ctx2d.lineTo(t1.x, t1.y);
        ctx2d.moveTo(stretchWallOrigin.p2.x, stretchWallOrigin.p2.y); ctx2d.lineTo(t2.x, t2.y);
        ctx2d.moveTo(t1.x, t1.y); ctx2d.lineTo(t2.x, t2.y);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
        drawDimension(t1, t2, true);
        drawDimension(stretchWallOrigin.p1, t1, true);
        drawDimension(stretchWallOrigin.p2, t2, true);
    }

    const isDrawingMode = currentMode === 'drawWall' || currentMode === 'drawRoom';
    if (isDrawingMode && mousePos.isSnapped) {
        const hasExtensionLines = mousePos.snapLines.h_origins.length > 0 || mousePos.snapLines.v_origins.length > 0;
        if (!startPoint && hasExtensionLines && !isMouseOverWall()) {
            ctx2d.strokeStyle = "rgba(138,180,248,.5)";
            ctx2d.lineWidth = 1;
            ctx2d.setLineDash([4, 4]);
            ctx2d.beginPath();
            mousePos.snapLines.h_origins.forEach(origin => {
                const p2 = { x: mousePos.x, y: origin.y };
                ctx2d.moveTo(origin.x, origin.y);
                ctx2d.lineTo(p2.x, p2.y);
                drawDimension(origin, p2, true);
            });
            mousePos.snapLines.v_origins.forEach(origin => {
                const p2 = { x: origin.x, y: mousePos.y };
                ctx2d.moveTo(origin.x, origin.y);
                ctx2d.lineTo(p2.x, p2.y);
                drawDimension(origin, p2, true);
            });
            ctx2d.stroke();
            ctx2d.setLineDash([]);
        }
    }

    if (mousePos.isSnapped) {
        ctx2d.strokeStyle = "rgba(138,180,248,.5)";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        const snapRadius = 10 / zoom;
        ctx2d.arc(mousePos.x, mousePos.y, snapRadius, 0, Math.PI * 2);
        ctx2d.stroke();
    }

    ctx2d.restore();
}