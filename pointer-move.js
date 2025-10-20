// ahmedakbayir/ngcad/ngcad-54ad8bf2d516757e62115ea4acba62ce8c974e7f/pointer-move.js
// GÜNCELLENMİŞ: Bu dosya artık sadece bir yönlendiricidir.

import { state, dom, setState, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { processWalls } from './wall-processor.js';
import { currentModifierKeys } from './input.js';
import { onPointerMove as onPointerMoveColumn, getColumnAtPoint } from './columns.js';
import { onPointerMove as onPointerMoveWall } from './wall-handler.js';
import { onPointerMove as onPointerMoveDoor } from './door-handler.js';
import { onPointerMove as onPointerMoveWindow } from './window-handler.js';
// TODO: Vent (Menfez) için de benzer handler'lar eklenebilir.

// Helper: Verilen bir noktanın (genellikle kolon merkezi) bir duvar merkez çizgisine snap olup olmadığını kontrol eder.
// (Bu fonksiyon `columns.js` içinde `getSnappedWallInfo` olarak zaten mevcut, oradan import edilmeli)
// Şimdilik burada kopyalıyorum:
function getSnappedWallInfo(point, tolerance = 1.0) { // Tolerans: 1 cm
    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue;
        const distSq = distToSegmentSquared(point, wall.p1, wall.p2);
        if (distSq < tolerance * tolerance) {
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            const roundedAngle = Math.round(angle / 15) * 15;
            return { wall: wall, angle: roundedAngle };
        }
    }
    return null;
}

export function onPointerMove(e) {
    if (state.isCtrlDeleting) {
        // ... (silme mantığı - değişiklik yok)
        if (state.selectedObject?.type === 'column' && state.selectedObject?.handle.startsWith('corner_')) {
            setState({ isCtrlDeleting: false });
            return;
        }
        if (state.selectedObject?.type === 'column' && state.selectedObject?.handle?.startsWith('edge_')) {
             setState({ isCtrlDeleting: false });
             return;
        }
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const wallsToDelete = new Set();
        for (const wall of state.walls) {
             const wallPx = wall.thickness || WALL_THICKNESS;
             const currentToleranceSq = (wallPx / 2)**2;
            const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
            if (distSq < currentToleranceSq) {
                wallsToDelete.add(wall);
            }
        }
        if (wallsToDelete.size > 0) {
            const wallsToDeleteArray = Array.from(wallsToDelete);
            const newWalls = state.walls.filter(w => !wallsToDeleteArray.includes(w));
            const newDoors = state.doors.filter(d => !wallsToDeleteArray.includes(d.wall));
            setState({ walls: newWalls, doors: newDoors });
            processWalls();
        }
        return;
    }

    if (state.isDraggingRoomName) {
        // ... (oda ismi taşıma mantığı - değişiklik yok)
        const room = state.isDraggingRoomName;
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const mouseDeltaX = mousePos.x - state.roomDragStartPos.x;
        const mouseDeltaY = mousePos.y - state.roomDragStartPos.y;
        const newCenterX = state.roomOriginalCenter[0] + mouseDeltaX;
        const newCenterY = state.roomOriginalCenter[1] + mouseDeltaY;
        room.center = [newCenterX, newCenterY];
        const bbox = turf.bbox(room.polygon);
        const bboxWidth = bbox[2] - bbox[0];
        const bboxHeight = bbox[3] - bbox[1];
        if (bboxWidth > 0 && bboxHeight > 0) {
            room.centerOffset = {
                x: (newCenterX - bbox[0]) / bboxWidth,
                y: (newCenterY - bbox[1]) / bboxHeight
            };
        }
        return;
    }

    if (state.isPanning) {
        // ... (pan mantığı - değişiklik yok)
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) positionLengthInput();
        updateMouseCursor();
        return;
    }

    if (state.isDragging && !state.aDragOccurred) {
        if ((e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2 > 25) {
            setState({ aDragOccurred: true });
        }
    }

    let snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos });

    const rect = dom.c2d.getBoundingClientRect();
    const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (state.isStretchDragging) {
        update3DScene();
        updateMouseCursor();
        return;
    }

    // Sürükleme aktifse, ilgili handler'ı çağır
    if (state.isDragging && state.selectedObject) {
        switch (state.selectedObject.type) {
            case 'column':
                onPointerMoveColumn(snappedPos, unsnappedPos);
                break;
            case 'wall':
                onPointerMoveWall(snappedPos, unsnappedPos);
                break;
            case 'door':
                onPointerMoveDoor(unsnappedPos);
                break;
            case 'window':
                onPointerMoveWindow(unsnappedPos);
                break;
            case 'vent':
                // TODO: `vent-handler.js`'e taşınabilir.
                // Şimdilik `pointer-move.js` içindeki mantık korunuyor.
                const vent = state.selectedObject.object; const oldWall = state.selectedObject.wall;
                const targetX = unsnappedPos.x + state.dragOffset.x; const targetY = unsnappedPos.y + state.dragOffset.y; const targetPos = { x: targetX, y: targetY };
                let closestWall = null; let minDistSq = Infinity; const bodyHitTolerance = WALL_THICKNESS * 2;
                for (const w of state.walls) {
                    const d = distToSegmentSquared(targetPos, w.p1, w.p2);
                    if (d < bodyHitTolerance ** 2 && d < minDistSq) { minDistSq = d; closestWall = w; }
                }
                if (closestWall) {
                    const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                    const ventMargin = 15;
                    if (wallLen >= vent.width + 2 * ventMargin) {
                        const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                        const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                        const newPos = t * wallLen;
                        const minPos = vent.width / 2 + ventMargin; const maxPos = wallLen - vent.width / 2 + ventMargin;
                        vent.pos = Math.max(minPos, Math.min(maxPos, newPos));
                        if (oldWall !== closestWall) {
                            if (oldWall.vents) oldWall.vents = oldWall.vents.filter(v => v !== vent);
                            if (!closestWall.vents) closestWall.vents = [];
                            closestWall.vents.push(vent);
                            state.selectedObject.wall = closestWall;
                        }
                    }
                }
                break;
        }
        update3DScene();
    }

    updateMouseCursor();
}

/**
 * Mouse imlecini duruma göre günceller.
 * (Refactor edildi, artık `getColumnAtPoint`'i kullanıyor)
 */
function updateMouseCursor() {
    const { c2d } = dom;
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, zoom } = state;

    c2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node', 'rotate-mode');
    c2d.style.cursor = '';

    if (state.isDraggingRoomName || isPanning) {
        c2d.style.cursor = 'grabbing';
        return;
    }

    if (isDragging) {
        if (selectedObject?.type === 'column') {
            if (selectedObject.handle?.startsWith('corner_')) {
                c2d.classList.add('rotate-mode');
                return;
            }
            if (selectedObject.handle?.startsWith('edge_')) {
                const edgeHandle = selectedObject.handle;
                const rotation = selectedObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') {
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
                } else {
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize';
                }
                c2d.style.cursor = cursorType;
                return;
            }
        }
        c2d.style.cursor = 'grabbing';
        return;
    }
    
    // Hover durumları
    // Not: `getColumnAtPoint` `columns.js` dosyasından import edilmeli.
    const hoveredColumnObject = getColumnAtPoint(mousePos);
    if (hoveredColumnObject) {
        const handle = hoveredColumnObject.handle;
        if (handle.startsWith('corner_')) {
            c2d.classList.add('rotate-mode');
            return;
        }
        if (handle.startsWith('edge_')) {
            const rotation = hoveredColumnObject.object.rotation || 0;
            const angleDeg = Math.abs(rotation % 180);
            let cursorType = 'ew-resize';
            if (handle === 'edge_top' || handle === 'edge_bottom') {
                cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
            } else {
                cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize';
            }
            c2d.style.cursor = cursorType;
            return;
        }
        if (handle === 'body' && currentMode === 'select') {
            c2d.style.cursor = 'move';
            return;
        }
    }

    const isDraggingDoorOrWindow = isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window');
    const showSnap = (currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawColumn') ||
                     (isDragging && selectedObject?.type === 'wall' && selectedObject.handle !== 'body');

    if (!isDraggingDoorOrWindow && mousePos.isSnapped && !isDragging && showSnap) {
        c2d.classList.add('near-snap');
        return;
    }

    if (currentMode === 'select') {
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.classList.add('over-node');
            return;
        }
        
        for (const w of state.walls) {
            const wallPx = w.thickness || WALL_THICKNESS;
            const bodyHitToleranceSq = (wallPx / 2)**2;
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
                c2d.classList.add('over-wall');
                return;
            }
        }
    }
}