// pointer-down.js
import { state, dom, setState, setMode } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists as geometryWallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { update3DScene } from './scene3d.js'; // Doğru yerden import
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint } from './actions.js';
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from './columns.js';
import { createBeam, onPointerDown as onPointerDownBeam } from './beams.js';
import { createStairs, onPointerDown as onPointerDownStairs, recalculateStepCount } from './stairs.js';
import { onPointerDownDraw as onPointerDownDrawWall, onPointerDownSelect as onPointerDownSelectWall } from './wall-handler.js';
import { onPointerDownDraw as onPointerDownDrawDoor, onPointerDownSelect as onPointerDownSelectDoor } from './door-handler.js';
import { onPointerDownDraw as onPointerDownDrawWindow, onPointerDownSelect as onPointerDownSelectWindow } from './window-handler.js';

export function onPointerDown(e) {
    if (e.target !== dom.c2d) return;
    if (e.button === 1) { setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } }); return; }
    if (e.button === 2) return;

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let snappedPos = getSmartSnapPoint(e);

    let needsUpdate3D = false; // 3D güncelleme bayrağı
    let objectJustCreated = false; // Yeni bir nesne oluşturuldu mu flag'i (Seçimi temizlemek için)

    if (state.currentMode === "select") {
        if (state.isEditingLength) { cancelLengthEdit(); return; }
        const clickedObject = getObjectAtPoint(pos); // Tıklanan nesneyi al
        // Silme modu (Ctrl+Alt) başlangıcı pointer-move içinde kontrol ediliyor, burada sadece Ctrl+Alt basılı mı diye bakıyoruz
        if (e.altKey && e.ctrlKey && !e.shiftKey) { setState({ isCtrlDeleting: true }); return; }

        // Önceki seçimi temizle (Bu, tıklama boşluğa gelirse veya yeni nesne seçilirse önceki seçimin kalkmasını sağlar)
        setState({ selectedObject: null, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map(), dragAxis: null, isSweeping: false, sweepWalls: [], dragOffset: { x: 0, y: 0 }, columnRotationOffset: null });

        // Tıklanan nesne varsa seçili yap
        if (clickedObject) {
            if (clickedObject.type === 'room') {
                setState({ selectedRoom: clickedObject.object }); // Oda seçimi farklı state'te tutuluyor
            } else if (clickedObject.type === 'roomName' || clickedObject.type === 'roomArea') {
                 setState({ isDraggingRoomName: clickedObject.object, roomDragStartPos: { x: pos.x, y: pos.y }, roomOriginalCenter: [...clickedObject.object.center] });
                 // Oda ismi/alanı sürüklenecekse selectedObject null kalmalı
            } else {
                 // Diğer nesneler için seçimi ayarla
                 setState({ selectedObject: clickedObject, selectedRoom: null }); // selectedRoom'u temizle

                 // Sürükleme için başlangıç bilgilerini ayarla
                 let dragInfo = { startPointForDragging: pos, dragOffset: { x: 0, y: 0 }, additionalState: {} };
                 switch (clickedObject.type) {
                     case 'column': dragInfo = onPointerDownColumn(clickedObject, pos, snappedPos); break;
                     case 'beam': dragInfo = onPointerDownBeam(clickedObject, pos, snappedPos); break;
                     case 'stairs': dragInfo = onPointerDownStairs(clickedObject, pos, snappedPos); break;
                     case 'wall': dragInfo = onPointerDownSelectWall(clickedObject, pos, snappedPos, e); break;
                     case 'door': dragInfo = onPointerDownSelectDoor(clickedObject, pos); break;
                     case 'window': dragInfo = onPointerDownSelectWindow(clickedObject, pos); break;
                     case 'vent':
                         const vent = clickedObject.object; const wall = clickedObject.wall;
                         if (wall && wall.p1 && wall.p2) {
                             const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                             if (wallLen > 0.1) {
                                 const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
                                 const ventCenterX = wall.p1.x + dx * vent.pos; const ventCenterY = wall.p1.y + dy * vent.pos;
                                 dragInfo.startPointForDragging = { x: ventCenterX, y: ventCenterY };
                                 dragInfo.dragOffset = { x: ventCenterX - pos.x, y: ventCenterY - pos.y };
                             }
                         }
                         break;
                 }
                 setState({ isDragging: true, dragStartPoint: dragInfo.startPointForDragging, initialDragPoint: { x: pos.x, y: pos.y }, dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId }, dragOffset: dragInfo.dragOffset, ...(dragInfo.additionalState || {}) });
            }
        } else {
            // Boşluğa tıklandıysa oda seçimini de temizle
            setState({ selectedRoom: null });
        }


    } else if (state.currentMode === "drawWall" || state.currentMode === "drawRoom") {
        const geometryChanged = onPointerDownDrawWall(snappedPos);
        if (geometryChanged) {
            needsUpdate3D = true;
            objectJustCreated = true;
             // Duvar çizimi devam etmiyorsa (startPoint null olduysa) seçimi temizle
             if (!state.startPoint) setState({ selectedObject: null });
        }
    } else if (state.currentMode === "drawDoor") {
        const clickedObject = getObjectAtPoint(pos);
        const added = onPointerDownDrawDoor(pos, clickedObject);
        if(added) {
            needsUpdate3D = true;
            objectJustCreated = true;
            // Kapı ekledikten sonra seçimi TEMİZLE
            setState({ selectedObject: null });
        }
    } else if (state.currentMode === "drawWindow") {
        const clickedObject = getObjectAtPoint(pos);
        const added = onPointerDownDrawWindow(pos, clickedObject);
         if(added) {
             needsUpdate3D = true;
             objectJustCreated = true;
             // Pencere ekledikten sonra seçimi TEMİZLE
             setState({ selectedObject: null });
         }
    } else if (state.currentMode === "drawColumn") {
         if (!state.startPoint) {
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
         } else {
             const p1 = state.startPoint;
             const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
             if (Math.abs(p1.x - p2.x) > 1 && Math.abs(p1.y - p2.y) > 1) {
                 const centerX = (p1.x + p2.x) / 2; const centerY = (p1.y + p2.y) / 2;
                 const width = Math.abs(p1.x - p2.x); const height = Math.abs(p1.y - p2.y);
                 const newColumn = createColumn(centerX, centerY, 0);
                 newColumn.width = width; newColumn.height = height;
                 newColumn.size = Math.max(width, height); newColumn.rotation = 0;
                 state.columns.push(newColumn);
                 saveState(); // Önce kaydet
                 needsUpdate3D = true;
                 objectJustCreated = true; // Bayrağı ayarla
             }
             setState({ startPoint: null });
         }
    } else if (state.currentMode === "drawBeam") {
         if (!state.startPoint) {
             setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
         } else {
             const p1 = state.startPoint;
             const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
             const dx = p2.x - p1.x; const dy = p2.y - p1.y;
             const length = Math.hypot(dx, dy);
             if (length > 1) {
                 const centerX = (p1.x + p2.x) / 2; const centerY = (p1.y + p2.y) / 2;
                 const width = length; const height = state.wallThickness;
                 const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                 const newBeam = createBeam(centerX, centerY, width, height, rotation);
                 state.beams.push(newBeam);
                 saveState(); // Önce kaydet
                 needsUpdate3D = true;
                 objectJustCreated = true; // Bayrağı ayarla
             }
             setState({ startPoint: null });
         }
    } else if (state.currentMode === "drawStairs") {
         if (!state.startPoint) {
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
         } else {
             const p1 = state.startPoint;
             const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
             const width = Math.abs(p1.x - p2.x);
             const height = Math.abs(p1.y - p2.y);

             if (width > 10 && height > 10) {
                 const centerX = (p1.x + p2.x) / 2;
                 const centerY = (p1.y + p2.y) / 2;
                 const rotation = 0;
                 const newStairs = createStairs(centerX, centerY, width, height, rotation);

                 state.stairs.push(newStairs);
                 saveState(); // Önce kaydet
                 needsUpdate3D = true;
                 objectJustCreated = true; // Bayrağı ayarla
             }
             setState({ startPoint: null });
         }
    } else if (state.currentMode === "drawVent") {
        let closestWall = null; let minDistSq = Infinity;
        const bodyHitTolerance = state.wallThickness * 1.5;
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
                     saveState(); // Önce kaydet
                     objectJustCreated = true; // Bayrağı ayarla
                     // No 3D update for vents
                 }
             }
         }
    }

    // Eğer yeni bir nesne oluşturulduysa (ve mod 'select' değilse), seçimi temizle
    // Bu işlem saveState'den sonra yapılmalı
    if (objectJustCreated && state.currentMode !== "select") {
        setState({ selectedObject: null });
    }


    // --- Fonksiyon sonunda 3D güncellemesini kontrol et ve gecikmeli çağır ---
    if (needsUpdate3D && dom.mainContainer.classList.contains('show-3d')) {
        // Kısa bir gecikme ekleyerek state güncellemelerinin tamamlanmasını bekle
        setTimeout(update3DScene, 0);
    }
    // --- YENİ SONU ---
}