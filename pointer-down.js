import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint, getDoorPlacement, isSpaceForDoor, findCollinearChain } from './actions.js';

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
        const selectedObject = getObjectAtPoint(pos);

        if (selectedObject && selectedObject.type === 'room') {
            setState({ selectedRoom: selectedObject.object, selectedObject: null });
        } else if (!selectedObject) {
            setState({ selectedRoom: null });
        }
        
        if (selectedObject && selectedObject.type === 'roomName') {
            setState({ 
                isDraggingRoomName: selectedObject.object, 
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
            sweepWalls: [] 
        });

        if (selectedObject) {
            let startPointForDragging;
            if (selectedObject.type === 'wall' && selectedObject.handle !== 'body') {
                const nodeToDrag = selectedObject.object[selectedObject.handle];
                startPointForDragging = { x: nodeToDrag.x, y: nodeToDrag.y };
            } else {
                startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
            }

            setState({
                isDragging: true,
                dragStartPoint: startPointForDragging,
                initialDragPoint: { x: pos.x, y: pos.y },
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId },
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
                                doors: state.doors.filter((d) => d.wall === wall).map((door) => ({
                                    doorRef: door,
                                    distFromP1: door.pos,
                                    distFromP2: wallLength - door.pos
                                }))
                            });
                        }
                    });
                } else {
                    const isCopying = e.ctrlKey && !e.shiftKey;
                    const isSweeping = e.shiftKey && !e.ctrlKey;

                    let wallsBeingMoved;
                    
                    if (isCopying || isSweeping) {
                        const originalWall = selectedObject.object;
                        const newP1 = { x: originalWall.p1.x, y: originalWall.p1.y };
                        const newP2 = { x: originalWall.p2.x, y: originalWall.p2.y };
                        state.nodes.push(newP1, newP2);
                        const newWall = { ...originalWall, p1: newP1, p2: newP2 };
                        state.walls.push(newWall);
                        
                        wallsBeingMoved = [newWall];
                        setState({ selectedObject: { ...selectedObject, object: newWall } });
                    } 
                    else {
                            if (e.ctrlKey && e.shiftKey) {
                                const chain = findCollinearChain(selectedObject.object);
                                console.log('Collinear chain bulundu:', chain.length, 'duvar');
                                console.log('Chain duvarları:', chain.map(w => `(${w.p1.x},${w.p1.y})-(${w.p2.x},${w.p2.y})`));
                                setState({ selectedGroup: chain });
                            }
                        wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                    }

                    const nodesBeingMoved = new Set();
                    wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

                    nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });

                    const wall = selectedObject.object;
                    const dx = wall.p2.x - wall.p1.x;
                    const dy = wall.p2.y - wall.p1.y;
                    
                    let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
                    
                    let dragAxis = null;
                    if (Math.abs(angle - 45) < 1) { dragAxis = null; } 
                    else if (angle < 45) { dragAxis = 'y'; } 
                    else { dragAxis = 'x'; }
                    
                    setState({ 
                        dragWallInitialVector: { dx, dy },
                        dragAxis,
                        isSweeping: isSweeping
                    });

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
        // Önce mahalle tıklanıp tıklanmadığını kontrol et (sadece kapı modunda)
        if (state.currentMode === "drawDoor") {
            const clickedObject = getObjectAtPoint(pos);
            
            if (clickedObject && clickedObject.type === 'room') {
                const clickedRoom = clickedObject.object;
                
                // Bu mahallenin duvarlarını polygon'dan bul
                if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) {
                    console.log('Polygon bilgisi eksik');
                    return;
                }
                
                const coords = clickedRoom.polygon.geometry.coordinates[0];
                const roomWalls = [];
                
                // Polygon kenarlarından duvarları bul
                for (let i = 0; i < coords.length - 1; i++) {
                    const p1Coord = coords[i];
                    const p2Coord = coords[i + 1];
                    
                    // Bu koordinatlara karşılık gelen duvarı bul
                    const wall = state.walls.find(w => {
                        const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) +
                                     Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                        const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) +
                                     Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                        return Math.min(dist1, dist2) < 1;
                    });
                    
                    if (wall) {
                        roomWalls.push(wall);
                    }
                }
                
                console.log('Mahalle duvarları bulundu:', roomWalls.length);
                
                // Komşu mahalleri bul - aynı duvarı paylaşan mahalleler
                const neighborRooms = [];
                
                state.rooms.forEach(otherRoom => {
                    if (otherRoom === clickedRoom) return;
                    
                    if (!otherRoom.polygon || !otherRoom.polygon.geometry) return;
                    
                    const otherCoords = otherRoom.polygon.geometry.coordinates[0];
                    const otherWalls = [];
                    
                    for (let i = 0; i < otherCoords.length - 1; i++) {
                        const p1Coord = otherCoords[i];
                        const p2Coord = otherCoords[i + 1];
                        
                        const wall = state.walls.find(w => {
                            const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) +
                                         Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                            const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) +
                                         Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                            return Math.min(dist1, dist2) < 1;
                        });
                        
                        if (wall) {
                            otherWalls.push(wall);
                        }
                    }
                    
                    // Ortak duvar var mı kontrol et
                    const sharedWalls = roomWalls.filter(w => otherWalls.includes(w));
                    
                    if (sharedWalls.length > 0) {
                        neighborRooms.push({
                            room: otherRoom,
                            sharedWalls: sharedWalls
                        });
                    }
                });
                
                console.log('Komşu mahalle sayısı:', neighborRooms.length);
                
                let doorsAdded = 0;
                
                neighborRooms.forEach(neighbor => {
                    const sharedWalls = neighbor.sharedWalls;
                    
                    // En uzun ortak duvarı bul
                    let longestWall = sharedWalls[0];
                    let maxLength = Math.hypot(longestWall.p2.x - longestWall.p1.x, longestWall.p2.y - longestWall.p1.y);
                    
                    sharedWalls.forEach(wall => {
                        const len = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (len > maxLength) {
                            maxLength = len;
                            longestWall = wall;
                        }
                    });
                    
                    // Bu duvarda zaten kapı var mı kontrol et
                    const existingDoor = state.doors.find(d => d.wall === longestWall);
                    
                    if (!existingDoor) {
                        // Duvarın ortasına kapı yerleştirmeye çalış
                        const midX = (longestWall.p1.x + longestWall.p2.x) / 2;
                        const midY = (longestWall.p1.y + longestWall.p2.y) / 2;
                        
                        const newDoor = getDoorPlacement(longestWall, { x: midX, y: midY });
                        
                        if (newDoor && isSpaceForDoor(newDoor)) {
                            state.doors.push(newDoor);
                            doorsAdded++;
                            console.log(`${neighbor.room.name} ile arasına kapı eklendi!`);
                        } else {
                            console.log(`${neighbor.room.name} ile arasına kapı eklenemedi - yer yok`);
                        }
                    } else {
                        console.log(`${neighbor.room.name} ile arasında zaten kapı var`);
                    }
                });
                
                console.log('Toplam eklenen kapı:', doorsAdded);
                if (doorsAdded > 0) {
                    saveState();
                }
                return;
            }
        }
        
        // Normal duvar tıklama mantığı (mahalle tıklanmadıysa)
        let closestWall = null;
        let minDistSq = Infinity;
        const bodyHitTolerance = WALL_THICKNESS;
        
        for (const w of [...state.walls].reverse()) {
            const p1 = w.p1, p2 = w.p2;
            const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
            if (l2 < 0.1) continue;
            
            const d = distToSegmentSquared({ x: snappedPos.x, y: snappedPos.y }, p1, p2);
            if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                minDistSq = d;
                closestWall = w;
            }
        }
        
        if (closestWall) {
            const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
            
            if (state.currentMode === "drawDoor") {
                const newDoor = getDoorPlacement(closestWall, { x: snappedPos.x, y: snappedPos.y });
                if (newDoor && isSpaceForDoor(newDoor)) {
                    state.doors.push(newDoor);
                    saveState();
                }
            } else if (state.currentMode === "drawWindow") {
                const windowWidth = Math.min(120, wallLen - 20);
                if (windowWidth >= 40) {
                    const dx = closestWall.p2.x - closestWall.p1.x;
                    const dy = closestWall.p2.y - closestWall.p1.y;
                    const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                    const windowPos = t * wallLen;
                    
                    if (windowPos >= windowWidth / 2 + 10 && windowPos <= wallLen - windowWidth / 2 - 10) {
                        if (!closestWall.windows) closestWall.windows = [];
                        closestWall.windows.push({
                            pos: windowPos,
                            width: windowWidth,
                            type: 'window'
                        });
                        saveState();
                    }
                }
            } else if (state.currentMode === "drawVent") {
                const ventWidth = 40;
                if (wallLen >= ventWidth + 20) {
                    const dx = closestWall.p2.x - closestWall.p1.x;
                    const dy = closestWall.p2.y - closestWall.p1.y;
                    const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                    const ventPos = t * wallLen;
                    
                    if (ventPos >= ventWidth / 2 + 10 && ventPos <= wallLen - ventWidth / 2 - 10) {
                        if (!closestWall.vents) closestWall.vents = [];
                        closestWall.vents.push({
                            pos: ventPos,
                            width: ventWidth,
                            type: 'vent'
                        });
                        saveState();
                    }
                }
            }
        }
    } else {
        let placementPos = { x: snappedPos.roundedX, y: snappedPos.roundedY };

        if (!state.startPoint) {
            setState({ startPoint: getOrCreateNode(placementPos.x, placementPos.y) });
        } else {
            const d = Math.hypot(state.startPoint.x - placementPos.x, state.startPoint.y - placementPos.y);

            if (d > 0.1) {
                let geometryChanged = false;

                if (state.currentMode === "drawWall") {
                    if (state.startPoint) {
                        // Eğer snap yakalanmadıysa 15 derece açı kısıtlaması uygula
                        if (!snappedPos.isSnapped) {
                            placementPos = snapTo15DegreeAngle(state.startPoint, placementPos);
                        }
                    }

                    const dx = placementPos.x - state.startPoint.x;
                    const dy = placementPos.y - state.startPoint.y;
                    const distance = Math.hypot(dx, dy);
                    const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1;

                    if (distance > 0.1) {
                        // Eğer snap yakalanmadıysa grid snapping uygula
                        if (!snappedPos.isSnapped) {
                            const snappedDistance = Math.round(distance / gridValue) * gridValue;
                            if (Math.abs(snappedDistance - distance) > 0.01) {
                                const scale = snappedDistance / distance;
                                placementPos.x = state.startPoint.x + dx * scale;
                                placementPos.y = state.startPoint.y + dy * scale;
                            }
                        }
                    }

                    const nodesBefore = state.nodes.length;
                    const endNode = getOrCreateNode(placementPos.x, placementPos.y);
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

                    if (Math.abs(p1.x - placementPos.x) > 1 && Math.abs(p1.y - placementPos.y) > 1) {
                        let roundedX = placementPos.x;
                        let roundedY = placementPos.y;

                        const v1 = p1,
                            v2 = getOrCreateNode(roundedX, v1.y),
                            v3 = getOrCreateNode(roundedX, roundedY),
                            v4 = getOrCreateNode(v1.x, roundedY);

                        [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }].forEach(pw => {
                            if (!wallExists(pw.p1, pw.p2)) state.walls.push({ type: "wall", ...pw });
                        });
                        geometryChanged = true;
                        setState({ startPoint: null });
                    }
                } else if (state.currentMode === "drawArcWall") {
                    const p1 = state.startPoint;

                    if (Math.abs(p1.x - placementPos.x) > 1 || Math.abs(p1.y - placementPos.y) > 1) {
                        const endNode = getOrCreateNode(placementPos.x, placementPos.y);
                        
                        if (endNode !== p1) {
                            const midX = (p1.x + endNode.x) / 2;
                            const midY = (p1.y + endNode.y) / 2;
                            
                            const dx = endNode.x - p1.x;
                            const dy = endNode.y - p1.y;
                            const length = Math.hypot(dx, dy);
                            const normalX = -dy / length;
                            const normalY = dx / length;
                            
                            const controlOffset = Math.min(50, length / 3);
                            const controlNode = getOrCreateNode(
                                midX + normalX * controlOffset,
                                midY + normalY * controlOffset
                            );
                            
                            state.arcWalls.push({
                                type: "arcWall",
                                p1: p1,
                                p2: endNode,
                                control: controlNode,
                                thickness: WALL_THICKNESS,
                                wallType: 'normal'
                            });
                            
                            geometryChanged = true;
                            setState({ startPoint: null });
                        }
                    }
                }
                if (geometryChanged) { processWalls(); saveState(); }
            }
        }
    }
}