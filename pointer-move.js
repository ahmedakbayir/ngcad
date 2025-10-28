
import { state, dom, setState } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { processWalls } from './wall-processor.js';
import { currentModifierKeys } from './input.js';
import { onPointerMove as onPointerMoveColumn, getColumnAtPoint, isPointInColumn } from './columns.js';
import { onPointerMove as onPointerMoveBeam, getBeamAtPoint, isPointInBeam } from './beams.js';
import { onPointerMove as onPointerMoveStairs, getStairAtPoint, isPointInStair } from './stairs.js';
import { onPointerMove as onPointerMoveWall } from './wall-handler.js';
import { onPointerMove as onPointerMoveDoor } from './door-handler.js';
import { onPointerMove as onPointerMoveWindow } from './window-handler.js';
import { calculateSymmetryPreview, calculateCopyPreview } from './symmetry.js'; // <-- BU SATIR OLMALI  

// Helper: Verilen bir noktanın duvar merkez çizgisine snap olup olmadığını kontrol eder.
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
    // Her fare hareketi başında geçici komşu duvar listesini temizle
    // (Eğer wall-handler.js içinde setState({tempNeighborWallsToDimension: ...}) çağrısı varsa bu gerekli)
    if (state.isDragging && state.selectedObject?.type === 'wall') {
        // Sadece duvar sürükleniyorsa temizle, diğer sürüklemeleri etkilemesin
        setState({ tempNeighborWallsToDimension: null });
    }

    // --- Silme Modu Kontrolü (Alt tuşu ile) ---
    if (state.isCtrlDeleting && e.altKey && !e.ctrlKey && !e.shiftKey) {
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        let needsProcessing = false;

        // Duvar silme
        const wallsToDelete = new Set();
        for (const wall of state.walls) {
             if (!wall.p1 || !wall.p2) continue;
             const wallPx = wall.thickness || state.wallThickness;
             const currentToleranceSq = (wallPx / 2 + 3 / state.zoom)**2;
             const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
             if (distSq < currentToleranceSq) {
                wallsToDelete.add(wall);
             }
        }
        if (wallsToDelete.size > 0) {
            const wallsToDeleteArray = Array.from(wallsToDelete);
            const newWalls = state.walls.filter(w => !wallsToDeleteArray.includes(w));
            const newDoors = state.doors.filter(d => d.wall && !wallsToDeleteArray.includes(d.wall));
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

        // Merdiven silme
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

        if (needsProcessing) {
            processWalls();
        }
        updateMouseCursor(); // İmleci güncelle (crosshair olmalı)
        return;
    } else if (state.isCtrlDeleting && (!e.altKey || e.ctrlKey || e.shiftKey)) {
        // Silme modunu bitir
         setState({ isCtrlDeleting: false });
         updateMouseCursor(); // İmleci normale döndür
         return;
    }
    // --- Silme Modu Kontrolü Sonu ---


    // Oda ismi sürükleme
    if (state.isDraggingRoomName) {
        const room = state.isDraggingRoomName;
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const mouseDeltaX = mousePos.x - state.roomDragStartPos.x;
        const mouseDeltaY = mousePos.y - state.roomDragStartPos.y;
        const newCenterX = state.roomOriginalCenter[0] + mouseDeltaX;
        const newCenterY = state.roomOriginalCenter[1] + mouseDeltaY;
        room.center = [newCenterX, newCenterY];
        try {
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
        // updateMouseCursor(); // Zaten grabbing ayarlı olmalı
        return;
    }

    // Pan
    if (state.isPanning) {
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) positionLengthInput();
        updateMouseCursor(); // İmleci güncelle (grabbing olmalı)
        return;
    }

    // Drag başladı mı kontrolü
    if (state.isDragging && !state.aDragOccurred) {
        if ((e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2 > 25) {
            setState({ aDragOccurred: true });
        }
    }

    // Fare pozisyonunu güncelle (snap ile)
    let snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos });

    // Snaplenmemiş pozisyonu al
    const rect = dom.c2d.getBoundingClientRect();
    const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    // Stretch dragging
    if (state.isStretchDragging) {
        // TODO: Stretch dragging mantığını buraya taşı veya ayrı fonksiyona çıkar
        update3DScene(); // Stretch dragging 3D'yi güncellesin
        updateMouseCursor(); // İmleci güncelle
        return;
    }



    // Normal Sürükleme
    if (state.isDragging && state.selectedObject) {
        // Nesne tipine göre ilgili onPointerMove fonksiyonunu çağır
        switch (state.selectedObject.type) {
            case 'column': onPointerMoveColumn(snappedPos, unsnappedPos); break;
            case 'beam':   onPointerMoveBeam(snappedPos, unsnappedPos);   break;
            case 'stairs': onPointerMoveStairs(snappedPos, unsnappedPos); break;
            case 'wall':   onPointerMoveWall(snappedPos, unsnappedPos);   break;
            case 'door':   onPointerMoveDoor(unsnappedPos);               break;
            case 'window': onPointerMoveWindow(unsnappedPos);             break;
            case 'vent':
                const vent = state.selectedObject.object; const oldWall = state.selectedObject.wall;
                const targetX = unsnappedPos.x + state.dragOffset.x; const targetY = unsnappedPos.y + state.dragOffset.y; const targetPos = { x: targetX, y: targetY };
                let closestWall = null; let minDistSq = Infinity; const bodyHitTolerance = state.wallThickness * 2;
                for (const w of state.walls) {
                    if (!w.p1 || !w.p2) continue;
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
                        const minPos = vent.width / 2 + ventMargin; const maxPos = wallLen - vent.width / 2 - ventMargin;
                        vent.pos = Math.max(minPos, Math.min(maxPos, newPos));
                        if (oldWall !== closestWall) {
                            if (oldWall && oldWall.vents) oldWall.vents = oldWall.vents.filter(v => v !== vent);
                            if (!closestWall.vents) closestWall.vents = [];
                            closestWall.vents.push(vent);
                            state.selectedObject.wall = closestWall;
                        }
                    }
                }
                break;
        }
        update3DScene(); // Sürükleme sonrası 3D'yi güncelle
    }
    if (state.currentMode === "drawSymmetry" && state.symmetryAxisP1) {
        // İkinci nokta mouse pozisyonu
        let axisP2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
        
        // SHIFT basılıysa DİK eksen yap
        if (currentModifierKeys.shift) {
            const dx = axisP2.x - state.symmetryAxisP1.x;
            const dy = axisP2.y - state.symmetryAxisP1.y;
            const distance = Math.hypot(dx, dy);
            
            if (distance > 1) {
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const snappedAngle = Math.round(angle / 90) * 90;
                const snappedAngleRad = snappedAngle * Math.PI / 180;
                
                axisP2 = {
                    x: state.symmetryAxisP1.x + distance * Math.cos(snappedAngleRad),
                    y: state.symmetryAxisP1.y + distance * Math.sin(snappedAngleRad)
                };
            }
        }
        
        setState({ symmetryAxisP2: axisP2 });
        
        // CTRL basılıysa kopya önizlemesi, değilse simetri önizlemesi
        if (currentModifierKeys.ctrl) {
            calculateCopyPreview(state.symmetryAxisP1, axisP2); // axisP1 değil, state.symmetryAxisP1
        } else {
            calculateSymmetryPreview(state.symmetryAxisP1, axisP2); // axisP1 değil, state.symmetryAxisP1
        }
    }
    // Her fare hareketinde imleci güncelle
    updateMouseCursor();
}

/**
 * Mouse imlecini duruma göre günceller. (Önce Mod Kontrolü)
 */
function updateMouseCursor() {
    const { c2d, p2d } = dom; // p2d'yi de alalım
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, zoom } = state;

    // Önceki sınıfları temizle (panel seviyesinde)
    p2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node', 'rotate-mode',
                         'select-mode', 'drawWall-mode', 'drawRoom-mode', 'drawDoor-mode', 'drawWindow-mode',
                         'drawColumn-mode', 'drawBeam-mode', 'drawStairs-mode');
    c2d.style.cursor = ''; // Canvas'ın stilini sıfırla

    // --- ÖNCELİK 1: Özel Durumlar (Silme, Pan, Drag) ---
    if (state.isCtrlDeleting && currentModifierKeys.alt && !currentModifierKeys.ctrl && !currentModifierKeys.shift) {
        c2d.style.cursor = 'crosshair';
        return;
    }
    if (state.isDraggingRoomName || isPanning) {
        c2d.style.cursor = 'grabbing';
        p2d.classList.add(isPanning ? 'panning' : 'dragging'); // İlgili sınıfı ekle
        return;
    }
    if (isDragging) {
        p2d.classList.add('dragging'); // Sürükleme sınıfını ekle
        // Sürüklenen nesneye göre özel imleçler (köşe/kenar)
        if (selectedObject?.type === 'column' || selectedObject?.type === 'beam' || selectedObject?.type === 'stairs') {
            if (selectedObject.handle?.startsWith('corner_')) {p2d.classList.add('rotate-mode'); return;
            }
            if (selectedObject.handle?.startsWith('edge_')) {
                // Boyutlandırma imlecini hesapla
                const edgeHandle = selectedObject.handle;
                const rotation = selectedObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize'; }
                else { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize'; }
                c2d.style.cursor = cursorType;
                return;
            }
        }
        // Diğer sürüklemeler için genel imleç
        c2d.style.cursor = 'grabbing';
        return;
    }

    // --- ÖNCELİK 2: Aktif Mod Çizim Modu mu? ---
    // Bu blok, çizim modundayken hover kontrollerini atlayıp doğru imleci ayarlar.
    if (currentMode === 'drawWall') {
        p2d.classList.add('drawWall-mode'); // CSS'deki özel SVG ikonu için sınıfı ekle
        // c2d.style.cursor = ''; // İmleci CSS yönetsin (SVG ikonlar için)
        return; // Hover kontrolü yapma
    }
    if (currentMode === 'drawRoom') {
        p2d.classList.add('drawRoom-mode'); // CSS'deki özel SVG ikonu için sınıfı ekle
        // c2d.style.cursor = ''; // İmleci CSS yönetsin (SVG ikonlar için)
        return; // Hover kontrolü yapma
    }
    if (currentMode === 'drawColumn' || currentMode === 'drawBeam' || currentMode === 'drawStairs') {
        c2d.style.cursor = 'crosshair'; // Bu modlar için crosshair
        p2d.classList.add(currentMode + '-mode'); // CSS'te de ayarlı, sınıfı ekleyelim
        return; // Hover kontrolü yapma
    }
    if (currentMode === 'drawDoor') {
        c2d.style.cursor = 'crosshair'; // Kapı için ok
        p2d.classList.add('drawDoor-mode');
        return; // Hover kontrolü yapma
    }
     if (currentMode === 'drawWindow') {
        c2d.style.cursor = 'crosshair'; // Pencere için crosshair
        p2d.classList.add('drawWindow-mode');
        return; // Hover kontrolü yapma
    }
    // TODO: drawVent modu için de benzer bir kontrol eklenebilir.
    if (currentMode === 'drawVent') {
         c2d.style.cursor = 'crosshair'; // Menfez için crosshair
         // p2d.classList.add('drawVent-mode'); // Eğer CSS'te varsa
         return; // Hover kontrolü yapma
    }

    // --- ÖNCELİK 3: Select Modu ve Hover Durumları ---
    if (currentMode === 'select') {
        p2d.classList.add('select-mode'); // Select modu sınıfını ekle

        // Kolon/Kiriş/Merdiven handle hover
        const hoveredColumnObject = getColumnAtPoint(mousePos);
        if (hoveredColumnObject && hoveredColumnObject.handle !== 'body') {
            if (hoveredColumnObject.handle.startsWith('corner_')) {  p2d.classList.add('rotate-mode'); return; }
            if (hoveredColumnObject.handle.startsWith('edge_')) {
                const edgeHandle = hoveredColumnObject.handle;
                const rotation = hoveredColumnObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize'; }
                else { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize'; }
                c2d.style.cursor = cursorType; return;
            }
        }
        const hoveredBeamObject = getBeamAtPoint(mousePos);
        if (hoveredBeamObject && hoveredBeamObject.handle !== 'body') {
            if (hoveredBeamObject.handle.startsWith('corner_')) {  p2d.classList.add('rotate-mode'); return; }
            if (hoveredBeamObject.handle.startsWith('edge_')) {
                const edgeHandle = hoveredBeamObject.handle;
                const rotation = hoveredBeamObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize'; }
                else { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize'; }
                c2d.style.cursor = cursorType; return;
            }
        }
        const hoveredStairObject = getStairAtPoint(mousePos);
        if (hoveredStairObject && hoveredStairObject.handle !== 'body') {
             if (hoveredStairObject.handle.startsWith('corner_')) {  p2d.classList.add('rotate-mode'); return; }
            if (hoveredStairObject.handle.startsWith('edge_')) {
                const edgeHandle = hoveredStairObject.handle;
                const rotation = hoveredStairObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize'; }
                else { cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize'; }
                c2d.style.cursor = cursorType; return;
            }
        }

        // Node hover
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.style.cursor = 'move';
            p2d.classList.add('over-node');
            return;
        }

        // Kolon/Kiriş/Merdiven gövdesi hover
        if (hoveredColumnObject && hoveredColumnObject.handle === 'body') { c2d.style.cursor = 'move'; return; }
        if (hoveredBeamObject && hoveredBeamObject.handle === 'body') { c2d.style.cursor = 'move'; return; }
        if (hoveredStairObject && hoveredStairObject.handle === 'body') { c2d.style.cursor = 'move'; return; }

        // Duvar gövdesi hover
        for (const w of state.walls) {
             if (!w.p1 || !w.p2) continue;
            const wallPx = w.thickness || state.wallThickness;
            const bodyHitToleranceSq = (wallPx / 2 + 2 / zoom)**2;
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
                 const d1Sq = (mousePos.x - w.p1.x)**2 + (mousePos.y - w.p1.y)**2;
                 const d2Sq = (mousePos.x - w.p2.x)**2 + (mousePos.y - w.p2.y)**2;
                 const nearEndpointToleranceSq = (8 / zoom) ** 2;
                 if(d1Sq > nearEndpointToleranceSq && d2Sq > nearEndpointToleranceSq) {
                    c2d.style.cursor = 'default'; // Duvar üzerinde ok
                    p2d.classList.add('over-wall'); // CSS sınıfını ekle (belki stil için lazım olur)
                    return;
                 }
            }
        }
        // TODO: Kapı/Pencere/Menfez gövdesi hover kontrolü eklenebilir (genelde default kalır)

        // Hiçbir şeyin üzerinde değilse varsayılan select imleci
        c2d.style.cursor = 'default';
        return;
    }

    // --- Diğer Tüm Durumlar ---
    // Eğer buraya gelinirse (bilinmeyen bir mod vb.), varsayılan imleci ayarla
    c2d.style.cursor = 'default';
}