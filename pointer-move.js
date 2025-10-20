// ahmedakbayir/ngcad/ngcad-b3712dab038a327c261e2256cbd1d4d58a069f34/pointer-move.js

import { state, dom, setState, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, distToSegmentSquared, findNodeAt } from './geometry.js';
import { positionLengthInput } from './ui.js';
import { update3DScene } from './scene3d.js';
// findLargestAvailableSegment fonksiyonunu import et
import { getDoorPlacement, isSpaceForDoor, getMinWallLength, findLargestAvailableSegment } from './actions.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { currentModifierKeys } from './input.js';
// Gerekli fonksiyonları import et
// DÖNME GÜNCELLEMESİ: getColumnHandleAtPoint olarak adını değiştirdik
import { getColumnCorners, getColumnHandleAtPoint, getColumnAtPoint } from './columns.js';

// Helper: Verilen bir noktanın (genellikle kolon merkezi) bir duvar merkez çizgisine snap olup olmadığını kontrol eder.
// Snap varsa duvarı ve açısını döndürür.
function getSnappedWallInfo(point, tolerance = 1.0) { // Tolerans: 1 cm
    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue; // Geçersiz duvarı atla
        // Noktanın duvar segmentine (merkez çizgisine) mesafesinin karesini hesapla
        const distSq = distToSegmentSquared(point, wall.p1, wall.p2);
        // Mesafe toleransın karesinden küçükse snap var demektir
        if (distSq < tolerance * tolerance) {
            // Duvarın açısını hesapla (derece cinsinden)
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;

            // Açıyı 15 derecelik adımlara yuvarla (negatif değerleri koruyarak)
            const roundedAngle = Math.round(angle / 15) * 15;

            return { wall: wall, angle: roundedAngle }; // Duvarı ve yuvarlanmış açıyı döndür
        }
    }
    return null; // Snap yok
}


export function onPointerMove(e) {
    if (state.isCtrlDeleting) {
        // Kontrol tuşu ile silme modu aktifse
        // DÖNME GÜNCELLEMESİ: 'corner' -> 'corner_'
        if (state.selectedObject?.type === 'column' && state.selectedObject?.handle.startsWith('corner_')) {
            setState({ isCtrlDeleting: false });
            return;
        }
        // Eğer kenar handle seçiliyse de silme modundan çık
        if (state.selectedObject?.type === 'column' && state.selectedObject?.handle?.startsWith('edge_')) {
             setState({ isCtrlDeleting: false });
             return;
        }

        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        // Fare pozisyonuna yakın duvarları bul
        const wallsToDelete = new Set();
        for (const wall of state.walls) {
             const wallPx = wall.thickness || WALL_THICKNESS;
             const currentToleranceSq = (wallPx / 2)**2; // Duvar kalınlığının yarısı kadar tolerans
            const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
            if (distSq < currentToleranceSq) {
                wallsToDelete.add(wall); // Silinecek duvarlara ekle
            }
        }

        // Silinecek duvar varsa
        if (wallsToDelete.size > 0) {
            const wallsToDeleteArray = Array.from(wallsToDelete);
            // Duvarları state'ten çıkar
            const newWalls = state.walls.filter(w => !wallsToDeleteArray.includes(w));
            // Bu duvarlara ait kapıları da state'ten çıkar
            const newDoors = state.doors.filter(d => !wallsToDeleteArray.includes(d.wall));

            setState({
                walls: newWalls,
                doors: newDoors,
            });
            processWalls(); // Geometriyi yeniden işle
            // Not: Silme işlemi bitince (pointer up'ta) saveState çağrılacak
        }
        return; // Silme modunda başka işlem yapma
    }

    if (state.isDraggingRoomName) {
        // Oda ismini taşıma
        const room = state.isDraggingRoomName;
        const rect = dom.c2d.getBoundingClientRect();
        const mousePos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        // Fare hareket miktarını hesapla
        const mouseDeltaX = mousePos.x - state.roomDragStartPos.x;
        const mouseDeltaY = mousePos.y - state.roomDragStartPos.y;
        // Yeni merkez pozisyonunu hesapla
        const newCenterX = state.roomOriginalCenter[0] + mouseDeltaX;
        const newCenterY = state.roomOriginalCenter[1] + mouseDeltaY;
        room.center = [newCenterX, newCenterY]; // Oda merkezini güncelle

        // Orantısal pozisyonu (centerOffset) güncelle (varsa)
        const bbox = turf.bbox(room.polygon); // Odanın sınırlayıcı kutusu
        const bboxWidth = bbox[2] - bbox[0];
        const bboxHeight = bbox[3] - bbox[1];
        if (bboxWidth > 0 && bboxHeight > 0) {
            room.centerOffset = {
                x: (newCenterX - bbox[0]) / bboxWidth, // X oranını hesapla
                y: (newCenterY - bbox[1]) / bboxHeight // Y oranını hesapla
            };
        }
        return; // İşlemi bitir
    }

    if (state.isPanning) {
        // Pan (kaydırma) işlemi
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        setState({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } }); // Pan offset'i ve başlangıç noktasını güncelle
        if (state.isEditingLength) positionLengthInput(); // Uzunluk girişi açıksa pozisyonunu ayarla
        updateMouseCursor(); // Mouse imlecini güncelle
        return; // İşlemi bitir
    }

    // Sürükleme başladı mı kontrolü (küçük hareketleri tıklama saymak için)
    if (state.isDragging && !state.aDragOccurred) {
        // Eğer fare başlangıçtan 5 pikselden fazla hareket ettiyse sürükleme başladı kabul et
        if ((e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2 > 25) { // 5*5=25
            setState({ aDragOccurred: true });
        }
    }

    // Fare pozisyonunu al ve snap uygula
    let snappedPos = getSmartSnapPoint(e, !state.isDragging); // Sürüklemiyorsa grid snap de uygula
    setState({ mousePos: snappedPos }); // Güncel fare pozisyonunu state'e kaydet

    // Snap uygulanmamış ham fare pozisyonunu al
    const rect = dom.c2d.getBoundingClientRect();
    const unsnappedPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

    if (state.isStretchDragging) {
        // Duvar esnetme modunda ise (şimdilik sadece 3D güncelleniyor)
        update3DScene();
        updateMouseCursor();
        return;
    }

    // Sürükleme aktifse ve bir nesne seçiliyse
    if (state.isDragging && state.selectedObject) {
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            // Duvarın bir ucunu (node) taşıma
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle]; // Hareket eden node
            let finalPos = { x: snappedPos.x, y: snappedPos.y }; // Hedef pozisyon (snaplenmiş)

            // Hareket geçerli mi kontrol et (duvar minimum uzunluktan kısa oluyor mu?)
            const moveIsValid = state.affectedWalls.every((wall) => {
                const otherNode = wall.p1 === nodeToMove ? wall.p2 : wall.p1; // Sabit kalan diğer node
                const newLength = Math.hypot(finalPos.x - otherNode.x, finalPos.y - otherNode.y); // Yeni uzunluk
                return newLength >= getMinWallLength(wall); // Minimumdan büyük veya eşit mi?
            });

            // Geçerliyse node'un pozisyonunu güncelle
            if (moveIsValid) {
                nodeToMove.x = finalPos.x;
                nodeToMove.y = finalPos.y;
            }
            // Geçersizse pozisyon güncellenmez (duvar kısalmaz)
        }
        else if (state.selectedObject.type === "wall" && state.selectedObject.handle === "body") {
            // --- DUVAR GÖVDESİ TAŞIMA ---
            // Taşınacak duvarları belirle (seçili grup veya tek duvar)
            const wallsToMove = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            // Bu duvarlara ait (tekilleştirilmiş) nodeları bul
            const nodesToMove = new Set();
            wallsToMove.forEach((w) => { nodesToMove.add(w.p1); nodesToMove.add(w.p2); });

            // Fare hareket miktarını hesapla
            const mouseDelta = { x: unsnappedPos.x - state.initialDragPoint.x, y: unsnappedPos.y - state.initialDragPoint.y };

            // Eksen kilidi varsa hareketi o eksene sınırla
            let totalDelta = { x: mouseDelta.x, y: mouseDelta.y };
            if (state.dragAxis === 'x') totalDelta.y = 0; // Sadece Y hareketi
            else if (state.dragAxis === 'y') totalDelta.x = 0; // Sadece X hareketi

            // Manyetik snap kontrolü (Nodlar için)
            const MAGNETIC_SNAP_DISTANCE = 20; // Dünya birimi (cm) cinsinden snap mesafesi
            const ANGLE_TOLERANCE = 2; // Paralellik/diklik için açı toleransı (derece)
            let bestMagneticSnap = null; // En iyi snap düzeltmesi {dx, dy}
            let minMagneticDist = Infinity; // En iyi snap mesafesi

            // Hareket eden her duvar için
            wallsToMove.forEach(movingWall => {
                 const dx1 = movingWall.p2.x - movingWall.p1.x, dy1 = movingWall.p2.y - movingWall.p1.y;
                 const len1 = Math.hypot(dx1, dy1); if (len1 < 0.1) return; // Çok kısa duvarları atla
                 const dir1 = { x: dx1 / len1, y: dy1 / len1 }; // Hareket eden duvarın yön vektörü

                 // Diğer tüm statik duvarlar için
                 state.walls.forEach(staticWall => {
                     if (wallsToMove.includes(staticWall)) return; // Statik duvar, hareket eden duvarlardan biri olamaz
                     const dx2 = staticWall.p2.x - staticWall.p1.x, dy2 = staticWall.p2.y - staticWall.p1.y;
                     const len2 = Math.hypot(dx2, dy2); if (len2 < 0.1) return;
                     const dir2 = { x: dx2 / len2, y: dy2 / len2 }; // Statik duvarın yön vektörü

                     // Açı kontrolü: Çok yakın açılı duvarlara snap yapma (neredeyse paralel/dik)
                     const dotProduct = Math.abs(dir1.x * dir2.x + dir1.y * dir2.y); // Vektörlerin nokta çarpımı (açı kosinüsü)
                     // Eğer açı toleransından büyükse (yani çok farklı açılardaysa) atla
                     if (dotProduct < Math.cos(ANGLE_TOLERANCE * Math.PI / 180)) return;

                     // Hareket eden duvarın nodlarının *geçici* pozisyonlarını hesapla
                     // (Hareket eden p1 -> statik p1/p2, hareket eden p2 -> statik p1/p2)
                     const nodePairs = [
                         { moving: movingWall.p1, static: staticWall.p1 }, { moving: movingWall.p1, static: staticWall.p2 },
                         { moving: movingWall.p2, static: staticWall.p1 }, { moving: movingWall.p2, static: staticWall.p2 }
                     ];

                     nodePairs.forEach(pair => {
                          // Hareket eden node'un orijinal pozisyonunu al
                          const originalMovingPos = state.preDragNodeStates.get(pair.moving);
                          if (!originalMovingPos) return; // Orijinal pozisyon yoksa atla (olmamalı)

                          // Geçici yeni pozisyonu hesapla (sadece mouse hareketine göre)
                          const tempMovingX = originalMovingPos.x + totalDelta.x;
                          const tempMovingY = originalMovingPos.y + totalDelta.y;

                         // Geçici pozisyon ile statik node arasındaki mesafeyi hesapla
                         const dist = Math.hypot(tempMovingX - pair.static.x, tempMovingY - pair.static.y);

                         // Eğer mesafe snap mesafesinden küçükse ve anlamlı bir mesafeyse (>0.1) ve önceki en iyi snap'ten daha iyiyse
                         if (dist < MAGNETIC_SNAP_DISTANCE && dist > 0.1 && dist < minMagneticDist) {
                             minMagneticDist = dist; // Yeni en iyi mesafe
                             // Snap için gereken düzeltme vektörünü kaydet (statik - geçici)
                             bestMagneticSnap = { dx: pair.static.x - tempMovingX, dy: pair.static.y - tempMovingY };
                         }
                     });
                 });
             });

            // Manyetik snap bulunduysa delta'yı ayarla (snap düzeltmesini ekle)
            if (bestMagneticSnap) {
                totalDelta.x += bestMagneticSnap.dx;
                totalDelta.y += bestMagneticSnap.dy;
            }

            // Duvar nodelarını nihai pozisyonlarına taşı
            nodesToMove.forEach((node) => {
                const originalPos = state.preDragNodeStates.get(node);
                if (originalPos) {
                    node.x = originalPos.x + totalDelta.x;
                    node.y = originalPos.y + totalDelta.y;
                }
            });

            // --- Duvarla birlikte Kolon Taşıma ---
            const SNAP_TOLERANCE_FOR_MOVE = 1.0; // Ne kadar yakınsa bağlı sayılacak (cm)
            state.columns.forEach(column => {
                // if ((column.rotation || 0) !== 0) return; // DÖNME GÜNCELLEMESİ: Artık döndürülmüş kolonları da taşı
                const colIndex = state.columns.indexOf(column); // Kolonun index'ini bul
                const originalColCenterX = state.preDragNodeStates.get(`col_${colIndex}_x`);
                const originalColCenterY = state.preDragNodeStates.get(`col_${colIndex}_y`);

                if (originalColCenterX === undefined || originalColCenterY === undefined) return; // Orijinal pozisyon yoksa atla

                let wasSnappedToMovingWall = false;
                // Taşınan her bir duvar için kontrol et
                for (const wall of wallsToMove) {
                    // Duvarın *orijinal* p1 ve p2 pozisyonlarını al
                    const originalP1 = state.preDragNodeStates.get(wall.p1);
                    const originalP2 = state.preDragNodeStates.get(wall.p2);
                    if (!originalP1 || !originalP2) continue; // Orijinal pozisyon yoksa atla

                    // Orijinal kolon merkezi ile orijinal duvar segmenti (merkez çizgisi) arasındaki mesafenin karesini hesapla
                    const distSq = distToSegmentSquared({ x: originalColCenterX, y: originalColCenterY }, originalP1, originalP2);

                    // Eğer mesafe toleransın karesinden küçükse, snapli kabul et
                    if (distSq < SNAP_TOLERANCE_FOR_MOVE * SNAP_TOLERANCE_FOR_MOVE) {
                        wasSnappedToMovingWall = true;
                        break; // Bir duvarla eşleşti, diğerlerine bakmaya gerek yok
                    }
                }

                // Eğer snapli idiyse, kolonu da duvarlarla aynı miktarda (totalDelta) taşı
                if (wasSnappedToMovingWall) {
                    column.center.x = originalColCenterX + totalDelta.x;
                    column.center.y = originalColCenterY + totalDelta.y;
                }
            });
            // --- Birlikte Kolon Taşıma SONU ---

            // Oda merkezi güncelleme
            if (state.draggedRoomInfo && state.draggedRoomInfo.length > 0) {
                 const nodePositionMap = new Map(); // Orijinal node pozisyonu -> yeni node pozisyonu haritası
                 nodesToMove.forEach(node => {
                     const originalPos = state.preDragNodeStates.get(node);
                     if (originalPos) nodePositionMap.set(`${originalPos.x},${originalPos.y}`, { x: node.x, y: node.y });
                 });
                 // Sürüklenen odaların bilgilerini güncelle
                 state.draggedRoomInfo.forEach(info => {
                     const { originalCoords, tempPolygon, room } = info;
                     // Odanın eski köşe koordinatlarını yeni pozisyonlara göre güncelle
                     const newCoords = originalCoords.map(coord => {
                         const key = `${coord[0]},${coord[1]}`;
                         return nodePositionMap.has(key) ? [nodePositionMap.get(key).x, nodePositionMap.get(key).y] : coord;
                     });
                     tempPolygon.geometry.coordinates[0] = newCoords; // Geçici poligonu güncelle
                     // Oda merkezini güvenli bir şekilde yeniden hesapla (pointOnFeature)
                     const centerOnFeature = turf.pointOnFeature(tempPolygon);
                     room.center = centerOnFeature.geometry.coordinates; // Oda nesnesinin merkezini güncelle
                 });
            }

            // Sweep duvarları güncelleme (eğer sweep modu aktifse)
            if (state.isSweeping) {
                const sweepWalls = []; // Bağlantı çizgileri
                // Taşınan her duvar için
                wallsToMove.forEach(movedWall => {
                    // Orijinal p1 ve p2 pozisyonlarını al
                    const originalP1 = state.preDragNodeStates.get(movedWall.p1); if (originalP1) sweepWalls.push({ p1: originalP1, p2: movedWall.p1 }); // Orijinal p1 -> Yeni p1
                    const originalP2 = state.preDragNodeStates.get(movedWall.p2); if (originalP2) sweepWalls.push({ p1: originalP2, p2: movedWall.p2 }); // Orijinal p2 -> Yeni p2
                });
                setState({ sweepWalls }); // Çizilecek sweep duvarlarını state'e kaydet
            }
        } // Duvar gövdesi taşıma sonu

        // --- GÜNCELLENMİŞ BLOK: KAPI TAŞIMA ---
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
                    minDistSq = d;
                    closestWall = w;
                }
            }

            if (closestWall) {
                const DG = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);

                // En büyük uygun segmenti bul (kendisini hariç tutarak)
                const largestSegment = findLargestAvailableSegment(closestWall, door);

                if (largestSegment) {
                    let KG = largestSegment.length; // Genişliği segmentin uzunluğu olarak al
                    KG = KG > 70 ? 70 : KG; // Max 70 ile sınırla

                    if (KG >= 20) { // Minimum genişlik kontrolü
                        const newWidth = KG;

                        // Pozisyonu hesapla
                        const dx = closestWall.p2.x - closestWall.p1.x;
                        const dy = closestWall.p2.y - closestWall.p1.y;
                        const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                        const posOnWall = t * DG;

                        // Kapının yerleşebileceği min/max pozisyonlar (segment içinde)
                        const minPos = largestSegment.start + newWidth / 2;
                        const maxPos = largestSegment.end - newWidth / 2;

                        if (minPos <= maxPos) { // Yer varsa
                            const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                            door.wall = closestWall;
                            door.pos = clampedPos;
                            door.width = newWidth; // Genişliği güncelle
                        }
                        // else: Segment, hesaplanan genişlik için yeterli değil, snap yapma
                    }
                    // else: Segment, minimum genişlik için bile yeterli değil, snap yapma
                }
                // else: Uygun segment bulunamadı, snap yapma
            } else {
                // En yakın duvar yoksa, genişliği max 70 yap
                door.width = 70;
            }
        }
        // --- KAPI TAŞIMA SONU ---

        // --- GÜNCELLENMİŞ BLOK: PENCERE TAŞIMA ---
        else if (state.selectedObject.type === "window") {
            const window = state.selectedObject.object;
            const oldWall = state.selectedObject.wall; // Eski duvarı sakla
            const targetX = unsnappedPos.x + state.dragOffset.x;
            const targetY = unsnappedPos.y + state.dragOffset.y;
            const targetPos = { x: targetX, y: targetY };

            let closestWall = null;
            let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 2;

            for (const w of state.walls) {
                const d = distToSegmentSquared(targetPos, w.p1, w.p2);
                if (d < bodyHitTolerance ** 2 && d < minDistSq) {
                    minDistSq = d;
                    closestWall = w;
                }
            }

            if (closestWall) {
                const DG = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);

                 // En büyük uygun segmenti bul (kendisini hariç tutarak)
                const largestSegment = findLargestAvailableSegment(closestWall, window);

                if (largestSegment) {
                    let PG = largestSegment.length; // Genişliği segmentin uzunluğu olarak al
                    PG = PG > 120 ? 120 : PG; // Max 120 ile sınırla

                    if (PG >= 20) { // Minimum genişlik kontrolü
                        const newWidth = PG;

                        // Pozisyonu hesapla
                        const dx = closestWall.p2.x - closestWall.p1.x;
                        const dy = closestWall.p2.y - closestWall.p1.y;
                        const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy)));
                        const posOnWall = t * DG;

                        // Pencerenin yerleşebileceği min/max pozisyonlar (segment içinde)
                        const minPos = largestSegment.start + newWidth / 2;
                        const maxPos = largestSegment.end - newWidth / 2;

                        if (minPos <= maxPos) { // Yer varsa
                            const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
                            window.pos = clampedPos;
                            window.width = newWidth; // Genişliği güncelle

                            // Duvar değiştirme mantığı
                            if (oldWall !== closestWall) {
                                if (oldWall.windows) oldWall.windows = oldWall.windows.filter(w => w !== window);
                                if (!closestWall.windows) closestWall.windows = [];
                                closestWall.windows.push(window);
                                state.selectedObject.wall = closestWall;
                            }
                        }
                        // else: Segment, hesaplanan genişlik için yeterli değil, snap yapma
                    }
                    // else: Segment, minimum genişlik için bile yeterli değil, snap yapma
                }
                 // else: Uygun segment bulunamadı, snap yapma
            } else {
                 // En yakın duvar yoksa, genişliği max 120 yap
                window.width = 120;
            }
        }
        // --- PENCERE TAŞIMA SONU ---

        else if (state.selectedObject.type === "vent") {
             // Menfez taşıma (Değişiklik yok)
             const vent = state.selectedObject.object; const oldWall = state.selectedObject.wall; const targetX = unsnappedPos.x + state.dragOffset.x; const targetY = unsnappedPos.y + state.dragOffset.y; const targetPos = { x: targetX, y: targetY }; let closestWall = null; let minDistSq = Infinity; const bodyHitTolerance = WALL_THICKNESS * 2; for (const w of state.walls) { const d = distToSegmentSquared(targetPos, w.p1, w.p2); if (d < bodyHitTolerance ** 2 && d < minDistSq) { minDistSq = d; closestWall = w; } } if (closestWall) { const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y); const ventMargin = 15; if (wallLen >= vent.width + 2 * ventMargin) { const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y; const t = Math.max(0, Math.min(1, ((targetPos.x - closestWall.p1.x) * dx + (targetPos.y - closestWall.p1.y) * dy) / (dx * dx + dy * dy))); const newPos = t * wallLen; const minPos = vent.width / 2 + ventMargin; const maxPos = wallLen - vent.width / 2 - ventMargin; vent.pos = Math.max(minPos, Math.min(maxPos, newPos)); if (oldWall !== closestWall) { if (oldWall.vents) oldWall.vents = oldWall.vents.filter(v => v !== vent); if (!closestWall.vents) closestWall.vents = []; closestWall.vents.push(vent); state.selectedObject.wall = closestWall; } } }
        }
else if (state.selectedObject.type === "column") {
    // --- KOLON TAŞIMA, BOYUTLANDIRMA veya DÖNDÜRME ---
    const column = state.selectedObject.object;
    const handle = state.selectedObject.handle;

    // DÖNME GÜNCELLEMESİ: Köşeden sürükleme (Döndürme)
    if (handle.startsWith('corner_')) {
        const center = column.center;
        // Ham (snaplenmemiş) mouse pozisyonuna göre açıyı hesapla
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x);
        // Başlangıç ofsetini uygula
        let newRotationRad = mouseAngle + state.columnRotationOffset;

        // --- YENİ SNAP MANTIĞI ---
        // 1. Önce 1 derecelik adımlara snaple
        const snapAngleRad1 = (1 * Math.PI / 180); // 1 derece (radyan)
        newRotationRad = Math.round(newRotationRad / snapAngleRad1) * snapAngleRad1;

        // 2. Sonra 90 derece katlarına yakınlığı kontrol et
        let newRotationDeg = newRotationRad * 180 / Math.PI; // Dereceye çevir
        const remainder = newRotationDeg % 90; // 90'a bölümünden kalan
        const snapThreshold = 5; // Yakınlık eşiği (derece)

        // Eğer kalan +/- snapThreshold içindeyse veya 90 - snapThreshold'dan büyükse
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            // En yakın 90 derece katına yuvarla
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
            newRotationRad = newRotationDeg * Math.PI / 180; // Tekrar radyana çevir
        }
        // --- YENİ SNAP MANTIĞI SONU ---


        // Yeni açıyı derece olarak ata
        column.rotation = newRotationRad * 180 / Math.PI;

        update3DScene(); // 3D görünümü güncelle
    }
    // Gövdeden veya merkezden taşıma
    else if (handle === 'body' || handle === 'center') {
            let newCenterX = unsnappedPos.x + state.dragOffset.x;
            let newCenterY = unsnappedPos.y + state.dragOffset.y;

            // --- Snap Mantığı (Duvar Merkezi ve Açı Alma) ---
            const snappedWallInfo = getSnappedWallInfo({ x: newCenterX, y: newCenterY });
            if (snappedWallInfo) {
                 // Duvara snap olduysa, kolonun açısını duvarın açısına ayarla
                 column.rotation = snappedWallInfo.angle;

                // Snap noktasını duvar çizgisi üzerine project et (daha hassas snap)
                const wall = snappedWallInfo.wall; const p1 = wall.p1; const p2 = wall.p2; const dx = p2.x - p1.x; const dy = p2.y - p1.y; const l2 = dx*dx + dy*dy;
                if (l2 > 0.1) { // Duvar çok kısa değilse
                    // Noktanın segment üzerindeki izdüşüm parametresini (t) hesapla
                    const t = ((newCenterX - p1.x) * dx + (newCenterY - p1.y) * dy) / l2;
                    // Projeksiyonu uygula (t'yi 0-1 arasına sıkıştırmaya gerek yok, çizgi üzerine snap yeterli)
                    newCenterX = p1.x + t * dx;
                    newCenterY = p1.y + t * dy;
                }
            } else {
                 // Duvara snap olmadıysa, açıyı sıfırlayabilir veya mevcut açıyı koruyabiliriz.
                 // Mevcut açıyı koruyalım. İstenirse sıfırlanabilir: column.rotation = 0;

                 // --- Kolon 3 Nokta -> Duvar Merkezi Snap (Sadece 0 dereceyken) ---
                 // (Bu kısım sadece duvara tam snap olmadığında çalışır ve kolon 0 dereceyse)
                 if ((column.rotation || 0) === 0) {
                    const SNAP_DISTANCE = 10; // Snap mesafesi (cm)
                    let bestSnapX = { diff: SNAP_DISTANCE, delta: 0 }; // En iyi X snap {fark, düzeltme}
                    let bestSnapY = { diff: SNAP_DISTANCE, delta: 0 }; // En iyi Y snap {fark, düzeltme}
                    // Kolonun 3 dikey hattı (sol, orta, sağ)
                    const halfW = (column.width || column.size) / 2;
                    const dragEdgesX = [newCenterX - halfW, newCenterX, newCenterX + halfW];
                    // Kolonun 3 yatay hattı (üst, orta, alt)
                    const halfH = (column.height || column.size) / 2;
                    const dragEdgesY = [newCenterY - halfH, newCenterY, newCenterY + halfH];

                    // --- Kolon-Kolon snap kaldırıldı ---

                    // Duvarları kontrol et (Kolonun 3 noktası -> Duvarın MERKEZİ)
                    state.walls.forEach(wall => {
                        if (!wall.p1 || !wall.p2) return; // Geçersiz duvarı atla
                        const isVertical = Math.abs(wall.p1.x - wall.p2.x) < 0.1; // Duvar dikey mi?
                        const isHorizontal = Math.abs(wall.p1.y - wall.p2.y) < 0.1; // Duvar yatay mı?

                        if (isVertical) {
                            const wallX = wall.p1.x; // Duvarın merkez X'i
                            const staticEdgesX = [wallX]; // Statik hat olarak sadece merkezi al
                            // X Snap (Kolon Sol/Orta/Sağ -> Duvar Orta)
                            for (const dX of dragEdgesX) {
                                for (const sX of staticEdgesX) { // Sadece 1 tane (orta)
                                    const diff = Math.abs(dX - sX); // Fark
                                    if (diff < bestSnapX.diff) { // Daha iyi bir snap bulunduysa
                                        bestSnapX = { diff, delta: sX - dX }; // Kaydet
                                    }
                                }
                            }
                        } else if (isHorizontal) {
                            const wallY = wall.p1.y; // Duvarın merkez Y'si
                            const staticEdgesY = [wallY]; // Statik hat olarak sadece merkezi al
                            // Y Snap (Kolon Üst/Orta/Alt -> Duvar Orta)
                            for (const dY of dragEdgesY) {
                                for (const sY of staticEdgesY) { // Sadece 1 tane (orta)
                                    const diff = Math.abs(dY - sY); // Fark
                                    if (diff < bestSnapY.diff) { // Daha iyi bir snap bulunduysa
                                        bestSnapY = { diff, delta: sY - dY }; // Kaydet
                                    }
                                }
                            }
                        }
                        // Eğik duvarlara bu snap mantığı uygulanmıyor
                    });

                    // Bulunan en iyi Snap düzeltmesini uygula
                    if (bestSnapX.delta !== 0) newCenterX += bestSnapX.delta;
                    if (bestSnapY.delta !== 0) newCenterY += bestSnapY.delta;
                 } // 0 derece snap sonu
             }
             // --- Snap Mantığı Sonu ---

            // Kolonun nihai merkez pozisyonunu ayarla
            column.center.x = newCenterX;
            column.center.y = newCenterY;

        }
        // Kenardan boyutlandırma
        else if (handle.startsWith('edge_')) {
            const isAltPressed = currentModifierKeys.alt; // Alt tuşu durumu
            // CTRL kontrolü kaldırıldı (döndürme yok)

            // Sabit kalacak karşı kenarı belirle
            let fixedEdgeHandle;
            if (handle === 'edge_top') fixedEdgeHandle = 'edge_bottom';
            else if (handle === 'edge_bottom') fixedEdgeHandle = 'edge_top';
            else if (handle === 'edge_left') fixedEdgeHandle = 'edge_right';
            else if (handle === 'edge_right') fixedEdgeHandle = 'edge_left';
            else return; // Geçersiz handle ise çık

            // Başlangıç durumunu al (genişlik, yükseklik, merkez) - preDragNodeStates'ten
            // Bu değerler pointer-down'da kaydedilmiş olmalı
            const initialWidth = state.preDragNodeStates.get('width');
            const initialHeight = state.preDragNodeStates.get('height');
            const initialCenterX = state.preDragNodeStates.get('center_x');
            const initialCenterY = state.preDragNodeStates.get('center_y');
            // Eğer başlangıç durumu kaydedilmemişse (hata durumu), işlemi durdur
            if (initialWidth === undefined || initialHeight === undefined || initialCenterX === undefined || initialCenterY === undefined) return;

             // Başlangıç köşe noktalarını hesapla (döndürülmüş dünya koordinatları)
             const initialCorners = getColumnCorners({
                 center: { x: initialCenterX, y: initialCenterY },
                 width: initialWidth,
                 height: initialHeight,
                 rotation: column.rotation || 0
             });

             // Sabit kalacak kenarın başlangıç ve bitiş noktalarını al
             let fixedPoint1, fixedPoint2;
             if (fixedEdgeHandle === 'edge_top') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[1]; } // Sol üst, Sağ üst
             else if (fixedEdgeHandle === 'edge_bottom') { fixedPoint1 = initialCorners[3]; fixedPoint2 = initialCorners[2]; } // Sol alt, Sağ alt
             else if (fixedEdgeHandle === 'edge_left') { fixedPoint1 = initialCorners[0]; fixedPoint2 = initialCorners[3]; } // Sol üst, Sol alt
             else if (fixedEdgeHandle === 'edge_right') { fixedPoint1 = initialCorners[1]; fixedPoint2 = initialCorners[2]; } // Sağ üst, Sağ alt
             // Sabit kenarın orta noktasını bul
             const fixedEdgeMidPoint = { x: (fixedPoint1.x + fixedPoint2.x) / 2, y: (fixedPoint1.y + fixedPoint2.y) / 2 };

             // Sabit kenara dik olan yön vektörünü bul (kolonun lokal eksenine göre, dünya koordinatlarında)
             const rotRad = (column.rotation || 0) * Math.PI / 180; // Kolonun açısı (radyan)
             const cosRot = Math.cos(rotRad);
             const sinRot = Math.sin(rotRad);
             let axisVector; // Boyutlandırma ekseni vektörü
             if (handle === 'edge_top' || handle === 'edge_bottom') {
                 // Üst veya alt kenar taşınıyorsa, boyutlandırma Y ekseninde olur
                 axisVector = { x: -sinRot, y: cosRot }; // Kolonun lokal Y ekseni (dünya koordinatlarında)
             } else { // Sol veya sağ kenar
                 // Sol veya sağ kenar taşınıyorsa, boyutlandırma X ekseninde olur
                 axisVector = { x: cosRot, y: sinRot }; // Kolonun lokal X ekseni (dünya koordinatlarında)
             }

             // Mouse pozisyonunu (snappedPos) sabit kenar çizgisine project et (izdüşümünü al)
             // Vektör: mouse - fixedEdgeMidPoint (sabit kenarın ortasından mouse'a)
             const mouseVec = { x: snappedPos.x - fixedEdgeMidPoint.x, y: snappedPos.y - fixedEdgeMidPoint.y };
             // Projeksiyon: dot(mouseVec, axisVector) / dot(axisVector, axisVector) * axisVector
             // dot(axisVector, axisVector) = 1 olduğu için sadece dot(mouseVec, axisVector) yeterli
             // Bu, mouse hareketinin boyutlandırma ekseni üzerindeki skaler bileşenidir (yeni boyut)
             const projection = mouseVec.x * axisVector.x + mouseVec.y * axisVector.y;

             // Yeni boyutu hesapla (projeksiyonun mutlak değeri, minimum 10cm)
             let newSize = Math.max(10, Math.abs(projection));

             // Yeni merkezi hesapla (sabit kenarın ortası + eksen yönünde yeni boyutun yarısı)
             // Projeksiyon yönünü dikkate alarak (+ veya -) yarım boyut vektörünü oluştur
             // Eğer projection negatifse, yarım vektör ters yönde eklenir
             const halfSizeVector = {
                 x: axisVector.x * projection / 2,
                 y: axisVector.y * projection / 2
             };
             // Yeni merkez = sabit kenar ortası + yarım boyut vektörü
            const newCenterX = fixedEdgeMidPoint.x + halfSizeVector.x;
            const newCenterY = fixedEdgeMidPoint.y + halfSizeVector.y;

            // Hangi boyutun değiştiğini belirle ve güncelle
             if (handle === 'edge_top' || handle === 'edge_bottom') { // Y ekseninde boyutlandırma
                 column.height = newSize;
                 // Genişlik değişmediyse, 'size' alanını güncelle (genellikle en büyük boyut tutulur)
                 column.size = Math.max(column.width || initialWidth, newSize);
             } else { // X ekseninde boyutlandırma
                 column.width = newSize;
                 // Yükseklik değişmediyse, 'size' alanını güncelle
                 column.size = Math.max(newSize, column.height || initialHeight);
             }
            // Yeni merkezi ata
            column.center.x = newCenterX;
            column.center.y = newCenterY;

            // Girinti (içi boşaltma) özelliklerini sıfırla (boyutlandırmada her zaman)
            column.hollowWidth = 0; column.hollowHeight = 0; column.hollowOffsetX = 0; column.hollowOffsetY = 0;

        } // Kenardan boyutlandırma sonu
} // Kolon taşıma/boyutlandırma sonu


        // Etkilenen duvarlardaki kapı/pencere/menfez pozisyonlarını güncelle (Duvar ucu taşındıysa)
        if (state.affectedWalls.length > 0) {
             state.affectedWalls.forEach((wall) => { const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); const wallThickness = wall.thickness || 20; const edgeMargin = (wallThickness / 2) + 5; const ventMargin = 15; (wall.doors || state.doors.filter(d => d.wall === wall)).forEach((door) => { const minPos = edgeMargin + door.width / 2; const maxPos = wallLength - edgeMargin - door.width / 2; if (minPos > maxPos) door.pos = wallLength / 2; else door.pos = Math.max(minPos, Math.min(maxPos, door.pos)); }); (wall.windows || []).forEach((window) => { const minPos = edgeMargin + window.width / 2; const maxPos = wallLength - edgeMargin - window.width / 2; if (minPos > maxPos) window.pos = wallLength / 2; else window.pos = Math.max(minPos, Math.min(maxPos, window.pos)); }); (wall.vents || []).forEach((vent) => { const minPos = ventMargin + vent.width / 2; const maxPos = wallLength - ventMargin - vent.width / 2; if (minPos > maxPos) vent.pos = wallLength / 2; else vent.pos = Math.max(minPos, Math.min(maxPos, vent.pos)); }); });
        }
        update3DScene(); // 3D görünümü güncelle
    } // isDragging ve selectedObject kontrolü sonu

    updateMouseCursor(); // Mouse imlecini güncelle
} // onPointerMove fonksiyonu sonu

// Mouse imlecini duruma göre günceller

// Mouse imlecini duruma göre günceller

// Mouse imlecini duruma göre günceller
function updateMouseCursor() {
    const { c2d } = dom; // Canvas elementi
    const { currentMode, isDragging, isPanning, mousePos, selectedObject, zoom } = state; // Gerekli state değerleri

    // Önce tüm özel imleç sınıflarını kaldır
    c2d.classList.remove('dragging', 'panning', 'near-snap', 'over-wall', 'over-node', 'rotate-mode');
    c2d.style.cursor = ''; // Style'ı temizle

    // 1. Pan veya Oda İsmi Taşıma (En Yüksek Öncelik)
    if (state.isDraggingRoomName || isPanning) {
        c2d.style.cursor = 'grabbing';
        return;
    }

    // 2. Sürükleme (Dragging) Durumları
    if (isDragging) {
        if (selectedObject?.type === 'column') {
            // Kolon köşesi sürükleniyorsa (Döndürme)
            if (selectedObject.handle?.startsWith('corner_')) {
                c2d.classList.add('rotate-mode');
                return;
            }
            // Kolon kenarı sürükleniyorsa (Boyutlandırma)
            if (selectedObject.handle?.startsWith('edge_')) {
                const edgeHandle = selectedObject.handle;
                const rotation = selectedObject.object.rotation || 0;
                const angleDeg = Math.abs(rotation % 180);
                let cursorType = 'ew-resize';
                if (edgeHandle === 'edge_top' || edgeHandle === 'edge_bottom') {
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
                } else {
                    cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize';
                }
                c2d.style.cursor = cursorType;
                return;
            }
        }
        // Diğer tüm sürüklemeler (gövde, node, kapı vs.)
        c2d.style.cursor = 'grabbing';
        return;
    }

    // 3. Hover (Sürükleme Yokken) Durumları
    
    // YENİ ÖNCELİK: Önce seçili olup olmadığına bakmaksızın bir kolon handle'ı üzerinde miyiz diye bakalım.
    // (getColumnAtPoint artık seçili olmasa da corner/edge dönebiliyor)
    const hoveredColumnObject = getColumnAtPoint(mousePos);

    if (hoveredColumnObject) {
        const handle = hoveredColumnObject.handle;
        
        // Kolon Köşesi (Döndürme ikonu)
        if (handle.startsWith('corner_')) {
            c2d.classList.add('rotate-mode');
            return;
        }
        // Kolon Kenarı (Boyutlandırma ikonu)
        if (handle.startsWith('edge_')) {
            const rotation = hoveredColumnObject.object.rotation || 0;
            const angleDeg = Math.abs(rotation % 180);
            let cursorType = 'ew-resize';
            if (handle === 'edge_top' || handle === 'edge_bottom') {
                cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ew-resize' : 'ns-resize';
            } else {
                cursorType = (angleDeg > 45 && angleDeg < 135) ? 'ns-resize' : 'ew-resize';
            }
            c2d.style.cursor = cursorType;
            return;
        }
        // Kolon Gövdesi (Taşıma ikonu)
        if (handle === 'body' && currentMode === 'select') {
            c2d.style.cursor = 'move';
            return;
        }
    }

    // 4. Snap İkonu (Kolon handle'larından SONRA kontrol edilir)
    const isDraggingDoorOrWindow = isDragging && (selectedObject?.type === 'door' || selectedObject?.type === 'window');
    // Snap ikonunu sadece çizim modlarındayken veya seçiliyken node taşırken göster
    const showSnap = (currentMode === 'drawWall' || currentMode === 'drawRoom' || currentMode === 'drawColumn') ||
                     (isDragging && selectedObject?.type === 'wall' && selectedObject.handle !== 'body');

    if (!isDraggingDoorOrWindow && mousePos.isSnapped && !isDragging && showSnap) {
        c2d.classList.add('near-snap'); // copy
        return;
    }

    // 5. Diğer hover durumları (Node, Duvar)
    if (currentMode === 'select') {
        const hoveredNode = findNodeAt(mousePos.x, mousePos.y);
        if (hoveredNode) {
            c2d.classList.add('over-node'); // move
            return;
        }
        
        for (const w of state.walls) {
            const wallPx = w.thickness || WALL_THICKNESS;
            const bodyHitToleranceSq = (wallPx / 2)**2;
            if (distToSegmentSquared(mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
                c2d.classList.add('over-wall'); // pointer
                return;
            }
        }
    }
    
    // 6. Hiçbiri değilse, moda göre varsayılan imleç CSS'den gelir
}