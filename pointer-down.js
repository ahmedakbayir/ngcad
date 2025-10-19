import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint, getDoorPlacement, isSpaceForDoor, findCollinearChain, getWindowPlacement, isSpaceForWindow } from './actions.js';
import { createColumn, getColumnCorners } from './columns.js';

export function onPointerDown(e) {
    if (e.target !== dom.c2d) {
        return;
    }

    if (e.button === 1) {
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        return;
    }
    if (e.button === 2) return;

    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let snappedPos = getSmartSnapPoint(e);

    if (state.currentMode === "select") {
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }

        const selectedObj = getObjectAtPoint(pos);
        const isColumnCornerSelected = selectedObj?.type === 'column' && selectedObj?.handle === 'corner';
                
        if (e.altKey && !e.shiftKey && !e.ctrlKey) {
            const objectAtMouse = getObjectAtPoint(pos);
            
            // Eğer kolon veya kolon handle'ı seçiliyse silme moduna geçme
            if (objectAtMouse?.type !== 'column' && 
                state.selectedObject?.type !== 'column') {
                setState({ isCtrlDeleting: true });
                return;
            }
        }


        const selectedObject = getObjectAtPoint(pos);

        if (selectedObject && selectedObject.type === 'room') {
            setState({ selectedRoom: selectedObject.object, selectedObject: null });
        } else if (!selectedObject) {
            setState({ selectedRoom: null });
        }
        if (selectedObject && (selectedObject.type === 'roomName' || selectedObject.type === 'roomArea')) {
            setState({
                isDraggingRoomName: selectedObject.object,
                roomDragStartPos: { x: pos.x, y: pos.y },
                roomOriginalCenter: [...selectedObject.object.center],
                selectedObject: null
            });
            return;
        }

        setState({
            selectedObject,
            selectedGroup: [],
            affectedWalls: [],
            preDragWallStates: new Map(),
            preDragNodeStates: new Map(),
            dragAxis: null,
            isSweeping: false,
            sweepWalls: [],
            dragOffset: { x: 0, y: 0 }
        });

        // Kolon için preDragNodeStates
        if (selectedObject && selectedObject.type === 'column') {
            const column = selectedObject.object;
            state.preDragNodeStates.set('center_x', column.center.x);
            state.preDragNodeStates.set('center_y', column.center.y);
            state.preDragNodeStates.set('size', column.size);
            state.preDragNodeStates.set('rotation', column.rotation || 0);
            state.preDragNodeStates.set('hollowWidth', column.hollowWidth || 0);
            state.preDragNodeStates.set('hollowHeight', column.hollowHeight || 0);
            state.preDragNodeStates.set('hollowOffsetX', column.hollowOffsetX || 0);
            state.preDragNodeStates.set('hollowOffsetY', column.hollowOffsetY || 0);
        }

        if (selectedObject) {
            let startPointForDragging;
            let dragOffset = { x: 0, y: 0 };

            if (selectedObject.type === 'wall' && selectedObject.handle !== 'body') {
                const nodeToDrag = selectedObject.object[selectedObject.handle];
                startPointForDragging = { x: nodeToDrag.x, y: nodeToDrag.y };
            } else if (selectedObject.type === 'door') {
                const door = selectedObject.object;
                const wall = door.wall;
                if (!wall || !wall.p1 || !wall.p2) return;
                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                if (wallLen < 0.1) return;
                const dx = (wall.p2.x - wall.p1.x) / wallLen;
                const dy = (wall.p2.y - wall.p1.y) / wallLen;
                const doorCenterX = wall.p1.x + dx * door.pos;
                const doorCenterY = wall.p1.y + dy * door.pos;
                startPointForDragging = { x: doorCenterX, y: doorCenterY };
                dragOffset = { x: doorCenterX - pos.x, y: doorCenterY - pos.y };
            } else if (selectedObject.type === 'window') {
                const window = selectedObject.object;
                const wall = selectedObject.wall;
                 if (!wall || !wall.p1 || !wall.p2) return;
                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                 if (wallLen < 0.1) return;
                const dx = (wall.p2.x - wall.p1.x) / wallLen;
                const dy = (wall.p2.y - wall.p1.y) / wallLen;
                const windowCenterX = wall.p1.x + dx * window.pos;
                const windowCenterY = wall.p1.y + dy * window.pos;
                startPointForDragging = { x: windowCenterX, y: windowCenterY };
                dragOffset = { x: windowCenterX - pos.x, y: windowCenterY - pos.y };
            } else if (selectedObject.type === 'vent') {
                 const vent = selectedObject.object;
                 const wall = selectedObject.wall;
                  if (!wall || !wall.p1 || !wall.p2) return;
                 const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                  if (wallLen < 0.1) return;
                 const dx = (wall.p2.x - wall.p1.x) / wallLen;
                 const dy = (wall.p2.y - wall.p1.y) / wallLen;
                 const ventCenterX = wall.p1.x + dx * vent.pos;
                 const ventCenterY = wall.p1.y + dy * vent.pos;
                 startPointForDragging = { x: ventCenterX, y: ventCenterY };
                 dragOffset = { x: ventCenterX - pos.x, y: ventCenterY - pos.y };
            } else if (selectedObject.type === 'column') {
                // Kolon için başlangıç noktası
                if (selectedObject.handle === 'body') {
                    // Body'den tutulduğunda mouse pozisyonunu kullan
                    startPointForDragging = { x: pos.x, y: pos.y };
                    dragOffset = { 
                        x: selectedObject.object.center.x - pos.x, 
                        y: selectedObject.object.center.y - pos.y 
                    };
                } else if (selectedObject.handle === 'center') {
                    startPointForDragging = { x: selectedObject.object.center.x, y: selectedObject.object.center.y };
                    dragOffset = { x: 0, y: 0 };
                } else if (selectedObject.handle === 'corner') {
                    const corners = getColumnCorners(selectedObject.object);
                    startPointForDragging = { x: corners[1].x, y: corners[1].y };
                    dragOffset = { x: 0, y: 0 };
                } else {
                    startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                    dragOffset = { x: 0, y: 0 };
                }
            } else {
                startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                dragOffset = { x: 0, y: 0 };
            }

            setState({
                isDragging: true,
                dragStartPoint: startPointForDragging,
                initialDragPoint: { x: pos.x, y: pos.y },
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
                dragOffset: dragOffset
            });

            if (selectedObject.type === "wall") {
                 if (selectedObject.handle !== "body") {
                     const nodeToDrag = selectedObject.object[selectedObject.handle];
                     const affectedWalls = state.walls.filter((w) => w.p1 === nodeToDrag || w.p2 === nodeToDrag);
                     setState({ affectedWalls, dragAxis: null });
                     affectedWalls.forEach((wall) => {
                         const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                         if (wallLength > 0.1) {
                             state.preDragWallStates.set(wall, {
                                 isP1Stationary: wall.p2 === nodeToDrag,
                                 doors: state.doors.filter((d) => d.wall === wall).map((door) => ({ doorRef: door, distFromP1: door.pos, distFromP2: wallLength - door.pos })),
                                 windows: (wall.windows || []).map((win) => ({ windowRef: win, distFromP1: win.pos, distFromP2: wallLength - win.pos }))
                             });
                         }
                     });
                 } else {
                     const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey;
                     const isSweeping =  !e.ctrlKey && !e.altKey && e.shiftKey;
                     let wallsBeingMoved;
                     if (isCopying || isSweeping) {
                         const originalWall = selectedObject.object;
                         const newP1 = { x: originalWall.p1.x, y: originalWall.p1.y };
                         const newP2 = { x: originalWall.p2.x, y: originalWall.p2.y };
                         state.nodes.push(newP1, newP2);
                         const newWall = { ...originalWall, p1: newP1, p2: newP2, windows: [], vents: [] };
                         state.walls.push(newWall);
                         wallsBeingMoved = [newWall];
                         setState({ selectedObject: { ...selectedObject, object: newWall } });
                     }
                     else {
                          if (e.ctrlKey && e.shiftKey) { const chain = findCollinearChain(selectedObject.object); setState({ selectedGroup: chain }); }
                          wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                     }
                     const nodesBeingMoved = new Set();
                     wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });
                     nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });

                     const wall = selectedObject.object;
                     const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
                     let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
                     let dragAxis = null;
                     if (Math.abs(angle - 45) < 1) dragAxis = null;
                     else if (angle < 45) dragAxis = 'y';
                     else dragAxis = 'x';

                     setState({ dragWallInitialVector: { dx, dy }, dragAxis, isSweeping: isSweeping });
                     const startWall = selectedObject.object;
                     const affectedRoomsForDrag = state.rooms.filter(room => {
                         if (!room.polygon || !room.polygon.geometry) return false;
                         const roomCoords = room.polygon.geometry.coordinates[0];
                         const hasP1 = roomCoords.some(c => Math.hypot(c[0] - startWall.p1.x, c[1] - startWall.p1.y) < 0.1);
                         const hasP2 = roomCoords.some(c => Math.hypot(c[0] - startWall.p2.x, c[1] - startWall.p2.y) < 0.1);
                         return hasP1 && hasP2;
                     });
                     if (affectedRoomsForDrag.length > 0) {
                          const draggedRoomInfos = affectedRoomsForDrag.map(room => ({
                               room: room,
                               originalCoords: JSON.parse(JSON.stringify(room.polygon.geometry.coordinates[0])),
                               tempPolygon: JSON.parse(JSON.stringify(room.polygon))
                          }));
                     }
                     if (!isCopying && !isSweeping && !e.altKey && !e.shiftKey) {
                         const checkAndSplitNode = (node) => {
                             const connectedWalls = state.walls.filter(w => (w.p1 === node || w.p2 === node) && !wallsBeingMoved.includes(w));
                             if (connectedWalls.length === 0) return false;
                             const mainDraggedWall = selectedObject.object;
                             const isMainWallHorizontal = Math.abs(mainDraggedWall.p2.y - mainDraggedWall.p1.y) < 1;
                             let needsSplit = false;
                             for (const connected of connectedWalls) {
                                 const isConnectedHorizontal = Math.abs(connected.p2.y - connected.p1.y) < 1;
                                 if ((isMainWallHorizontal && isConnectedHorizontal) || (!isMainWallHorizontal && !isConnectedHorizontal)) {
                                     needsSplit = true;
                                     break;
                                 }
                             }
                             if (needsSplit) {
                                 const newNode = { x: node.x, y: node.y };
                                 state.nodes.push(newNode);
                                 wallsBeingMoved.forEach(wall => {
                                     if (wall.p1 === node) wall.p1 = newNode;
                                     if (wall.p2 === node) wall.p2 = newNode;
                                 });
                                 state.preDragNodeStates.set(newNode, { x: node.x, y: node.y });
                                 return true;
                             }
                             return false;
                         };
                         let splitOccurred = false;
                         nodesBeingMoved.forEach(node => {
                             if(checkAndSplitNode(node)) {
                                 splitOccurred = true;
                             }
                         });
                         if (splitOccurred) {
                             setState({ isSweeping: true });
                         }
                     }
                 }
            }
        }
    } else if (state.currentMode === "drawDoor" || state.currentMode === "drawWindow" || state.currentMode === "drawVent") {

        if (state.currentMode === "drawWindow") {
            let previewWall = null, minDistSqPreview = Infinity;
            const bodyHitTolerancePreview = (WALL_THICKNESS * 1.5) ** 2;
            for (const w of [...state.walls].reverse()) {
                if (!w.p1 || !w.p2) continue;
                const distSq = distToSegmentSquared(pos, w.p1, w.p2);
                if (distSq < bodyHitTolerancePreview && distSq < minDistSqPreview) {
                    minDistSqPreview = distSq; previewWall = w;
                }
            }
            if (previewWall) {
                const previewWindowData = getWindowPlacement(previewWall, pos);
                if (previewWindowData && isSpaceForWindow(previewWindowData)) {
                    if (!previewWall.windows) previewWall.windows = [];
                    previewWall.windows.push({ pos: previewWindowData.pos, width: previewWindowData.width, type: 'window' });
                    saveState();
                    return;
                }
            }
        } else if (state.currentMode === "drawDoor") {
            let previewWall = null, minDistSqPreview = Infinity;
            const bodyHitTolerancePreview = (WALL_THICKNESS * 1.5) ** 2;
            for (const w of [...state.walls].reverse()) {
                 if (!w.p1 || !w.p2) continue;
                 const distSq = distToSegmentSquared(pos, w.p1, w.p2);
                 if (distSq < bodyHitTolerancePreview && distSq < minDistSqPreview) {
                     minDistSqPreview = distSq; previewWall = w;
                 }
            }
            if (previewWall) {
                const previewDoor = getDoorPlacement(previewWall, pos);
                if (previewDoor && isSpaceForDoor(previewDoor)) {
                    state.doors.push(previewDoor);
                    saveState();
                    return;
                }
            }
        }

        const clickedObject = getObjectAtPoint(pos);

        if (state.currentMode === "drawWindow") {
            const addWindowToWallMiddle = (wall) => {
                 if (wall.windows && wall.windows.length > 0) return false;

                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                const wallThickness = wall.thickness || WALL_THICKNESS;
                const margin = (wallThickness / 2) + 5;
                const defaultWidth = 150;
                const minWidth = 40;

                let windowWidth = defaultWidth;
                if (wallLen < 300) {
                     const availableSpace = wallLen - 2 * margin;
                     windowWidth = Math.max(minWidth, Math.min(availableSpace, wallLen / 2));
                } else {
                     const availableSpace = wallLen - 2 * margin;
                     windowWidth = Math.min(defaultWidth, availableSpace);
                }

                 if(windowWidth < minWidth) return false;

                const windowPos = wallLen / 2;

                 const tempWindowData = { wall: wall, pos: windowPos, width: windowWidth };
                 if (!isSpaceForWindow(tempWindowData)) {
                     return false;
                 }

                if (!wall.windows) wall.windows = [];
                wall.windows.push({
                    pos: windowPos,
                    width: windowWidth,
                    type: 'window'
                });
                return true;
            };

            if (clickedObject && clickedObject.type === 'room') {
                const clickedRoom = clickedObject.object; const TOLERANCE = 1;
                if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return;
                const roomCoords = clickedRoom.polygon.geometry.coordinates[0]; const roomWalls = new Set();
                for (let i = 0; i < roomCoords.length - 1; i++) {
                     const p1Coord = roomCoords[i]; const p2Coord = roomCoords[i + 1];
                     const wall = state.walls.find(w => {
                         if (!w || !w.p1 || !w.p2) return false;
                         const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                         const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                          return Math.min(d1, d2) < TOLERANCE;
                      });
                     if (wall) roomWalls.add(wall);
                }
                let windowAdded = false;
                roomWalls.forEach(wall => { if (state.wallAdjacency.get(wall) === 1) if (addWindowToWallMiddle(wall)) windowAdded = true; });
                if (windowAdded) saveState();
                return;
            }
            if (!clickedObject) {
                let windowAdded = false;
                state.wallAdjacency.forEach((count, wall) => { if (count === 1) if (addWindowToWallMiddle(wall)) windowAdded = true; });
                if (windowAdded) saveState();
                return;
            }
        }

        if (state.currentMode === "drawDoor" && clickedObject && clickedObject.type === 'room') {
            const clickedRoom = clickedObject.object;
            if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return;
            const coords = clickedRoom.polygon.geometry.coordinates[0];
            const roomWalls = [];
            for (let i = 0; i < coords.length - 1; i++) {
                const p1Coord = coords[i]; const p2Coord = coords[i + 1];
                const wall = state.walls.find(w => {
                    if (!w || !w.p1 || !w.p2) return false;
                   const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                   const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                   return Math.min(dist1, dist2) < 1;
                });
                if (wall) roomWalls.push(wall);
            }
            const neighborRooms = [];
            state.rooms.forEach(otherRoom => {
                if (otherRoom === clickedRoom || !otherRoom.polygon || !otherRoom.polygon.geometry) return;
                const otherCoords = otherRoom.polygon.geometry.coordinates[0];
                const otherWalls = [];
                for (let i = 0; i < otherCoords.length - 1; i++) {
                     const p1Coord = otherCoords[i]; const p2Coord = otherCoords[i + 1];
                     const wall = state.walls.find(w => {
                         if (!w || !w.p1 || !w.p2) return false;
                        const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                        const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                        return Math.min(dist1, dist2) < 1;
                     });
                     if (wall) otherWalls.push(wall);
                }
                const sharedWalls = roomWalls.filter(w => otherWalls.includes(w));
                if (sharedWalls.length > 0) neighborRooms.push({ room: otherRoom, sharedWalls: sharedWalls });
            });
            let doorsAdded = 0;
            neighborRooms.forEach(neighbor => {
                const sharedWalls = neighbor.sharedWalls;
                let longestWall = sharedWalls[0];
                let maxLength = 0;
                 if(longestWall && longestWall.p1 && longestWall.p2) maxLength = Math.hypot(longestWall.p2.x - longestWall.p1.x, longestWall.p2.y - longestWall.p1.y);
                sharedWalls.forEach(wall => {
                     if (!wall || !wall.p1 || !wall.p2) return;
                    const len = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                    if (len > maxLength) { maxLength = len; longestWall = wall; }
                });
                if(!longestWall || !longestWall.p1 || !longestWall.p2) return;
                const existingDoor = state.doors.find(d => d.wall === longestWall);
                if (!existingDoor) {
                    const midX = (longestWall.p1.x + longestWall.p2.x) / 2;
                    const midY = (longestWall.p1.y + longestWall.p2.y) / 2;
                    const newDoor = getDoorPlacement(longestWall, { x: midX, y: midY });
                    if (newDoor && isSpaceForDoor(newDoor)) { state.doors.push(newDoor); doorsAdded++; }
                }
            });
            if (doorsAdded > 0) saveState();
            return;
        }

        if(state.currentMode === "drawVent") {
            let closestWall = null; let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS;
             for (const w of [...state.walls].reverse()) {
                 if (!w.p1 || !w.p2) continue;
                 const p1 = w.p1, p2 = w.p2; const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2; if(l2 < 0.1) continue;
                 const d = distToSegmentSquared(snappedPos, p1, p2);
                 if (d < bodyHitTolerance**2 && d < minDistSq) { minDistSq = d; closestWall = w; }
             }
             if(closestWall) {
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const ventWidth = 40; const ventMargin = 10;
                if (wallLen >= ventWidth + 2 * ventMargin) {
                     const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                     const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                     const ventPos = t * wallLen;
                     if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                         if (!closestWall.vents) closestWall.vents = [];
                         closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                         saveState();
                     }
                 }
             }
        }

    } else if (state.currentMode === "drawColumn") {
        const newColumn = createColumn(snappedPos.roundedX, snappedPos.roundedY, 40);
        state.columns.push(newColumn);
        saveState();
        return;
        
    } else {
        let placementPos = { x: snappedPos.roundedX, y: snappedPos.roundedY };
        if (!state.startPoint) {
             setState({ startPoint: getOrCreateNode(placementPos.x, placementPos.y) });
        } else {
            const d = Math.hypot(state.startPoint.x - placementPos.x, state.startPoint.y - placementPos.y);
            if (d > 0.1) {
                let geometryChanged = false;
                if (state.currentMode === "drawWall") {
                     if (!snappedPos.isSnapped || snappedPos.snapType === 'GRID') {
                          placementPos = snapTo15DegreeAngle(state.startPoint, placementPos);
                     }
                     const dx = placementPos.x - state.startPoint.x, dy = placementPos.y - state.startPoint.y;
                     const distance = Math.hypot(dx, dy);
                     const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;
                     if (distance > 0.1 && (!snappedPos.isSnapped || snappedPos.snapType === 'GRID')) {
                         const snappedDistance = Math.round(distance / gridValue) * gridValue;
                         if (Math.abs(snappedDistance - distance) > 0.01) {
                            const scale = snappedDistance / distance;
                            placementPos.x = state.startPoint.x + dx * scale;
                            placementPos.y = state.startPoint.y + dy * scale;
                         }
                     }
                     const nodesBefore = state.nodes.length;
                     const endNode = getOrCreateNode(placementPos.x, placementPos.y);
                     const didSnapToExistingNode = (state.nodes.length === nodesBefore);
                     const didConnectToWallBody = !didSnapToExistingNode && isPointOnWallBody(endNode);
                     if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
                         state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: WALL_THICKNESS, wallType: 'normal' });
                         geometryChanged = true;
                     }
                     if ((didSnapToExistingNode && endNode !== state.startPoint) || didConnectToWallBody) { setState({ startPoint: null }); }
                     else { setState({ startPoint: endNode }); }
                } else if (state.currentMode === "drawRoom") {
                    const p1 = state.startPoint;
                    if (Math.abs(p1.x - placementPos.x) > 1 && Math.abs(p1.y - placementPos.y) > 1) {
                       const v1 = p1, v2 = getOrCreateNode(placementPos.x, v1.y), v3 = getOrCreateNode(placementPos.x, placementPos.y), v4 = getOrCreateNode(v1.x, placementPos.y);
                       [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }].forEach(pw => {
                            if (!wallExists(pw.p1, pw.p2)) state.walls.push({ type: "wall", ...pw, thickness: WALL_THICKNESS, wallType: 'normal' });
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