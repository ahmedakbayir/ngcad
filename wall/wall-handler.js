// wall-handler.js
import { processWalls } from './wall-processor.js';
import { getOrCreateNode, isPointOnWallBody, snapTo15DegreeAngle, distToSegmentSquared, distToArcWallSquared } from '../draw/geometry.js';
import { saveState } from '../general-files/history.js';
import { state, setState } from '../general-files/main.js'; // setState import edildiğinden emin olun
import { getMinWallLength } from '../general-files/actions.js'; // actions.js'ten kalanları al
import { update3DScene } from '../scene3d/scene3d-update.js'; 


/**
 * İki node arasında bir duvar olup olmadığını kontrol eder.
 * @param {object} p1 - Birinci node
 * @param {object} p2 - İkinci node
 * @returns {boolean} - Duvar varsa true
 */
export function wallExists(p1, p2) {
    // Sadece aktif kattaki duvarları kontrol et (farklı katlarda aynı noktadan duvar çizilebilmeli)
    const currentFloorId = state.currentFloor?.id;
    const wallsToCheck = currentFloorId
        ? state.walls.filter(w => w.floorId === currentFloorId)
        : state.walls;
    return wallsToCheck.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
}

/**
 * Verilen noktaya (pos) en yakın duvarı veya duvar ucunu (node) bulur.
 * @param {object} pos - Dünya koordinatlarında {x, y}
 * @param {number} tolerance - Yakalama toleransı
 * @returns {object | null} - Bulunan duvar nesnesi (seçim için) veya null
 */
export function getWallAtPoint(pos, tolerance) {
    const currentFloorId = state.currentFloor?.id;
    const walls = currentFloorId
        ? (state.walls || []).filter(w => w.floorId === currentFloorId)
        : (state.walls || []);

    // Duvar ucu (node) kontrolü
    for (const wall of [...walls].reverse()) {
        if (!wall.p1 || !wall.p2) continue;
        const d1 = Math.hypot(pos.x - wall.p1.x, pos.y - wall.p1.y);
        const d2 = Math.hypot(pos.x - wall.p2.x, pos.y - wall.p2.y);
        if (d1 < tolerance) return { type: "wall", object: wall, handle: "p1" };
        if (d2 < tolerance) return { type: "wall", object: wall, handle: "p2" };
    }

    // Duvar gövdesi kontrolü - CRITICAL FIX: Use filtered 'walls' not 'state.walls'
    for (const wall of [...walls].reverse()) {
        if (!wall.p1 || !wall.p2) continue;
        const wallPx = wall.thickness || state.wallThickness;
        const bodyHitToleranceSq = (wallPx / 2 + tolerance)**2;

        // Arc duvarlar için özel kontrol
        let distSq;
        if (wall.isArc && wall.arcControl1 && wall.arcControl2) {
            distSq = distToArcWallSquared(pos, wall);
        } else {
            distSq = distToSegmentSquared(pos, wall.p1, wall.p2);
        }

        if (distSq < bodyHitToleranceSq) {
            const d1Sq = (pos.x - wall.p1.x)**2 + (pos.y - wall.p1.y)**2;
            const d2Sq = (pos.x - wall.p2.x)**2 + (pos.y - wall.p2.y)**2;
            if (d1Sq > tolerance**2 && d2Sq > tolerance**2) { // Uçlarda değilse
                return { type: "wall", object: wall, handle: "body" };
            }
        }
    }
    return null;
}

/**
 * 'drawWall' veya 'drawRoom' modundayken tıklama işlemini yönetir.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 */
export function onPointerDownDraw(snappedPos) {
    // Eğer snap olunmuşsa (guide, endpoint vb.), snapped pozisyonu kullan
    // Değilse grid-rounded pozisyonu kullan
    let placementPos = snappedPos.isSnapped
        ? { x: snappedPos.x, y: snappedPos.y }
        : { x: snappedPos.roundedX, y: snappedPos.roundedY };

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
                     state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: state.wallThickness, wallType: 'normal', floorId: state.currentFloor?.id });
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
                   const v1 = p1,
                         v2 = getOrCreateNode(placementPos.x, v1.y),
                         v3 = getOrCreateNode(placementPos.x, placementPos.y),
                         v4 = getOrCreateNode(v1.x, placementPos.y);
                   [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }].forEach(pw => {
                        if (!wallExists(pw.p1, pw.p2)) {
                            state.walls.push({ type: "wall", ...pw, thickness: state.wallThickness, wallType: 'normal', floorId: state.currentFloor?.id });
                        }
                   });
                   geometryChanged = true;
                   setState({ startPoint: null });
                }
            }

            if (geometryChanged) {
                processWalls();
                saveState();
            }
        }
    }
}

/**
 * Bir duvar seçildiğinde sürükleme için ilk state'i ayarlar.
 * @param {object} selectedObject - Seçilen duvar nesnesi
 * @param {object} pos - Dünya koordinatları {x, y}
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {Event} e - PointerDown olayı
 * @returns {object} - Sürükleme için { startPointForDragging, dragOffset, ...ekState }
 */
export function onPointerDownSelect(selectedObject, pos, snappedPos, e) {
    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = {};

    if (selectedObject.handle !== "body") {
        // Duvar Ucu (Node) Sürükleme
        const nodeToDrag = selectedObject.object[selectedObject.handle];
        startPointForDragging = { x: nodeToDrag.x, y: nodeToDrag.y };

        // Sadece aktif kattaki duvarları etkile (diğer katlardaki node'ları etkilemeden)
        const currentFloorId = state.currentFloor?.id;
        const affectedWalls = state.walls.filter((w) =>
            (w.p1 === nodeToDrag || w.p2 === nodeToDrag) &&
            (!currentFloorId || w.floorId === currentFloorId)
        );
        additionalState.affectedWalls = affectedWalls;
        additionalState.dragAxis = null;

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
        // Duvar Gövdesi Sürükleme
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY }; // Snapli pozisyonu kullan

        const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey;
        const isSweeping = !e.ctrlKey && !e.altKey && e.shiftKey;
        let wallsBeingMoved;

        if (isCopying || isSweeping) {
            const originalWall = selectedObject.object;
            const newP1 = { x: originalWall.p1.x, y: originalWall.p1.y };
            const newP2 = { x: originalWall.p2.x, y: originalWall.p2.y };
            state.nodes.push(newP1, newP2);
            const newWall = { ...originalWall, p1: newP1, p2: newP2, windows: [], vents: [] };
            state.walls.push(newWall);
            wallsBeingMoved = [newWall];
            // Ana state'teki selectedObject'i güncellemek için setState gerekir
            setState({ selectedObject: { ...selectedObject, object: newWall } });
        } else {
             if (e.ctrlKey && e.shiftKey) {
                 const chain = findCollinearChain(selectedObject.object);
                 setState({ selectedGroup: chain });
             }
             wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
        }

        const nodesBeingMoved = new Set();
        wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

        nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });

        // Kolonların orijinal pozisyonlarını kaydet
        state.columns.forEach((col, index) => {
            state.preDragNodeStates.set(`col_${index}_x`, col.center.x);
            state.preDragNodeStates.set(`col_${index}_y`, col.center.y);
        });

        const wall = selectedObject.object;
        const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
        let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
        let dragAxis = null;
        if (Math.abs(angle - 45) < 1) dragAxis = null;
        else if (angle < 45) dragAxis = 'y';
        else dragAxis = 'x';

        additionalState.dragWallInitialVector = { dx, dy };
        additionalState.dragAxis = dragAxis;
        additionalState.isSweeping = isSweeping;

        // T-Kavşağı ayırma
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
            nodesBeingMoved.forEach(node => { if(checkAndSplitNode(node)) splitOccurred = true; });
            if (splitOccurred) {
                 additionalState.isSweeping = true;
            }
        }
    }

    return { startPointForDragging, dragOffset, additionalState };
}

/**
 * Seçili bir duvarı sürüklerken çağrılır.
 * @param {object} snappedPos - Snap uygulanmış fare pozisyonu
 * @param {object} unsnappedPos - Snap uygulanmamış fare pozisyonu
 */
export function onPointerMove(snappedPos, unsnappedPos) {
    const currentFloorId = state.currentFloor?.id;

    // Sürüklenen duvarları tespit et
    const draggedWalls = state.selectedGroup && state.selectedGroup.length > 0
        ? state.selectedGroup
        : [state.selectedObject.object];

    // Snap için kullanılacak duvarlar - sürüklenen duvarları ÇIKAR
    const walls = (state.walls || [])
        .filter(w => !currentFloorId || !w.floorId || w.floorId === currentFloorId)
        .filter(w => !draggedWalls.includes(w));

    let neighborWallsToDimension = new Set(); // Komşu duvarları saklamak için Set

    if (state.selectedObject.handle !== "body") {
        // Duvar Ucu (Node) Sürükleme
        const nodeToMove = state.selectedObject.object[state.selectedObject.handle];

        // UZAK DUVAR YÜZEY SNAP (smooth)
        const SNAP_DISTANCE = 20; // Snap mesafesi (cm)

        // Mouse pozisyonundan başla
        let finalPos = { x: snappedPos.x, y: snappedPos.y };

        // Duvar yüzeylerine snap kontrolü
        let bestSnapX = { diff: SNAP_DISTANCE, value: null };
        let bestSnapY = { diff: SNAP_DISTANCE, value: null };

        walls.forEach(wall => {
            // Sürüklenen node'un bağlı olduğu duvarları atla
            if (state.affectedWalls.includes(wall)) return;
            if (!wall.p1 || !wall.p2) return;

            const wallThickness = wall.thickness || state.wallThickness;
            const halfThickness = wallThickness / 2;
            const dxW = wall.p2.x - wall.p1.x;
            const dyW = wall.p2.y - wall.p1.y;
            const isVertical = Math.abs(dxW) < 0.1;
            const isHorizontal = Math.abs(dyW) < 0.1;

            if (isVertical) {
                const wallX = wall.p1.x;
                const snapXPositions = [wallX - halfThickness, wallX + halfThickness, wallX];
                for (const snapX of snapXPositions) {
                    const diff = Math.abs(finalPos.x - snapX);
                    if (diff < bestSnapX.diff) {
                        bestSnapX = { diff, value: snapX };
                    }
                }
            } else if (isHorizontal) {
                const wallY = wall.p1.y;
                const snapYPositions = [wallY - halfThickness, wallY + halfThickness, wallY];
                for (const snapY of snapYPositions) {
                    const diff = Math.abs(finalPos.y - snapY);
                    if (diff < bestSnapY.diff) {
                        bestSnapY = { diff, value: snapY };
                    }
                }
            }
        });

        // Snap bulunduysa uygula
        if (bestSnapX.value !== null) finalPos.x = bestSnapX.value;
        if (bestSnapY.value !== null) finalPos.y = bestSnapY.value;

        const moveIsValid = state.affectedWalls.every((wall) => {
            const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1;
            const newLength = Math.hypot(finalPos.x - otherNode.x, finalPos.y - otherNode.y);
            return newLength >= getMinWallLength(wall);
        });

        if (moveIsValid) {
            nodeToMove.x = finalPos.x;
            nodeToMove.y = finalPos.y;
        }

       // Sürüklenen node'a bağlı komşu duvarları bul (affectedWalls hariç)
       walls.forEach(wall => {
           if (!state.affectedWalls.includes(wall) && (wall.p1 === nodeToMove || wall.p2 === nodeToMove)) {
               neighborWallsToDimension.add(wall);
           }
       });

        // Etkilenen duvarlardaki eleman pozisyonlarını güncelle
        if (state.affectedWalls.length > 0) {
             state.affectedWalls.forEach((wall) => {
                 const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                 const wallThickness = wall.thickness || 20;
                 const edgeMargin = (wallThickness / 2) + 5;
                 const ventMargin = 15;

                 (wall.doors || state.doors.filter(d => d.wall === wall)).forEach((door) => {
                     const minPos = edgeMargin + door.width / 2;
                     const maxPos = wallLength - edgeMargin - door.width / 2;
                     if (minPos > maxPos) door.pos = wallLength / 2;
                     else door.pos = Math.max(minPos, Math.min(maxPos, door.pos));
                 });
                 (wall.windows || []).forEach((window) => {
                     const minPos = edgeMargin + window.width / 2;
                     const maxPos = wallLength - edgeMargin - window.width / 2;
                     if (minPos > maxPos) window.pos = wallLength / 2;
                     else window.pos = Math.max(minPos, Math.min(maxPos, window.pos));
                 });
                 (wall.vents || []).forEach((vent) => {
                     const minPos = ventMargin + vent.width / 2;
                     const maxPos = wallLength - ventMargin - vent.width / 2;
                     if (minPos > maxPos) vent.pos = wallLength / 2;
                     else vent.pos = Math.max(minPos, Math.min(maxPos, vent.pos));
                 });
             });
        }
    } else {
        // Duvar Gövdesi Sürükleme
        const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
        const nodesToMove = new Set();
        wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

        // SNAP LOCK MEKANIZMASI - Dalgalanmayı önle
        const SNAP_LOCK_DISTANCE = 10; // Snap'ten ayrılma için minimum mesafe (cm)

        let totalDelta;

        // Eğer snap lock varsa ve hala snap mesafesindeyse, lock'u kullan
        if (state.wallBodySnapLock && snappedPos.isSnapped) {
            // Lock'u koru
            totalDelta = {
                x: state.wallBodySnapLock.dx,
                y: state.wallBodySnapLock.dy
            };

            // Mouse unsnapped pozisyona çok uzaklaştı mı kontrol et
            const currentMouseDelta = {
                x: unsnappedPos.x - state.initialDragPoint.x,
                y: unsnappedPos.y - state.initialDragPoint.y
            };
            const distFromLock = Math.hypot(
                currentMouseDelta.x - totalDelta.x,
                currentMouseDelta.y - totalDelta.y
            );

            // Snap'ten uzaklaştıysa lock'u kaldır
            if (distFromLock > SNAP_LOCK_DISTANCE) {
                setState({ wallBodySnapLock: null });
                totalDelta = {
                    x: snappedPos.x - state.initialDragPoint.x,
                    y: snappedPos.y - state.initialDragPoint.y
                };
            }
        } else if (snappedPos.isSnapped) {
            // Yeni snap yakalandı, lock'la
            totalDelta = {
                x: snappedPos.x - state.initialDragPoint.x,
                y: snappedPos.y - state.initialDragPoint.y
            };
            setState({
                wallBodySnapLock: {
                    dx: totalDelta.x,
                    dy: totalDelta.y
                }
            });
        } else {
            // Snap yok, lock yok, normal takip et
            totalDelta = {
                x: snappedPos.x - state.initialDragPoint.x,
                y: snappedPos.y - state.initialDragPoint.y
            };
        }

        // Eksen kısıtlaması uygula
        if (state.dragAxis === 'x') totalDelta.y = 0;
        else if (state.dragAxis === 'y') totalDelta.x = 0;

        // Nodeları taşı
        nodesToMove.forEach((node) => {
            const originalPos = state.preDragNodeStates.get(node);
            if (originalPos) {
                node.x = originalPos.x + totalDelta.x;
                node.y = originalPos.y + totalDelta.y;
            }
        });

        // Kolonları taşı
        const SNAP_TOLERANCE_FOR_MOVE = 1.0;
        state.columns.forEach(column => {
            const colIndex = state.columns.indexOf(column);
            const originalColCenterX = state.preDragNodeStates.get(`col_${colIndex}_x`);
            const originalColCenterY = state.preDragNodeStates.get(`col_${colIndex}_y`);
            if (originalColCenterX === undefined) return;

            let wasSnappedToMovingWall = false;
            for (const wall of wallsToMove) {
                const originalP1 = state.preDragNodeStates.get(wall.p1);
                const originalP2 = state.preDragNodeStates.get(wall.p2);
                if (!originalP1 || !originalP2) continue;
                const distSq = distToSegmentSquared({ x: originalColCenterX, y: originalColCenterY }, originalP1, originalP2);
                if (distSq < SNAP_TOLERANCE_FOR_MOVE * SNAP_TOLERANCE_FOR_MOVE) {
                    wasSnappedToMovingWall = true;
                    break;
                }
            }
            if (wasSnappedToMovingWall) {
                column.center.x = originalColCenterX + totalDelta.x;
                column.center.y = originalColCenterY + totalDelta.y;
            }
        });

       // Sürüklenen nodelara bağlı komşu duvarları bul (wallsToMove hariç)
       nodesToMove.forEach(node => {
           walls.forEach(wall => {
               // Duvarın geçerli olduğundan emin ol
               if (!wall || !wall.p1 || !wall.p2) return;
               // Sürüklenen duvarlardan değilse VE node'a bağlıysa ekle
               if (!wallsToMove.includes(wall) && (wall.p1 === node || wall.p2 === node)) {
                   neighborWallsToDimension.add(wall);
               }
           });
       });

        // Oda merkezlerini güncelle (bu mantık `pointer-move.js` içinde kalabilir veya buraya taşınabilir)
        // ... (şimdilik atlandı, `pointer-move.js` içinde bırakılabilir) ...

        // Sweep duvarlarını güncelle
        if (state.isSweeping) {
            const sweepWalls = [];
            wallsToMove.forEach(movedWall => {
                // Taşınan duvarın özelliklerini al
                const wallType = movedWall.wallType || 'normal';
                const thickness = movedWall.thickness || state.wallThickness;
                const floorId = movedWall.floorId; // Kat ID'sini al

                const originalP1 = state.preDragNodeStates.get(movedWall.p1);
                if (originalP1) {
                    sweepWalls.push({
                        p1: originalP1,
                        p2: movedWall.p1,
                        type: 'wall',
                        wallType: wallType,
                        thickness: thickness,
                        floorId: floorId // floorId ekle
                    });
                }

                const originalP2 = state.preDragNodeStates.get(movedWall.p2);
                if (originalP2) {
                    sweepWalls.push({
                        p1: originalP2,
                        p2: movedWall.p2,
                        type: 'wall',
                        wallType: wallType,
                        thickness: thickness,
                        floorId: floorId // floorId ekle
                    });
                }
            });
            setState({ sweepWalls });
        }
    }
    //update3DScene();

   // Bulunan komşu duvarları geçici state'e ata
   setState({ tempNeighborWallsToDimension: neighborWallsToDimension });
}
/**
 * Aynı hizada olan duvar zincirini bulur.
 * @param {object} startWall - Başlangıç duvarı
 * @returns {Array<object>} - Aynı hizadaki duvarlar dizisi
 */
export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);
    // Sadece aynı kattaki duvarları tara
    const currentFloorId = state.currentFloor?.id;
    const wallsOnSameFloor = currentFloorId ? (state.walls || []).filter(w => w.floorId === currentFloorId) : [];

    const exploreFrom = (wall) => {
        if (!wall || !wall.p1 || !wall.p2) return;
        [wall.p1, wall.p2].forEach(node => {
            wallsOnSameFloor.forEach(w => {
                if (visited.has(w)) return;
                if (!w || w.p1 !== node && w.p2 !== node) return;
                if (!w.p1 || !w.p2) return;

                const v1 = { x: wall.p2.x - wall.p1.x, y: wall.p2.y - wall.p1.y };
                const v2 = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
                const len1 = Math.hypot(v1.x, v1.y);
                const len2 = Math.hypot(v2.x, v2.y);
                if (len1 < 0.1 || len2 < 0.1) return;

                v1.x /= len1; v1.y /= len1;
                v2.x /= len2; v2.y /= len2;

                const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);
                if (dot > 0.999) {
                    chain.push(w);
                    visited.add(w);
                    exploreFrom(w);
                }
            });
        });
    };
    exploreFrom(startWall);
    return chain;
}