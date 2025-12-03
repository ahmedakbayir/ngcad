// pointer-down.js
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from '../architectural-objects/columns.js';
import { createBeam, onPointerDown as onPointerDownBeam } from '../architectural-objects/beams.js';
import { createStairs, onPointerDown as onPointerDownStairs, recalculateStepCount } from '../architectural-objects/stairs.js';
import { plumbingManager, TESISAT_MODLARI } from '../plumbing_v2/plumbing-manager.js';
import { PLUMBING_PIPE_TYPES, PLUMBING_COMPONENT_TYPES } from '../plumbing_v2/plumbing-types.js';
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

    console.log('✅ Marked', visited.size, 'pipes as connected to valve');
}

export function onPointerDown(e) {
    if (e.target !== dom.c2d) return; // Sadece canvas üzerindeki tıklamaları işle
    if (e.button === 1) { // Orta tuş ile pan
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        dom.p2d.classList.add('panning'); // Pan cursor'ı ekle
        return;
    }
    if (e.button === 2) return; // Sağ tuş (context menu için ayrılmış)

    console.log('🎯 onPointerDown called - currentMode:', state.currentMode);

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
    console.log('🔍 Plumbing check:', { boruCizimAktif, isPlumbingMode, currentMode: state.currentMode });

    // Plumbing manager'a önce sor (boru çizim veya seçim için)
    if (isPlumbingMode && plumbingManager.interactionManager) {
        console.log('⚡ Calling plumbing manager handler');
        const handled = plumbingManager.interactionManager.handlePointerDown(e);
        console.log('⚡ Plumbing manager handled:', handled);
        if (handled) {
            console.log('⚡ Plumbing manager consumed the click - returning early');
            return;
        }
    }

    // Eğer boruCizimAktif ama plumbing modunda değilsek uyarı
    if (boruCizimAktif && !isPlumbingMode) {
        console.warn('⚠️ WARNING: boruCizimAktif is TRUE but we are NOT in plumbing mode!');
        console.warn('⚠️ Current mode:', state.currentMode, '- This is the BUG! Plumbing manager should reset this flag.');
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
            console.log('🎯 Object clicked:', clickedObject.type, 'handle:', clickedObject.handle);
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

                console.log('✅ Selection set:', clickedObject.type, clickedObject.handle);

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

                            // Borunun açısına göre dragAxis belirle - HER ZAMAN x veya y
                            const dx = pipeObj.p2.x - pipeObj.p1.x;
                            const dy = pipeObj.p2.y - pipeObj.p1.y;
                            const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
                            // Açı < 45° ise yatay boru → sadece Y'de hareket et (dragAxis='y')
                            // Açı >= 45° ise dikey boru → sadece X'de hareket et (dragAxis='x')
                            const dragAxis = (angle < 45) ? 'y' : 'x';

                            // Başlangıç pozisyonlarını state'e kaydet
                            dragInfo.additionalState = {
                                pipeInitialP1: { x: pipeObj.p1.x, y: pipeObj.p1.y },
                                pipeInitialP2: { x: pipeObj.p2.x, y: pipeObj.p2.y },
                                dragAxis: dragAxis
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
                console.log('✅ Dragging started, additionalState:', dragInfo.additionalState);
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
        console.warn('⚠️ Eski tesisat modu kullanılıyor. Lütfen plumbingV2 modunu kullanın.');
        setMode("plumbingV2");
        return;

    // --- Merdiven Çizim Modu (YORUM BLOĞUNDAN ÇIKARILDI) ---
    } else if (state.currentMode === "drawStairs") {
        console.log('🔷 STAIRCASE DRAWING MODE - Click registered');
        if (!state.startPoint) {
            console.log('✅ First click - Setting start point:', { x: snappedPos.roundedX, y: snappedPos.roundedY });
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
        } else {
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
            const deltaX = p2.x - p1.x;
            const deltaY = p2.y - p1.y;
            const absWidth = Math.abs(deltaX);
            const absHeight = Math.abs(deltaY);
            console.log('🔷 Second click - Dimensions:', { absWidth, absHeight, p1, p2 });
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
                console.log('✅ Creating staircase:', { centerX, centerY, width, height, rotation, isLanding });
                const newStairs = createStairs(centerX, centerY, width, height, rotation, isLanding);
                if (!state.stairs) {
                    state.stairs = [];
                }
                state.stairs.push(newStairs);
                console.log('✅ Staircase created and added to state.stairs:', newStairs);
                console.log('📊 Total stairs count:', state.stairs.length);
                needsUpdate3D = true;
                objectJustCreated = true;
                geometryChanged = true;
            } else {
                console.warn('⚠️ Staircase too small - Minimum size is 10cm x 10cm:', { absWidth, absHeight });
            }
            setState({ startPoint: null, selectedObject: null });
        }

        /* ESKI KOD - KALDIRILDI
        const blockType = state.currentPlumbingBlockType || 'SERVIS_KUTUSU';

        // SAYAÇ için boru üzerine ekleme kontrolü
        if (blockType === 'SAYAC') {
            const clickedPipe = getObjectAtPoint(pos);
            if (clickedPipe && clickedPipe.type === 'plumbingPipe') {
                const pipe = clickedPipe.object;
                console.log('🔧 Adding', blockType, 'to pipe');
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const t = Math.max(0, Math.min(1,
                    ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / (dx * dx + dy * dy)
                ));
                const splitX = pipe.p1.x + t * dx;
                const splitY = pipe.p1.y + t * dy;
                let blockX = splitX;
                let blockY = splitY;
                let blockRotation = Math.round(angle / 15) * 15;
                if (blockType === 'SAYAC') {
                    let normalizedAngle = angle;
                    while (normalizedAngle > 180) normalizedAngle -= 360;
                    while (normalizedAngle < -180) normalizedAngle += 360;
                    blockRotation = Math.round(normalizedAngle / 15) * 15;
                    const connectionPointAvgOffset = 19;
                    const rotRad = blockRotation * Math.PI / 180;
                    const offsetX = -connectionPointAvgOffset * Math.sin(rotRad);
                    const offsetY = connectionPointAvgOffset * Math.cos(rotRad);
                    blockX = splitX + offsetX;
                    blockY = splitY + offsetY;
                }
                const newBlock = createPlumbingBlock(blockX, blockY, blockType);
                newBlock.rotation = blockRotation;
                const connectionPoints = getConnectionPoints(newBlock);
                const oldP1 = { ...pipe.p1 };
                const oldP2 = { ...pipe.p2 };
                const oldPipeType = pipe.pipeType;
                const oldIsConnected = pipe.isConnectedToValve;
                state.plumbingPipes = state.plumbingPipes.filter(p => p !== pipe);
                const pipe1 = createPlumbingPipe(oldP1.x, oldP1.y, connectionPoints[0].x, connectionPoints[0].y, oldPipeType);
                const pipe2 = createPlumbingPipe(connectionPoints[1].x, connectionPoints[1].y, oldP2.x, oldP2.y, oldPipeType);
                pipe1.isConnectedToValve = oldIsConnected;
                pipe2.isConnectedToValve = true;
                if (!pipe1.connections) pipe1.connections = { start: null, end: null };
                pipe1.connections.end = {
                    blockId: newBlock.id || newBlock,
                    connectionIndex: 0,
                    blockType: newBlock.blockType
                };
                if (!pipe2.connections) pipe2.connections = { start: null, end: null };
                pipe2.connections.start = {
                    blockId: newBlock.id || newBlock,
                    connectionIndex: 1,
                    blockType: newBlock.blockType
                };
                if (!state.plumbingPipes) state.plumbingPipes = [];
                state.plumbingPipes.push(pipe1, pipe2);
                markAllDownstreamPipesAsConnected(pipe2);
                if (!state.plumbingBlocks) state.plumbingBlocks = [];
                state.plumbingBlocks.push(newBlock);
                geometryChanged = true;
                needsUpdate3D = true;
                objectJustCreated = true;
                console.log('✅ Block added to pipe, pipe split into 2 and connected to connection points');
                setMode("select");
                return;
            }
        }

        // OCAK ve KOMBI sadece boru ucuna veya servis kutusuna eklenebilir
        if (blockType === 'OCAK' || blockType === 'KOMBI') {
            const pipeSnap = snapToPipeEndpoint(pos, 15);
            // GÜNCELLENDİ: Servis kutusuna snap artık kenarlara (BLOCK_EDGE) yapılır
            // snapToConnectionPoint (blok merkezi) yerine snappedPos'u (kenar) kullanacağız

            let snap = pipeSnap; // Önce boru ucunu dene

            if (!snap) {
                // Boru ucu yoksa, 'PLUMBING_BLOCK_EDGE' snap'i var mı diye bak
                if (snappedPos.isSnapped && snappedPos.snapType === 'PLUMBING_BLOCK_EDGE' && snappedPos.wall?.blockType === 'SERVIS_KUTUSU') {
                    // Kenara snap yapıldı, buraya yerleştir
                    const newBlock = createPlumbingBlock(snappedPos.x, snappedPos.y, blockType);
                    newBlock.rotation = snappedPos.snapAngle || 0; // Duvar açısını al

                    if (!state.plumbingBlocks) state.plumbingBlocks = [];
                    state.plumbingBlocks.push(newBlock);

                    geometryChanged = true;
                    needsUpdate3D = true;
                    objectJustCreated = true;
                    console.log('✅', blockType, 'added directly to block edge');
                    setMode("select");
                    return;
                }

                console.warn('⚠️', blockType, 'can only be placed at pipe ends or block edges');
                return;
            }

            // (Boru ucuna snap yapıldıysa)
            const nearbyPipe = state.plumbingPipes?.find(p =>
                Math.hypot(p.p1.x - snap.x, p.p1.y - snap.y) < 1 ||
                Math.hypot(p.p2.x - snap.x, p.p2.y - snap.y) < 1
            );
            let pipeAngle = 0;
            if (nearbyPipe) {
                const dx = nearbyPipe.p2.x - nearbyPipe.p1.x;
                const dy = nearbyPipe.p2.y - nearbyPipe.p1.y;
                pipeAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            }
            const newBlock = createPlumbingBlock(snap.x, snap.y, blockType);
            newBlock.rotation = Math.round(pipeAngle / 15) * 15;
            if (!state.plumbingBlocks) state.plumbingBlocks = [];
            state.plumbingBlocks.push(newBlock);
            geometryChanged = true;
            needsUpdate3D = true;
            objectJustCreated = true;
            console.log('✅', blockType, 'added directly to pipe end');
            setMode("select");
            return;
        }

        // Diğer bloklar (SERVIS_KUTUSU)
        const newBlock = createPlumbingBlock(snappedPos.x, snappedPos.y, blockType);

        // Duvar snap kontrolü - eğer duvara snap yapıldıysa rotasyonu ayarla
        if (snappedPos.isSnapped && snappedPos.snapType === 'WALL') {
            newBlock.rotation = snappedPos.snapAngle || 0;
        }

        if (!state.plumbingBlocks) state.plumbingBlocks = [];
        state.plumbingBlocks.push(newBlock);

        geometryChanged = true;
        needsUpdate3D = true;
        objectJustCreated = true;

        console.log('✅', blockType, 'placed at', snappedPos.x, snappedPos.y);

        // --- Vana Çizim Modu (Boru Üzerinde) ---
    } else if (state.currentMode === "drawValve") {
        const clickedPipe = getObjectAtPoint(pos);
        if (!clickedPipe || clickedPipe.type !== 'plumbingPipe') {
            console.warn('⚠️ Vana sadece boru üzerine eklenebilir');
            return;
        }
        const pipe = clickedPipe.object;
        console.log('🔧 Adding valve to pipe');
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const pipeLength = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const t = Math.max(0, Math.min(1,
            ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / (dx * dx + dy * dy)
        ));
        const valvePos = t * pipeLength;
        const valveWidth = PLUMBING_BLOCK_TYPES.VANA.width;
        if (!isSpaceForValve(pipe, valvePos, valveWidth)) {
            console.warn('⚠️ Bu konumda vana için yeterli yer yok');
            return;
        }
        const newValve = {
            pos: valvePos,
            width: valveWidth,
            rotation: angle
        };
        if (!pipe.valves) pipe.valves = [];
        pipe.valves.push(newValve);
        geometryChanged = true;
        needsUpdate3D = true;
        objectJustCreated = true;
        console.log('✅ Valve added to pipe at position', valvePos);
        // --- Merdiven Çizim Modu (ÇIKARILDI - YORUM BLOĞUNUN DIŞINA TAŞINDI) ---
        // (Kod satır 384'te)
        // --- Tesisat Borusu Çizim Modu ---
    } else if (state.currentMode === "drawPlumbingPipe") {
        console.log('🚀 PIPE DRAWING MODE - Click registered:', { hasStartPoint: !!state.startPoint, pos });

        if (!state.startPoint) {
            let startPos = null;

            // GÜNCELLENDİ: ÖNCELİK 1: Blok Kenarı (PLUMBING_BLOCK_EDGE)
            if (snappedPos.isSnapped && (snappedPos.snapType === 'PLUMBING_BLOCK_EDGE' || snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION')) {
                startPos = { x: snappedPos.x, y: snappedPos.y };
                console.log('✅ Starting from Block Edge / Edge-Wall Intersection:', startPos);
            }

            // ÖNCELİK 2: Boru ucuna snap (pipe endpoint)
            if (!startPos) {
                const pipeEndSnap = snapToPipeEndpoint(pos, 10);
                if (pipeEndSnap) {
                    startPos = { x: pipeEndSnap.x, y: pipeEndSnap.y };
                    console.log('✅ Starting from pipe endpoint:', startPos);
                }
            }

            // ÖNCELİK 3: Bağlantı noktasına snap (Sayaç, Vana, Kombi, Ocak)
            if (!startPos) {
                const blockSnap = snapToConnectionPoint(pos, 10);
                if (blockSnap) {
                    startPos = { x: blockSnap.x, y: blockSnap.y };
                    console.log('✅ Starting from block connection point:', startPos);
                }
            }

            // ÖNCELİK 4: Boru üzerine tıklama (branch/dal oluşturma)
            if (!startPos) {
                const clickedPipe = getObjectAtPoint(pos);
                if (clickedPipe && clickedPipe.type === 'plumbingPipe') {
                    const pipe = clickedPipe.object;
                    const dx = pipe.p2.x - pipe.p1.x;
                    const dy = pipe.p2.y - pipe.p1.y;
                    const lengthSq = dx * dx + dy * dy;
                    if (lengthSq > 0.1) {
                        const t = Math.max(0, Math.min(1,
                            ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / lengthSq
                        ));
                        const splitX = pipe.p1.x + t * dx;
                        const splitY = pipe.p1.y + t * dy;
                        const distToP1 = Math.hypot(splitX - pipe.p1.x, splitY - pipe.p1.y);
                        const distToP2 = Math.hypot(splitX - pipe.p2.x, splitY - pipe.p2.y);

                        if (distToP1 < 10 || distToP2 < 10) {
                            startPos = distToP1 < distToP2 ?
                                { x: pipe.p1.x, y: pipe.p1.y } :
                                { x: pipe.p2.x, y: pipe.p2.y };
                            console.log('✅ Starting from pipe endpoint (near click):', startPos);
                        } else {
                            const originalP1 = { ...pipe.p1 };
                            const originalP2 = { ...pipe.p2 };
                            const splitPoint = { x: splitX, y: splitY };
                            const pipeType = pipe.pipeType;
                            const pipeConfig = pipe.typeConfig;
                            const isConnected = pipe.isConnectedToValve;
                            const pipeIndex = state.plumbingPipes.indexOf(pipe);
                            if (pipeIndex > -1) {
                                state.plumbingPipes.splice(pipeIndex, 1);
                            }
                            const pipe1 = createPlumbingPipe(originalP1.x, originalP1.y, splitX, splitY, pipeType);
                            const pipe2 = createPlumbingPipe(splitX, splitY, originalP2.x, originalP2.y, pipeType);
                            if (pipe1) {
                                pipe1.isConnectedToValve = isConnected;
                                if (pipe.connections?.start) {
                                    pipe1.connections.start = pipe.connections.start;
                                }
                                state.plumbingPipes.push(pipe1);
                            }
                            if (pipe2) {
                                pipe2.isConnectedToValve = isConnected;
                                if (pipe.connections?.end) {
                                    pipe2.connections.end = pipe.connections.end;
                                }
                                state.plumbingPipes.push(pipe2);
                            }
                            startPos = splitPoint;
                            console.log('✅ Pipe split at body, branch starting from:', startPos);
                            geometryChanged = true;
                            needsUpdate3D = true;
                        }
                    }
                }
            }

            // ÖNCELİK 5: Normal snapped pozisyon
            if (!startPos) {
                startPos = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                console.log('✅ Start point set (normal):', startPos);
            }

            setState({ startPoint: startPos });
        } else {
            // İkinci tıklama: Boruyu oluştur
            const p1 = state.startPoint;

            // GÜNCELLENDİ: Bitiş noktası için öncelik sırası + modifier tuş desteği
            let p2;
            let blockEdgeSnap = null; // Dışarıda tanımla, her durumda erişilebilir olsun

            // SHIFT tuşu: ORTHO modu açık + tüm snap'ları devre dışı bırak
            if (currentModifierKeys.shift) {
                // Snap'ları atla, sadece ORTHO (15 derece snap) kullan
                const orthoPoint = snapTo15DegreeAngle(p1, pos);
                p2 = { x: orthoPoint.x, y: orthoPoint.y };
                console.log('🔗 Pipe end with SHIFT (ORTHO mode, no snaps)');
            }
            // ALT tuşu: Serbest çizim (snap ve ortho kapalı)
            else if (currentModifierKeys.alt) {
                // Ne snap ne ortho, tam serbest çizim
                p2 = { x: pos.x, y: pos.y };
                console.log('🔗 Pipe end with ALT (free mode, no snaps, no ortho)');
            }
            // Normal mod: Snap öncelikli, sonra ORTHO
            else {
                blockEdgeSnap = (snappedPos.isSnapped && (snappedPos.snapType === 'PLUMBING_BLOCK_EDGE' || snappedPos.snapType === 'PLUMBING_WALL_BLOCK_INTERSECTION')) ? { x: snappedPos.x, y: snappedPos.y, ...snappedPos } : null;
                const blockSnap = snapToConnectionPoint(pos, 10);
                const pipeSnap = snapToPipeEndpoint(pos, 10);

                if (blockSnap) {
                    p2 = { x: blockSnap.x, y: blockSnap.y };
                    console.log('🔗 Pipe end snapped to BLOCK CONNECTION');
                } else if (pipeSnap) {
                    p2 = { x: pipeSnap.x, y: pipeSnap.y };
                    console.log('🔗 Pipe end snapped to PIPE END');
                } else if (blockEdgeSnap) {
                    p2 = { x: blockEdgeSnap.x, y: blockEdgeSnap.y };
                    console.log('🔗 Pipe end snapped to BLOCK EDGE');
                } else {
                    p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                }
            }
            // --- GÜNCELLEME SONU ---

            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            console.log('🔧 Creating pipe:', { p1, p2, length, minLength: 5 });

            if (length > 5) {
                const pipeType = state.currentPlumbingPipeType || 'STANDARD';
                const newPipe = createPlumbingPipe(p1.x, p1.y, p2.x, p2.y, pipeType);
                console.log('🔧 Pipe created:', newPipe);
                if (newPipe) {
                    // EXPLICIT CONNECTION TRACKING
                    const startSnap = snapToConnectionPoint(p1, 2) || (state.startPoint && state.startPoint.snapType === 'PLUMBING_BLOCK_EDGE' ? { block: state.startPoint.wall } : null); // 'wall' burada 'block'
                    if (startSnap && startSnap.block) {
                        if (startSnap.block.blockType !== 'SERVIS_KUTUSU') {
                            newPipe.connections.start = {
                                blockId: startSnap.block.id || startSnap.block,
                                connectionIndex: startSnap.connectionIndex,
                                blockType: startSnap.block.blockType
                            };
                            console.log('✅ P1 connected to', startSnap.block.blockType, 'connection', startSnap.connectionIndex);
                        }
                    }

                    const endSnap = snapToConnectionPoint(p2, 2) || (blockEdgeSnap ? { block: blockEdgeSnap.wall } : null); // 'wall' burada 'block'
                    if (endSnap && endSnap.block) {
                        if (endSnap.block.blockType !== 'SERVIS_KUTUSU') {
                            newPipe.connections.end = {
                                blockId: endSnap.block.id || endSnap.block,
                                connectionIndex: endSnap.connectionIndex,
                                blockType: endSnap.block.blockType
                            };
                            console.log('✅ P2 connected to', endSnap.block.blockType, 'connection', endSnap.connectionIndex);
                        }
                    }

                    // isConnectedToValve mantığı
                    const startBlock = startSnap ? startSnap.block : null;
                    if (startBlock &&
                        (startBlock.blockType === 'SERVIS_KUTUSU' ||
                            startBlock.blockType === 'VANA' ||
                            startBlock.blockType === 'SAYAC')) {
                        newPipe.isConnectedToValve = true;
                    } else {
                        const prevPipe = state.plumbingPipes?.find(p =>
                            (p.p2 === p1) || (Math.hypot(p.p2.x - p1.x, p.p2.y - p1.y) < 1)
                        );
                        if (prevPipe && prevPipe.isConnectedToValve) {
                            newPipe.isConnectedToValve = true;
                        } else {
                            newPipe.isConnectedToValve = false;
                        }
                    }

                    if (!state.plumbingPipes) state.plumbingPipes = [];
                    state.plumbingPipes.push(newPipe);
                    geometryChanged = true;
                    needsUpdate3D = true;
                    objectJustCreated = true;
                } else {
                    console.error('❌ newPipe is null/undefined!');
                }
            } else {
                console.warn('⚠️ Pipe too short:', length, '< 5');
            }

            // GÜNCELLENDİ: Zincirleme çizim için sonraki başlangıç noktası
            const nextSnap = snapToConnectionPoint(p2, 10) || snapToPipeEndpoint(p2, 10);
            const nextStart = nextSnap ? { x: nextSnap.x, y: nextSnap.y } : p2;
            setState({ startPoint: nextStart });
        }
        ESKI KOD SONU */
        // --- Menfez Çizim Modu ---
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