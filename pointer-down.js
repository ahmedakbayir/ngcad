import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint, getDoorPlacement, getDoorPlacementAtNode, isSpaceForDoor } from './actions.js';

function wallExists(p1, p2) {
    return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
}

export function onPointerDown(e) {
    if (dom.settingsPopup.contains(e.target) || dom.settingsBtn.contains(e.target)) return;
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
        setState({ selectedObject, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map() });
        
        if (selectedObject) {
            setState({
                isDragging: true,
                dragStartPoint: {x: snappedPos.x, y: snappedPos.y},
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
                    const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                    const dragNodeBehaviors = new Map();
                    const dragOriginalNodes = new Map();
    
                    const areVectorsCollinear = (v1, v2) => {
                        const len1 = Math.hypot(v1.x, v1.y);
                        const len2 = Math.hypot(v2.x, v2.y);
                        if (len1 < 0.1 || len2 < 0.1) return true;
                        const u1 = { x: v1.x / len1, y: v1.y / len1 };
                        const u2 = { x: v2.x / len2, y: v2.y / len2 };
                        const dotProduct = Math.abs(u1.x * u2.x + u1.y * u2.y);
                        return dotProduct > 0.99;
                    };
    
                    wallsToMove.forEach(wall => {
                        const wallVector = { x: wall.p2.x - wall.p1.x, y: wall.p2.y - wall.p1.y };
    
                        const processNode = (node) => {
                            if (dragNodeBehaviors.has(node)) return;
                            const connectedWalls = state.walls.filter(w => !wallsToMove.includes(w) && (w.p1 === node || w.p2 === node));
                            if (connectedWalls.length === 0) {
                                dragNodeBehaviors.set(node, 'move');
                                return;
                            }
                            const hasOffAxisWall = connectedWalls.some(connWall => {
                                const connVector = { x: connWall.p2.x - connWall.p1.x, y: connWall.p2.y - connWall.p1.y };
                                return !areVectorsCollinear(wallVector, connVector);
                            });
                            dragNodeBehaviors.set(node, hasOffAxisWall ? 'copy' : 'move');
                        };
                        processNode(wall.p1);
                        processNode(wall.p2);
                    });
    
                    const nodesToMoveSet = new Set();
                    dragNodeBehaviors.forEach((behavior, node) => {
                        if (behavior === 'move') {
                            nodesToMoveSet.add(node);
                        } else {
                            const newNode = { x: node.x, y: node.y };
                            state.nodes.push(newNode);
                            nodesToMoveSet.add(newNode);
                            dragOriginalNodes.set(newNode, node);
                            wallsToMove.forEach(w => {
                                if (w.p1 === node) w.p1 = newNode;
                                if (w.p2 === node) w.p2 = newNode;
                            });
                        }
                    });
    
                    Array.from(nodesToMoveSet).forEach(node => {
                        state.preDragNodeStates.set(node, { x: node.x, y: node.y });
                    });
    
                    setState({
                        dragNodeBehaviors,
                        dragOriginalNodes,
                        dragWallInitialVector: { dx: selectedObject.object.p2.x - selectedObject.object.p1.x, dy: selectedObject.object.p2.y - selectedObject.object.p1.y }
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
                    const dx = Math.abs(snappedPos.x - state.startPoint.x);
                    const dy = Math.abs(snappedPos.y - state.startPoint.y);
                    if(dx > dy) {
                        snappedPos.y = state.startPoint.y;
                    } else {
                        snappedPos.x = state.startPoint.x;
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