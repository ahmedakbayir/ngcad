import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, snapTo15DegreeAngle } from './geometry.js';
import { getDoorPlacementAtNode, getDoorPlacement, isSpaceForDoor } from './actions.js';
import { drawDimension, drawDoorSymbol, drawGrid, isMouseOverWall, drawAngleSymbol } from './renderer2d.js';

export function draw2D() {
    const { ctx2d, c2d } = dom;
    const {
        panOffset, zoom, rooms, roomFillColor, walls, doors, selectedObject,
        selectedGroup, wallBorderColor, lineThickness, showDimensions,
        affectedWalls, startPoint, currentMode, mousePos,
        isStretchDragging, stretchWallOrigin, dragStartPoint, isDragging, isPanning,
        isSweeping, sweepWalls
    } = state;

    ctx2d.fillStyle = BG;
    ctx2d.fillRect(0, 0, c2d.width, c2d.height);
    ctx2d.save();
    ctx2d.translate(panOffset.x, panOffset.y);
    ctx2d.scale(zoom, zoom);
    ctx2d.lineWidth = 1 / zoom;

    drawGrid();

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

    const wallPx = WALL_THICKNESS;
    ctx2d.lineJoin = "miter"; ctx2d.miterLimit = 4; ctx2d.lineCap = "square";

    const orthoSegments = [], nonOrthoSegments = [], selectedSegments = [];

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

        currentSegments.forEach((seg) => {
            let p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            let p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };
            if (seg.start > 0) { p1.x += dx * halfWallPx; p1.y += dy * halfWallPx; }
            if (seg.end < wallLen) { p2.x -= dx * halfWallPx; p2.y -= dy * halfWallPx; }
            const segmentData = { p1, p2 };

            if (isSelected) {
                selectedSegments.push(segmentData);
            } else if (isOrthogonal) {
                orthoSegments.push(segmentData);
            } else {
                nonOrthoSegments.push(segmentData);
            }
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

    drawSegments(orthoSegments, wallBorderColor);
    drawSegments(nonOrthoSegments, "#e57373");
    drawSegments(selectedSegments, "#8ab4f8");

    const nodesToDrawAngle = new Set();
    if (isDragging && selectedObject?.handle !== 'body') {
        const nodeToDrag = selectedObject.object[selectedObject.handle];
        nodesToDrawAngle.add(nodeToDrag);
    }
    else if (selectedObject?.type === 'wall') {
        nodesToDrawAngle.add(selectedObject.object.p1);
        nodesToDrawAngle.add(selectedObject.object.p2);
    }
    nodesToDrawAngle.forEach(node => drawAngleSymbol(node));

    if (rooms.length > 0) {
        ctx2d.textAlign = "center";
        rooms.forEach((room) => {
            if (!room.center || !Array.isArray(room.center) || room.center.length < 2) return;
            const baseNameFontSize = 18, baseAreaFontSize = 14;
            const baseNameYOffset = showDimensions ? 10 : 0;
            const nameYOffset = baseNameYOffset / zoom;

            ctx2d.fillStyle = room.name === 'TANIMSIZ' ? '#e57373' : '#8ab4f8';

            let nameFontSize = zoom > 1 ? baseNameFontSize / zoom : baseNameFontSize;
            ctx2d.font = `500 ${Math.max(3 / zoom, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            ctx2d.textBaseline = showDimensions ? "bottom" : "middle";
            ctx2d.fillText(room.name, room.center[0], room.center[1] - nameYOffset);

            if (showDimensions) {
                ctx2d.fillStyle = "#8ab4f8";
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
            const bodyHitoleranceSq = (WALL_THICKNESS * 1.5) ** 2;
            for (const w of [...walls].reverse()) {
                const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
                if (distSq < bodyHitoleranceSq && distSq < minDistSq) {
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

    // DUVAR SÜRÜKLEMEDE KOMŞU DUVARLARIN BOYUTLARINI VE AÇILARINI GÖSTER
    if (isDragging && selectedObject?.type === "wall" && selectedObject.handle === "body") {
        const wallsBeingMoved = selectedGroup.length > 0 ? selectedGroup : [selectedObject.object];
        const nodesBeingMoved = new Set();
        wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });
        
        // Komşu duvarları bul (taşınmayan ama taşınan düğümlere bağlı olanlar)
        const neighborWalls = walls.filter(w => {
            if (wallsBeingMoved.includes(w)) return false;
            return nodesBeingMoved.has(w.p1) || nodesBeingMoved.has(w.p2);
        });
        
        // Komşu duvarların boyutlarını göster
        neighborWalls.forEach(wall => {
            drawDimension(wall.p1, wall.p2, true);
        });
        
        // Komşu duvarların köşe açılarını göster
        nodesBeingMoved.forEach(node => {
            drawAngleSymbol(node);
        });
    }

    if (showDimensions) { walls.forEach((w) => { const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w); drawDimension(w.p1, w.p2, false); }); }
    else if (!isDragging && selectedObject?.type === "wall") { drawDimension(selectedObject.object.p1, selectedObject.object.p2, true); }
    if (isDragging && affectedWalls.length > 0) { affectedWalls.forEach((wall) => { drawDimension(wall.p1, wall.p2, true); }); }

    if (isDragging && selectedObject?.type === "wall") {
        drawDimension(selectedObject.object.p1, selectedObject.object.p2, true);
    }

    if (isSweeping && sweepWalls.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)";
        ctx2d.lineWidth = 2;
        ctx2d.setLineDash([6, 6]);
        ctx2d.beginPath();
        sweepWalls.forEach(wall => {
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
        });
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    }

    if (selectedObject?.type === "wall" && !isDragging) {
        const w = selectedObject.object;
        ctx2d.fillStyle = "#ffffff";
        ctx2d.beginPath(); ctx2d.arc(w.p1.x, w.p1.y, 3, 0, 2 * Math.PI); ctx2d.fill();
        ctx2d.beginPath(); ctx2d.arc(w.p2.x, w.p2.y, 3, 0, 2 * Math.PI); ctx2d.fill();
    }

    if (startPoint) {
        ctx2d.strokeStyle = "#8ab4f8"; ctx2d.lineWidth = 2; ctx2d.setLineDash([6, 3]);

        let previewPos = { x: mousePos.x, y: mousePos.y };

        if (currentMode === "drawRoom") {
            ctx2d.strokeRect(startPoint.x, startPoint.y, previewPos.x - startPoint.x, previewPos.y - startPoint.y);
            drawDimension(startPoint, { x: previewPos.x, y: startPoint.y }, true);
            drawDimension({ x: previewPos.x, y: startPoint.y }, previewPos, true);
        } else if (currentMode === "drawWall") {
            previewPos = snapTo15DegreeAngle(startPoint, previewPos);

            ctx2d.beginPath();
            ctx2d.moveTo(startPoint.x, startPoint.y);
            ctx2d.lineTo(previewPos.x, previewPos.y);
            ctx2d.stroke();
            
            drawDimension(startPoint, previewPos, true);
        }
        ctx2d.setLineDash([]);
    }

    if (isStretchDragging) {
        const displacementVec = { x: mousePos.x - dragStartPoint.x, y: mousePos.y - dragStartPoint.y };
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
            });
            mousePos.snapLines.v_origins.forEach(origin => {
                const p2 = { x: origin.x, y: mousePos.y };
                ctx2d.moveTo(origin.x, origin.y);
                ctx2d.lineTo(p2.x, p2.y);
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