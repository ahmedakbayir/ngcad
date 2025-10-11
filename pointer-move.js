import { state, dom, setState, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { getDoorPlacement, isSpaceForDoor, getMinWallLength } from './actions.js';

export function onPointerMove(e) {
    if (state.isPanning) {
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) positionLengthInput();
        return;
    }

    if (state.isDragging && !state.aDragOccurred) {
        if ((e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2 > 25) {
            setState({ aDragOccurred: true });
        }
    }
    
    let snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos });

    if (state.isStretchDragging) {
        update3DScene();
        return;
    }

    if (state.isDragging && state.selectedObject) {
        // --- DÜĞÜM NOKTASI SÜRÜKLEME ---
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            const nodeInitialDragPoint = state.dragStartPoint;
            
            let finalPos = { x: snappedPos.x, y: snappedPos.y };

            // Hareketi `pointer-down`da belirlenen `dragAxis`'e göre kilitle.
            if (state.dragAxis === 'x') {
                finalPos.y = nodeInitialDragPoint.y; // Y'yi sabitle, sadece X değişsin.
            } else if (state.dragAxis === 'y') {
                finalPos.x = nodeInitialDragPoint.x; // X'i sabitle, sadece Y değişsin.
            }
            
            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
                return Math.hypot(finalPos.x - otherNode.x, finalPos.y - otherNode.y) >= getMinWallLength(wall);
            });

            if (moveIsValid) {
                nodeToMove.x = finalPos.x;
                nodeToMove.y = finalPos.y;
            }
        
        // --- DUVAR GÖVDESİ SÜRÜKLEME ---
        } else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            const rect = dom.c2d.getBoundingClientRect();
            const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

            const mouseDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };

            const gridSpacing = state.gridOptions.spacing;
            const snapRadius = gridSpacing; 
            let bestSnapVector = { x: 0, y: 0 };
            let minSnapDistSq = snapRadius * snapRadius;
            const stationaryNodes = [...new Set(state.walls.filter(w => !wallsToMove.includes(w)).flatMap(w => [w.p1, w.p2]))];

            for (const movingNode of nodesToMove) {
                const originalPos = state.preDragNodeStates.get(movingNode);
                if (!originalPos) continue;
                const proposedPos = { x: originalPos.x + mouseDelta.x, y: originalPos.y + mouseDelta.y };
                for (const sNode of stationaryNodes) {
                    const distSq = (proposedPos.x - sNode.x)**2 + (proposedPos.y - sNode.y)**2;
                    if (distSq < minSnapDistSq) {
                        minSnapDistSq = distSq;
                        bestSnapVector = { x: sNode.x - proposedPos.x, y: sNode.y - proposedPos.y };
                    }
                }
            }

            // totalDelta'yı ham hareket ile başlat (pürüzsüz)
            let totalDelta = {
                x: mouseDelta.x,
                y: mouseDelta.y
            };
            
            // --- HAREKET KONTROLÜ (Sadece Node Snap'i Uygula) ---
            const SNAP_VECTOR_THRESHOLD = 0.1; 
            
            const wallVec = state.dragWallInitialVector;
            let isVertical = false;
            let isHorizontal = false;

            if (wallVec) { 
                 isVertical = Math.abs(wallVec.dx) < 0.1;
                 isHorizontal = Math.abs(wallVec.dy) < 0.1;
            }

            // GÜÇLÜ NODE SNAP KONTROLÜ
            if (Math.hypot(bestSnapVector.x, bestSnapVector.y) >= SNAP_VECTOR_THRESHOLD) {
                // Güçlü Node Snap bulundu: totalDelta'yı snap vektörüne göre ayarla.
                totalDelta.x = mouseDelta.x + bestSnapVector.x;
                totalDelta.y = mouseDelta.y + bestSnapVector.y;
            }
            // --- HAREKET MANTIĞI SONU ---
            
            // Sert Ortogonal Kilitleme
            if (isVertical) {
                totalDelta.y = 0;
            } else if (isHorizontal) {
                totalDelta.x = 0;
            }
            
            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    node.x = originalPos.x + totalDelta.x;
                    node.y = originalPos.y + totalDelta.y;
                }
            });

            if (state.isSweeping) {
                const sweepWalls = [];
                wallsToMove.forEach(movedWall => {
                    const originalP1 = state.preDragNodeStates.get(movedWall.p1);
                    if (originalP1) {
                        sweepWalls.push({ p1: originalP1, p2: movedWall.p1 });
                    }
                    const originalP2 = state.preDragNodeStates.get(movedWall.p2);
                    if (originalP2) {
                         sweepWalls.push({ p1: originalP2, p2: movedWall.p2 });
                    }
                });
                setState({ sweepWalls });
            }

        } else if (state.selectedObject.type === "door") {
            const door = state.selectedObject.object;
            let closestWall = door.wall;
            let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 2;
            for (const w of state.walls) {
                const d = distToSegmentSquared(snappedPos, w.p1, w.p2);
                if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                    minDistSq = d;
                    closestWall = w;
                }
            }
            if (closestWall) {
                const placement = getDoorPlacement(closestWall, snappedPos);
                if (placement && isSpaceForDoor({ ...placement, object: door })) {
                    door.wall = closestWall;
                    door.pos = placement.pos;
                    door.width = placement.width;
                }
            }
        }
        
        // Sürükleme sırasında kapıların pozisyonlarını güncelle
        if (state.affectedWalls.length > 0) {
            state.affectedWalls.forEach((wall) => {
                const originalState = state.preDragWallStates.get(wall);
                if (originalState?.doors) {
                    const newLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                    originalState.doors.forEach(ds => {
                        ds.doorRef.pos = originalState.isP1Stationary ? ds.distFromP1 : newLength - ds.distFromP2;
                    });
                }
            });
        }
        update3DScene();
    }
}