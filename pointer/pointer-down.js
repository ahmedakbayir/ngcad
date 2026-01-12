// pointer/pointer-down.js
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from '../architectural-objects/columns.js';
import { createBeam, onPointerDown as onPointerDownBeam } from '../architectural-objects/beams.js';
import { createStairs, onPointerDown as onPointerDownStairs, recalculateStepCount } from '../architectural-objects/stairs.js';
import { plumbingManager, TESISAT_MODLARI } from '../plumbing_v2/plumbing-manager.js';
import { onPointerDownDraw as onPointerDownDrawWall, onPointerDownSelect as onPointerDownSelectWall, wallExists } from '../wall/wall-handler.js';
import { onPointerDownDraw as onPointerDownDrawDoor, onPointerDownSelect as onPointerDownSelectDoor } from '../architectural-objects/door-handler.js';
import { onPointerDownGuide } from '../architectural-objects/guide-handler.js';
import { onPointerDownDraw as onPointerDownDrawWindow, onPointerDownSelect as onPointerDownSelectWindow } from '../architectural-objects/window-handler.js';
import { hideGuideContextMenu } from '../menu/guide-menu.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, snapTo15DegreeAngle } from '../draw/geometry.js';
import { applySymmetry, applyCopy } from '../draw/symmetry.js';
import { state, dom, setState, setMode } from '../general-files/main.js';
import { getSmartSnapPoint } from '../general-files/snap.js';
import { currentModifierKeys } from '../general-files/input.js';
import { saveState } from '../general-files/history.js';
import { cancelLengthEdit } from '../general-files/ui.js';
import { getObjectAtPoint, getInteractableObjectAtPoint } from '../general-files/actions.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { processWalls } from '../wall/wall-processor.js';
// plumbingManager zaten yukarıda import edildi

/**
 * Vanadan/Sayaçtan sonraki tüm bağlı boruları düz çizgi yap
 */
function markAllDownstreamPipesAsConnected(startPipe) {
    const visited = new Set();
    const queue = [startPipe];

    while (queue.length > 0) {
        const pipe = queue.shift();
        if (visited.has(pipe)) continue;
        visited.add(pipe);

        pipe.isConnectedToValve = true;

        // p2 ucuna bağlı diğer boruları bul
        const connectedPipes = (state.plumbingPipes || []).filter(p =>
            !visited.has(p) && (
                (Math.hypot(p.p1.x - pipe.p2.x, p.p1.y - pipe.p2.y) < 1) ||
                (Math.hypot(p.p2.x - pipe.p2.x, p.p2.y - pipe.p2.y) < 1)
            )
        );

        queue.push(...connectedPipes);
    }
}

export function onPointerDown(e) {
    if (e.target !== dom.c2d) return;

    // --- YENİ: CTRL + Orta Tuş (Tekerlek) ile 2D Eğme (Tilt) Başlangıcı ---
    if (e.button === 1 && (e.ctrlKey || state.currentModifierKeys?.ctrl)) {
        e.preventDefault();
        dom.c2d.setPointerCapture(e.pointerId); // Mouse'u yakala
        
        setState({
            isCtrl3DToggling: true,
            ctrl3DToggleStart: { x: e.clientX, y: e.clientY },
            ctrl3DToggleLastPos: { x: e.clientX, y: e.clientY },
            ctrl3DToggleMoved: false,
            // Eğer tilt değeri henüz yoksa 0 (2D) olarak başlat
            camera3DTilt: state.camera3DTilt !== undefined ? state.camera3DTilt : 0
        });
        return; 
    }
    // ----------------------------------------------------------------------

    // Mevcut Orta Tuş (Pan) Kodu
    if (e.button === 1) { 
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        dom.p2d.classList.add('panning');
        return;
    }
    if (e.button === 2) return; // Sağ tuş (context menu için ayrılmış)

    // Tıklama konumunu dünya koordinatlarına çevir
    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    // Tıklama konumunu snap noktalarına göre ayarla
    let snappedPos = getSmartSnapPoint(e);

    // Güncelleme bayrakları
    let needsUpdate3D = false; // 3D sahne güncellenmeli mi?
    let objectJustCreated = false; // Yeni bir nesne oluşturuldu mu?
    let geometryChanged = false; // Geometri değişti mi (saveState için)?

    // === BORU ÇİZİM MODU AKTİF İSE ÖNCELİKLİ İŞLE ===
    // SADECE plumbing modlarında boru çizim handler'ını çağır
    // Diğer çizim modlarında (drawStairs, drawColumn, vb.) kesmemeli
    const isPlumbingMode = state.currentMode === 'plumbingV2' ||
                          state.currentMode === 'drawPlumbingPipe' ||
                          state.currentMode === 'drawPlumbingBlock' ||
                          state.currentMode === 'select' ||
                          state.currentMode === 'MİMARİ-TESİSAT';

    const boruCizimAktif = plumbingManager.interactionManager?.boruCizimAktif;

    // Plumbing manager'a önce sor (boru çizim veya seçim için)
    if (isPlumbingMode && plumbingManager.interactionManager) {
        // --- DEĞİŞİKLİK BURADA: MİMARİ MOD KONTROLÜ ---
        // Eğer MİMARİ moddaysak ve aktif bir boru çizimi yoksa,
        // plumbing manager'ın tıklamayı yakalamasına izin verme.
        // Böylece olay aşağıya (select kısmına) düşer ve orada isObjectInteractable kontrolüne takılır.
        const skipPlumbingInteraction = state.currentDrawingMode === 'MİMARİ' && !boruCizimAktif;

        if (!skipPlumbingInteraction) {
            const handled = plumbingManager.interactionManager.handlePointerDown(e);
            if (handled) {
                return;
            }
        }
        // --- DEĞİŞİKLİK SONU ---
    }

    // --- Seçim Modu ---
    if (state.currentMode === "select") {
        // NOT: Select modunda v2 interactionManager kullanılmıyor
        // getObjectAtPoint hem v1 (state.plumbingBlocks) hem v2 nesnelerini buluyor

        // Uzunluk düzenleme modu aktifse iptal et
        if (state.isEditingLength) { cancelLengthEdit(); return; }

        // Tıklanan nesneyi bul (mevcut çizim modunda interaktif olanları)
        const clickedObject = getInteractableObjectAtPoint(pos);

        // Silme modu (Sadece Alt tuşu basılıysa)
        if (currentModifierKeys.alt && !currentModifierKeys.ctrl && !currentModifierKeys.shift) {
            setState({ isCtrlDeleting: true }); // Silme modunu başlat
            dom.p2d.style.cursor = 'crosshair'; // Silme cursor'ı ayarla
            return; // Başka işlem yapma
        }

        // CTRL ile multi-select modu (sadece CTRL basılıyken, body'ye tıklandığında)
        if (currentModifierKeys.ctrl && !currentModifierKeys.alt && !currentModifierKeys.shift && clickedObject &&
            ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) &&
            clickedObject.handle === 'body') {

            let currentGroup = [...state.selectedGroup];
            if (currentGroup.length === 0 && state.selectedObject &&
                ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(state.selectedObject.type)) {
                currentGroup.push(state.selectedObject);
            }

            const existingIndex = currentGroup.findIndex(item =>
                item.type === clickedObject.type && item.object === clickedObject.object
            );

            if (existingIndex !== -1) {
                currentGroup.splice(existingIndex, 1);
                setState({ selectedGroup: currentGroup, selectedObject: null });
            } else {
                currentGroup.push(clickedObject);
                setState({
                    selectedGroup: currentGroup,
                    selectedObject: null
                });
            }
            return;
        }

        if (!currentModifierKeys.ctrl && clickedObject &&
            ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) &&
            state.selectedGroup.length > 0) {
            // (selectedGroup'u temizle - aşağıda yapılıyor)
        }

        if (!clickedObject || clickedObject.type === 'room') {
            setState({
                selectedObject: null, selectedGroup: [],
                affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map(),
                dragAxis: null, isSweeping: false, sweepWalls: [], dragOffset: { x: 0, y: 0 },
                columnRotationOffset: null
            });
        }

        // FLOOR VALIDATION
        if (clickedObject && state.currentFloor?.id) {
            const currentFloorId = state.currentFloor.id;
            const obj = clickedObject.object;

            if (['wall', 'door', 'window', 'vent', 'column', 'beam', 'stairs', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type)) {
                if (clickedObject.type === 'wall' && obj.floorId && obj.floorId !== currentFloorId) {
                    clickedObject = null;
                }
                else if (['door', 'window', 'vent'].includes(clickedObject.type) && clickedObject.wall?.floorId && clickedObject.wall.floorId !== currentFloorId) {
                    clickedObject = null;
                }
                else if (['column', 'beam', 'stairs', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) && obj.floorId && obj.floorId !== currentFloorId) {
                    clickedObject = null;
                }
            }
        }

        // Tıklanan nesne varsa seçili yap ve sürüklemeyi başlat
        if (clickedObject) {
            if (clickedObject.type === 'room') {
                setState({ selectedRoom: clickedObject.object, selectedObject: null });
            } else if (clickedObject.type === 'roomName' || clickedObject.type === 'roomArea') {
                setState({
                    isDraggingRoomName: clickedObject.object,
                    roomDragStartPos: { x: pos.x, y: pos.y },
                    roomOriginalCenter: [...clickedObject.object.center],
                    selectedObject: null
                });
                dom.p2d.classList.add('dragging');
            } else {
                // Önceki seçili tesisat nesnesinin isSelected'ını temizle
                if (state.selectedObject?.object?.isSelected !== undefined) {
                    state.selectedObject.object.isSelected = false;
                }

                setState({ selectedObject: clickedObject, selectedRoom: null, selectedGroup: [] });

                // Yeni seçili tesisat nesnesinin isSelected'ını ayarla (renderer için)
                if (clickedObject.type === 'plumbingPipe' || clickedObject.type === 'plumbingBlock') {
                    clickedObject.object.isSelected = true;
                }

                let dragInfo = { startPointForDragging: pos, dragOffset: { x: 0, y: 0 }, additionalState: {} };
                switch (clickedObject.type) {
                    case 'camera':
                        const camInfo = clickedObject.object;
                        if (clickedObject.handle === 'position') {
                            dragInfo = {
                                startPointForDragging: { x: camInfo.position.x, y: camInfo.position.z },
                                dragOffset: { x: camInfo.position.x - pos.x, y: camInfo.position.z - pos.y },
                                additionalState: { cameraHandle: 'position' }
                            };
                        } else if (clickedObject.handle === 'direction') {
                            dragInfo = {
                                startPointForDragging: pos,
                                dragOffset: { x: 0, y: 0 },
                                additionalState: {
                                    cameraHandle: 'direction',
                                    initialYaw: camInfo.yaw,
                                    cameraCenter: { x: camInfo.position.x, y: camInfo.position.z }
                                }
                            };
                        }
                        break;
                    case 'arcControl':
                        dragInfo = {
                            startPointForDragging: clickedObject.handle === 'control1' ?
                                { x: clickedObject.object.arcControl1.x, y: clickedObject.object.arcControl1.y } :
                                { x: clickedObject.object.arcControl2.x, y: clickedObject.object.arcControl2.y },
                            dragOffset: { x: 0, y: 0 },
                            additionalState: {}
                        };
                        break;
                    case 'guide': dragInfo = onPointerDownGuide(clickedObject, pos, snappedPos, e); break;
                    case 'column': dragInfo = onPointerDownColumn(clickedObject, pos, snappedPos, e); break;
                    case 'beam': dragInfo = onPointerDownBeam(clickedObject, pos, snappedPos, e); break;
                    case 'stairs': dragInfo = onPointerDownStairs(clickedObject, pos, snappedPos, e); break;
                    case 'plumbingBlock': {
                        // v2'de plumbingManager üzerinden yönetiliyor
                        const block = clickedObject.object;
                        const blockX = block.x ?? block.center?.x;
                        const blockY = block.y ?? block.center?.y;
                        if (blockX !== undefined && blockY !== undefined) {
                            dragInfo.startPointForDragging = { x: blockX, y: blockY };
                            dragInfo.dragOffset = { x: blockX - pos.x, y: blockY - pos.y };
                        }
                        break;
                    }
                    case 'plumbingPipe': {
                        // v2'de plumbingManager üzerinden yönetiliyor - boru gövdesi taşıma
                        const pipeObj = clickedObject.object;
                        if (pipeObj && pipeObj.p1 && pipeObj.p2) {
                            // Borunun merkez noktasını hesapla
                            const pipeCenterX = (pipeObj.p1.x + pipeObj.p2.x) / 2;
                            const pipeCenterY = (pipeObj.p1.y + pipeObj.p2.y) / 2;
                            dragInfo.startPointForDragging = { x: pipeCenterX, y: pipeCenterY };
                            dragInfo.dragOffset = { x: pipeCenterX - pos.x, y: pipeCenterY - pos.y };
                            // Başlangıç pozisyonlarını state'e kaydet
                            dragInfo.additionalState = {
                                pipeInitialP1: { x: pipeObj.p1.x, y: pipeObj.p1.y },
                                pipeInitialP2: { x: pipeObj.p2.x, y: pipeObj.p2.y }
                            };
                        }
                        break;
                    }
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
                setState({
                    isDragging: true,
                    dragStartPoint: dragInfo.startPointForDragging,
                    initialDragPoint: { x: pos.x, y: pos.y },
                    dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
                    dragOffset: dragInfo.dragOffset,
                    ...(dragInfo.additionalState || {})
                });
                dom.p2d.classList.add('dragging');
            }
        } else {
            setState({ selectedRoom: null });
        }

        // --- Duvar veya Oda Çizim Modu ---
    } else if (state.currentMode === "drawWall" || state.currentMode === "drawRoom") {
        onPointerDownDrawWall(snappedPos);
        needsUpdate3D = true;
        if (!state.startPoint) setState({ selectedObject: null });

        // --- Kapı Çizim Modu ---
    } else if (state.currentMode === "drawDoor") {
        onPointerDownDrawDoor(pos, getInteractableObjectAtPoint(pos));
        needsUpdate3D = true;
        objectJustCreated = true;
        setState({ selectedObject: null });

        // --- Pencere Çizim Modu ---
    } else if (state.currentMode === "drawWindow") {
        onPointerDownDrawWindow(pos, getInteractableObjectAtPoint(pos));
        needsUpdate3D = true;
        objectJustCreated = true;
        setState({ selectedObject: null });

        // --- Kolon Çizim Modu ---
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
                newColumn.size = Math.max(width, height);
                newColumn.rotation = 0;
                if (!state.columns) state.columns = [];
                state.columns.push(newColumn);
                geometryChanged = true;
                needsUpdate3D = true;
                objectJustCreated = true;
            }
            setState({ startPoint: null });
        }
        // --- Kiriş Çizim Modu ---
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
                const width = length;
                const height = state.wallThickness;
                const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
                const newBeam = createBeam(centerX, centerY, width, height, rotation);
                state.beams = state.beams || [];
                state.beams.push(newBeam);
                geometryChanged = true;
                needsUpdate3D = true;
                objectJustCreated = true;
            }
            setState({ startPoint: null });
        }

        // ===================================================================
        // === YENİ TESİSAT SİSTEMİ (v2) ===
        // ===================================================================
    } else if (state.currentMode === "plumbingV2") {
        // Yeni tesisat sistemine yönlendir
        const handled = plumbingManager.interactionManager.handlePointerDown(e);
        if (handled) {
            return;
        }

        // ===================================================================
        // === ESKI TESİSAT MODLARI - v2'YE YÖNLENDİRİLDİ ===
        // ===================================================================
    } else if (state.currentMode === "drawPlumbingBlock" || state.currentMode === "drawValve" || state.currentMode === "drawPlumbingPipe") {
        // Eski tesisat modları plumbing_v2'ye taşındı
        setMode("plumbingV2");
        return;

    // --- Merdiven Çizim Modu (YORUM BLOĞUNDAN ÇIKARILDI) ---
    } else if (state.currentMode === "drawStairs") {
        if (!state.startPoint) {
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
        } else {
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
            const deltaX = p2.x - p1.x;
            const deltaY = p2.y - p1.y;
            const absWidth = Math.abs(deltaX);
            const absHeight = Math.abs(deltaY);
            if (absWidth > 10 && absHeight > 10) {
                const centerX = (p1.x + p2.x) / 2;
                const centerY = (p1.y + p2.y) / 2;
                let width, height, rotation;
                if (absWidth >= absHeight) {
                    width = absWidth;
                    height = absHeight;
                    rotation = (deltaX >= 0) ? 0 : 180;
                } else {
                    width = absHeight;
                    height = absWidth;
                    rotation = (deltaY >= 0) ? 90 : -90;
                }
                const isLanding = currentModifierKeys.ctrl;
                const newStairs = createStairs(centerX, centerY, width, height, rotation, isLanding);
                if (!state.stairs) {
                    state.stairs = [];
                }
                state.stairs.push(newStairs);
                needsUpdate3D = true;
                objectJustCreated = true;
                geometryChanged = true;
            }
            setState({ startPoint: null, selectedObject: null });
        }
    } else if (state.currentMode === "drawVent") {
        let closestWall = null; let minDistSq = Infinity;
        const bodyHitTolerance = (state.wallThickness * 1.5) ** 2;
        for (const w of [...state.walls].reverse()) {
            if (!w.p1 || !w.p2) continue;
            const distSq = distToSegmentSquared(pos, w.p1, w.p2);
            if (distSq < bodyHitTolerance && distSq < minDistSq) { minDistSq = distSq; closestWall = w; }
        }
        if (closestWall) {
            const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
            const ventWidth = 25;
            const ventMargin = 10;
            if (wallLen >= ventWidth + 2 * ventMargin) {
                const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                const t = Math.max(0, Math.min(1, ((pos.x - closestWall.p1.x) * dx + (pos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                const ventPos = t * wallLen;
                if (ventPos >= ventWidth / 2 + ventMargin && ventPos <= wallLen - ventWidth / 2 - ventMargin) {
                    if (!closestWall.vents) closestWall.vents = [];
                    let overlaps = false;
                    const newVentStart = ventPos - ventWidth / 2;
                    const newVentEnd = ventPos + ventWidth / 2;
                    (closestWall.vents || []).forEach(existingVent => {
                        const existingStart = existingVent.pos - existingVent.width / 2;
                        const existingEnd = existingVent.pos + existingVent.width / 2;
                        if (!(newVentEnd <= existingStart || newVentStart >= existingEnd)) { overlaps = true; }
                    });
                    if (!overlaps) {
                        closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                        geometryChanged = true;
                        objectJustCreated = true;
                        needsUpdate3D = true;
                    }
                }
            }
        }
        setState({ selectedObject: null });
        // --- Simetri Modu ---
    } else if (state.currentMode === "drawSymmetry") {

        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
            setState({ symmetryPreviewTimer: null });
        }

        if (!state.symmetryAxisP1) {
            setState({
                symmetryAxisP1: { x: snappedPos.roundedX, y: snappedPos.roundedY },
                symmetryAxisP2: null
            });
        } else {
            let axisP1 = state.symmetryAxisP1;
            let axisP2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };

            if (currentModifierKeys.shift) {
                const dx = axisP2.x - axisP1.x;
                const dy = axisP2.y - axisP1.y;
                const distance = Math.hypot(dx, dy);
                if (distance > 1) {
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    const snappedAngle = Math.round(angle / 15) * 15;
                    const snappedAngleRad = snappedAngle * Math.PI / 180;
                    axisP2 = {
                        x: axisP1.x + distance * Math.cos(snappedAngleRad),
                        y: axisP1.y + distance * Math.sin(snappedAngleRad)
                    };
                }
            }

            const axisLength = Math.hypot(axisP2.x - axisP1.x, axisP2.y - axisP1.y);
            if (axisLength > 10) {
                if (currentModifierKeys.ctrl) {
                    applyCopy(axisP1, axisP2);
                } else {
                    applySymmetry(axisP1, axisP2);
                }
                geometryChanged = true;
                needsUpdate3D = true;
            }

            setState({
                symmetryAxisP1: null,
                symmetryAxisP2: null,
                symmetryPreviewElements: {
                    nodes: [], walls: [], doors: [], windows: [], vents: [],
                    columns: [], beams: [], stairs: [], rooms: []
                }
            });
            setMode("select");
        }
        // --- Rehber Çizim Modları ---
    } else if (state.currentMode === "drawGuideAngular" || state.currentMode === "drawGuideFree") {

        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
            setState({ symmetryPreviewTimer: null });
        }

        if (state.startPoint) { // Bu ikinci tıklama
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };

            if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 1) {
                const subType = state.currentMode === "drawGuideAngular" ? 'angular' : 'free';

                if (!state.guides) state.guides = [];
                state.guides.push({
                    type: 'guide',
                    subType: subType,
                    p1: { x: p1.x, y: p1.y },
                    p2: { x: p2.x, y: p2.y }
                });

                geometryChanged = true;
            }

            setState({ startPoint: null });
            setMode("select");
        }
    }

    // --- Son İşlemler ---

    if (objectJustCreated && state.currentMode !== "select") {
        setState({ selectedObject: null });
    }

    if (geometryChanged) {
        saveState();
    }

    if (needsUpdate3D && dom.mainContainer.classList.contains('show-3d')) {
        setTimeout(update3DScene, 0);
    }
}