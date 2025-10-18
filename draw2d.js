// ahmedakbayir/ngcad/ngcad-a6b637b86b5133ae889a41590ba89e209f647ee8/draw2d.js
// ÜZERİNE SADECE PENCERE ÖNİZLEME EKLENDİ

import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, snapTo15DegreeAngle } from './geometry.js';
// getWindowPlacement ve isSpaceForWindow import edildi
import { getDoorPlacement, isSpaceForDoor, getObjectAtPoint, getWindowPlacement, isSpaceForWindow } from './actions.js';
import { drawAngleSymbol, drawDoorSymbol, drawGrid, isMouseOverWall, drawWindowSymbol, drawVentSymbol, drawColumnSymbol, drawNodeWallCount } from './renderer2d.js';
import { drawDimension, drawTotalDimensions, drawOuterDimensions } from './dimensions.js';

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
    const gStr = (g.toString(16).length < 2) ? '0' + g.toString(16) : g.toString(16); // Düzeltme
    const bStr = (b.toString(16).length < 2) ? '0' + b.toString(16) : b.toString(16); // Düzeltme
    return `#${rStr}${gStr}${bStr}`;
}

export function draw2D() {
    const { ctx2d, c2d } = dom;
    const {
        panOffset, zoom, rooms, roomFillColor, walls, doors, selectedObject,
        selectedGroup, wallBorderColor, lineThickness, dimensionMode,
        affectedWalls, startPoint, currentMode, mousePos,
        isStretchDragging, stretchWallOrigin, dragStartPoint, isDragging, isPanning,
        isSweeping, sweepWalls, nodes, selectedRoom, dimensionOptions, draggedRoomInfo
    } = state;

    ctx2d.fillStyle = BG;
    ctx2d.fillRect(0, 0, c2d.width, c2d.height);
    ctx2d.save();
    ctx2d.translate(panOffset.x, panOffset.y);
    ctx2d.scale(zoom, zoom);
    ctx2d.lineWidth = 1 / zoom;

    drawGrid();

    // Sürüklenen geçici mahal poligonlarını çiz
    if (isDragging && draggedRoomInfo.length > 0) {
        draggedRoomInfo.forEach(info => {
            const { tempPolygon } = info;
            if (!tempPolygon || !tempPolygon.geometry || !tempPolygon.geometry.coordinates || tempPolygon.geometry.coordinates.length === 0) return;
            const coords = tempPolygon.geometry.coordinates[0];
            if (coords && coords.length >= 3) {
                ctx2d.fillStyle = darkenColor(roomFillColor, 20);
                ctx2d.strokeStyle = "rgba(138, 180, 248, 0.5)";
                ctx2d.lineWidth = 2 / zoom;
                ctx2d.beginPath();
                ctx2d.moveTo(coords[0][0], coords[0][1]);
                for (let i = 1; i < coords.length; i++) {
                    ctx2d.lineTo(coords[i][0], coords[i][1]);
                }
                ctx2d.closePath();
                ctx2d.fill();
                ctx2d.stroke();
            }
        });
    }

    const draggedRooms = isDragging && draggedRoomInfo.length > 0
        ? new Set(draggedRoomInfo.map(info => info.room))
        : new Set();

    if (rooms.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.3)";
        ctx2d.lineWidth = 1 / zoom;
        rooms.forEach((room) => {
            if (draggedRooms.has(room)) return;
            if (!room.polygon || !room.polygon.geometry || !room.polygon.geometry.coordinates || room.polygon.geometry.coordinates.length === 0) return;
            const coords = room.polygon.geometry.coordinates[0]; if (!coords || coords.length < 3) return;
            ctx2d.fillStyle = room === selectedRoom ? darkenColor(roomFillColor, 20) : roomFillColor;
            ctx2d.beginPath();
            ctx2d.moveTo(coords[0][0], coords[0][1]);
            for (let i = 1; i < coords.length; i++) ctx2d.lineTo(coords[i][0], coords[i][1]);
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.stroke();
        });
    }

    const wallPx = WALL_THICKNESS;
    ctx2d.lineJoin = "miter";
    ctx2d.miterLimit = 10;
    ctx2d.lineCap = "square"; // Önemli!

    const segmentGroups = {
        normal: { ortho: [], nonOrtho: [], selected: [] },
        balcony: { ortho: [], nonOrtho: [], selected: [] },
        glass: { ortho: [], nonOrtho: [], selected: [] },
        half: { ortho: [], nonOrtho: [], selected: [] }
    };

    walls.forEach((w) => {
        if (!w || !w.p1 || !w.p2) return;
        const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w);
        const isOrthogonal = Math.abs(w.p1.x - w.p2.x) < 0.1 || Math.abs(w.p1.y - w.p2.y) < 0.1;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        if (wallLen < 0.1) return;

        // Kapıları ve Pencereleri birleştir
        const openings = [
            ...(doors.filter(d => d.wall === w).map(d => ({ type: 'door', pos: d.pos, width: d.width }))),
            ...(w.windows || []).map(win => ({ type: 'window', pos: win.pos, width: win.width })) // Pencereleri de dahil et
        ].sort((a, b) => a.pos - b.pos);


        let currentSegments = [];
        let lastPos = 0;

        openings.forEach(opening => {
            const openingStart = opening.pos - opening.width / 2;
            if (openingStart > lastPos + 0.1) {
                currentSegments.push({ start: lastPos, end: openingStart });
            }
            lastPos = opening.pos + opening.width / 2;
        });


        if (lastPos < wallLen - 0.1) {
            currentSegments.push({ start: lastPos, end: wallLen });
        }

        const dx = (w.p2.x - w.p1.x) / wallLen, dy = (w.p2.y - w.p1.y) / wallLen;
        const halfWallPx = (w.thickness || wallPx) / 2; // Duvarın kendi kalınlığını kullan

        const wallType = w.wallType || 'normal';
        let targetList = segmentGroups[wallType];
        if (!targetList) targetList = segmentGroups.normal;

        currentSegments.forEach((seg) => {
            let p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            let p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };

            // Bu kısım kaldırıldı, lineCap halledecek
            // if (seg.start > 0) { p1.x += dx * halfWallPx; p1.y += dy * halfWallPx; }
            // if (seg.end < wallLen) { p2.x -= dx * halfWallPx; p2.y -= dy * halfWallPx; }

            const segmentData = { p1, p2, wall: w };

            if (isSelected) targetList.selected.push(segmentData);
            else if (isOrthogonal) targetList.ortho.push(segmentData);
            else targetList.nonOrtho.push(segmentData);
        });
    });

    // --- ORİJİNAL drawNormalSegments ---
    const drawNormalSegments = (segmentList, color) => {
        if (segmentList.length === 0) return;

        ctx2d.beginPath();
        segmentList.forEach((seg) => {
            if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 0.1) { // Çok kısa segmentleri atla
                ctx2d.moveTo(seg.p1.x, seg.p1.y);
                ctx2d.lineTo(seg.p2.x, seg.p2.y);
            }
        });
        const thickness = segmentList[0]?.wall?.thickness || wallPx; // Segmentin duvarından kalınlığı al
        ctx2d.lineWidth = thickness;
        ctx2d.strokeStyle = color;
        ctx2d.stroke();

        ctx2d.beginPath();
        segmentList.forEach((seg) => {
            if (Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y) >= 0.1) {
                ctx2d.moveTo(seg.p1.x, seg.p1.y);
                ctx2d.lineTo(seg.p2.x, seg.p2.y);
            }
        });
        const innerPx = Math.max(0.5 / zoom, thickness - lineThickness); // min 0.5 piksel
        ctx2d.lineWidth = innerPx;
        ctx2d.strokeStyle = BG;
        ctx2d.stroke();
    };
    // Diğer çizim fonksiyonları (glass, balcony, half) orijinaldeki gibi
     const drawGlassSegments = (segmentList, color) => {
         if (segmentList.length === 0) return;
         const thickness = segmentList[0]?.wall?.thickness || wallPx;
         const spacing = Math.min(4 / zoom, thickness * 0.1);
         ctx2d.strokeStyle = color;
         ctx2d.lineWidth = lineThickness / 2 / zoom; // İnce çizgi
         segmentList.forEach((seg) => {
             const wall = seg.wall; if(!wall || !wall.p1 || !wall.p2) return;
             const dx = seg.p2.x - seg.p1.x; const dy = seg.p2.y - seg.p1.y; const length = Math.hypot(dx, dy); if (length < 0.1) return;
             const dirX = dx / length; const dirY = dy / length; const normalX = -dirY; const normalY = dirX;
             const offset = thickness / 2 - spacing;
             ctx2d.beginPath();
             ctx2d.moveTo(seg.p1.x + normalX * offset, seg.p1.y + normalY * offset);
             ctx2d.lineTo(seg.p2.x + normalX * offset, seg.p2.y + normalY * offset);
             ctx2d.moveTo(seg.p1.x - normalX * offset, seg.p1.y - normalY * offset);
             ctx2d.lineTo(seg.p2.x - normalX * offset, seg.p2.y - normalY * offset);
             ctx2d.stroke();
             // Bağlantı çizgileri
             const connectionSpacing = Math.max(15, 30 / zoom);
             const numConnections = Math.floor(length / connectionSpacing);
             if (numConnections > 0) {
                 ctx2d.beginPath();
                 for (let i = 0; i <= numConnections; i++) {
                     const t = i / numConnections; if(t > 1) continue;
                     const midX = seg.p1.x + dirX * length * t; const midY = seg.p1.y + dirY * length * t;
                     ctx2d.moveTo(midX + normalX * offset, midY + normalY * offset);
                     ctx2d.lineTo(midX - normalX * offset, midY - normalY * offset);
                 }
                 ctx2d.stroke();
             }
         });
    };
    const drawBalconySegments = (segmentList, color) => {
         if (segmentList.length === 0) return;
         ctx2d.strokeStyle = color;
         ctx2d.lineWidth = lineThickness / 2 / zoom; // İnce çizgi
         ctx2d.beginPath();
         segmentList.forEach((seg) => {
             const len = Math.hypot(seg.p1.x - seg.p2.x, seg.p1.y - seg.p2.y);
             if (len >= 0.1) {
                 ctx2d.moveTo(seg.p1.x, seg.p1.y); ctx2d.lineTo(seg.p2.x, seg.p2.y);
             }
         });
         ctx2d.stroke();
    };
    const drawHalfSegments = (segmentList, color) => {
         if (segmentList.length === 0) return;
         ctx2d.strokeStyle = color;
         ctx2d.fillStyle = "rgba(231, 230, 208, 0.3)";
         ctx2d.lineWidth = 1 / zoom; // Çok ince çizgi
         segmentList.forEach((seg) => {
             const wall = seg.wall; if(!wall || !wall.p1 || !wall.p2) return;
             const dx = seg.p2.x - seg.p1.x; const dy = seg.p2.y - seg.p1.y; const length = Math.hypot(dx, dy); if (length < 1) return;
             const dirX = dx / length; const dirY = dy / length; const normalX = -dirY; const normalY = dirX;
             const thickness = wall.thickness || wallPx;
             const brickHeight = thickness;
             const brickWidth = 20; // cm
             const numBricks = Math.max(1, Math.floor(length / brickWidth));
             const actualBrickWidth = length / numBricks;
             for (let i = 0; i < numBricks; i++) {
                 const startT = i * actualBrickWidth; const endT = (i + 1) * actualBrickWidth;
                 const brick1 = { x: seg.p1.x + dirX * startT, y: seg.p1.y + dirY * startT };
                 const brick2 = { x: seg.p1.x + dirX * endT, y: seg.p1.y + dirY * endT };
                 const corner1 = { x: brick1.x - normalX * brickHeight / 2, y: brick1.y - normalY * brickHeight / 2 };
                 const corner2 = { x: brick1.x + normalX * brickHeight / 2, y: brick1.y + normalY * brickHeight / 2 };
                 const corner3 = { x: brick2.x + normalX * brickHeight / 2, y: brick2.y + normalY * brickHeight / 2 };
                 const corner4 = { x: brick2.x - normalX * brickHeight / 2, y: brick2.y - normalY * brickHeight / 2 };
                 ctx2d.beginPath();
                 ctx2d.moveTo(corner1.x, corner1.y); ctx2d.lineTo(corner2.x, corner2.y); ctx2d.lineTo(corner3.x, corner3.y); ctx2d.lineTo(corner4.x, corner4.y);
                 ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
             }
         });
    };

    // Segmentleri çiz
    drawNormalSegments(segmentGroups.normal.ortho, wallBorderColor);
    drawNormalSegments(segmentGroups.normal.nonOrtho, "#e57373");
    drawNormalSegments(segmentGroups.normal.selected, "#8ab4f8");
    drawBalconySegments(segmentGroups.balcony.ortho, wallBorderColor);
    drawBalconySegments(segmentGroups.balcony.nonOrtho, "#e57373");
    drawBalconySegments(segmentGroups.balcony.selected, "#8ab4f8");
    drawGlassSegments(segmentGroups.glass.ortho, wallBorderColor);
    drawGlassSegments(segmentGroups.glass.nonOrtho, "#e57373");
    drawGlassSegments(segmentGroups.glass.selected, "#8ab4f8");
    drawHalfSegments(segmentGroups.half.ortho, wallBorderColor);
    drawHalfSegments(segmentGroups.half.nonOrtho, "#e57373");
    drawHalfSegments(segmentGroups.half.selected, "#8ab4f8");
    // --- Duvar Çizimi Sonu ---


    nodes.forEach(node => { drawNodeWallCount(node); });


    // Mahal isimleri ve alanları
    if (rooms.length > 0) {
        ctx2d.textAlign = "center";
        const hoveredObject = currentMode === 'select' && !isDragging ? getObjectAtPoint(mousePos) : null;
        const hoveredRoom = (hoveredObject?.type === 'roomName' || hoveredObject?.type === 'roomArea') ? hoveredObject.object : null;
        rooms.forEach((room) => {
             if (draggedRooms.has(room)) return;
             if (!room.center || !Array.isArray(room.center) || room.center.length < 2) return;
             const baseNameFontSize = 18, baseAreaFontSize = 14;
             const showAreaOption = dimensionOptions.showArea;
             const showArea = (showAreaOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) || (showAreaOption === 2 && dimensionMode === 1) || (showAreaOption === 3 && dimensionMode === 2);
             const baseNameYOffset = showArea ? 10 : 0;
             const nameYOffset = baseNameYOffset / zoom;
             const isHovered = hoveredRoom === room;
             if (isHovered) { ctx2d.shadowColor = 'rgba(138, 180, 248, 0.6)'; ctx2d.shadowBlur = 8; }
             ctx2d.fillStyle = room.name === 'MAHAL' ? '#e57373' : '#8ab4f8';
             let nameFontSize = Math.max(3, baseNameFontSize / zoom);
             ctx2d.font = `500 ${nameFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
             const nameParts = room.name.split(' ');
             ctx2d.textBaseline = "middle";
             if (nameParts.length === 2) {
                 const lineGap = nameFontSize * 1.2;
                 ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - nameYOffset - lineGap/2);
                 ctx2d.fillText(nameParts[1], room.center[0], room.center[1] - nameYOffset + lineGap/2);
             } else {
                 ctx2d.fillText(room.name, room.center[0], room.center[1] - nameYOffset);
             }
             if (showArea) {
                 ctx2d.fillStyle = '#e57373';
                 let areaFontSize = Math.max(2, baseAreaFontSize / zoom);
                 ctx2d.font = `400 ${areaFontSize}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
                 ctx2d.textBaseline = "middle";
                 const text = `${room.area.toFixed(2)} m²`;
                 const areaYOffset = nameParts.length === 2 ? nameFontSize * 1.5 : nameFontSize * 1.1;
                 ctx2d.fillText(text, room.center[0], room.center[1] - nameYOffset + areaYOffset);
             }
             if (isHovered) { ctx2d.shadowColor = 'transparent'; ctx2d.shadowBlur = 0; }
        });
    }
    // Sürüklenen mahal isimleri
    if (isDragging && draggedRoomInfo.length > 0) {
         draggedRoomInfo.forEach(info => { /* ... */ });
    }

    // Kapılar (Doğrudan renderer'dan çağrılır)
    doors.forEach((door) => {
        const isSelected = selectedObject?.type === "door" && selectedObject.object === door;
        drawDoorSymbol(door, false, isSelected);
    });

    // Pencereler (Doğrudan renderer'dan çağrılır)
    walls.forEach(wall => {
        if (wall.windows && wall.windows.length > 0) {
            wall.windows.forEach(window => {
                const isSelected = selectedObject?.type === "window" && selectedObject.object === window;
                drawWindowSymbol(wall, window, false, isSelected); // isPreview=false
            });
        }
    });

    // Menfezler
    walls.forEach(wall => {
        if (wall.vents && wall.vents.length > 0) {
            wall.vents.forEach(vent => {
                drawVentSymbol(wall, vent);
            });
        }
    });

    // Kolonlar
    nodes.forEach(node => { if (node.isColumn) drawColumnSymbol(node); });

    // --- ÖNİZLEMELER ---

    // Kapı Önizleme
    if (currentMode === "drawDoor" && !isPanning && !isDragging) {
        let closestWall = null, minDistSq = Infinity;
        const bodyHitTolerance = (WALL_THICKNESS * 1.5) ** 2;
        for (const w of [...walls].reverse()) {
             if (!w.p1 || !w.p2) continue;
             const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
             if (distSq < bodyHitTolerance && distSq < minDistSq) { minDistSq = distSq; closestWall = w; }
        }
        if (closestWall) {
            const previewDoor = getDoorPlacement(closestWall, mousePos);
            if (previewDoor && isSpaceForDoor(previewDoor)) {
                drawDoorSymbol(previewDoor, true); // isPreview = true
            }
        }
    }

    // Pencere Önizleme (YENİ EKLENDİ)
    if (currentMode === "drawWindow" && !isPanning && !isDragging) {
        let closestWall = null, minDistSq = Infinity;
        const bodyHitTolerance = (WALL_THICKNESS * 1.5) ** 2;
        for (const w of [...walls].reverse()) {
             if (!w.p1 || !w.p2) continue;
             // Önizleme için HAM mousePos kullanılır (snap kapalı)
             const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
             if (distSq < bodyHitTolerance && distSq < minDistSq) { minDistSq = distSq; closestWall = w; }
        }
        if (closestWall) {
            // Önizleme pozisyonunu HAM mousePos'a göre hesapla
            const previewWindowData = getWindowPlacement(closestWall, mousePos);
            if (previewWindowData && isSpaceForWindow(previewWindowData)) {
                const tempWindow = { pos: previewWindowData.pos, width: previewWindowData.width };
                drawWindowSymbol(closestWall, tempWindow, true); // isPreview = true
            }
        }
    }


    // Sürükleme sırasında komşu ölçüler
    if (isDragging && selectedObject?.type === "wall" && selectedObject.handle === "body") {
         const wallsBeingMoved = selectedGroup.length > 0 ? selectedGroup : [selectedObject.object];
         const nodesBeingMoved = new Set(); wallsBeingMoved.forEach(w => { if(w && w.p1 && w.p2) { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); } });
         const neighborWalls = walls.filter(w => w && w.p1 && w.p2 && !wallsBeingMoved.includes(w) && (nodesBeingMoved.has(w.p1) || nodesBeingMoved.has(w.p2)));
         neighborWalls.forEach(wall => { drawDimension(wall.p1, wall.p2, true, 'single'); });
    }

    // Ölçülendirme
    const wallAdjacency = state.wallAdjacency || new Map();
    if (dimensionMode === 1) { drawTotalDimensions(); }
    else if (dimensionMode === 2) { walls.forEach(w => { if (w && w.p1 && w.p2) drawDimension(w.p1, w.p2, false, 'single'); }); }
    drawOuterDimensions();

    // Seçili duvar ve komşularının ölçüleri
    if (isDragging && affectedWalls.length > 0 && (dimensionMode === 0 || dimensionMode === 1)) {
        affectedWalls.forEach((wall) => { if (wall && wall.p1 && wall.p2) drawDimension(wall.p1, wall.p2, true, 'single'); });
    } else if (!isDragging && selectedObject?.type === "wall") {
        const selectedWall = selectedObject.object;
        if (selectedWall && selectedWall.p1 && selectedWall.p2) {
            const adjacency = wallAdjacency.get(selectedWall);
            const isInteriorWall = adjacency > 1;
            const node1 = selectedWall.p1; const node2 = selectedWall.p2;
            walls.forEach(wall => {
                if (!wall || !wall.p1 || !wall.p2 || wall === selectedWall) return;
                if (wall.p1 === node1 || wall.p2 === node1 || wall.p1 === node2 || wall.p2 === node2) {
                    drawDimension(wall.p1, wall.p2, true, 'single');
                }
            });
            if (dimensionMode === 0 || (dimensionMode === 1 && isInteriorWall)) {
                 drawDimension(selectedWall.p1, selectedWall.p2, true, 'single');
            }
        }
    }

    // Sweep duvarları
    if (isSweeping && sweepWalls.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)"; ctx2d.lineWidth = 2 / zoom; ctx2d.setLineDash([6 / zoom, 6 / zoom]);
        ctx2d.beginPath();
        sweepWalls.forEach(wall => { if (wall && wall.p1 && wall.p2) { ctx2d.moveTo(wall.p1.x, wall.p1.y); ctx2d.lineTo(wall.p2.x, wall.p2.y); } });
        ctx2d.stroke(); ctx2d.setLineDash([]);
    }

    // Seçili duvar uç noktaları
    if (selectedObject?.type === "wall" && !isDragging) {
        const w = selectedObject.object;
        if (w && w.p1 && w.p2) {
            ctx2d.fillStyle = "#ffffff";
            const radius = 3 / zoom;
            ctx2d.beginPath(); ctx2d.arc(w.p1.x, w.p1.y, radius, 0, 2 * Math.PI); ctx2d.fill();
            ctx2d.beginPath(); ctx2d.arc(w.p2.x, w.p2.y, radius, 0, 2 * Math.PI); ctx2d.fill();
        }
    }

    // Çizim modu önizlemesi
    if (startPoint) {
        ctx2d.strokeStyle = "#8ab4f8"; ctx2d.lineWidth = 2 / zoom; ctx2d.setLineDash([6 / zoom, 3 / zoom]);
        let previewPos = { x: mousePos.x, y: mousePos.y }; // Snap'li veya snap'siz olabilir
        if (currentMode === "drawRoom") {
            // Oda önizlemesi için snap kullanmayabiliriz veya grid snap kullanabiliriz
            // previewPos = { x: mousePos.roundedX, y: mousePos.roundedY }; // Grid snap'li
            ctx2d.strokeRect(startPoint.x, startPoint.y, previewPos.x - startPoint.x, previewPos.y - startPoint.y);
            drawDimension(startPoint, { x: previewPos.x, y: startPoint.y }, true, 'single');
            drawDimension({ x: previewPos.x, y: startPoint.y }, previewPos, true, 'single');
        } else if (currentMode === "drawWall") {
            if (!mousePos.isSnapped || mousePos.snapType === 'GRID') { // Snap yoksa veya sadece grid ise açı snap uygula
                 previewPos = snapTo15DegreeAngle(startPoint, previewPos);
            }
            ctx2d.beginPath(); ctx2d.moveTo(startPoint.x, startPoint.y); ctx2d.lineTo(previewPos.x, previewPos.y); ctx2d.stroke();
            drawDimension(startPoint, previewPos, true, 'single');
        }
        ctx2d.setLineDash([]);
    }

    // Esnetme modu önizlemesi
    if (isStretchDragging) {
        if(stretchWallOrigin && stretchWallOrigin.p1 && stretchWallOrigin.p2 && dragStartPoint) {
            const displacementVec = { x: mousePos.x - dragStartPoint.x, y: mousePos.y - dragStartPoint.y };
            const wallVec = { x: stretchWallOrigin.p2.x - stretchWallOrigin.p1.x, y: stretchWallOrigin.p2.y - stretchWallOrigin.p1.y };
            const normalVec = { x: -wallVec.y, y: wallVec.x }; const len = Math.hypot(normalVec.x, normalVec.y);
            if (len > 0.1) { normalVec.x /= len; normalVec.y /= len; }
            const distance = displacementVec.x * normalVec.x + displacementVec.y * normalVec.y;
            const dx = distance * normalVec.x, dy = distance * normalVec.y;
            const t1 = { x: stretchWallOrigin.p1.x + dx, y: stretchWallOrigin.p1.y + dy };
            const t2 = { x: stretchWallOrigin.p2.x + dx, y: stretchWallOrigin.p2.y + dy };
            ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)"; ctx2d.lineWidth = 2 / zoom; ctx2d.setLineDash([6 / zoom, 3 / zoom]);
            ctx2d.beginPath();
            ctx2d.moveTo(stretchWallOrigin.p1.x, stretchWallOrigin.p1.y); ctx2d.lineTo(t1.x, t1.y);
            ctx2d.moveTo(stretchWallOrigin.p2.x, stretchWallOrigin.p2.y); ctx2d.lineTo(t2.x, t2.y);
            ctx2d.moveTo(t1.x, t1.y); ctx2d.lineTo(t2.x, t2.y);
            ctx2d.stroke(); ctx2d.setLineDash([]);
            drawDimension(t1, t2, true, 'single');
            drawDimension(stretchWallOrigin.p1, t1, true, 'single');
            drawDimension(stretchWallOrigin.p2, t2, true, 'single');
        }
    }

    // Snap çizgileri
    const isDrawingMode = currentMode === 'drawWall' || currentMode === 'drawRoom';
    if (isDrawingMode && mousePos.isSnapped && mousePos.snapType !== 'GRID') { // Sadece nokta/kesişim snap'leri için
        const hasExtensionLines = mousePos.snapLines.h_origins.length > 0 || mousePos.snapLines.v_origins.length > 0;
        if (!startPoint && hasExtensionLines && !isMouseOverWall()) {
            ctx2d.strokeStyle = "rgba(138,180,248,.5)"; ctx2d.lineWidth = 1 / zoom; ctx2d.setLineDash([4 / zoom, 4 / zoom]);
            ctx2d.beginPath();
            mousePos.snapLines.h_origins.forEach(origin => { if(origin) { const p2 = { x: mousePos.x, y: origin.y }; ctx2d.moveTo(origin.x, origin.y); ctx2d.lineTo(p2.x, p2.y); } });
            mousePos.snapLines.v_origins.forEach(origin => { if(origin) { const p2 = { x: origin.x, y: mousePos.y }; ctx2d.moveTo(origin.x, origin.y); ctx2d.lineTo(p2.x, p2.y); } });
            ctx2d.stroke(); ctx2d.setLineDash([]);
        }
    }

    // Snap noktası
    if (mousePos.isSnapped && mousePos.snapType !== 'GRID' && !(isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window'))) { // Grid snap için nokta gösterme
        const snapRadius = 4 / zoom; const color = "#8ab4f8";
        ctx2d.fillStyle = color; ctx2d.beginPath(); ctx2d.arc(mousePos.x, mousePos.y, snapRadius, 0, Math.PI * 2); ctx2d.fill();
    }

    ctx2d.restore(); // En sonda state'i restore et
}