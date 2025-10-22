// ahmedakbayir/ngcad/ngcad-57ad1e9e29c68ba90143525c3fd3ac20a130f44e/pointer-down.js
import { state, dom, setState, setMode } from './main.js';
import { getSmartSnapPoint } from './snap.js';
// 'distToSegmentSquared' fonksiyonunu geometry.js'den import et
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists as geometryWallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint } from './actions.js';
// 'isPointInColumn' fonksiyonunu da columns.js'den import et
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from './columns.js';
// YENİ IMPORTLARI AŞAĞIYA EKLEYİN
import { createBeam, onPointerDown as onPointerDownBeam } from './beams.js';
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

        // <-- DEĞİŞİKLİK BURADA (İçteki 'if' kaldırıldı) -->
        // Alt tuşu ile silme modu (artık kolonlar dahil)
        if (e.altKey && !e.shiftKey && !e.ctrlKey) {
            setState({ isCtrlDeleting: true });
            return;
        }
        // <-- DEĞİŞİKLİK SONU -->

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
                case 'beam': // <-- YENİ CASE EKLEYİN
                    dragInfo = onPointerDownBeam(selectedObject, pos, snappedPos);
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
        // YENİ MANTIK: İki noktaya tıkla (Oda gibi)
        if (!state.startPoint) {
            // 1. Tıklama: Başlangıç noktasını ayarla
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
        } else {
            // 2. Tıklama: Kolonu oluştur
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };

            // Minimum boyuttan (1cm) büyükse devam et
            if (Math.abs(p1.x - p2.x) > 1 && Math.abs(p1.y - p2.y) > 1) {
                const centerX = (p1.x + p2.x) / 2;
                const centerY = (p1.y + p2.y) / 2;
                const width = Math.abs(p1.x - p2.x);
                const height = Math.abs(p1.y - p2.y);
            
                // createColumn'u çağır ve en/boy ayarla
                const newColumn = createColumn(centerX, centerY, 0); // Size 0 ile başla
                newColumn.width = width;
                newColumn.height = height;
                newColumn.size = Math.max(width, height); // Uyumluluk için
                newColumn.rotation = 0; // Varsayılan 0 derece
            
                state.columns.push(newColumn);
                saveState();
            }
            // Başlangıç noktasını sıfırla
            setState({ startPoint: null }); 
        }
    
    // YENİ ELSE IF BLOĞUNU AŞAĞIYA EKLEYİN
    } else if (state.currentMode === "drawBeam") {
        if (!state.startPoint) {
            // 1. Tıklama: Başlangıç noktasını ayarla
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
        } else {
            // 2. Tıklama: Kirişi oluştur
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
            
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const length = Math.hypot(dx, dy); // Kullanıcının çizdiği uzunluk

            if (length > 1) { // Minimum 1cm kontrolü
                const centerX = (p1.x + p2.x) / 2;
                const centerY = (p1.y + p2.y) / 2;
                
                const width = length; // Kirişin uzunluğu
                const height = state.wallThickness; // Kirişin eni (varsayılan duvar kalınlığı)
                const rotation = Math.atan2(dy, dx) * 180 / Math.PI; // Açı

                const newBeam = createBeam(centerX, centerY, width, height, rotation);
            
                state.beams.push(newBeam);
                saveState();
            }
            // Başlangıç noktasını sıfırla
            setState({ startPoint: null }); 
        }
    // YENİ BLOK BİTİŞİ
    
    } else if (state.currentMode === "drawVent") {
        // TODO: `vent-handler.js` oluşturulup mantık oraya taşınabilir.
        // Şimdilik `pointer-down.js` içindeki mantık korunuyor.
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
                     saveState();
                 }
             }
         }
    }
}