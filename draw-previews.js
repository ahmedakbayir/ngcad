// ahmedakbayir/ngcad/ngcad-57ad1e9e29c68ba90143525c3fd3ac20a130f44e/draw-previews.js
import { state, dom } from './main.js';
// import { getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow } from './actions.js'; // <-- BU SATIRI SİLİN
import { getDoorPlacement, isSpaceForDoor } from './door-handler.js'; // <-- BU SATIRI EKLEYİN
import { getWindowPlacement, isSpaceForWindow } from './window-handler.js'; // <-- BU SATIRI EKLEYİN
import { drawDoorSymbol, drawWindowSymbol, isMouseOverWall } from './renderer2d.js';
import { drawDimension } from './dimensions.js';
import { distToSegmentSquared, snapTo15DegreeAngle } from './geometry.js';

export function drawObjectPlacementPreviews(ctx2d, state, getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, drawDoorSymbol, drawWindowSymbol) {
    const { currentMode, isPanning, isDragging, walls, mousePos } = state;

    // Kapı önizlemesi
    if (currentMode === "drawDoor" && !isPanning && !isDragging) {
        const doorsToPreview = [];

        let closestWall = null, minDistSq = Infinity;
        const bodyHitTolerance = (state.wallThickness * 1.5) ** 2;
        
        for (const w of [...walls].reverse()) {
            const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
            if (distSq < bodyHitTolerance && distSq < minDistSq) {
                minDistSq = distSq;
                closestWall = w;
            }
        }
        
        if (closestWall) {
            const previewDoor = getDoorPlacement(closestWall, mousePos);
            if (previewDoor && isSpaceForDoor(previewDoor)) {
                doorsToPreview.push(previewDoor);
            }
        }

        doorsToPreview.forEach(door => {
            drawDoorSymbol(door, true);
        });
    }

    // Pencere önizlemesi
    if (currentMode === "drawWindow" && !isPanning && !isDragging) {
        let closestWall = null, minDistSq = Infinity;
        const bodyHitTolerance = (state.wallThickness * 1.5) ** 2;
        
        for (const w of [...walls].reverse()) {
            if (!w.p1 || !w.p2) continue;
            const distSq = distToSegmentSquared(mousePos, w.p1, w.p2);
            if (distSq < bodyHitTolerance && distSq < minDistSq) {
                minDistSq = distSq;
                closestWall = w;
            }
        }
        
        if (closestWall) {
            const previewWindowData = getWindowPlacement(closestWall, mousePos);
            if (previewWindowData && isSpaceForWindow(previewWindowData)) {
                const tempWindow = { pos: previewWindowData.pos, width: previewWindowData.width };
                drawWindowSymbol(closestWall, tempWindow, true);
            }
        }
    }
}

export function drawDragPreviews(ctx2d, state, drawDimension) {
    const { isStretchDragging, stretchWallOrigin, dragStartPoint, mousePos, isSweeping, sweepWalls, zoom } = state;
    
    // Sweep duvarları
    if (isSweeping && sweepWalls.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)";
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.setLineDash([6 / zoom, 6 / zoom]);
        ctx2d.beginPath();
        sweepWalls.forEach(wall => {
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
        });
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    }
    
    // Esnetme modu önizlemesi
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
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.7)"; 
        ctx2d.lineWidth = 2 / zoom; 
        ctx2d.setLineDash([6 / zoom, 3 / zoom]);
        ctx2d.beginPath();
        ctx2d.moveTo(stretchWallOrigin.p1.x, stretchWallOrigin.p1.y); ctx2d.lineTo(t1.x, t1.y);
        ctx2d.moveTo(stretchWallOrigin.p2.x, stretchWallOrigin.p2.y); ctx2d.lineTo(t2.x, t2.y);
        ctx2d.moveTo(t1.x, t1.y); ctx2d.lineTo(t2.x, t2.y);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
        drawDimension(t1, t2, true, 'single');
        drawDimension(stretchWallOrigin.p1, t1, true, 'single');
        drawDimension(stretchWallOrigin.p2, t2, true, 'single');
    }
}

export function drawSelectionFeedback(ctx2d, state) {
    const { selectedObject, isDragging, zoom } = state;
    
    // Seçili duvar uç noktaları
    if (selectedObject?.type === "wall" && !isDragging) {
        const w = selectedObject.object;
        ctx2d.fillStyle = "#ffffff";
        ctx2d.beginPath(); ctx2d.arc(w.p1.x, w.p1.y, 3 / zoom, 0, 2 * Math.PI); ctx2d.fill();
        ctx2d.beginPath(); ctx2d.arc(w.p2.x, w.p2.y, 3 / zoom, 0, 2 * Math.PI); ctx2d.fill();
    }
}

export function drawDrawingPreviews(ctx2d, state, snapTo15DegreeAngle, drawDimension) {
    const { startPoint, currentMode, mousePos, zoom } = state;
    
    // Çizim modu önizlemeleri
    if (startPoint) {
        ctx2d.strokeStyle = "#8ab4f8"; 
        ctx2d.lineWidth = 2 / zoom; 
        ctx2d.setLineDash([6 / zoom, 3 / zoom]);

        let previewPos = { x: mousePos.x, y: mousePos.y };

        // <-- DEĞİŞİKLİK BURADA: "drawColumn" modu eklendi -->
        if (currentMode === "drawRoom" || currentMode === "drawColumn") {
            ctx2d.strokeRect(startPoint.x, startPoint.y, previewPos.x - startPoint.x, previewPos.y - startPoint.y);
            drawDimension(startPoint, { x: previewPos.x, y: startPoint.y }, true, 'single');
            drawDimension({ x: previewPos.x, y: startPoint.y }, previewPos, true, 'single');
        } else if (currentMode === "drawWall") {
            if (mousePos.isSnapped) {
                previewPos = { x: mousePos.x, y: mousePos.y };
            } else {
                previewPos = snapTo15DegreeAngle(startPoint, previewPos);
            }

            ctx2d.beginPath();
            ctx2d.moveTo(startPoint.x, startPoint.y);
            ctx2d.lineTo(previewPos.x, previewPos.y);
            ctx2d.stroke();
            
            drawDimension(startPoint, previewPos, true, 'single');
        }
        ctx2d.setLineDash([]);
    }
}
export function drawSnapFeedback(ctx2d, state, isMouseOverWall) {
    const { currentMode, mousePos, isDragging, selectedObject, zoom, startPoint } = state;
    
    // Snap uzantı çizgileri
    const isDrawingMode = currentMode === 'drawWall' || currentMode === 'drawRoom';
    if (isDrawingMode && mousePos.isSnapped) {
        const hasExtensionLines = mousePos.snapLines.h_origins.length > 0 || mousePos.snapLines.v_origins.length > 0;
        if (!startPoint && hasExtensionLines && !isMouseOverWall()) {
            ctx2d.strokeStyle = "rgba(138,180,248,.5)";
            ctx2d.lineWidth = 1 / zoom;
            ctx2d.setLineDash([4 / zoom, 4 / zoom]);
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

    // Snap noktası gösterimi - SADECE ÇİZİM MODLARINDA GÖSTER
    if (mousePos.isSnapped && 
        (currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawColumn') && 
        currentMode !== 'drawDoor' && 
        currentMode !== 'drawWindow' && 
        !(isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window'))) {
        
        const snapRadius = 4 / zoom;
        const color = "#8ab4f8";
        
        ctx2d.fillStyle = color;
        
        ctx2d.beginPath();
        ctx2d.arc(mousePos.x, mousePos.y, snapRadius, 0, Math.PI * 2);
        ctx2d.fill();
    }
}