import { getOrCreateNode } from '../draw/geometry.js';
import { state, setState, dom } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { processWalls, cleanupNodeHoverTimers } from '../wall/wall-processor.js';
import { wallExists } from '../wall/wall-handler.js'; // <-- YENİ
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { toggle3DView } from '../general-files/ui.js';
import { orbitControls, camera } from '../scene3d/scene3d-core.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { draw2D } from '../draw/draw2d.js';
import * as THREE from 'three';

export function onPointerUp(e) {

// --- YENİ: CTRL + Orta Tuş Bırakma Mantığı ---
    if (state.isCtrl3DToggling) {
        dom.c2d.releasePointerCapture(e.pointerId);

        let finalTilt = state.camera3DTilt || 0;

        if (!state.ctrl3DToggleMoved) {
            // Sürükleme olmadı -> Sadece Tıklandı -> TOGGLE
            // Eğer şu an 0'a yakınsa standart 3D açısına (örn: 60) getir, yoksa sıfırla
            if (finalTilt < 5) {
                finalTilt = 60;
                setState({ is3DPerspectiveActive: true });
            } else {
                finalTilt = 0;
                setState({ is3DPerspectiveActive: false });
            }
        } else {
            // Sürükleme oldu -> SNAP KONTROLÜ
            // İSTEK: 0°-5° arasında iken 0° ye sabitlenip 2D görünüme geçme
            if (finalTilt < 5) {
                finalTilt = 0;
                setState({ is3DPerspectiveActive: false });
            }
        }

        // Yeni açıyı kaydet ve çiz
        setState({ 
            camera3DTilt: finalTilt,
            isCtrl3DToggling: false,
            ctrl3DToggleStart: null,
            ctrl3DToggleLastPos: null,
            ctrl3DToggleMoved: false
        });
        draw2D();
        return;
    }


    if (state.isCtrlDeleting) {
        setState({ isCtrlDeleting: false });
        saveState();
        return;
    }

    // CTRL + Orta tuş ile 2D/3D geçiş (AYNI SAHNE İÇİNDE, KATI MODEL AÇILMAZ!)
    // SADECE orta tuş (button 1) bırakıldığında çalış
    if (state.isCtrl3DToggling && e.button === 1) {
        // Eğer sürükleme olmadıysa (sadece tıklama) -> 1s animasyonla kamera döndür
        if (!state.ctrl3DToggleMoved && orbitControls && camera) {
            const currentPolarAngle = orbitControls.getPolarAngle();
            const currentPolarDegrees = currentPolarAngle * (180 / Math.PI);

            // Hedef açı belirle
            let targetPolarAngle;
            if (currentPolarDegrees < 10) {
                // 2D'den 3D'ye geç (60° perspektif)
                targetPolarAngle = 60 * (Math.PI / 180);
                // Animasyon için is3DPerspectiveActive aç
                setState({ is3DPerspectiveActive: true });
            } else {
                // 3D'den 2D'ye geç (0° üstten bakış)
                targetPolarAngle = 0;
            }

            // 1 saniyelik animasyon
            const duration = 1000;
            const startTime = Date.now();
            const startPolarAngle = currentPolarAngle;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Easing (ease-in-out)
                const eased = progress < 0.5
                    ? 2 * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 2) / 2;

                const newPolarAngle = startPolarAngle + (targetPolarAngle - startPolarAngle) * eased;
                orbitControls.setPolarAngle(newPolarAngle);
                orbitControls.update();

                // Kamera açılarını state'e kaydet
                setState({
                    camera3DPolarAngle: orbitControls.getPolarAngle(),
                    camera3DAzimuthalAngle: orbitControls.getAzimuthalAngle()
                });

                // 2D ve 3D sahneyi render et
                draw2D();
                update3DScene();

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Animasyon bitti, 2D'ye döndüyse is3DPerspectiveActive'i kapat
                    const finalPolarDegrees = orbitControls.getPolarAngle() * (180 / Math.PI);
                    if (finalPolarDegrees < 10) {
                        setState({ is3DPerspectiveActive: false });
                    }
                    // Son bir kez daha render et
                    draw2D();
                    update3DScene();
                }
            };

            animate();
        }
        // Sürükleme olduysa, kamera açısına göre is3DPerspectiveActive ayarla
        else if (state.ctrl3DToggleMoved && orbitControls) {
            const finalPolarDegrees = orbitControls.getPolarAngle() * (180 / Math.PI);
            if (finalPolarDegrees < 10) {
                setState({ is3DPerspectiveActive: false });
            }
        }

        // State'i temizle
        setState({
            isCtrl3DToggling: false,
            ctrl3DToggleStart: null,
            ctrl3DToggleLastPos: null,
            ctrl3DToggleMoved: false
        });
        return;
    }

    // --- Yeni Tesisat Sistemi (v2) ---
    // Tesisat nesneleri tüm modlarda interaktif olmalı (select, plumbingV2, karma)
    const isPlumbingMode = state.currentMode === 'plumbingV2' ||
                          state.currentMode === 'drawPlumbingPipe' ||
                          state.currentMode === 'drawPlumbingBlock' ||
                          state.currentMode === 'select' ||
                          state.currentMode === 'MİMARİ-TESİSAT';

    if (isPlumbingMode && plumbingManager.interactionManager) {
        const handled = plumbingManager.interactionManager.handlePointerUp(e);
        if (handled) {
            return;
        }
    }
    // --- Yeni Tesisat Sistemi Sonu ---

    if (state.isDraggingRoomName) {
        const room = state.isDraggingRoomName;
        const point = turf.point(room.center);

        if (!turf.booleanPointInPolygon(point, room.polygon)) {
            const centerPoint = turf.pointOnFeature(room.polygon);
            room.center = centerPoint.geometry.coordinates;
        }

        setState({ isDraggingRoomName: null, roomDragStartPos: null, roomOriginalCenter: null });
        saveState();
        return;
    }

    setState({ isSnapLocked: false, lockedSnapPoint: null });

    if (state.isStretchDragging) {
        const { stretchWallOrigin, dragStartPoint, stretchMode, mousePos } = state;
        let { walls, doors, nodes } = state;

        const displacementVec = { x: mousePos.x - dragStartPoint.x, y: mousePos.y - dragStartPoint.y };
        const wallVec = { x: stretchWallOrigin.p2.x - stretchWallOrigin.p1.x, y: stretchWallOrigin.p2.y - stretchWallOrigin.p1.y };
        const normalVec = { x: -wallVec.y, y: wallVec.x };
        const len = Math.hypot(normalVec.x, normalVec.y);
        if (len > 0.1) {
            normalVec.x /= len;
            normalVec.y /= len;
        }
        const distance = displacementVec.x * normalVec.x + displacementVec.y * normalVec.y;
        const dx = distance * normalVec.x, dy = distance * normalVec.y;

        if (Math.hypot(dx, dy) > 0.1) {
            const p1_orig = stretchWallOrigin.p1;
            const p2_orig = stretchWallOrigin.p2;

            let newWallsToAdd = [];

            const t1_node = getOrCreateNode(p1_orig.x + dx, p1_orig.y + dy);
            const t2_node = getOrCreateNode(p2_orig.x + dx, p2_orig.y + dy);

            if (!wallExists(p1_orig, t1_node)) newWallsToAdd.push({ type: "wall", p1: p1_orig, p2: t1_node });
            if (!wallExists(p2_orig, t2_node)) newWallsToAdd.push({ type: "wall", p1: p2_orig, p2: t2_node });
            if (!wallExists(t1_node, t2_node)) newWallsToAdd.push({ type: "wall", p1: t1_node, p2: t2_node });

            if (stretchMode === "shift") {
                const wallToDelete = state.selectedObject.object;
                const p1ToDelete = wallToDelete.p1, p2ToDelete = wallToDelete.p2;

                let finalDoors = doors.filter((d) => d.wall !== wallToDelete);
                let finalWalls = walls.filter((w) => w !== wallToDelete).concat(newWallsToAdd);

                let finalNodes = [...nodes];
                const p1IsUsed = finalWalls.some((w) => w.p1 === p1ToDelete || w.p2 === p1ToDelete);
                if (!p1IsUsed) finalNodes = finalNodes.filter((n) => n !== p1ToDelete);

                const p2IsUsed = finalWalls.some((w) => w.p1 === p2ToDelete || w.p2 === p2ToDelete);
                if (!p2IsUsed) finalNodes = finalNodes.filter((n) => n !== p2ToDelete);

                setState({ doors: finalDoors, walls: finalWalls, nodes: finalNodes });
            } else {
                 setState({ walls: walls.concat(newWallsToAdd) });
            }
        }
    }

    const didClick = Math.hypot(e.clientX - state.dragStartScreen.x, e.clientY - state.dragStartScreen.y) < 5;

    if (state.aDragOccurred) {
        if (state.isSweeping) {
            const newWalls = state.sweepWalls.filter(w => Math.hypot(w.p1.x - w.p2.x, w.p1.y - w.p2.y) > 1);
            setState({ walls: [...state.walls, ...newWalls] });
        }

        if (state.selectedObject?.type === "wall" && state.selectedObject.handle === "body") {
            const wallsToProcess = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMove = new Set();
            wallsToProcess.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

            const gridSpacing = state.gridOptions.spacing;

            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    const movedX = node.x - originalPos.x;
                    const movedY = node.y - originalPos.y;

                    const roundedMovedX = Math.round(movedX / gridSpacing) * gridSpacing;
                    const roundedMovedY = Math.round(movedY / gridSpacing) * gridSpacing;

                    node.x = originalPos.x + roundedMovedX;
                    node.y = originalPos.y + roundedMovedY;
                }

                // BİRLEŞTİRME KAPALI - Lokal kalınlık için
                // mergeNode(node);
            });
        }

        if (state.selectedObject?.type === "wall") {
            // BİRLEŞTİRME KAPALI - Lokal kalınlık için
            // const nodesToMerge = new Set();

            if (state.selectedObject.handle !== 'body' && state.affectedWalls) {
                const nodeToMerge = state.selectedObject.object[state.selectedObject.handle];
                const affectedWalls = state.affectedWalls;

                // BİRLEŞTİRME KAPALI
                // const mergedNode = mergeNode(nodeToMerge);
                const mergedNode = null;
                const finalNode = mergedNode || nodeToMerge;

                if (mergedNode) {
                    affectedWalls.forEach(wall => {
                        const stationaryNode = wall.p1 === finalNode ? wall.p2 : wall.p1;
                        const movingNode = finalNode;

                        const dx = movingNode.x - stationaryNode.x;
                        const dy = movingNode.y - stationaryNode.y;
                        const length = Math.hypot(dx, dy);

                        if (length > 0.1) {
                            let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;

                            if (angle < 5) {
                                movingNode.y = stationaryNode.y;
                            } else if (angle > 85) {
                                movingNode.x = stationaryNode.x;
                            }
                        }
                    });
                }
            } else {
                // BİRLEŞTİRME KAPALI
                // const wallsToProcess = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
                // wallsToProcess.forEach((w) => { nodesToMerge.add(w.p1); nodesToMerge.add(w.p2); });
                // nodesToMerge.forEach((node) => mergeNode(node));
            }
        }

        if (state.selectedObject?.type === "column" && state.columnRotationOffset !== null) {
            processWalls();
        }

        // YENİ IF BLOĞUNU AŞAĞIYA EKLEYİN
        if (state.selectedObject?.type === "beam") {
            processWalls();
        }
        // YENİ BLOK BİTİŞİ

        // YENİ IF BLOĞUNU AŞAĞIYA EKLEYİN
        if (state.selectedObject?.type === "stairs") { //
            processWalls(); // (veya sadece update3DScene() çağrılabilir, ama processWalls 3D'yi de tetikler)
        }
        // YENİ BLOK BİTİŞİ

        // TESİSAT İŞLEMLERİ İÇİN UNDO/REDO DESTEĞİ
        if (state.selectedObject?.type === "plumbingBlock") {
            processWalls();
        }

        if (state.selectedObject?.type === "plumbingPipe") {
            processWalls();
        }
        // TESİSAT BLOK BİTİŞİ

        processWalls();
        saveState();

    } else if (didClick && state.isSweeping) {
        if (state.preDragNodeStates.size > 0 && state.selectedObject?.type === 'wall') {
            // BİRLEŞTİRME KAPALI
            // const nodesToMerge = Array.from(state.preDragNodeStates.keys());
            // nodesToMerge.forEach(node => {
            //     mergeNode(node);
            // });
            processWalls();
            saveState();
        }
    }


    // Drag bittiğinde node hover timer'ları temizle
    if (state.nodeHoverTimers) {
        state.nodeHoverTimers.clear();
    }

    setState({
        isPanning: false,
        isDragging: false,
        isStretchDragging: false,
        aDragOccurred: false,
        stretchMode: null,
        initialDragPoint: null,
        // selectedGroup: [], // REMOVED - Bu satır CTRL multi-select'i bozuyordu
        affectedWalls: [],
        preDragWallStates: new Map(),
        preDragNodeStates: new Map(),
        dragWallInitialVector: null,
        selectedObject: (didClick || state.selectedObject?.type === "arcControl" || state.selectedObject?.type === "valve") ? state.selectedObject : null, // arcControl VE VANA sürüklemesi sonrası seçimi koru        dragOriginalNodes: null,
        isSweeping: false,
        sweepWalls: [],
        columnRotationOffset: null,
        tempNeighborWallsToDimension: null, // Komşu duvar Set'ini temizle
        wallNodeSnapLock: null, // Snap lock'u temizle
        nodeHoverTimers: new Map() // Node hover timer'larını temizle
    });
}