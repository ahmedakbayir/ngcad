import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint, getDoorPlacement, getDoorPlacementAtNode, isSpaceForDoor, findCollinearChain } from './actions.js';

export function onPointerDown(e) {
    if (e.target !== dom.c2d) {
        return;
    }

    if (e.button === 1) { // Orta tuş
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        return;
    }
    if (e.button === 2) return; // Sağ tuş

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let snappedPos = getSmartSnapPoint(e);

    if (state.currentMode === "select") {
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }
        const selectedObject = getObjectAtPoint(pos);
        setState({ selectedObject, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map(), dragAxis: null });
        
        if (selectedObject) {
            let startPointForDragging;
            if (selectedObject.type === 'wall' && selectedObject.handle !== 'body') {
                const nodeToDrag = selectedObject.object[selectedObject.handle];
                startPointForDragging = { x: nodeToDrag.x, y: nodeToDrag.y };
            } else {
                startPointForDragging = { x: snappedPos.x, y: snappedPos.y };
            }

            setState({
                isDragging: true,
                dragStartPoint: startPointForDragging,
                initialDragPoint: { x: pos.x, y: pos.y },
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
            });

            if (selectedObject.type === "wall") {
                // --- DÜĞÜM NOKTASI SÜRÜKLEME ---
                if (selectedObject.handle !== "body") {
                    const nodeToDrag = selectedObject.object[selectedObject.handle];
                    const draggedWall = selectedObject.object;
                    
                    const draggedWallVec = { x: draggedWall.p2.x - draggedWall.p1.x, y: draggedWall.p2.y - draggedWall.p1.y };
                    const isDraggedWallHorizontal = Math.abs(draggedWallVec.y) < 1; // Toleranslı kontrol
                    const isDraggedWallVertical = Math.abs(draggedWallVec.x) < 1;   // Toleranslı kontrol

                    let dragAxis = null;
                    // KURAL: Eğer sürüklenen duvar YATAY ise, hareket DİKEY (Y) eksende kilitlenmelidir.
                    if (isDraggedWallHorizontal) {
                        dragAxis = 'y';
                    // KURAL: Eğer sürüklenen duvar DİKEY ise, hareket YATAY (X) eksende kilitlenmelidir.
                    } else if (isDraggedWallVertical) {
                        dragAxis = 'x';
                    }
                    // Açılı duvarlar için kilit yok (serbest hareket). dragAxis null kalır.
                    setState({ dragAxis });

                    const affectedWalls = state.walls.filter((w) => w.p1 === nodeToDrag || w.p2 === nodeToDrag);
                    setState({ affectedWalls });
                    affectedWalls.forEach((wall) => {
                        const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (wallLength > 0.1) {
                            state.preDragWallStates.set(wall, { 
                                isP1Stationary: wall.p2 === nodeToDrag, 
                                doors: state.doors.filter((d) => d.wall === wall).map((door) => ({ 
                                    doorRef: door, 
                                    distFromP1: door.pos, 
                                    distFromP2: wallLength - door.pos 
                                })) 
                            });
                        }
                    });

                // --- GÖVDE SÜRÜKLEME ---
                } else { 
                    if (e.ctrlKey && e.shiftKey) {
                        setState({ selectedGroup: findCollinearChain(selectedObject.object) });
                    }
                    const wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                    const nodesBeingMoved = new Set();
                    wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

                    nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });

                    const wall = selectedObject.object;
                    setState({ dragWallInitialVector: { dx: wall.p2.x - wall.p1.x, dy: wall.p2.y - wall.p1.y } });
                    
                    if (e.altKey) {
                         setState({ isStretchDragging: true, stretchMode: "alt", stretchWallOrigin: { p1: { ...selectedObject.object.p1 }, p2: { ...selectedObject.object.p2 } }});
                    } else if (e.shiftKey && !e.ctrlKey) {
                         setState({ isStretchDragging: true, stretchMode: "shift", stretchWallOrigin: { p1: { ...selectedObject.object.p1 }, p2: { ...selectedObject.object.p2 } }});
                    } else if (e.ctrlKey && !e.altKey && !e.shiftKey) {
                        const wallToMove = selectedObject.object;
                        const p1 = wallToMove.p1;
                        const p1Connections = state.walls.filter(w => w.p1 === p1 || w.p2 === p1);
                        if (p1Connections.length > 1) {
                            const newP1 = { x: p1.x, y: p1.y };
                            state.nodes.push(newP1);
                            wallToMove.p1 = newP1;
                            state.preDragNodeStates.set(newP1, { x: p1.x, y: p1.y });
                        }
                        const p2 = wallToMove.p2;
                        const p2Connections = state.walls.filter(w => w.p1 === p2 || w.p2 === p2);
                        if (p2Connections.length > 1) {
                            const newP2 = { x: p2.x, y: p2.y };
                            state.nodes.push(newP2);
                            wallToMove.p2 = newP2;
                            state.preDragNodeStates.set(newP2, { x: p2.x, y: p2.y });
                        }
                    }
                }
            }
        }
    } else if (state.currentMode === "drawDoor") {
        const clickedNode = findNodeAt(snappedPos.x, snappedPos.y);
        let doorsAdded = false;
        if (clickedNode) {
            const connectedWalls = state.walls.filter(w => w.p1 === clickedNode || w.p2 === clickedNode);
            connectedWalls.forEach(wall => {
                const newDoor = getDoorPlacementAtNode(wall, clickedNode);
                if (newDoor && isSpaceForDoor(newDoor, clickedNode)) {
                    state.doors.push(newDoor);
                    doorsAdded = true;
                }
            });
        } else {
            let closestWall = null;
            let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS;
            for (const w of [...state.walls].reverse()) {
                const p1 = w.p1, p2 = w.p2;
                const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
                if (l2 < 0.1) continue;
                let t = ((snappedPos.x - p1.x) * (p2.x - p1.x) + (snappedPos.y - p1.y) * (p2.y - p1.y)) / l2;
                const END_THRESHOLD = 0.05;
                if (t > END_THRESHOLD && t < (1 - END_THRESHOLD)) {
                    const d = distToSegmentSquared(snappedPos, p1, p2);
                    if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                        minDistSq = d;
                        closestWall = w;
                    }
                }
            }
            if (closestWall) {
                const newDoor = getDoorPlacement(closestWall, snappedPos);
                if (newDoor && isSpaceForDoor(newDoor)) {
                    state.doors.push(newDoor);
                    doorsAdded = true;
                }
            }
        }
        if (doorsAdded) saveState();
    } else {
        if (!state.startPoint) {
            setState({ startPoint: getOrCreateNode(snappedPos.x, snappedPos.y) });
        } else {
            const d = Math.hypot(state.startPoint.x - snappedPos.x, state.startPoint.y - snappedPos.y);
            if (d > 0.1) {
                let geometryChanged = false;
                if (state.currentMode === "drawWall") {
                    if (!snappedPos.isSnapped) {
                        const dx = snappedPos.x - state.startPoint.x;
                        const dy = snappedPos.y - state.startPoint.y;
                        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                        const snapAngle = 5;

                        if (Math.abs(angle) < snapAngle || Math.abs(angle - 180) < snapAngle || Math.abs(angle + 180) < snapAngle) {
                            snappedPos.y = state.startPoint.y;
                        } else if (Math.abs(angle - 90) < snapAngle || Math.abs(angle + 90) < snapAngle) {
                            snappedPos.x = state.startPoint.x;
                        } else {
                            if (Math.abs(dx) > Math.abs(dy)) {
                                snappedPos.y = state.startPoint.y;
                            } else {
                                snappedPos.x = state.startPoint.x;
                            }
                        }
                    }

                    const nodesBefore = state.nodes.length;
                    const endNode = getOrCreateNode(snappedPos.x, snappedPos.y);
                    const didSnapToExistingNode = (state.nodes.length === nodesBefore);
                    const didConnectToWallBody = !didSnapToExistingNode && isPointOnWallBody(endNode);

                    if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
                        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode });
                        geometryChanged = true;
                    }
                    if ((didSnapToExistingNode && endNode !== state.startPoint) || didConnectToWallBody) {
                        setState({ startPoint: null });
                    } else {
                        setState({ startPoint: endNode });
                    }
                } else if (state.currentMode === "drawRoom") {
                    const p1 = state.startPoint;
                    const p2 = snappedPos;
                    if (Math.abs(p1.x - p2.x) > 1 && Math.abs(p1.y - p2.y) > 1) {
                        const v1 = p1, v2 = getOrCreateNode(p2.x, v1.y), v3 = getOrCreateNode(p2.x, p2.y), v4 = getOrCreateNode(v1.x, p2.y);
                        [ {p1:v1, p2:v2}, {p1:v2, p2:v3}, {p1:v3, p2:v4}, {p1:v4, p2:v1} ].forEach(pw => {
                            if (!wallExists(pw.p1, pw.p2)) state.walls.push({ type: "wall", ...pw });
                        });
                        geometryChanged = true;
                        setState({ startPoint: null });
                    }
                }
                if (geometryChanged) { processWalls(); saveState(); }
            }
        }
    }
}