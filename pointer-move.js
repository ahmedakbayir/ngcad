import { state, dom, setState, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
import { getDoorPlacement, isSpaceForDoor, getMinWallLength } from './actions.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';

export function onPointerMove(e) {
    if (state.isCtrlDeleting) {
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        const wallsToDelete = new Set();
        // Duvar kalınlığına göre tolerans
        for (const wall of state.walls) {
             const wallPx = wall.thickness || WALL_THICKNESS;
             const currentToleranceSq = (wallPx / 2)**2;
            const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
            if (distSq < currentToleranceSq) {
                wallsToDelete.add(wall);
            }
        }

        if (wallsToDelete.size > 0) {
            const wallsToDeleteArray = Array.from(wallsToDelete);
            const newWalls = state.walls.filter(w => !wallsToDeleteArray.includes(w));
            const newDoors = state.doors.filter(d => !wallsToDeleteArray.includes(d.wall));

            setState({
                walls: newWalls,
                doors: newDoors,
            });
            processWalls(); // Geometriyi yeniden işle (odaları vb. günceller)
        }
        return;
    }

    if (state.isDraggingRoomName) {
        const room = state.isDraggingRoomName;
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const mouseDeltaX = mousePos.x - state.roomDragStartPos.x;
        const mouseDeltaY = mousePos.y - state.roomDragStartPos.y;
        const newCenterX = state.roomOriginalCenter[0] + mouseDeltaX;
        const newCenterY = state.roomOriginalCenter[1] + mouseDeltaY;
        room.center = [newCenterX, newCenterY];

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

    // Snap'i al (kapı/pencere sürükleniyorsa snap'siz döner)
    let snappedPos = getSmartSnapPoint(e, !state.isDragging);
    setState({ mousePos: snappedPos }); // mousePos güncellenir

    // Ham fare koordinatlarını al
    const rect = dom.c2d.getBoundingClientRect();
    const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);


    if (state.isStretchDragging) {
        update3DScene();
        updateMouseCursor();
        return;
    }

    if (state.isDragging && state.selectedObject) {
        // --- Duvar Ucu Sürükleme ---
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            // Duvar ucu sürüklerken snap'li pozisyonu kullan
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
        }
        // --- Duvar Gövdesi Sürükleme ---
        else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

            const mouseDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };

            let totalDelta = { x: mouseDelta.x, y: mouseDelta.y };
            if (state.dragAxis === 'x') totalDelta.y = 0;
            else if (state.dragAxis === 'y') totalDelta.x = 0;

            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    node.x = originalPos.x + totalDelta.x;
                    node.y = originalPos.y + totalDelta.y;
                }
            });

            // Mahal güncelleme
            if (state.draggedRoomInfo && state.draggedRoomInfo.length > 0) {
                 const nodePositionMap = new Map();
                 nodesToMove.forEach(node => {
                     const originalPos = state.preDragNodeStates.get(node);
                     if (originalPos) nodePositionMap.set(`${originalPos.x},${originalPos.y}`, { x: node.x, y: node.y });
                 });
                 state.draggedRoomInfo.forEach(info => {
                     const { originalCoords, tempPolygon, room } = info;
                     const newCoords = originalCoords.map(coord => {
                         const key = `${coord[0]},${coord[1]}`;
                         return nodePositionMap.has(key) ? [nodePositionMap.get(key).x, nodePositionMap.get(key).y] : coord;
                     });
                     tempPolygon.geometry.coordinates[0] = newCoords;
                     const centerOnFeature = turf.pointOnFeature(tempPolygon);
                     room.center = centerOnFeature.geometry.coordinates;
                 });
            }

            // Manyetik snap
             const MAGNETIC_SNAP_DISTANCE = 20;
             const ANGLE_TOLERANCE = 2;
             let bestMagneticSnap = null;
             let minMagneticDist = Infinity;
             wallsToMove.forEach(movingWall => {
                 const dx1 = movingWall.p2.x - movingWall.p1.x, dy1 = movingWall.p2.y - movingWall.p1.y;
                 const len1 = Math.hypot(dx1, dy1); if (len1 < 0.1) return;
                 const dir1 = { x: dx1 / len1, y: dy1 / len1 };
                 state.walls.forEach(staticWall => {
                     if (wallsToMove.includes(staticWall)) return;
                     const dx2 = staticWall.p2.x - staticWall.p1.x, dy2 = staticWall.p2.y - staticWall.p1.y;
                     const len2 = Math.hypot(dx2, dy2); if (len2 < 0.1) return;
                     const dir2 = { x: dx2 / len2, y: dy2 / len2 };
                     const dotProduct = Math.abs(dir1.x * dir2.x + dir1.y * dir2.y);
                     if (dotProduct < Math.cos(ANGLE_TOLERANCE * Math.PI / 180)) return;
                     const nodePairs = [
                         { moving: movingWall.p1, static: staticWall.p1 }, { moving: movingWall.p1, static: staticWall.p2 },
                         { moving: movingWall.p2, static: staticWall.p1 }, { moving: movingWall.p2, static: staticWall.p2 }
                     ];
                     nodePairs.forEach(pair => {
                         const dist = Math.hypot(pair.moving.x - pair.static.x, pair.moving.y - pair.static.y);
                         if (dist < MAGNETIC_SNAP_DISTANCE && dist > 0.1 && dist < minMagneticDist) {
                             minMagneticDist = dist;
                             bestMagneticSnap = { dx: pair.static.x - pair.moving.x, dy: pair.static.y - pair.moving.y, wallAngle: Math.atan2(Math.abs(dy1), Math.abs(dx1)) * 180 / Math.PI };
                         }
                     });
                 });
             });
             if (bestMagneticSnap) {
                 nodesToMove.forEach(node => { node.x += bestMagneticSnap.dx; node.y += bestMagneticSnap.dy; });
             }

            // Sweep walls
            if (state.isSweeping) {
                const sweepWalls = [];
                wallsToMove.forEach(movedWall => {
                    const originalP1 = state.preDragNodeStates.get(movedWall.p1); if (originalP1) sweepWalls.push({ p1: originalP1, p2: movedWall.p1 });
                    const originalP2 = state.preDragNodeStates.get(movedWall.p2); if (originalP2) sweepWalls.push({ p1: originalP2, p2: movedWall.p2 });
                });
                setState({ sweepWalls });
            }
        }
        // --- Kapı Sürükleme ---
        else if (state.selectedObject.type === "door") {
            const door = state.selectedObject.object;
            const targetX = unsnappedPos.x + state.dragOffset.x;
            const targetY = unsnappedPos.y + state.dragOffset.y;
            const targetPos = { x: targetX, y: targetY };

            let closestWall = null;
            let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 2;

            for (const w of state.walls) {
                const d = distToSegmentSquared(targetPos, w.p1, w.p2);
                 if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                     minDistSq = d; closestWall = w;
                 }
            }

            if (closestWall) {
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const wallThickness = closestWall.thickness || 20;
                const edgeMargin = (wallThickness / 2) + 5;

                const dx = closestWall.p2.x - closestWall.p1.x;
                const dy = closestWall.p2.y - closestWall.p1.y;
                const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                const newPos = t * wallLen;

                // Kapı genişliğini koruma mantığı
                let targetWidth = door.originalWidth || door.width;
                let minPos = edgeMargin + targetWidth / 2;
                let maxPos = wallLen - edgeMargin - targetWidth / 2;

                // Eğer duvar, orijinal genişlik için çok kısaysa (minPos > maxPos)
                // VE duvar değişiyorsa, yarısını dene
                if (minPos > maxPos && closestWall !== door.wall) {
                     targetWidth = (door.originalWidth || door.width) / 2;
                     minPos = edgeMargin + targetWidth / 2;
                     maxPos = wallLen - edgeMargin - targetWidth / 2;
                     // Yarı genişlik sığıyor mu ve minimumdan büyük mü?
                     if (wallLen >= targetWidth + 2 * edgeMargin && targetWidth >= 20) {
                          // Yarı genişlik sığıyor, pozisyonu ayarla
                          const clampedPos = Math.max(minPos, Math.min(maxPos, newPos));
                          door.wall = closestWall;
                          door.pos = clampedPos;
                          door.width = targetWidth; // Yarı genişliği kullan
                     } else {
                         // Yarısı da sığmıyor, taşıma engellendi gibi davran (pozisyonu/genişliği güncelleme)
                     }
                } else if (minPos <= maxPos) { // Duvar yeterince uzunsa veya aynı duvardaysa
                     // Pozisyonu sınırlar içinde tut
                     const clampedPos = Math.max(minPos, Math.min(maxPos, newPos));
                     door.wall = closestWall; // Duvar değişmiş olabilir
                     door.pos = clampedPos;
                     // GÜNCELLENDİ: Genişliği sadece originalWidth varsa ona geri döndür
                     door.width = door.originalWidth || targetWidth;
                     if (!door.originalWidth) door.originalWidth = door.width; // OriginalWidth'i kaydet
                }
                 // Eğer minPos > maxPos ve AYNI duvardaysa, hiçbir şey yapma (kenara sıkıştı)

            } else {
                 // Hiçbir duvara yakın değilse, orijinal genişliğe dön (opsiyonel)
                 door.width = door.originalWidth || door.width;
            }
        }
        // --- Pencere Sürükleme ---
        else if (state.selectedObject.type === "window") {
            const window = state.selectedObject.object;
            const oldWall = state.selectedObject.wall;
            const targetX = unsnappedPos.x + state.dragOffset.x;
            const targetY = unsnappedPos.y + state.dragOffset.y;
            const targetPos = { x: targetX, y: targetY };

            let closestWall = null;
            let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 2;

            for (const w of state.walls) {
                const d = distToSegmentSquared(targetPos, w.p1, w.p2);
                 if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                     minDistSq = d; closestWall = w;
                 }
            }

            if (closestWall) {
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const wallThickness = closestWall.thickness || 20;
                const margin = (wallThickness / 2) + 5;

                const dx = closestWall.p2.x - closestWall.p1.x;
                const dy = closestWall.p2.y - closestWall.p1.y;
                const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                const newPos = t * wallLen;

                // Pozisyon geçerli mi? (Genişlik değişmez)
                 const minPos = window.width / 2 + margin;
                 const maxPos = wallLen - window.width / 2 - margin;

                if (newPos >= minPos && newPos <= maxPos) { // Tamamen sığıyorsa
                    window.pos = newPos;
                    if (oldWall !== closestWall) { // Duvar değiştiyse
                        if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                        if (!closestWall.windows) closestWall.windows = [];
                        closestWall.windows.push(window);
                        state.selectedObject.wall = closestWall;
                    }
                } else if (wallLen >= window.width + 2*margin) { // Duvar yeterince uzun ama kenara geldi
                     window.pos = Math.max(minPos, Math.min(maxPos, newPos)); // Pozisyonu sınıra çek
                     if (oldWall !== closestWall) { // Duvar değiştiyse
                         if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                         if (!closestWall.windows) closestWall.windows = [];
                         closestWall.windows.push(window);
                         state.selectedObject.wall = closestWall;
                     }
                }
                // Eğer duvar pencere için çok kısaysa (minPos > maxPos), pozisyonu güncelleme
            }
        }
        // --- Menfez Sürükleme ---
        else if (state.selectedObject.type === "vent") {
             const vent = state.selectedObject.object;
             const oldWall = state.selectedObject.wall;
             const targetX = unsnappedPos.x + state.dragOffset.x;
             const targetY = unsnappedPos.y + state.dragOffset.y;
             const targetPos = { x: targetX, y: targetY };
             let closestWall = null;
             let minDistSq = Infinity;
             const bodyHitTolerance = WALL_THICKNESS * 2;
             for (const w of state.walls) {
                 const d = distToSegmentSquared(targetPos, w.p1, w.p2);
                 if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                     minDistSq = d; closestWall = w;
                 }
             }
             if (closestWall) {
                 const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                 const ventMargin = 15;
                 if (wallLen >= vent.width + 2 * ventMargin) { // Sadece sığıyorsa işlem yap
                     const dx = closestWall.p2.x - closestWall.p1.x;
                     const dy = closestWall.p2.y - closestWall.p1.y;
                     const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                     const newPos = t * wallLen;
                     const minPos = vent.width / 2 + ventMargin;
                     const maxPos = wallLen - vent.width / 2 - ventMargin;

                     // Pozisyonu sınırlar içinde tut
                     vent.pos = Math.max(minPos, Math.min(maxPos, newPos));

                     if (oldWall !== closestWall) {
                         if (oldWall.vents) oldWall.vents = oldWall.vents.filter(v => v !== vent);
                         if (!closestWall.vents) closestWall.vents = [];
                         closestWall.vents.push(vent);
                         state.selectedObject.wall = closestWall;
                     }
                 }
             }
        }


        // Küçülen duvarlardaki kapı/pencere/menfez ayarı
        if (state.affectedWalls.length > 0) {
             state.affectedWalls.forEach((wall) => {
                 const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                 const wallThickness = wall.thickness || 20;
                 const edgeMargin = (wallThickness / 2) + 5;
                 const ventMargin = 15;
                 // Kapıları ayarla
                 (wall.doors || state.doors.filter(d => d.wall === wall)).forEach((door) => {
                     const minPos = edgeMargin + door.width / 2;
                     const maxPos = wallLength - edgeMargin - door.width / 2;
                     if (minPos > maxPos) door.pos = wallLength / 2;
                     else door.pos = Math.max(minPos, Math.min(maxPos, door.pos));
                 });
                 // Pencereleri ayarla
                 (wall.windows || []).forEach((window) => {
                      const minPos = edgeMargin + window.width / 2;
                      const maxPos = wallLength - edgeMargin - window.width / 2;
                      if (minPos > maxPos) window.pos = wallLength / 2;
                      else window.pos = Math.max(minPos, Math.min(maxPos, window.pos));
                 });
                 // Menfezleri ayarla
                  (wall.vents || []).forEach((vent) => {
                      const minPos = ventMargin + vent.width / 2;
                      const maxPos = wallLength - ventMargin - vent.width / 2;
                      if (minPos > maxPos) vent.pos = wallLength / 2;
                      else vent.pos = Math.max(minPos, Math.min(maxPos, vent.pos));
                 });
             });
        }
        update3DScene();
    } // if (isDragging && selectedObject) sonu

    updateMouseCursor();
} // onPointerMove sonu

function updateMouseCursor() {
    const { c2d } = dom;
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, isDraggingRoomName } = state;

    c2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node');

    if (isPanning || isDraggingRoomName) {
        c2d.classList.add('panning');
        return;
    }

    if (isDragging) {
        c2d.classList.add('dragging');
        return;
    }

    // Kapı veya pencere sürüklenmiyorsa ve snap varsa göster
    const isDraggingDoorOrWindow = isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window');
    if (!isDraggingDoorOrWindow && mousePos.isSnapped) {
        c2d.classList.add('near-snap');
        return;
    }

    if (currentMode === 'select') {
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.classList.add('over-node');
            return;
        }

        // Duvar üzerine gelme cursor'ı (kalınlığa göre)
        for (const w of state.walls) {
             const wallPx = w.thickness || WALL_THICKNESS;
             const bodyHitToleranceSq = (wallPx / 2) ** 2;
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
                c2d.classList.add('over-wall');
                return;
            }
        }
    }
     // Eğer hiçbir özel durum yoksa, varsayılan cursor kalsın
     // c2d.style.cursor = 'default'; // veya crosshair vb. moduna göre
}