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
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            const nodeInitialDragPoint = state.dragStartPoint;
            
            const deltaX = snappedPos.x - nodeInitialDragPoint.x;
            const deltaY = snappedPos.y - nodeInitialDragPoint.y;

            let finalPos = { x: snappedPos.x, y: snappedPos.y };
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                finalPos.y = nodeInitialDragPoint.y;
            } else {
                finalPos.x = nodeInitialDragPoint.x;
            }

            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
                return Math.hypot(finalPos.x - otherNode.x, finalPos.y - otherNode.y) >= getMinWallLength(wall);
            });

            if (moveIsValid) {
                nodeToMove.x = finalPos.x;
                nodeToMove.y = finalPos.y;
            }
        } else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            const rect = dom.c2d.getBoundingClientRect();
            const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

            let totalDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };
            
            // --- YENİ YÖNE DUYARLI TAŞIMA MANTIĞI ---
            const wallVec = state.dragWallInitialVector;
            const wallAngle = Math.abs(Math.atan2(wallVec.dy, wallVec.dx) * 180 / Math.PI) % 180; // 0-180 derece arası
            const tolerance = 1; // Açı toleransı

            // Duvarın dikeye yakın olup olmadığını kontrol et (90 derece civarı)
            if (wallAngle > 45 + tolerance && wallAngle < 135 - tolerance) { 
                totalDelta.y = 0; // Dikey duvar, sadece X yönünde hareket eder
            } 
            // Duvarın yataya yakın olup olmadığını kontrol et (0 veya 180 derece civarı)
            else if (wallAngle < 45 - tolerance || wallAngle > 135 + tolerance) {
                totalDelta.x = 0; // Yatay duvar, sadece Y yönünde hareket eder
            } 
            // 45 Derece ve civarındaki eğimli duvarlar için
            else {
                // Fare hareketi hangi yönde daha fazlaysa, o yöne kilitle
                if (Math.abs(totalDelta.x) > Math.abs(totalDelta.y)) {
                    totalDelta.y = 0;
                } else {
                    totalDelta.x = 0;
                }
            }
            
            const snapRadiusWorld = 15;
            let bestSnapVector = { x: 0, y: 0 };
            let minSnapDistSq = snapRadiusWorld * snapRadiusWorld;
            const movingNodesArray = Array.from(nodesToMove);
            const stationaryNodes = state.nodes.filter(n => !nodesToMove.has(n));

            for (const movingNode of movingNodesArray) {
                const originalPos = state.preDragNodeStates.get(movingNode);
                if (!originalPos) continue;
                const proposedPos = { x: originalPos.x + totalDelta.x, y: originalPos.y + totalDelta.y };
                for (const stationaryNode of stationaryNodes) {
                    const distSq = (proposedPos.x - stationaryNode.x) ** 2 + (proposedPos.y - stationaryNode.y) ** 2;
                    if (distSq < minSnapDistSq) {
                        minSnapDistSq = distSq;
                        bestSnapVector = { x: stationaryNode.x - proposedPos.x, y: stationaryNode.y - proposedPos.y };
                    }
                }
            }
            totalDelta.x += bestSnapVector.x;
            totalDelta.y += bestSnapVector.y;

            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    node.x = originalPos.x + totalDelta.x;
                    node.y = originalPos.y + totalDelta.y;
                }
            });
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