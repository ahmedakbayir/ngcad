import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
// 'distToSegmentSquared' fonksiyonunu geometry.js'den import et
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists as geometryWallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint } from './actions.js';
// 'isPointInColumn' fonksiyonunu da columns.js'den import et
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from './columns.js';
import { onPointerDownDraw as onPointerDownDrawWall, onPointerDownSelect as onPointerDownSelectWall } from './wall-handler.js';
import { onPointerDownDraw as onPointerDownDrawDoor, onPointerDownSelect as onPointerDownSelectDoor } from './door-handler.js';
import { onPointerDownDraw as onPointerDownDrawWindow, onPointerDownSelect as onPointerDownSelectWindow } from './window-handler.js';
// TODO: Vent (Menfez) için de benzer handler'lar eklenebilir.

export function onPointerDown(e) {
    if (e.target !== dom.c2d) return;
    if (e.button === 1) {
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        return;
    }
    if (e.button === 2) return;

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let snappedPos = getSmartSnapPoint(e);

    if (state.currentMode === "select") {
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }

        const selectedObject = getObjectAtPoint(pos);

        // Alt tuşu ile silme modu (kolonlar hariç)
        if (e.altKey && !e.shiftKey && !e.ctrlKey) {
            if (selectedObject?.type !== 'column' && state.selectedObject?.type !== 'column') {
                setState({ isCtrlDeleting: true });
                return;
            }
        }

        // Oda seçimi ve isim sürükleme
        if (selectedObject && selectedObject.type === 'room') {
            setState({ selectedRoom: selectedObject.object, selectedObject: null });
        } else if (!selectedObject) {
            setState({ selectedRoom: null });
        }
        if (selectedObject && (selectedObject.type === 'roomName' || selectedObject.type === 'roomArea')) {
            setState({
                isDraggingRoomName: selectedObject.object,
                roomDragStartPos: { x: pos.x, y: pos.y },
                roomOriginalCenter: [...selectedObject.object.center],
                selectedObject: null
            });
            return;
        }

        // Sürükleme için genel state sıfırlaması
        setState({
            selectedObject,
            selectedGroup: [],
            affectedWalls: [],
            preDragWallStates: new Map(),
            preDragNodeStates: new Map(),
            dragAxis: null,
            isSweeping: false,
            sweepWalls: [],
            dragOffset: { x: 0, y: 0 },
            columnRotationOffset: null
        });

        // Nesne seçildiyse, ilgili handler'ı çağır
        if (selectedObject) {
            let dragInfo = { startPointForDragging: pos, dragOffset: { x: 0, y: 0 }, additionalState: {} };

            switch (selectedObject.type) {
                case 'column':
                    dragInfo = onPointerDownColumn(selectedObject, pos, snappedPos);
                    break;
                case 'wall':
                    dragInfo = onPointerDownSelectWall(selectedObject, pos, snappedPos, e);
                    break;
                case 'door':
                    dragInfo = onPointerDownSelectDoor(selectedObject, pos);
                    break;
                case 'window':
                    dragInfo = onPointerDownSelectWindow(selectedObject, pos);
                    break;
                case 'vent':
                    // TODO: onPointerDownSelectVent(selectedObject, pos);
                    // Şimdilik varsayılan mantığı kullan
                    const vent = selectedObject.object;
                    const wall = selectedObject.wall;
                    if (wall && wall.p1 && wall.p2) {
                        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (wallLen > 0.1) {
                            const dx = (wall.p2.x - wall.p1.x) / wallLen;
                            const dy = (wall.p2.y - wall.p1.y) / wallLen;
                            const ventCenterX = wall.p1.x + dx * vent.pos;
                            const ventCenterY = wall.p1.y + dy * vent.pos;
                            dragInfo.startPointForDragging = { x: ventCenterX, y: ventCenterY };
                            dragInfo.dragOffset = { x: ventCenterX - pos.x, y: ventCenterY - pos.y };
                        }
                    }
                    break;
            }

            // Sürükleme state'ini başlat
            setState({
                isDragging: true,
                dragStartPoint: dragInfo.startPointForDragging,
                initialDragPoint: { x: pos.x, y: pos.y },
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
                dragOffset: dragInfo.dragOffset,
                ...(dragInfo.additionalState || {}) // Handler'dan gelen ek state'leri (örn: columnRotationOffset) ekle
            });
        }
    } else if (state.currentMode === "drawWall" || state.currentMode === "drawRoom") {
        onPointerDownDrawWall(snappedPos);
    } else if (state.currentMode === "drawDoor") {
        const clickedObject = getObjectAtPoint(pos);
        onPointerDownDrawDoor(pos, clickedObject);
    } else if (state.currentMode === "drawWindow") {
        const clickedObject = getObjectAtPoint(pos);
        onPointerDownDrawWindow(pos, clickedObject);
    } else if (state.currentMode === "drawColumn") {
        // Kolon oluşturma mantığı (pointer-down.js'ten taşındı)
        let clickedOnExistingColumn = null;
        for (const col of [...state.columns].reverse()) {
            if (isPointInColumn(pos, col)) {
                clickedOnExistingColumn = col;
                break;
            }
        }

        let finalX = snappedPos.roundedX;
        let finalY = snappedPos.roundedY;
        const newColSize = 40;
        const newHalfSize = newColSize / 2;
        let newRotation = 0;

        if (clickedOnExistingColumn) {
            // Mevcut kolonun yanına yerleştir
            const rot = (clickedOnExistingColumn.rotation || 0) * Math.PI / 180;
            const cosRot = Math.cos(rot);
            const sinRot = Math.sin(rot);
            const existingHalfWidth = (clickedOnExistingColumn.width || clickedOnExistingColumn.size) / 2;
            const offset = existingHalfWidth + newHalfSize + 1;
            const worldOffsetX = offset * cosRot;
            const worldOffsetY = offset * sinRot;
            finalX = clickedOnExistingColumn.center.x + worldOffsetX;
            finalY = clickedOnExistingColumn.center.y + worldOffsetY;
            newRotation = clickedOnExistingColumn.rotation || 0;
        } else {
            // Duvara snap kontrolü
            let closestWall = null;
            let minDistSq = Infinity;
            const wallSnapTolerance = (WALL_THICKNESS / 2) + 1;
            for (const wall of state.walls) {
                if (!wall.p1 || !wall.p2) continue;
                const distSq = distToSegmentSquared(pos, wall.p1, wall.p2);
                if (distSq < wallSnapTolerance * wallSnapTolerance && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestWall = wall;
                }
            }

            if (closestWall) {
                // Duvara snap oldu, "iç" tarafı bul ve yerleştir
                const wall = closestWall;
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const length = Math.hypot(dx, dy);
                if (length > 0.1) {
                    const nx = -dy / length; const ny = dx / length;
                    const l2 = dx*dx + dy*dy;
                    
                    const distSqSnapToWall = distToSegmentSquared(snappedPos, wall.p1, wall.p2);
                    let wallSnapX, wallSnapY;
                    
                    if (distSqSnapToWall < wallSnapTolerance * wallSnapTolerance) {
                         const t_snap = ((snappedPos.x - wall.p1.x) * dx + (snappedPos.y - wall.p1.y) * dy) / l2;
                         const t_snap_clamped = Math.max(0, Math.min(1, t_snap));
                         wallSnapX = wall.p1.x + t_snap_clamped * dx;
                         wallSnapY = wall.p1.y + t_snap_clamped * dy;
                    } else {
                        const t = ((pos.x - wall.p1.x) * dx + (pos.y - wall.p1.y) * dy) / l2;
                        const t_clamped = Math.max(0, Math.min(1, t));
                        wallSnapX = wall.p1.x + t_clamped * dx;
                        wallSnapY = wall.p1.y + t_clamped * dy;
                    }

                    const testDist = 5.0;
                    const p_test1 = { x: wallSnapX + nx * testDist, y: wallSnapY + ny * testDist };
                    const p_test2 = { x: wallSnapX - nx * testDist, y: wallSnapY - ny * testDist };
                    let is_p1_inside = false, is_p2_inside = false;

                    for (const room of state.rooms) {
                        if (!room.polygon || !room.polygon.geometry) continue;
                        if (turf.booleanPointInPolygon([p_test1.x, p_test1.y], room.polygon)) is_p1_inside = true;
                        if (turf.booleanPointInPolygon([p_test2.x, p_test2.y], room.polygon)) is_p2_inside = true;
                    }

                    let offsetX = 0, offsetY = 0;
                    if (is_p1_inside && !is_p2_inside) {
                        offsetX = nx * newHalfSize; offsetY = ny * newHalfSize;
                    } else if (is_p2_inside && !is_p1_inside) {
                        offsetX = -nx * newHalfSize; offsetY = -ny * newHalfSize;
                    } else {
                        offsetX = nx * newHalfSize; offsetY = ny * newHalfSize;
                    }
                    
                    finalX = wallSnapX + offsetX;
                    finalY = wallSnapY + offsetY;
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    newRotation = Math.round(angle / 15) * 15;
                }
            }
        }
        
        const newColumn = createColumn(finalX, finalY, newColSize);
        newColumn.rotation = newRotation;
        state.columns.push(newColumn);
        saveState();
    } else if (state.currentMode === "drawVent") {
        // TODO: `vent-handler.js` oluşturulup mantık oraya taşınabilir.
        // Şimdilik `pointer-down.js` içindeki mantık korunuyor.
        let closestWall = null; let minDistSq = Infinity;
        const bodyHitTolerance = WALL_THICKNESS * 1.5;
         for (const w of [...state.walls].reverse()) {
             if (!w.p1 || !w.p2) continue;
             const p1 = w.p1, p2 = w.p2; const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2; if(l2 < 0.1) continue;
             const d = distToSegmentSquared(snappedPos, p1, p2);
             if (d < bodyHitTolerance**2 && d < minDistSq) { minDistSq = d; closestWall = w; }
         }
         if(closestWall) {
            const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
            const ventWidth = 40; const ventMargin = 10;
            if (wallLen >= ventWidth + 2 * ventMargin) {
                 const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                 const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                 const ventPos = t * wallLen;
                 if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                     if (!closestWall.vents) closestWall.vents = [];
                     closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                     saveState();
                 }
             }
         }
    }
}