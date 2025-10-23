// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/pointer-move.js
// GÜNCELLENMİŞ: Bu dosya artık sadece bir yönlendiricidir.

import { state, dom, setState } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { processWalls } from './wall-processor.js';
import { currentModifierKeys } from './input.js';
// <-- DEĞİŞİKLİK BURADA: isPointInColumn eklendi -->
import { onPointerMove as onPointerMoveColumn, getColumnAtPoint, isPointInColumn } from './columns.js';
// YENİ IMPORTLARI AŞAĞIYA EKLEYİN
import { onPointerMove as onPointerMoveBeam, getBeamAtPoint, isPointInBeam } from './beams.js';
import { onPointerMove as onPointerMoveStairs, getStairAtPoint, isPointInStair } from './stairs.js'; // <-- MERDİVEN EKLENDİ
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
    // isCtrlDeleting bloğu GÜNCELLENDİ (Merdiven silme eklendi)
    if (state.isCtrlDeleting && e.altKey && !e.ctrlKey) { // Sadece Alt basılıyken sil
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        let needsProcessing = false; // processWalls çağırmak gerekip gerekmediğini izle

        // Duvar silme
        const wallsToDelete = new Set();
        for (const wall of state.walls) {
             if (!wall.p1 || !wall.p2) continue; // Geçersiz duvarları atla
             const wallPx = wall.thickness || state.wallThickness;
             // Silme toleransını biraz artıralım
             const currentToleranceSq = (wallPx / 2 + 3 / state.zoom)**2;
             const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
             if (distSq < currentToleranceSq) {
                 wallsToDelete.add(wall);
             }
        }
        if (wallsToDelete.size > 0) {
            const wallsToDeleteArray = Array.from(wallsToDelete);
            const newWalls = state.walls.filter(w => !wallsToDeleteArray.includes(w));
            const newDoors = state.doors.filter(d => d.wall && !wallsToDeleteArray.includes(d.wall)); // d.wall kontrolü
            setState({ walls: newWalls, doors: newDoors });
            needsProcessing = true;
        }

        // Kolon silme
        const columnsToDelete = new Set();
        for (const column of state.columns) {
            if (isPointInColumn(mousePos, column)) {
                columnsToDelete.add(column);
            }
        }
        if (columnsToDelete.size > 0) {
            const columnsToDeleteArray = Array.from(columnsToDelete);
            const newColumns = state.columns.filter(c => !columnsToDeleteArray.includes(c));
            setState({ columns: newColumns });
            needsProcessing = true;
        }

        // Kiriş silme
        const beamsToDelete = new Set();
        for (const beam of (state.beams || [])) {
            if (isPointInBeam(mousePos, beam)) {
                beamsToDelete.add(beam);
            }
        }
        if (beamsToDelete.size > 0) {
            const beamsToDeleteArray = Array.from(beamsToDelete);
            const newBeams = state.beams.filter(b => !beamsToDeleteArray.includes(b));
            setState({ beams: newBeams });
            needsProcessing = true;
        }

        // Merdiven silme <-- YENİ EKLENDİ VE GÜNCELLENDİ
        const stairsToDelete = new Set();
        for (const stair of (state.stairs || [])) {
            if (isPointInStair(mousePos, stair)) {
                stairsToDelete.add(stair);
            }
        }
        if (stairsToDelete.size > 0) {
            const stairsToDeleteArray = Array.from(stairsToDelete);
            const newStairs = state.stairs.filter(s => !stairsToDeleteArray.includes(s));
            setState({ stairs: newStairs });
            needsProcessing = true;
        }

        // Eğer herhangi bir silme işlemi yapıldıysa processWalls çağır
        if (needsProcessing) {
            processWalls(); // Silme işlemi sonrası geometriyi güncelle
            // saveState() burada çağrılmamalı, pointerUp'ta çağrılacak
        }

        return; // Silme modundan sonra başka işlem yapma
    } else if (state.isCtrlDeleting && (!e.altKey || !e.ctrlKey)) {
        // Eğer tuşlar bırakıldıysa silme modunu bitir (input.js'deki onKeyUp'a ek olarak)
         setState({ isCtrlDeleting: false });
         // saveState(); // pointerUp'ta çağrılacak
         return; // Başka işlem yapma
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
        try { // Add try-catch for turf.bbox
            const bbox = turf.bbox(room.polygon);
            const bboxWidth = bbox[2] - bbox[0];
            const bboxHeight = bbox[3] - bbox[1];
            if (bboxWidth > 0 && bboxHeight > 0) {
                room.centerOffset = {
                    x: (newCenterX - bbox[0]) / bboxWidth,
                    y: (newCenterY - bbox[1]) / bboxHeight
                };
            }
        } catch (error) {
            console.error("Error calculating bbox for room name dragging:", error);
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
        update3DScene(); // Stretch dragging 3D'yi güncellesin
        updateMouseCursor();
        return;
    }

    // Sürükleme aktifse, ilgili handler'ı çağır
    if (state.isDragging && state.selectedObject) {
        switch (state.selectedObject.type) {
            case 'column':
                onPointerMoveColumn(snappedPos, unsnappedPos);
                break;
            case 'beam':
                onPointerMoveBeam(snappedPos, unsnappedPos);
                break;
            case 'stairs':
                onPointerMoveStairs(snappedPos, unsnappedPos);
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
                let closestWall = null; let minDistSq = Infinity; const bodyHitTolerance = state.wallThickness * 2;
                for (const w of state.walls) {
                    if (!w.p1 || !w.p2) continue; // Check added
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
                            if (oldWall && oldWall.vents) oldWall.vents = oldWall.vents.filter(v => v !== vent); // oldWall check
                            if (!closestWall.vents) closestWall.vents = [];
                            closestWall.vents.push(vent);
                            state.selectedObject.wall = closestWall; // Update selected object's wall reference
                        }
                    }
                }
                break;
        }
        // Sadece sürükleme varsa 3D'yi güncelle
        update3DScene();
    }

    updateMouseCursor();
}

/**
 * Mouse imlecini duruma göre günceller.
 */
function updateMouseCursor() {
    const { c2d, p2d } = dom; // p2d'yi de alalım
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, zoom } = state;

    // Sınıfları p2d üzerinden temizleyelim
    p2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node', 'rotate-mode',
                         'select-mode', 'drawWall-mode', 'drawRoom-mode', 'drawDoor-mode', 'drawWindow-mode',
                         'drawColumn-mode', 'drawBeam-mode', 'drawStairs-mode'); // Tüm mod sınıfları
    c2d.style.cursor = ''; // Canvas'ın cursor stilini sıfırla

    // Ctrl+Alt silme modu için özel cursor
    if (state.isCtrlDeleting && currentModifierKeys.alt && currentModifierKeys.ctrl) {
        c2d.style.cursor = 'crosshair'; // veya 'cell' gibi farklı bir cursor
        return;
    }


    if (state.isDraggingRoomName || isPanning) {
        // Pan/oda ismi sürüklerken cursor'ı doğrudan canvas'a verelim
        c2d.style.cursor = 'grabbing';
        return;
    }

    if (isDragging) {
        // Kolon, Kiriş veya Merdiven döndürme/boyutlandırma
        if (selectedObject?.type === 'column' || selectedObject?.type === 'beam' || selectedObject?.type === 'stairs') { // <-- "stairs" EKLEYİN
            if (selectedObject.handle?.startsWith('corner_')) {
                p2d.classList.add('rotate-mode'); // Sınıfı p2d'ye ekle
                return;
            }
            if (selectedObject.handle?.startsWith('edge_')) {
                const edgeHandle = selectedObject.handle;
                const rotation = selectedObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize'; // Varsayılan

                // Merdiven kenarları için cursor tipi (Kolon/Kiriş ile aynı mantık)
                 if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') { // 'height' (en)
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
                 } else { // 'width' (uzunluk)
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize';
                 }

                c2d.style.cursor = cursorType;
                return;
            }
        }
        // Genel sürükleme cursor'ı
        c2d.style.cursor = 'grabbing';
        return;
    }

    // Hover durumları (Sürükleme yokken)
    // Kolon hover
    const hoveredColumnObject = getColumnAtPoint(mousePos);
    if (hoveredColumnObject) {
        const handle = hoveredColumnObject.handle;
        if (handle.startsWith('corner_')) {
            p2d.classList.add('rotate-mode');
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

    // Kiriş hover
    const hoveredBeamObject = getBeamAtPoint(mousePos);
    if (hoveredBeamObject) {
        const handle = hoveredBeamObject.handle;
        if (handle.startsWith('corner_')) {
            p2d.classList.add('rotate-mode');
            return;
        }
        if (handle.startsWith('edge_')) {
            const rotation = hoveredBeamObject.object.rotation || 0;
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

    // Merdiven hover <-- YENİ EKLENDİ
    const hoveredStairObject = getStairAtPoint(mousePos);
    if (hoveredStairObject) {
        const handle = hoveredStairObject.handle;
        if (handle.startsWith('corner_')) {
            p2d.classList.add('rotate-mode');
            return;
        }
        if (handle.startsWith('edge_')) {
            const rotation = hoveredStairObject.object.rotation || 0;
            const angleDeg = Math.abs(rotation % 180);
            let cursorType = 'ew-resize';
             if (handle === 'edge_top' || handle === 'edge_bottom') { // 'height' (en)
                cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
             } else { // 'width' (uzunluk)
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


    // Diğer hover durumları için sınıfları p2d'ye ekleyelim
    const isDraggingDoorOrWindow = isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window');
    const showSnap = (currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawColumn' || currentMode === 'drawBeam' || currentMode === 'drawStairs') || // <-- "drawStairs" EKLEYİN
                     (isDragging && selectedObject?.type === 'wall' && selectedObject.handle !== 'body');

    if (!isDraggingDoorOrWindow && mousePos.isSnapped && !isDragging && showSnap) {
        p2d.classList.add('near-snap'); // Snap sınıfını p2d'ye
        return;
    }

    if (currentMode === 'select') {
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            p2d.classList.add('over-node'); // Node sınıfını p2d'ye
            return;
        }

        for (const w of state.walls) {
             if (!w.p1 || !w.p2) continue; // Eklendi: Geçersiz duvarları atlama
            const wallPx = w.thickness || state.wallThickness;
            // Toleransı biraz artıralım, özellikle kalın duvarlarda daha iyi olur
            const bodyHitToleranceSq = (wallPx / 2 + 2 / zoom)**2; // +2 piksel tolerans
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
                 // Uçlara çok yakın değilse duvar gövdesi üzerindedir
                 const d1Sq = (mousePos.x - w.p1.x)**2 + (mousePos.y - w.p1.y)**2;
                 const d2Sq = (mousePos.x - w.p2.x)**2 + (mousePos.y - w.p2.y)**2;
                 const nearEndpointToleranceSq = (8 / zoom) ** 2; // Node yakalama toleransı ile aynı
                 if(d1Sq > nearEndpointToleranceSq && d2Sq > nearEndpointToleranceSq) {
                    p2d.classList.add('over-wall'); // Duvar sınıfını p2d'ye
                    return;
                 }
            }
        }
    }

     // Hiçbir özel durum yoksa, modu temel alan varsayılan cursor'ı ayarla (p2d üzerinden)
     if (currentMode === 'select') p2d.classList.add('select-mode');
     else if (currentMode === 'drawWall') p2d.classList.add('drawWall-mode');
     else if (currentMode === 'drawRoom') p2d.classList.add('drawRoom-mode');
     else if (currentMode === 'drawDoor') p2d.classList.add('drawDoor-mode');
     else if (currentMode === 'drawWindow') { /* window için özel class yok */ }
     else if (currentMode === 'drawColumn') p2d.classList.add('drawColumn-mode');
     else if (currentMode === 'drawBeam') p2d.classList.add('drawBeam-mode');
     else if (currentMode === 'drawStairs') p2d.classList.add('drawStairs-mode'); // <-- YENİ SATIRI EKLEYİN

}