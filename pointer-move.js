import { state, dom, setState, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { getDoorPlacement, isSpaceForDoor, getMinWallLength } from './actions.js';

export function onPointerMove(e) {
    if (state.isDraggingRoomName) {
        const room = state.isDraggingRoomName;
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        // Farenin sürüklemeye başladığı noktaya göre ne kadar yer değiştirdiğini bul
        const mouseDeltaX = mousePos.x - state.roomDragStartPos.x;
        const mouseDeltaY = mousePos.y - state.roomDragStartPos.y;

        // Etiketin başlangıçtaki merkezine bu yer değişimini ekleyerek yeni merkezini bul
        const newCenterX = state.roomOriginalCenter[0] + mouseDeltaX;
        const newCenterY = state.roomOriginalCenter[1] + mouseDeltaY;

        // Etiketin mutlak merkezini güncelle
        room.center = [newCenterX, newCenterY];

        // Bu yeni merkezin, mahalin sınırlayıcı kutusuna göre orantısal konumunu hesapla ve kaydet
        const bbox = turf.bbox(room.polygon);
        const bboxWidth = bbox[2] - bbox[0];
        const bboxHeight = bbox[3] - bbox[1];
        
        if (bboxWidth > 0 && bboxHeight > 0) {
            room.centerOffset = {
                x: (newCenterX - bbox[0]) / bboxWidth,
                y: (newCenterY - bbox[1]) / bboxHeight
            };
        }
        
        return;
    }

    if (state.isPanning) {
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) positionLengthInput();
        updateMouseCursor();
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
        updateMouseCursor();
        return;
    }

    if (state.isDragging && state.selectedObject) {
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            
            let finalPos = { x: snappedPos.x, y: snappedPos.y };
            
            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
                const newLength = Math.hypot(finalPos.x - otherNode.x, finalPos.y - otherNode.y);
                return newLength >= getMinWallLength(wall);
            });

            if (moveIsValid) {
                nodeToMove.x = finalPos.x;
                nodeToMove.y = finalPos.y;
            }
        
        } else if (state.selectedObject.type === "arcWall") {
            const arcWall = state.selectedObject.object;
            const handle = state.selectedObject.handle;
            
            if (handle === "p1") {
                arcWall.p1.x = snappedPos.x;
                arcWall.p1.y = snappedPos.y;
            } else if (handle === "p2") {
                arcWall.p2.x = snappedPos.x;
                arcWall.p2.y = snappedPos.y;
            } else if (handle === "control") {
                arcWall.control.x = snappedPos.x;
                arcWall.control.y = snappedPos.y;
            }
        } else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            const rect = dom.c2d.getBoundingClientRect();
            const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { 
                nodesToMove.add(w.p1); 
                nodesToMove.add(w.p2); 
            });

            const mouseDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };

            let totalDelta = {
                x: mouseDelta.x,
                y: mouseDelta.y
            };
            
            if (state.dragAxis === 'x') {
                totalDelta.y = 0;
            } else if (state.dragAxis === 'y') {
                totalDelta.x = 0;
            }
            
            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    node.x = originalPos.x + totalDelta.x;
                    node.y = originalPos.y + totalDelta.y;
                }
            });

            const MAGNETIC_SNAP_DISTANCE = 20;
            const ANGLE_TOLERANCE = 2;
            
            let bestMagneticSnap = null;
            let minMagneticDist = Infinity;

            wallsToMove.forEach(movingWall => {
                const dx1 = movingWall.p2.x - movingWall.p1.x;
                const dy1 = movingWall.p2.y - movingWall.p1.y;
                const len1 = Math.hypot(dx1, dy1);
                if (len1 < 0.1) return;
    
                const dir1 = { x: dx1 / len1, y: dy1 / len1 };
                
                state.walls.forEach(staticWall => {
                    if (wallsToMove.includes(staticWall)) return;
                    
                    const dx2 = staticWall.p2.x - staticWall.p1.x;
                    const dy2 = staticWall.p2.y - staticWall.p1.y;
                    const len2 = Math.hypot(dx2, dy2);
                    if (len2 < 0.1) return;
                    
                    const dir2 = { x: dx2 / len2, y: dy2 / len2 };
                    
                    const dotProduct = Math.abs(dir1.x * dir2.x + dir1.y * dir2.y);
                    if (dotProduct < Math.cos(ANGLE_TOLERANCE * Math.PI / 180)) return;
                    
                    const nodePairs = [
                        { moving: movingWall.p1, static: staticWall.p1 },
                        { moving: movingWall.p1, static: staticWall.p2 },
                        { moving: movingWall.p2, static: staticWall.p1 },
                        { moving: movingWall.p2, static: staticWall.p2 }
                    ];
                    
                    nodePairs.forEach(pair => {
                        const dist = Math.hypot(pair.moving.x - pair.static.x, pair.moving.y - pair.static.y);
                        if (dist < MAGNETIC_SNAP_DISTANCE && dist > 0.1 && dist < minMagneticDist) {
                            minMagneticDist = dist;
                            bestMagneticSnap = {
                                dx: pair.static.x - pair.moving.x,
                                dy: pair.static.y - pair.moving.y,
                                wallAngle: Math.atan2(Math.abs(dy1), Math.abs(dx1)) * 180 / Math.PI
                            };
                        }
                    });
                });
            });
            
            if (bestMagneticSnap) {
                let magneticDx = bestMagneticSnap.dx;
                let magneticDy = bestMagneticSnap.dy;
                
                nodesToMove.forEach(node => {
                    node.x += magneticDx;
                    node.y += magneticDy;
                });
            }

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
            
            if (!door.originalWidth) {
                door.originalWidth = door.width;
            }
            
            let closestWall = null;
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
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const wallThickness = closestWall.thickness || 20;
                const edgeMargin = (wallThickness / 2) + 5;
                const availableSpace = wallLen - (2 * edgeMargin);
                
                let newWidth = door.originalWidth;
                
                if (availableSpace < door.originalWidth) {
                    if (availableSpace >= door.originalWidth / 2) {
                        newWidth = door.originalWidth / 2;
                    } else {
                        door.width = door.originalWidth;
                        updateMouseCursor();
                        return;
                    }
                }

                const dx = closestWall.p2.x - closestWall.p1.x;
                const dy = closestWall.p2.y - closestWall.p1.y;
                const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                const newPos = t * wallLen;
                
                const minPos = edgeMargin + newWidth / 2;
                const maxPos = wallLen - edgeMargin - newWidth / 2;
                
                if (newPos >= minPos && newPos <= maxPos) {
                    door.wall = closestWall;
                    door.pos = newPos;
                    door.width = newWidth;
                }
            } else {
                door.width = door.originalWidth;
            }
        } else if (state.selectedObject.type === "window") {
            const window = state.selectedObject.object;
            const wall = state.selectedObject.wall;
            
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen >= 1) {
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const t = Math.max(0, Math.min(1, ((snappedPos.x - wall.p1.x) * dx + (snappedPos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
                const newPos = t * wallLen;
                
                const minDist = 15;
                if (newPos >= window.width / 2 + minDist && newPos <= wallLen - window.width / 2 - minDist) {
                    window.pos = newPos;
                }
            }
        } else if (state.selectedObject.type === "vent") {
            const vent = state.selectedObject.object;
            const wall = state.selectedObject.wall;
            
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen >= 1) {
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const t = Math.max(0, Math.min(1, ((snappedPos.x - wall.p1.x) * dx + (snappedPos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
                const newPos = t * wallLen;
                
                const minDist = 15;
                if (newPos >= vent.width / 2 + minDist && newPos <= wallLen - vent.width / 2 - minDist) {
                    vent.pos = newPos;
                }
            }
        }
        
        if (state.affectedWalls.length > 0) {
            state.affectedWalls.forEach((wall) => {
                const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                const wallThickness = wall.thickness || 20;
                const edgeMargin = (wallThickness / 2) + 5;
                
                state.doors.forEach((door) => {
                    if (door.wall !== wall) return;
                    
                    const minPos = edgeMargin + door.width / 2;
                    const maxPos = wallLength - edgeMargin - door.width / 2;
                    
                    if (minPos > maxPos) {
                        door.pos = wallLength / 2;
                    } else {
                        if (door.pos < minPos) door.pos = minPos;
                        if (door.pos > maxPos) door.pos = maxPos;
                    }
                });
            });
        }
        update3DScene();
    }
    
    updateMouseCursor();
}

function updateMouseCursor() {
    const { c2d } = dom;
    const { currentMode, isDragging, isPanning, mousePos, isDraggingRoomName } = state;
    
    c2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node');
    
    if (isPanning || isDraggingRoomName) {
        c2d.classList.add('panning');
        return;
    }
    
    if (isDragging) {
        c2d.classList.add('dragging');
        return;
    }
    
    if (mousePos.isSnapped) {
        c2d.classList.add('near-snap');
        return;
    }
    
    if (currentMode === 'select') {
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.classList.add('over-node');
            return;
        }
        
        const bodyHitTolerance = WALL_THICKNESS / 2;
        for (const w of state.walls) {
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitTolerance ** 2) {
                c2d.classList.add('over-wall');
                return;
            }
        }
    }
}