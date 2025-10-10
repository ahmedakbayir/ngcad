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
            const nodeToMove = selectedObject.object[state.selectedObject.handle];
            
            const nodeInitialDragPoint = state.dragStartPoint;
            const deltaX = snappedPos.x - nodeInitialDragPoint.x;
            const deltaY = snappedPos.y - nodeInitialDragPoint.y;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                snappedPos.y = nodeInitialDragPoint.y;
            } else {
                snappedPos.x = nodeInitialDragPoint.x;
            }

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
            
            let totalDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };

            const snapCorrection = { x: snappedPos.x - unsnappedPos.x, y: snappedPos.y - unsnappedPos.y };
            totalDelta.x += snapCorrection.x;
            totalDelta.y += snapCorrection.y;

            const wallDx = state.dragWallInitialVector.dx;
            const wallDy = state.dragWallInitialVector.dy;
            
            let normalVec = { x: -wallDy, y: wallDx };
            const len = Math.hypot(normalVec.x, normalVec.y);
            if (len > 0.1) { normalVec.x /= len; normalVec.y /= len; }
            const projectedDistance = totalDelta.x * normalVec.x + totalDelta.y * normalVec.y;
            totalDelta = { x: projectedDistance * normalVec.x, y: projectedDistance * normalVec.y };

            state.preDragNodeStates.forEach((originalPos, node) => {
                node.x = originalPos.x + totalDelta.x;
                node.y = originalPos.y + totalDelta.y;
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