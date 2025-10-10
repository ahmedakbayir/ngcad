import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode } from './geometry.js';
import { processWalls, mergeNode } from './wall-processor.js';
import { saveState, restoreState } from './history.js';
import { cancelLengthEdit, positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { getObjectAtPoint, getDoorPlacement, getDoorPlacementAtNode, isSpaceForDoor, getMinWallLength, findCollinearChain } from './actions.js';

function wallExists(p1, p2) {
    return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
}

export function onPointerDown(e) {
    if (dom.settingsPopup.contains(e.target) || dom.settingsBtn.contains(e.target)) return;
    if (e.button === 1) {
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        return;
    }
    if (e.button === 2) return;

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const snappedPos = getSmartSnapPoint(e);

    if (state.currentMode === "select") {
        // ... (Bu kısım aynı kalıyor)
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }
        const selectedObject = getObjectAtPoint(pos);
        setState({ selectedObject, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map() });

        if (selectedObject) {
            setState({
                isDragging: true,
                dragStartPoint: snappedPos,
                initialDragPoint: { x: pos.x, y: pos.y },
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
            });
            
            if (selectedObject.type === "wall") {
                if (selectedObject.handle !== "body") {
                    const nodeToDrag = selectedObject.object[selectedObject.handle];
                    const affectedWalls = state.walls.filter((w) => w.p1 === nodeToDrag || w.p2 === nodeToDrag);
                    setState({ affectedWalls });
                    affectedWalls.forEach((wall) => {
                        const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (wallLength > 0.1) {
                            state.preDragWallStates.set(wall, { isP1Stationary: wall.p2 === nodeToDrag, doors: state.doors.filter((d) => d.wall === wall).map((door) => ({ doorRef: door, distFromP1: door.pos, distFromP2: wallLength - door.pos })) });
                        }
                    });
                } else {
                    if (e.altKey && !e.ctrlKey && !e.shiftKey) { 
                        setState({ isStretchDragging: true, stretchMode: "alt", stretchWallOrigin: { p1: { ...selectedObject.object.p1 }, p2: { ...selectedObject.object.p2 } }});
                    } else if (e.shiftKey && !e.ctrlKey && !e.altKey) {
                        setState({ isStretchDragging: true, stretchMode: "shift", stretchWallOrigin: { p1: { ...selectedObject.object.p1 }, p2: { ...selectedObject.object.p2 } }});
                    } else {
                        if (e.ctrlKey && e.shiftKey) {
                            setState({ selectedGroup: findCollinearChain(selectedObject.object) });
                        }
                        const wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                        const nodesBeingMoved = new Set();
                        wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

                        nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });
                        
                        const wall = selectedObject.object;
                        setState({
                            dragWallInitialVector: { dx: wall.p2.x - wall.p1.x, dy: wall.p2.y - wall.p1.y },
                            affectedWalls: state.walls.filter((w) => !wallsBeingMoved.includes(w) && (nodesBeingMoved.has(w.p1) || nodesBeingMoved.has(w.p2)))
                        });

                        state.affectedWalls.forEach((wall) => {
                            const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                            const isP1Stationary = !nodesBeingMoved.has(wall.p1);
                            if (wallLength > 0.1) {
                                state.preDragWallStates.set(wall, { isP1Stationary, doors: state.doors.filter((d) => d.wall === wall).map((door) => ({ doorRef: door, distFromP1: door.pos, distFromP2: wallLength - door.pos })) });
                            }
                        });
                    }
                }
            }
        }
    } else if (state.currentMode === "drawDoor") {
        // --- DÜZELTİLMİŞ KAPI EKLEME MANTIĞI ---
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
            let closestWall = null, minDistSq = Infinity;
            const bodyHitToleranceSq = (WALL_THICKNESS * 1.5) ** 2; // Toleransı biraz artıralım
            for (const w of [...state.walls].reverse()) {
                const distSq = distToSegmentSquared(snappedPos, w.p1, w.p2);
                if (distSq < bodyHitToleranceSq && distSq < minDistSq) {
                    minDistSq = distSq;
                    closestWall = w;
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
        // --- DÜZELTME SONU ---
    } else { 
        if (!state.startPoint) {
            setState({ startPoint: getOrCreateNode(snappedPos.x, snappedPos.y) });
        } else {
            const d = Math.hypot(state.startPoint.x - snappedPos.x, state.startPoint.y - snappedPos.y);
            if (d > 0.1) {
                let geometryChanged = false;
                if (state.currentMode === "drawWall") {
                    // --- DÜZELTİLMİŞ DUVAR ÇİZİM MANTIĞI (AŞAĞIDA) ---
                    const nodesBefore = state.nodes.length;
                    const endNode = getOrCreateNode(snappedPos.x, snappedPos.y);
                    const didSnapToExistingNode = (state.nodes.length === nodesBefore);

                    if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
                        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode });
                        geometryChanged = true;
                    }
                    
                    if (didSnapToExistingNode && endNode !== state.startPoint) {
                        setState({ startPoint: null }); // Zinciri sonlandır
                    } else {
                        setState({ startPoint: endNode }); // Zincire devam et
                    }
                    // --- DÜZELTME SONU ---

                } else if (state.currentMode === "drawRoom") {
                    const p1 = state.startPoint, p2 = snappedPos;
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

    const snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos });

    if (state.isStretchDragging) {
        update3DScene();
        return;
    }

    if (state.isDragging && state.selectedObject) {
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
                return Math.hypot(snappedPos.x - otherNode.x, snappedPos.y - otherNode.y) >= getMinWallLength(wall);
            });
            if (moveIsValid) {
                nodeToMove.x = snappedPos.x;
                nodeToMove.y = snappedPos.y;
            }
        } else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            const rect = dom.c2d.getBoundingClientRect();
            const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });
            let totalDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };
            const { dx, dy } = state.dragWallInitialVector;
            let normalVec = { x: -dy, y: dx };
            const len = Math.hypot(normalVec.x, normalVec.y);
            if (len > 0.1) { normalVec.x /= len; normalVec.y /= len; }
            const projectedDistance = totalDelta.x * normalVec.x + totalDelta.y * normalVec.y;
            totalDelta = { x: projectedDistance * normalVec.x, y: projectedDistance * normalVec.y };
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

export function onPointerUp(e) {
    setState({ isSnapLocked: false, lockedSnapPoint: null });

    if (state.isStretchDragging) {
        const { stretchWallOrigin, dragStartPoint, stretchMode, mousePos, walls, doors, nodes } = state;
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
            const p1_orig = stretchWallOrigin.p1, p2_orig = stretchWallOrigin.p2;
            const t1_node = getOrCreateNode(p1_orig.x + dx, p1_orig.y + dy);
            const t2_node = getOrCreateNode(p2_orig.x + dx, p2_orig.y + dy);
            if (!wallExists(p1_orig, t1_node)) walls.push({ type: "wall", p1: p1_orig, p2: t1_node });
            if (!wallExists(p2_orig, t2_node)) walls.push({ type: "wall", p1: p2_orig, p2: t2_node });
            if (!wallExists(t1_node, t2_node)) walls.push({ type: "wall", p1: t1_node, p2: t2_node });
            
            if (stretchMode === "shift") {
                const wallToDelete = state.selectedObject.object;
                const p1ToDelete = wallToDelete.p1, p2ToDelete = wallToDelete.p2;
                const newDoors = doors.filter((d) => d.wall !== wallToDelete);
                const newWalls = walls.filter((w) => w !== wallToDelete);
                const p1IsUsed = newWalls.some((w) => w.p1 === p1ToDelete || w.p2 === p1ToDelete);
                let newNodes = nodes;
                if (!p1IsUsed) newNodes = newNodes.filter((n) => n !== p1ToDelete);
                const p2IsUsed = newWalls.some((w) => w.p1 === p2ToDelete || w.p2 === p2ToDelete);
                if (!p2IsUsed) newNodes = newNodes.filter((n) => n !== p2ToDelete);
                setState({ doors: newDoors, walls: newWalls, nodes: newNodes });
            }
        }
    }

    if (state.aDragOccurred) {
        if (state.selectedObject?.type === "wall") {
            const wallsToProcess = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMerge = new Set();
            wallsToProcess.forEach((w) => { nodesToMerge.add(w.p1); nodesToMerge.add(w.p2); });
            nodesToMerge.forEach((node) => mergeNode(node));
        }
        processWalls();
        saveState();
    }

    const didClick = Math.hypot(e.clientX - state.dragStartScreen.x, e.clientY - state.dragStartScreen.y) < 5;

    setState({
        isPanning: false,
        isDragging: false,
        isStretchDragging: false,
        aDragOccurred: false,
        stretchMode: null,
        initialDragPoint: null,
        selectedGroup: [],
        affectedWalls: [],
        preDragWallStates: new Map(),
        preDragNodeStates: new Map(),
        dragWallInitialVector: null,
        selectedObject: didClick ? state.selectedObject : null
    });
}