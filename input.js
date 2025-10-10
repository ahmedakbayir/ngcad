import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt, areCollinear, getOrCreateNode, isPointOnWallBody } from './geometry.js';
import { processWalls, splitWallAtMousePosition, mergeNode } from './wall-processor.js';
import { saveState, undo, redo, restoreState } from './history.js';
import { showRoomNamePopup, cancelLengthEdit, startLengthEdit, positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';

function getDoorPlacementAtNode(wall, node) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const PADDING = 15;
    const doorWidth = 70;

    if (wallLen < doorWidth + PADDING * 2) return null;

    let pos;
    if (wall.p1 === node) {
        pos = PADDING + doorWidth / 2;
    } else if (wall.p2 === node) {
        pos = wallLen - (PADDING + doorWidth / 2);
    } else {
        return null;
    }
    return { wall, pos, width: doorWidth, type: "door" };
}

function getDoorPlacement(wall, clickPos) {
    if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const PADDING = 15;
    if (wallLen < 2 * PADDING + 20) return null;

    let doorWidth = (wallLen >= 70 + 2 * PADDING) ? 70 : wallLen - 2 * PADDING;

    const l2 = (wall.p1.x - wall.p2.x) ** 2 + (wall.p1.y - wall.p2.y) ** 2;
    let t = ((clickPos.x - wall.p1.x) * (wall.p2.x - wall.p1.x) + (clickPos.y - wall.p1.y) * (wall.p2.y - wall.p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    let pos = t * wallLen;

    const minPos = PADDING + doorWidth / 2;
    const maxPos = wallLen - PADDING - doorWidth / 2;
    pos = Math.max(minPos, Math.min(maxPos, pos));

    return { wall, pos, width: doorWidth, type: "door" };
}

function isSpaceForDoor(door, node = null) {
    if (node) return true;
    const wallDoors = state.doors.filter(d => d.wall === door.wall && d !== door.object);
    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;
    for (const existingDoor of wallDoors) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (Math.max(doorStart, existingStart) < Math.min(doorEnd, existingEnd)) return false;
    }
    return true;
}

function getMinWallLength(wall) {
    const wallDoors = state.doors.filter((d) => d.wall === wall);
    if (wallDoors.length === 0) return 10;
    let totalDoorWidth = wallDoors.reduce((sum, d) => sum + d.width, 0);
    const PADDING = 15;
    return totalDoorWidth + (wallDoors.length + 1) * PADDING;
}

function getObjectAtPoint(pos) {
    const { zoom, doors, walls } = state;
    const hr = 8 / zoom; // DRAG_HANDLE_RADIUS

    for (const door of doors) {
        const wall = door.wall;
        if (!wall) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenter = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
        if (Math.hypot(pos.x - doorCenter.x, pos.y - doorCenter.y) < door.width / 2) {
            return { object: door, type: "door", handle: "body" };
        }
    }

    for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        if (Math.hypot(pos.x - w.p1.x, pos.y - w.p1.y) < hr) return { object: w, type: "wall", handle: "p1" };
        if (Math.hypot(pos.x - w.p2.x, pos.y - w.p2.y) < hr) return { object: w, type: "wall", handle: "p2" };
    }

    const bodyHitTolerance = WALL_THICKNESS / 2;
    for (const w of walls) {
        if (distToSegmentSquared(pos, w.p1, w.p2) < bodyHitTolerance ** 2) {
            return { object: w, type: "wall", handle: "body" };
        }
    }
    return null;
}

function findCollinearChain(startWall) {
    const chain = new Set([startWall]);
    const toProcess = [startWall];
    const incident = new Map();
    for (const w of state.walls) {
        if (!incident.has(w.p1)) incident.set(w.p1, []);
        if (!incident.has(w.p2)) incident.set(w.p2, []);
        incident.get(w.p1).push(w);
        incident.get(w.p2).push(w);
    }
    while (toProcess.length > 0) {
        const currentWall = toProcess.pop();
        const processNode = (node, otherNode) => {
            const connected = incident.get(node) || [];
            for (const neighbor of connected) {
                if (!chain.has(neighbor) && areCollinear(otherNode, node, neighbor.p1 === node ? neighbor.p2 : neighbor.p1)) {
                    chain.add(neighbor);
                    toProcess.push(neighbor);
                }
            }
        };
        processNode(currentWall.p1, currentWall.p2);
        processNode(currentWall.p2, currentWall.p1);
    }
    return Array.from(chain);
}

function wallExists(p1, p2) {
    return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
}

function onPointerDown(e) {
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
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }
        const selectedObject = getObjectAtPoint(pos);
        setState({
            selectedObject: selectedObject,
            selectedGroup: [],
            affectedWalls: [],
            preDragWallStates: new Map(),
            preDragNodeStates: new Map(),
        });

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
                    if (e.ctrlKey && e.shiftKey) {
                        setState({ selectedGroup: findCollinearChain(selectedObject.object) });
                    }
                    const wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                    const nodesBeingMoved = new Set();
                    wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

                    nodesBeingMoved.forEach(node => {
                        state.preDragNodeStates.set(node, { x: node.x, y: node.y });
                    });
                    
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
            let closestWall = null, minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS;
            for (const w of [...state.walls].reverse()) {
                const d = distToSegmentSquared(snappedPos, w.p1, w.p2);
                if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                    minDistSq = d;
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
    } else { // drawWall veya drawRoom
        if (!state.startPoint) {
            setState({ startPoint: getOrCreateNode(snappedPos.x, snappedPos.y) });
        } else {
            const d = Math.hypot(state.startPoint.x - snappedPos.x, state.startPoint.y - snappedPos.y);
            if (d > 0.1) {
                let geometryChanged = false;
                if (state.currentMode === "drawWall") {
                    const endNode = getOrCreateNode(snappedPos.x, snappedPos.y);
                    if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
                        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode });
                        geometryChanged = true;
                    }
                    setState({ startPoint: endNode });
                } else if (state.currentMode === "drawRoom") {
                    const p1 = state.startPoint, p2 = snappedPos;
                    if (Math.abs(p1.x - p2.x) > 1 && Math.abs(p1.y - p2.y) > 1) {
                        const v1 = p1, v2 = getOrCreateNode(p2.x, v1.y), v3 = getOrCreateNode(p2.x, p2.y), v4 = getOrCreateNode(v1.x, p2.y);
                        const potentialWalls = [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }];
                        potentialWalls.forEach((pw) => { if (!wallExists(pw.p1, pw.p2)) { state.walls.push({ type: "wall", ...pw }); } });
                        geometryChanged = true;
                        setState({ startPoint: null });
                    }
                }
                if (geometryChanged) { processWalls(); saveState(); }
            }
        }
    }
}

function onPointerMove(e) {
    if (state.isPanning) {
        const newPanOffset = {
            x: state.panOffset.x + e.clientX - state.panStart.x,
            y: state.panOffset.y + e.clientY - state.panStart.y,
        };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) positionLengthInput();
        return;
    }

    if (state.isDragging && !state.aDragOccurred) {
        const distSq = (e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2;
        if (distSq > 5 * 5) {
            setState({ aDragOccurred: true });
        }
    }

    const snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos });

    if (state.isDragging && state.selectedObject) {
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
                const newLength = Math.hypot(snappedPos.x - otherNode.x, snappedPos.y - otherNode.y);
                return newLength >= getMinWallLength(wall);
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

            const wallDx = state.dragWallInitialVector.dx;
            const wallDy = state.dragWallInitialVector.dy;
            let normalVec = { x: -wallDy, y: wallDx };
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
            let closestWall = door.wall, minDistSq = Infinity;
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
                if (placement) {
                    const tempDoor = { ...placement, object: door };
                    if (isSpaceForDoor(tempDoor)) {
                        door.wall = closestWall;
                        door.pos = placement.pos;
                        door.width = placement.width;
                    }
                }
            }
        }

        if (state.affectedWalls.length > 0) {
            state.affectedWalls.forEach((wall) => {
                const originalState = state.preDragWallStates.get(wall);
                if (originalState && originalState.doors) {
                    const newLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                    originalState.doors.forEach((doorState) => {
                        if (originalState.isP1Stationary) doorState.doorRef.pos = doorState.distFromP1;
                        else doorState.doorRef.pos = newLength - doorState.distFromP2;
                    });
                }
            });
        }
        update3DScene();
    }
}

function onPointerUp(e) {
    setState({ isSnapLocked: false, lockedSnapPoint: null });

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
        initialDragPoint: null,
        selectedGroup: [],
        affectedWalls: [],
        preDragWallStates: new Map(),
        preDragNodeStates: new Map(),
        dragWallInitialVector: null,
        selectedObject: didClick ? state.selectedObject : null
    });
}

function onWheel(e) {
    e.preventDefault();
    const rect = dom.c2d.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const before = screenToWorld(mouseX, mouseY);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = state.zoom * factor;

    const after = {
        x: (mouseX - state.panOffset.x) / newZoom,
        y: (mouseY - state.panOffset.y) / newZoom
    };

    const newPanOffset = {
        x: state.panOffset.x + (after.x - before.x) * newZoom,
        y: state.panOffset.y + (after.y - before.y) * newZoom,
    };

    setState({ zoom: newZoom, panOffset: newPanOffset });

    if (state.isEditingLength) positionLengthInput();
}

function onKeyDown(e) {
    if (document.activeElement.closest("#settings-popup") || document.activeElement.closest("#room-name-popup")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); splitWallAtMousePosition(); return; }
    if (state.selectedObject?.type === "wall" && !state.isEditingLength && /^[0-9.]$/.test(e.key)) { e.preventDefault(); startLengthEdit(e.key); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "z") { undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { redo(); return; }
    if (e.key === "Escape") {
        if (state.isEditingLength) cancelLengthEdit();
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map() });
            restoreState(state.history[state.historyIndex]);
        } else {
            setState({ selectedObject: null, selectedGroup: [] });
        }
        setState({ startPoint: null });
        setMode("select");
    }
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
        if (state.selectedObject && state.selectedObject.type === "door") {
            const newDoors = state.doors.filter((d) => d !== state.selectedObject.object);
            setState({ doors: newDoors });
        } else {
            const wallsToDelete = state.selectedGroup.length > 0 ? state.selectedGroup : state.selectedObject ? [state.selectedObject.object] : [];
            const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w));
            const newDoors = state.doors.filter((d) => !wallsToDelete.includes(d.wall));
            setState({ walls: newWalls, doors: newDoors });
        }
        setState({ selectedObject: null, selectedGroup: [] });
        processWalls();
        saveState();
    }

    if (e.key.toLowerCase() === "d") setState({ showDimensions: !state.showDimensions });
    if (e.key.toLowerCase() === "w") setMode("drawWall");
    if (e.key.toLowerCase() === "r") setMode("drawRoom");
    if (e.key.toLowerCase() === "k") setMode("drawDoor");
    if (e.code === "Space" && state.currentMode === "select") { e.preventDefault(); setMode(state.lastUsedMode); }
}

export function setupInputListeners() {
    const { c2d } = dom;

    c2d.addEventListener("pointerdown", onPointerDown);
    c2d.addEventListener("pointermove", onPointerMove);
    c2d.addEventListener("pointerup", onPointerUp);
    c2d.addEventListener("wheel", onWheel, { passive: false });
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        setState({ startPoint: null, isSnapLocked: false, lockedSnapPoint: null });
        setMode("select");
    });
    c2d.addEventListener("pointerleave", (e) => {
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map() });
            if (state.history[state.historyIndex]) restoreState(state.history[state.historyIndex]);
        }
        if (state.isPanning) setState({ isPanning: false });
    });
    c2d.addEventListener('dblclick', (e) => {
        if (dom.roomNamePopup.style.display === 'block') return;
        const clickPos = screenToWorld(e.clientX - c2d.getBoundingClientRect().left, e.clientY - c2d.getBoundingClientRect().top);
        const point = turf.point([clickPos.x, clickPos.y]);
        for (const room of state.rooms) {
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                showRoomNamePopup(room, e);
                return;
            }
        }
    });
    
    window.addEventListener("keydown", onKeyDown);
}