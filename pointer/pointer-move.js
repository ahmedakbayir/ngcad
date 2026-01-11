// pointer/pointer-move.js
import { onPointerMoveGuide, getGuideAtPoint } from '../architectural-objects/guide-handler.js';
import { onPointerMove as onPointerMoveDoor } from '../architectural-objects/door-handler.js';
import { onPointerMove as onPointerMoveWindow } from '../architectural-objects/window-handler.js';
import { onPointerMove as onPointerMoveColumn, getColumnAtPoint, isPointInColumn } from '../architectural-objects/columns.js';
import { onPointerMove as onPointerMoveBeam, getBeamAtPoint, isPointInBeam } from '../architectural-objects/beams.js';
import { onPointerMove as onPointerMoveStairs, getStairAtPoint, isPointInStair } from '../architectural-objects/stairs.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { calculateSymmetryPreview, calculateCopyPreview } from '../draw/symmetry.js'; // <-- DÜZELTME: Bu import eklendi
import { screenToWorld, distToSegmentSquared, findNodeAt } from '../draw/geometry.js';
import { getObjectAtPoint } from '../general-files/actions.js'; // getObjectAtPoint eklendi
import { state, dom, setState, isObjectInteractable } from '../general-files/main.js';
import { getSmartSnapPoint } from '../general-files/snap.js';
import { positionLengthInput } from '../general-files/ui.js';
import { currentModifierKeys } from '../general-files/input.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { setCameraPosition, setCameraRotation } from '../scene3d/scene3d-camera.js';
import { onPointerMove as onPointerMoveWall, getWallAtPoint } from '../wall/wall-handler.js';
import { processWalls, cleanupNodeHoverTimers } from '../wall/wall-processor.js';
import { orbitControls, camera } from '../scene3d/scene3d-core.js';
import { toggle3DView } from '../general-files/ui.js';
// Plumbing functions now handled by plumbingManager

// DÜZELTME: Debounce zamanlayıcısı eklendi
const SYMMETRY_PREVIEW_DEBOUNCE_MS = 50; // 50ms gecikme

// Helper: Verilen bir noktanın duvar merkez çizgisine snap olup olmadığını kontrol eder.
function getSnappedWallInfo(point, tolerance = 1.0) { // Tolerans: 1 cm
    const currentFloorId = state.currentFloor?.id;
    const walls = (state.walls || []).filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId);
    for (const wall of walls) {
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

        const currentFloorId_delete = state.currentFloor?.id;
        const walls_delete = (state.walls || []).filter(w => !currentFloorId_delete || !w.floorId || w.floorId === currentFloorId_delete);

        // Duvar silme
        const wallsToDelete = new Set();
        for (const wall of walls_delete) {
            if (!wall.p1 || !wall.p2) continue;
            const wallPx = wall.thickness || state.wallThickness;
            const currentToleranceSq = (wallPx / 2 + 3 / state.zoom) ** 2;
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

        // --- YENİ EKLENDİ: Rehber Silme ---
        const guidesToDelete = new Set();
        const tolerance = 8 / state.zoom;
        const guideHit = getGuideAtPoint(mousePos, tolerance);
        if (guideHit) {
            guidesToDelete.add(guideHit.object);
        }
        if (guidesToDelete.size > 0) {
            const guidesToDeleteArray = Array.from(guidesToDelete);
            const newGuides = state.guides.filter(g => !guidesToDeleteArray.includes(g));
            setState({ guides: newGuides });
            // needsProcessing = false; // Rehber silmek processWalls gerektirmez
        }
        // --- YENİ SONU ---

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

        // v2'de plumbingManager üzerinden silme işlemleri yapılıyor
        // Eski plumbing blok/boru/vana silme fonksiyonları kaldırıldı


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

    // === BORU ÇİZİM MODU AKTİF İSE ÖNCELİKLİ İŞLE ===
    // Seç modunda boru çizim aktif olsa bile seçim öncelikli
    if (plumbingManager.interactionManager?.boruCizimAktif && state.currentMode !== 'select') {
        const handled = plumbingManager.interactionManager.handlePointerMove(e);
        if (handled) {
            updateMouseCursor(); // Cursor'ı güncelle
            return;
        }
    }

    // --- Yeni Tesisat Sistemi (v2) ---
    // Tesisat nesneleri tüm modlarda interaktif olmalı (select, plumbingV2, karma)
    const isPlumbingMode = state.currentMode === 'plumbingV2' ||
                          state.currentMode === 'drawPlumbingPipe' ||
                          state.currentMode === 'drawPlumbingBlock' ||
                          state.currentMode === 'select' ||
                          state.currentMode === 'MİMARİ-TESİSAT';

    if (isPlumbingMode && plumbingManager.interactionManager) {
        // --- DEĞİŞİKLİK BURADA: MİMARİ MOD KONTROLÜ ---
        // Mimari modda tesisat manager'ı hover olaylarını yutmamalı
        const skipPlumbingInteraction = state.currentDrawingMode === 'MİMARİ' && !plumbingManager.interactionManager.boruCizimAktif;

        if (!skipPlumbingInteraction) {
            const handled = plumbingManager.interactionManager.handlePointerMove(e);
            if (handled) {
                updateMouseCursor(); // Cursor'ı güncelle
                return;
            }
        }
        // --- DEĞİŞİKLİK SONU ---
    }
    // --- Yeni Tesisat Sistemi Sonu ---

    // CTRL + Orta tuş ile 2D/3D geçiş
    if (state.isCtrl3DToggling) {
        const deltaX = e.clientX - state.ctrl3DToggleStart.x;
        const deltaY = e.clientY - state.ctrl3DToggleStart.y;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        // Eğer fare 5 pikselden fazla hareket ettiyse sürükleme olarak kabul et
        if (distance > 5 && !state.ctrl3DToggleMoved) {
            setState({ ctrl3DToggleMoved: true });

            // 3D panel kapalıysa aç
            if (!dom.mainContainer.classList.contains('show-3d')) {
                toggle3DView();
            }
        }

        // Eğer sürükleme başladıysa ve 3D panel açıksa kamerayı döndür
        if (state.ctrl3DToggleMoved && dom.mainContainer.classList.contains('show-3d')) {
            if (!orbitControls || !camera) {
                console.warn('OrbitControls veya camera henüz başlatılmadı');
                return;
            }

            // Son pozisyonla şimdiki pozisyon arasındaki farkı hesapla
            const deltaX = e.clientX - state.ctrl3DToggleLastPos.x;
            const deltaY = e.clientY - state.ctrl3DToggleLastPos.y;

            const azimuthSpeed = 0.005;
            const polarSpeed = 0.005;

            orbitControls.rotateLeft(deltaX * azimuthSpeed);
            orbitControls.rotateUp(-deltaY * polarSpeed);
            orbitControls.update();

            // 3D sahneyi güncelle (render et)
            update3DScene();

            // Son pozisyonu güncelle
            setState({ ctrl3DToggleLastPos: { x: e.clientX, y: e.clientY } });
        }

        updateMouseCursor();
        return;
    }

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
    // Sürükleme sırasında da snap aktif olsun
    let snappedPos = getSmartSnapPoint(e, true); // Her zaman grid snap kullan

    // Snaplenmemiş pozisyonu al
    const rect = dom.c2d.getBoundingClientRect();
    const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    setState({
        mousePos: snappedPos,
        unsnappedMousePos: unsnappedPos // Simülasyonlar için snap uygulanmamış pozisyon
    });

    // Stretch dragging
    if (state.isStretchDragging) {
        // TODO: Stretch dragging mantığını buraya taşı veya ayrı fonksiyona çıkar
        // update3DScene(); // <-- SİLİNDİ
        updateMouseCursor(); // İmleci güncelle
        return;
    }



    // Normal Sürükleme
    if (state.isDragging && state.selectedObject) {
        // Nesne tipine göre ilgili onPointerMove fonksiyonunu çağır
        switch (state.selectedObject.type) {
            case 'camera':
                // Kamera pozisyon veya yön sürükleme
                if (state.cameraHandle === 'position') {
                    // Kamera pozisyonunu sürükle (XZ düzleminde)
                    const newX = unsnappedPos.x + state.dragOffset.x;
                    const newZ = unsnappedPos.y + state.dragOffset.y;
                    setCameraPosition(newX, newZ);
                } else if (state.cameraHandle === 'direction') {
                    // Kamera yönünü döndür
                    const dx = unsnappedPos.x - state.cameraCenter.x;
                    const dz = unsnappedPos.y - state.cameraCenter.y;
                    // Three.js koordinat sistemine uygun yaw hesaplama (-cos kullanıldığı için -dz)
                    const newYaw = Math.atan2(dx, -dz);
                    setCameraRotation(newYaw);
                }
                break;
            case 'arcControl':
                // Arc kontrol noktası sürükleme
                const wall = state.selectedObject.object;
                const handle = state.selectedObject.handle;
                if (handle === 'control1') {
                    wall.arcControl1.x = snappedPos.x;
                    wall.arcControl1.y = snappedPos.y;
                } else if (handle === 'control2') {
                    wall.arcControl2.x = snappedPos.x;
                    wall.arcControl2.y = snappedPos.y;
                }
                break;
            case 'guide': onPointerMoveGuide(snappedPos, unsnappedPos); break;
            case 'column': onPointerMoveColumn(snappedPos, unsnappedPos); break;
            case 'beam': onPointerMoveBeam(snappedPos, unsnappedPos); break;
            case 'stairs': onPointerMoveStairs(snappedPos, unsnappedPos); break;
            case 'plumbingBlock': {
                // v2'de plumbingManager üzerinden yönetiliyor
                const block = state.selectedObject?.object;
                if (block) {
                    if (block.center) {
                        block.center.x = snappedPos.x;
                        block.center.y = snappedPos.y;
                    } else if (block.x !== undefined) {
                        block.x = snappedPos.x;
                        block.y = snappedPos.y;
                    }
                }
                break;
            }
            case 'plumbingPipe': {
                // Boru gövdesi taşıma
                const pipeObj = state.selectedObject?.object;
                if (pipeObj && pipeObj.p1 && pipeObj.p2 && state.initialDragPoint) {
                    // Delta hesapla
                    const deltaX = snappedPos.x - state.initialDragPoint.x;
                    const deltaY = snappedPos.y - state.initialDragPoint.y;

                    // İlk taşımada başlangıç pozisyonlarını kaydet
                    if (!state.pipeInitialP1) {
                        setState({
                            pipeInitialP1: { x: pipeObj.p1.x, y: pipeObj.p1.y },
                            pipeInitialP2: { x: pipeObj.p2.x, y: pipeObj.p2.y }
                        });
                    }

                    if (state.pipeInitialP1 && state.pipeInitialP2) {
                        // Her iki uç noktayı da taşı
                        pipeObj.p1.x = state.pipeInitialP1.x + deltaX;
                        pipeObj.p1.y = state.pipeInitialP1.y + deltaY;
                        pipeObj.p2.x = state.pipeInitialP2.x + deltaX;
                        pipeObj.p2.y = state.pipeInitialP2.y + deltaY;
                    }
                }
                break;
            }
            case 'valve':
                // Vana taşıma (boru üzerinde kaydırma ve başka boruya geçirme)
                const valve = state.selectedObject.object;
                const currentPipe = state.selectedObject.pipe;

                // Fare pozisyonu
                const mouseX = unsnappedPos.x;
                const mouseY = unsnappedPos.y;

                // En yakın boruyu bul
                const currentFloorId_valve = state.currentFloor?.id;
                const pipes = (state.plumbingPipes || []).filter(p => p.floorId === currentFloorId_valve);

                let closestPipe = null;
                let minDist = Infinity;
                let closestPos = 0;

                for (const pipe of pipes) {
                    const dx = pipe.p2.x - pipe.p1.x;
                    const dy = pipe.p2.y - pipe.p1.y;
                    const pipeLength = Math.hypot(dx, dy);
                    if (pipeLength < 0.1) continue;

                    // Fare pozisyonunun boru üzerindeki izdüşümü
                    const t = Math.max(0, Math.min(1,
                        ((mouseX - pipe.p1.x) * dx + (mouseY - pipe.p1.y) * dy) / (dx * dx + dy * dy)
                    ));
                    const projX = pipe.p1.x + t * dx;
                    const projY = pipe.p1.y + t * dy;
                    const dist = Math.hypot(mouseX - projX, mouseY - projY);

                    if (dist < minDist) {
                        minDist = dist;
                        closestPipe = pipe;
                        closestPos = t * pipeLength;
                    }
                }

                // En yakın boru bulunduysa
                if (closestPipe && minDist < 30) { // 30 cm tolerans
                    // Yeni pozisyonda yer var mı kontrol et (valve.width import edilmeli)
                    const valveWidth = valve.width || 12;

                    if (isSpaceForValve(closestPipe, closestPos, valveWidth, valve)) {
                        // Vana pozisyonunu güncelle
                        valve.pos = closestPos;

                        // Eğer boru değiştiyse
                        if (closestPipe !== currentPipe) {
                            // Eski borudan çıkar
                            if (currentPipe && currentPipe.valves) {
                                currentPipe.valves = currentPipe.valves.filter(v => v !== valve);
                            }

                            // Yeni boruya ekle
                            if (!closestPipe.valves) closestPipe.valves = [];
                            closestPipe.valves.push(valve);

                            // selectedObject'i güncelle
                            state.selectedObject.pipe = closestPipe;
                        }
                    }
                }
                break;
            case 'wall':
                onPointerMoveWall(snappedPos, unsnappedPos);
                cleanupNodeHoverTimers(); // Timer'ları temizle
                break;
            case 'door': onPointerMoveDoor(unsnappedPos); break;
            case 'window': onPointerMoveWindow(unsnappedPos); break;
            case 'vent':
                const currentFloorId_vent = state.currentFloor?.id;
                const walls_vent = (state.walls || []).filter(w => !currentFloorId_vent || !w.floorId || w.floorId === currentFloorId_vent);
                const vent = state.selectedObject.object; const oldWall = state.selectedObject.wall;
                const targetX = unsnappedPos.x + state.dragOffset.x; const targetY = unsnappedPos.y + state.dragOffset.y; const targetPos = { x: targetX, y: targetY };
                let closestWall = null; let minDistSq = Infinity; const bodyHitTolerance = state.wallThickness * 2;
                for (const w of walls_vent) {
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
                        const minPos = vent.width / 2 + ventMargin; const maxPos = wallLen - vent.width / 2 + ventMargin;
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
        // update3DScene(); // <-- SİLİNDİ (Sürükleme sonrası 3D'yi güncelle)
    }

    // --- DÜZELTME: Simetri önizlemesi debounce (gecikmeli) mantığı ile değiştirildi ---
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
                const snappedAngle = Math.round(angle / 15) * 15;
                const snappedAngleRad = snappedAngle * Math.PI / 180;

                axisP2 = {
                    x: state.symmetryAxisP1.x + distance * Math.cos(snappedAngleRad),
                    y: state.symmetryAxisP1.y + distance * Math.sin(snappedAngleRad)
                };
            }
        }

        // Eksenin ikinci noktasını state'e hemen ata (eksen çizgisi çizimi için)
        setState({ symmetryAxisP2: axisP2 });

        // --- DEBOUNCE LOGIC (state.symmetryPreviewTimer kullanarak) ---
        // Önceki zamanlayıcıyı temizle
        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
        }

        // Kapatılacak (closure) değişkenleri ayarla
        const p1 = state.symmetryAxisP1; // Tıklanan ilk nokta
        const p2 = axisP2; // Farenin *şu anki* pozisyonu
        const isCtrl = currentModifierKeys.ctrl; // Ctrl'nin *şu anki* durumu

        // Yeni bir zamanlayıcı ayarla
        const newTimer = setTimeout(() => {
            // Zamanlayıcı çalıştığında, hala simetri modunda mıyız ve ilk nokta değişti mi diye bak
            if (state.currentMode === "drawSymmetry" && state.symmetryAxisP1 === p1) {
                // Ağır hesaplama fonksiyonlarını *şimdi* çağır
                if (isCtrl) {
                    calculateCopyPreview(p1, p2);
                } else {
                    calculateSymmetryPreview(p1, p2);
                }
            }
            // Zamanlayıcıyı state'ten temizle
            setState({ symmetryPreviewTimer: null });
        }, SYMMETRY_PREVIEW_DEBOUNCE_MS);

        // Yeni zamanlayıcıyı state'e kaydet
        setState({ symmetryPreviewTimer: newTimer });
        // --- END DEBOUNCE LOGIC ---

    } else if (state.currentMode !== "drawSymmetry") {
        // Eğer simetri modundan çıktıysak, bekleyen bir zamanlayıcı varsa iptal et
        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
            setState({ symmetryPreviewTimer: null });
        }
    }
    // --- DÜZELTME SONU ---

    // Her fare hareketinde imleci güncelle
    updateMouseCursor();
}

// pointer-move.js -> updateMouseCursor fonksiyonu

function updateMouseCursor() {
    const { c2d } = dom;
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, zoom, isCtrlDeleting } = state;

    // Önceki imleç sınıflarını temizle (sadece sınıf tabanlı olanları)
    const cursorClasses = [
        'dragging-body', 'dragging-node', 'rotate-handle-hover', /* resize sınıflarını buradan kaldırın */
        'hover-node', 'hover-object-body', 'hover-wall-body',
        'panning', 'delete-mode', 'hover-room-label',
        'hover-guide'
    ];
    cursorClasses.forEach(cls => c2d.classList.remove(cls));
    c2d.style.cursor = ''; // Stili her seferinde sıfırla

    // --- ÖNCELİK 1: Özel Durumlar ---
    if (isCtrlDeleting && currentModifierKeys.alt && !currentModifierKeys.ctrl && !currentModifierKeys.shift) {
        c2d.style.cursor = 'crosshair'; // Silme için crosshair kullanabiliriz
        c2d.classList.add('delete-mode'); // İsteğe bağlı: Kırmızı efekt için sınıf kalabilir
        return;
    }
    if (state.isDraggingRoomName || isPanning) {
        c2d.style.cursor = 'grabbing'; // Pan ve oda ismi sürükleme
        // c2d.classList.add('panning'); // Sınıf da kalabilir
        return;
    }
    if (isDragging && selectedObject) {
        const handle = selectedObject.handle;
        if (typeof handle === 'string') {
            if (handle === 'body') {
                c2d.style.cursor = 'grabbing'; // Gövde sürükleme
                // c2d.classList.add('dragging-body');
            } else if (handle === 'p1' || handle === 'p2') {
                c2d.style.cursor = 'move'; // Node sürükleme
                // c2d.classList.add('dragging-node');
            } else if (handle.startsWith('corner_')) {
                c2d.classList.add('rotate-handle-hover'); // Döndürme sınıfını KULLAN (CSS'e ekledik)
            } else if (handle.startsWith('edge_')) {
                // --- YENİ: Doğrudan stil ata ---
                const rotation = selectedObject.object.rotation || 0;
                const angleDeg = ((rotation % 360) + 360) % 360;
                let cursorStyle = 'ew-resize'; // Varsayılan yatay
                const isNearVertical = (angleDeg > 45 && angleDeg < 135) || (angleDeg > 225 && angleDeg < 315);
                if (handle === 'edge_top' || handle === 'edge_bottom') {
                    cursorStyle = isNearVertical ? 'ew-resize' : 'ns-resize'; // Dikey kenar için
                } else { // edge_left veya edge_right
                    cursorStyle = isNearVertical ? 'ns-resize' : 'ew-resize'; // Yatay kenar için
                }
                c2d.style.cursor = cursorStyle; // Stili doğrudan ata
                // --- YENİ SONU ---
            } else {
                c2d.style.cursor = 'grabbing'; // Bilinmeyen handle
            }
        } else {
            c2d.style.cursor = 'grabbing'; // handle string değilse
        }
        return;
    }

    // --- ÖNCELİK 2: Çizim Modları ---
    // ... (Bu kısım aynı kalabilir, doğrudan stil ataması yapıyor) ...
    let modeCursorStyle = '';
    switch (currentMode) {
        case 'drawWall':
        case 'drawRoom':
            modeCursorStyle = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><line x1=\"16\" y1=\"4\" x2=\"16\" y2=\"28\" stroke=\"white\" stroke-width=\"1.5\"/><line x1=\"4\" y1=\"16\" x2=\"28\" y2=\"16\" stroke=\"white\" stroke-width=\"1.5\"/><path fill=\"white\" transform=\"translate(20 20) scale(0.5)\" d=\"M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.21c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z\"/></svg>') 16 16, crosshair"; // Örnek duvar ikonu + fallback
            if (currentMode === 'drawRoom') {
                modeCursorStyle = "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\"><line x1=\"16\" y1=\"4\" x2=\"16\" y2=\"28\" stroke=\"white\" stroke-width=\"1.5\"/><line x1=\"4\" y1=\"16\" x2=\"28\" y2=\"16\" stroke=\"white\" stroke-width=\"1.5\"/><rect x=\"20\" y=\"20\" width=\"10\" height=\"8\" fill=\"none\" stroke=\"white\" stroke-width=\"1.5\" rx=\"1\"/></svg>') 16 16, crosshair"; // Oda ikonu + fallback
            }
            break;
        case 'drawColumn':
        case 'drawBeam':
        case 'drawStairs':
        case 'drawPlumbingPipe':
        case 'drawValve':
        case 'drawDoor':
        case 'drawWindow':
        case 'drawVent':
        case 'drawSymmetry':
        case 'drawGuideAngular':
        case 'drawGuideFree':
            modeCursorStyle = 'crosshair';
            break;
        case 'plumbingV2':
            // Boru aracı seçiliyse veya boru çizim modu aktifse özel cursor göster
            if (plumbingManager.activeTool === 'boru' || plumbingManager.interactionManager?.boruCizimAktif) {
                // Custom SVG cursor for pipe drawing - hot spot kalemin ucunda (4, 22)
                modeCursorStyle = "url('general-files/pipe-cursor.svg') 6 36, crosshair";
            } else {
                modeCursorStyle = 'crosshair';
            }
            break;
        case 'select':
            // Select modu aşağıda ele alınacak
            break;
        default:
            modeCursorStyle = 'default';
    }

    if (modeCursorStyle) {
        c2d.style.cursor = modeCursorStyle;
        return;
    }


    // --- ÖNCELİK 3: Select Modu - Hover Durumları ---
    if (currentMode === 'select') {
        const hoveredObject = getObjectAtPoint(mousePos);

        if (hoveredObject) {
            // İlk olarak nesnenin interaktif olup olmadığını kontrol et
            const objectType = hoveredObject.type;
            const isInteractive = isObjectInteractable(objectType);

            // Eğer nesne interaktif değilse, cursor değiştirme
            if (!isInteractive) {
                c2d.style.cursor = 'default';
                return;
            }

            // --- YENİ ÖNCELİKLİ KONTROL ---
            // 1. Mahal Adı/Alanı Hover (Handle'dan bağımsız)
            if (hoveredObject.type === 'roomName' || hoveredObject.type === 'roomArea') {
                c2d.style.cursor = 'grab'; // Oda ismi/alanı (İstediğiniz sarı "hand" ikonu)
                // c2d.classList.add('hover-room-label'); // (Opsiyonel sınıf)
                return; // Öncelikli olarak çık
            }
            // --- YENİ KONTROL SONU ---
            // 2. Mahal Alanı (Etiket hariç)
            if (hoveredObject.type === 'room') {
                c2d.style.cursor = 'default'; // Alanın üzeri 'default' (beyaz ok)
                return; // Çık
            }
            // --- GÜNCELLENMİŞ KONTROL SONU ---
            const handle = hoveredObject.handle;
            if (typeof handle === 'string') {
                // 1. Handle Hover
                if (handle.startsWith('corner_')) {
                    c2d.classList.add('rotate-handle-hover'); // Döndürme sınıfını KULLAN
                    return;
                } else if (handle.startsWith('edge_')) {
                    // --- YENİ: Doğrudan stil ata ---
                    const rotation = hoveredObject.object.rotation || 0;
                    const angleDeg = ((rotation % 360) + 360) % 360;
                    let cursorStyle = 'ew-resize';
                    const isNearVertical = (angleDeg > 45 && angleDeg < 135) || (angleDeg > 225 && angleDeg < 315);
                    if (handle === 'edge_top' || handle === 'edge_bottom') {
                        cursorStyle = isNearVertical ? 'ew-resize' : 'ns-resize';
                    } else {
                        cursorStyle = isNearVertical ? 'ns-resize' : 'ew-resize';
                    }
                    c2d.style.cursor = cursorStyle; // Stili doğrudan ata
                    // --- YENİ SONU ---
                    return;
                } else if (handle === 'p1' || handle === 'p2') {
                    // --- GÜNCELLEME: guide handle'ı da 'move' olmalı ---
                    if (hoveredObject.type === 'guide' || hoveredObject.type === 'wall') {
                        c2d.style.cursor = 'move'; // Node veya Guide P1/P2 hover
                    } else {
                        c2d.style.cursor = 'move';
                    }
                    // c2d.classList.add('hover-node');
                    return;
                }
                // 2. Gövde Hover
                else if (handle === 'body') {
                    if (hoveredObject.type === 'wall') {
                        c2d.style.cursor = 'default'; // Duvar gövdesi
                        // c2d.classList.add('hover-wall-body');
                        // } else if (hoveredObject.type === 'room' || hoveredObject.type === 'roomName' || hoveredObject.type === 'roomArea') {
                        //      c2d.style.cursor = 'grab'; // Oda ismi/alanı
                        //      // c2d.classList.add('hover-room-label');
                    }
                    // --- YENİ EKLENDİ ---
                    else if (hoveredObject.type === 'guide') {
                        c2d.style.cursor = 'move'; // Rehber gövdesi
                        // c2d.classList.add('hover-guide'); // (Opsiyonel sınıf)
                    }
                    // --- YENİ SONU ---
                    else {
                        c2d.style.cursor = 'grab'; // Diğer nesne gövdeleri (kolon, kiriş, merdiven, kapı, pencere)
                        // c2d.classList.add('hover-object-body');
                    }
                    return;
                }
            }
            // handle string değilse veya bilinmeyen handle ise varsayılana düş
        }

        // 3. Node Hover (getObjectAtPoint bulamadıysa, ek kontrol)
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.style.cursor = 'move'; // Node hover
            // c2d.classList.add('hover-node');
            return;
        }

        // 4. Hiçbir şeyin üzerinde değilse
        c2d.style.cursor = 'default';
        return;
    }

    // --- Varsayılan ---
    c2d.style.cursor = 'default';
}