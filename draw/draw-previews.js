// ahmedakbayir/ngcad/ngcad-57ad1e9e29c68ba90143525c3fd3ac20a130f44e/draw-previews.js
import { drawDoorSymbol, drawWindowSymbol, isMouseOverWall } from './renderer2d.js';
import { distToSegmentSquared, snapTo15DegreeAngle, screenToWorld } from './geometry.js';
import { drawDimension } from './dimensions.js';
import { getDoorPlacement, isSpaceForDoor } from '../architectural-objects/door-handler.js';
import { getWindowPlacement, isSpaceForWindow } from '../architectural-objects/window-handler.js';
import { state, dom } from '../general-files/main.js';

export function drawObjectPlacementPreviews(ctx2d, state, getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, drawDoorSymbol, drawWindowSymbol) {
    const { currentMode, isPanning, isDragging, unsnappedMousePos } = state;

    // FLOOR ISOLATION: Sadece aktif kattaki duvarları kullan
    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId);

    // Snap uygulanmamış pozisyonu kullan (eğer yoksa snapli olanı kullan)
    const previewMousePos = unsnappedMousePos || state.mousePos;
    if (!previewMousePos) return; // Eğer fare pozisyonu yoksa çık

    // Kapı önizlemesi - SADECE duvara yakınsa göster
    if (currentMode === "drawDoor" && !isPanning && !isDragging) {
        const doorsToPreview = [];

        let closestWall = null, minDistSq = Infinity;
        // Daha sıkı tolerans: sadece duvar kalınlığı kadar
        const bodyHitTolerance = (state.wallThickness * 0.75) ** 2;

        for (const w of [...walls].reverse()) {
            const distSq = distToSegmentSquared(previewMousePos, w.p1, w.p2);
            if (distSq < bodyHitTolerance && distSq < minDistSq) {
                minDistSq = distSq;
                closestWall = w;
            }
        }

        if (closestWall) {
            const previewDoor = getDoorPlacement(closestWall, previewMousePos);
            if (previewDoor && isSpaceForDoor(previewDoor)) {
                doorsToPreview.push(previewDoor);
            }
        }

        doorsToPreview.forEach(door => {
            drawDoorSymbol(door, true);
        });
    }

    // Pencere önizlemesi - SADECE duvara yakınsa göster
    if (currentMode === "drawWindow" && !isPanning && !isDragging) {
        let closestWall = null, minDistSq = Infinity;
        // Daha sıkı tolerans: sadece duvar kalınlığı kadar
        const bodyHitTolerance = (state.wallThickness * 0.75) ** 2;

        for (const w of [...walls].reverse()) {
            if (!w.p1 || !w.p2) continue;
            const distSq = distToSegmentSquared(previewMousePos, w.p1, w.p2);
            if (distSq < bodyHitTolerance && distSq < minDistSq) {
                minDistSq = distSq;
                closestWall = w;
            }
        }

        if (closestWall) {
            const previewWindowData = getWindowPlacement(closestWall, previewMousePos);
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

        // <-- DEĞİŞİKLİK BURADA: "drawStairs" modu eklendi -->
        if (currentMode === "drawRoom" || currentMode === "drawColumn" || currentMode === "drawStairs") { //
            ctx2d.strokeRect(startPoint.x, startPoint.y, previewPos.x - startPoint.x, previewPos.y - startPoint.y); //
            drawDimension(startPoint, { x: previewPos.x, y: startPoint.y }, true, 'single'); //
            drawDimension({ x: previewPos.x, y: startPoint.y }, previewPos, true, 'single'); //
        } else if (currentMode === "drawWall" || currentMode === "drawBeam") { // <-- "drawBeam" EKLEYİN
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
        }else if (currentMode === "drawGuideAngular" || currentMode === "drawGuideFree") {
            ctx2d.strokeStyle = "rgba(255, 0, 0, 0.7)"; // Kırmızı rehber rengi
            ctx2d.lineWidth = 1.5 / zoom;
            ctx2d.setLineDash([4 / zoom, 4 / zoom]);

            previewPos = { x: mousePos.x, y: mousePos.y }; // Snaplenmiş pozisyonu kullanır (mousePos'tan gelir)

            ctx2d.beginPath();
            ctx2d.moveTo(startPoint.x, startPoint.y);
            
            let p_end = previewPos;

            if (currentMode === "drawGuideAngular") {
                // Çizgiyi ekranın dışına kadar uzat
                const dx = previewPos.x - startPoint.x;
                const dy = previewPos.y - startPoint.y;
                const len = Math.hypot(dx, dy);
                if (len > 0.1) {
                    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
                    const { x: worldRight, y: worldBottom } = screenToWorld(dom.c2d.width, dom.c2d.height);
                    const extend = Math.max(worldRight - worldLeft, worldBottom - worldTop) * 2;
                    
                    const p0 = { x: startPoint.x - (dx/len) * extend, y: startPoint.y - (dy/len) * extend };
                    p_end = { x: startPoint.x + (dx/len) * extend, y: startPoint.y + (dy/len) * extend };
                    ctx2d.moveTo(p0.x, p0.y); // Başlangıç noktasını da uzat
                }
            }
            
            ctx2d.lineTo(p_end.x, p_end.y);
            ctx2d.stroke();
            ctx2d.setLineDash([]);
        }
        ctx2d.setLineDash([]);
    }
}
export function drawSnapFeedback(ctx2d, state, isMouseOverWall) {
    const { currentMode, mousePos, isDragging, selectedObject, zoom, startPoint } = state;

    // Snap uzantı çizgileri
    const isDrawingMode = currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawBeam' || currentMode === 'drawStairs'; // <-- "drawStairs" EKLEYİN
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

    // Snap noktası gösterimi - ÇİZİM MODLARINDA VE SÜRÜKLEME SIRASINDA GÖSTER
    const isInDrawMode = (currentMode === 'drawWall' || currentMode === 'drawRoom' ||
                          currentMode === 'drawColumn' || currentMode === 'drawBeam' ||
                          currentMode === 'drawStairs');

    // Sürükleme sırasında da snap göster (door/window hariç)
    const isDraggingValidObject = isDragging && selectedObject &&
                                  !['door', 'window'].includes(selectedObject.type);

    if (mousePos.isSnapped &&
        (isInDrawMode || isDraggingValidObject) &&
        currentMode !== 'drawDoor' &&
        currentMode !== 'drawWindow') {

        const snapRadius = 4 / zoom;
        const color = "#8ab4f8";

        ctx2d.fillStyle = color;

        ctx2d.beginPath();
        ctx2d.arc(mousePos.x, mousePos.y, snapRadius, 0, Math.PI * 2);
        ctx2d.fill();
    }
}

/**
 * Simetri eksenini ve önizlemesini çizer
 */
export function drawSymmetryPreview(ctx2d, state) {
    const { symmetryAxisP1, symmetryAxisP2, symmetryPreviewElements, zoom, mousePos, currentMode } = state;
    
    // Simetri modundayken HER ZAMAN yeşil noktayı göster
    if (currentMode === "drawSymmetry") {
        if (!symmetryAxisP1) {
            // İlk nokta belirlenmemiş - mouse ucunda yeşil nokta
            ctx2d.fillStyle = "#24ffda";
            ctx2d.beginPath();
            ctx2d.arc(mousePos.x, mousePos.y, 3 / zoom, 0, Math.PI * 2);
            ctx2d.fill();
            
            // İç içe halka efekti
            ctx2d.strokeStyle = "#24ffda";
            ctx2d.lineWidth = 1 / zoom;
            ctx2d.beginPath();
            ctx2d.arc(mousePos.x, mousePos.y, 5 / zoom, 0, Math.PI * 2);
            ctx2d.stroke();
            
            return; // İlk nokta yoksa geri kalanı çizme
        }
    }
    
    // Eğer simetri modunda değilsek hiçbir şey çizme
    if (!symmetryAxisP1) return;
    
    // 2. Ekseni çiz
    if (symmetryAxisP2) {
        ctx2d.strokeStyle = "#24ffda";
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.setLineDash([8 / zoom, 4 / zoom]);
        ctx2d.beginPath();
        ctx2d.moveTo(symmetryAxisP1.x, symmetryAxisP1.y);
        ctx2d.lineTo(symmetryAxisP2.x, symmetryAxisP2.y);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
    }
    
    // 3. Eksen uç noktalarını çiz
    ctx2d.fillStyle = "#24ffda";
    ctx2d.beginPath();
    ctx2d.arc(symmetryAxisP1.x, symmetryAxisP1.y, 4 / zoom, 0, Math.PI * 2);
    ctx2d.fill();
    
    if (symmetryAxisP2) {
        ctx2d.beginPath();
        ctx2d.arc(symmetryAxisP2.x, symmetryAxisP2.y, 4 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
    }
    
    // 4. Önizleme elemanlarını çiz (yarı saydam)
    if (!symmetryPreviewElements || !symmetryAxisP2) return;
    
    ctx2d.globalAlpha = 0.5; // Biraz daha opak yaptık
    
    // Kolonları çiz
    if (symmetryPreviewElements.columns && symmetryPreviewElements.columns.length > 0) {
        symmetryPreviewElements.columns.forEach(col => {
            if (col.center) {
                const halfW = (col.width || col.size || 30) / 2;
                const halfH = (col.height || col.size || 30) / 2;
                const rot = (col.rotation || 0) * Math.PI / 180;
                
                ctx2d.fillStyle = "#8ab4f8";
                ctx2d.strokeStyle = "#8ab4f8";
                ctx2d.lineWidth = 2 / zoom;
                
                ctx2d.save();
                ctx2d.translate(col.center.x, col.center.y);
                ctx2d.rotate(rot);
                ctx2d.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
                ctx2d.restore();
            }
        });
    }
    
    // Kirişleri çiz
    if (symmetryPreviewElements.beams && symmetryPreviewElements.beams.length > 0) {
        symmetryPreviewElements.beams.forEach(beam => {
            if (beam.center) {
                const halfW = beam.width / 2;
                const halfH = beam.height / 2;
                const rot = (beam.rotation || 0) * Math.PI / 180;
                
                ctx2d.strokeStyle = "#8ab4f8";
                ctx2d.lineWidth = 2 / zoom;
                ctx2d.setLineDash([6 / zoom, 3 / zoom]);
                
                ctx2d.save();
                ctx2d.translate(beam.center.x, beam.center.y);
                ctx2d.rotate(rot);
                ctx2d.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
                ctx2d.restore();
                
                ctx2d.setLineDash([]);
            }
        });
    }
    
    // Merdivenleri çiz
    if (symmetryPreviewElements.stairs && symmetryPreviewElements.stairs.length > 0) {
        symmetryPreviewElements.stairs.forEach(stair => {
            if (stair.center) {
                const halfW = stair.width / 2;
                const halfH = stair.height / 2;
                const rot = (stair.rotation || 0) * Math.PI / 180;
                
                ctx2d.strokeStyle = "#8ab4f8";
                ctx2d.lineWidth = 2 / zoom;
                
                ctx2d.save();
                ctx2d.translate(stair.center.x, stair.center.y);
                ctx2d.rotate(rot);
                ctx2d.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
                ctx2d.restore();
            }
        });
    }
    
    // Duvarları çiz
    ctx2d.strokeStyle = "#8ab4f8";
    ctx2d.lineWidth = 2 / zoom;
    ctx2d.setLineDash([]);
    symmetryPreviewElements.walls.forEach(wall => {
        if (wall.p1 && wall.p2) {
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }
    });
    
    // Node'ları çiz
    ctx2d.fillStyle = "#8ab4f8";
    symmetryPreviewElements.nodes.forEach(node => {
        ctx2d.beginPath();
        ctx2d.arc(node.x, node.y, 3 / zoom, 0, Math.PI * 2);
        ctx2d.fill();
    });
    
    ctx2d.globalAlpha = 1.0;
}