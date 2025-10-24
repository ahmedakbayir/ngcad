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
    if (e.button === 1) { // Orta tuş ile pan
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        dom.p2d.classList.add('panning'); // Pan cursor'ı ekle
        return;
    }
    if (e.button === 2) return; // Sağ tuş (context menu)

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let snappedPos = getSmartSnapPoint(e);

    let needsUpdate3D = false; // 3D güncelleme bayrağı
    let objectJustCreated = false; // Yeni bir nesne oluşturuldu mu flag'i (Seçimi temizlemek için)
    let geometryChanged = false; // Genel geometri değişikliği flag'i (saveState için)

    if (state.currentMode === "select") {
        if (state.isEditingLength) { cancelLengthEdit(); return; }
        const clickedObject = getObjectAtPoint(pos); // Tıklanan nesneyi al

        // Silme modu (Sadece Alt)
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            setState({ isCtrlDeleting: true });
            dom.p2d.style.cursor = 'crosshair'; // Silme cursor'ı ayarla
            return;
        }

        // Önceki seçimi temizle
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
                     case 'column': dragInfo = onPointerDownColumn(clickedObject, pos, snappedPos, e); break; // e eklendi
                     case 'beam': dragInfo = onPointerDownBeam(clickedObject, pos, snappedPos, e); break;   // e eklendi
                     case 'stairs': dragInfo = onPointerDownStairs(clickedObject, pos, snappedPos, e); break; // e eklendi
                     case 'wall': dragInfo = onPointerDownSelectWall(clickedObject, pos, snappedPos, e); break; // e zaten vardı
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
                 setState({
                    isDragging: true,
                    dragStartPoint: dragInfo.startPointForDragging,
                    initialDragPoint: { x: pos.x, y: pos.y }, // Snap uygulanmamış ilk tıklama noktası
                    dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
                    dragOffset: dragInfo.dragOffset,
                    ...(dragInfo.additionalState || {})
                 });
                 dom.p2d.classList.add('dragging'); // Sürükleme cursor'ı ekle
            }
        } else {
            // Boşluğa tıklandıysa oda seçimini de temizle
            setState({ selectedRoom: null });
        }


    } else if (state.currentMode === "drawWall" || state.currentMode === "drawRoom") {
        // onPointerDownDrawWall artık true/false döndürmüyor, saveState'i kendi içinde yapıyor
        onPointerDownDrawWall(snappedPos);
        needsUpdate3D = true; // Duvar/Oda çizimi her zaman 3D'yi etkiler
        // Duvar çizimi devam etmiyorsa (startPoint null olduysa) seçimi temizle
        if (!state.startPoint) setState({ selectedObject: null });

    } else if (state.currentMode === "drawDoor") {
        // onPointerDownDrawDoor artık true/false döndürmüyor, saveState'i kendi içinde yapıyor
        onPointerDownDrawDoor(pos, getObjectAtPoint(pos)); // Tıklanan nesneyi ilet
        needsUpdate3D = true;
        objectJustCreated = true; // Bayrağı ayarla
        setState({ selectedObject: null }); // Seçimi temizle

    } else if (state.currentMode === "drawWindow") {
        // onPointerDownDrawWindow artık true/false döndürmüyor, saveState'i kendi içinde yapıyor
        onPointerDownDrawWindow(pos, getObjectAtPoint(pos)); // Tıklanan nesneyi ilet
         needsUpdate3D = true;
         objectJustCreated = true; // Bayrağı ayarla
         setState({ selectedObject: null }); // Seçimi temizle

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
                 geometryChanged = true;
                 needsUpdate3D = true;
                 objectJustCreated = true;
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
                 const width = length; const height = state.wallThickness; // Varsayılan duvar kalınlığı
                 const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                 const newBeam = createBeam(centerX, centerY, width, height, rotation);
                 state.beams = state.beams || []; // Dizi yoksa oluştur
                 state.beams.push(newBeam);
                 geometryChanged = true;
                 needsUpdate3D = true;
                 objectJustCreated = true;
             }
             setState({ startPoint: null });
         }
} else if (state.currentMode === "drawStairs") {
     if (!state.startPoint) {
        setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
     } else {
         const p1 = state.startPoint;
         const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
         
         // Dikdörtgenin kenar uzunluklarını hesapla
         const deltaX = p2.x - p1.x;
         const deltaY = p2.y - p1.y;
         const absWidth = Math.abs(deltaX);
         const absHeight = Math.abs(deltaY);

         if (absWidth > 10 && absHeight > 10) {
             const centerX = (p1.x + p2.x) / 2;
             const centerY = (p1.y + p2.y) / 2;
             
             let width, height, rotation;
             
             // Hangi kenar daha uzun?
             if (absWidth >= absHeight) {
                 // Yatay dikdörtgen: X ekseni boyunca uzun
                 width = absWidth;  // Uzun kenar (merdiven uzunluğu)
                 height = absHeight; // Kısa kenar (merdiven eni)
                 
                 // Yönü belirle: p1'den p2'ye doğru
                 if (deltaX > 0) {
                     rotation = 0;    // Sağa doğru
                 } else {
                     rotation = 180;  // Sola doğru
                 }
             } else {
                 // Dikey dikdörtgen: Y ekseni boyunca uzun
                 width = absHeight; // Uzun kenar (merdiven uzunluğu)
                 height = absWidth;  // Kısa kenar (merdiven eni)
                 
                 // Yönü belirle: p1'den p2'ye doğru
                 if (deltaY > 0) {
                     rotation = 90;   // Aşağı doğru
                 } else {
                     rotation = -90;  // Yukarı doğru (270)
                 }
             }
             
             const newStairs = createStairs(centerX, centerY, width, height, rotation);

             state.stairs.push(newStairs);
             needsUpdate3D = true;
             objectJustCreated = true;
             saveState();
         }
         setState({ startPoint: null, selectedObject: null });
     }
} else if (state.currentMode === "drawVent") { // Menfez çizimi
        let closestWall = null; let minDistSq = Infinity;
        const bodyHitTolerance = state.wallThickness * 1.5;
         for (const w of [...state.walls].reverse()) {
             if (!w.p1 || !w.p2) continue;
             const p1 = w.p1, p2 = w.p2; const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2; if(l2 < 0.1) continue;
             const d = distToSegmentSquared(pos, p1, p2); // Snaplenmemiş pozisyonu kullan
             if (d < bodyHitTolerance**2 && d < minDistSq) { minDistSq = d; closestWall = w; }
         }
         if(closestWall) {
            const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
            const ventWidth = 40; const ventMargin = 10; // Uçlara olan min mesafe
            if (wallLen >= ventWidth + 2 * ventMargin) {
                 const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                 const t = Math.max(0, Math.min(1, ((pos.x - closestWall.p1.x) * dx + (pos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                 const ventPos = t * wallLen;
                 // Pozisyonun kenarlara uygun olup olmadığını kontrol et
                 if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                     if (!closestWall.vents) closestWall.vents = [];
                     // Çakışma kontrolü (varsa)
                     let overlaps = false;
                     const newVentStart = ventPos - ventWidth / 2;
                     const newVentEnd = ventPos + ventWidth / 2;
                     // Diğer menfezlerle kontrol
                     (closestWall.vents || []).forEach(existingVent => {
                          const existingStart = existingVent.pos - existingVent.width / 2;
                          const existingEnd = existingVent.pos + existingVent.width / 2;
                          if (!(newVentEnd <= existingStart || newVentStart >= existingEnd)) {
                              overlaps = true;
                          }
                     });
                     // Diğer kapı/pencere vb. ile kontrol (gerekirse eklenebilir)

                     if (!overlaps) {
                         closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                         geometryChanged = true;
                         objectJustCreated = true;
                         // No 3D update for vents
                     }
                 }
             }
         }
    }

    // Eğer yeni bir nesne oluşturulduysa (ve mod 'select' değilse), seçimi temizle
    if (objectJustCreated && state.currentMode !== "select") {
        setState({ selectedObject: null });
    }

    // Geometri değiştiyse kaydet
    if (geometryChanged) {
        saveState();
    }

    // --- Fonksiyon sonunda 3D güncellemesini kontrol et ve gecikmeli çağır ---
    if (needsUpdate3D && dom.mainContainer.classList.contains('show-3d')) {
        // Kısa bir gecikme ekleyerek state güncellemelerinin tamamlanmasını bekle
        setTimeout(update3DScene, 0);
    }
}