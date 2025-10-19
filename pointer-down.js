// ahmedakbayir/ngcad/ngcad-b3712dab038a327c261e2256cbd1d4d58a069f34/pointer-down.js

import { state, dom, setState, setMode, WALL_THICKNESS } from './main.js';
import { getSmartSnapPoint } from './snap.js';
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, wallExists, snapTo15DegreeAngle } from './geometry.js';
import { processWalls } from './wall-processor.js';
import { saveState } from './history.js';
import { cancelLengthEdit } from './ui.js';
import { getObjectAtPoint, getDoorPlacement, isSpaceForDoor, findCollinearChain, getWindowPlacement, isSpaceForWindow } from './actions.js';
import { createColumn, getColumnCorners } from './columns.js';

export function onPointerDown(e) {
    // Canvas dışına tıklanırsa işlemi durdur
    if (e.target !== dom.c2d) {
        return;
    }

    // Orta tuşa basılırsa pan modunu başlat
    if (e.button === 1) { // Orta tuş (wheel button)
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        return;
    }
    // Sağ tuşa basılırsa işlem yapma (context menu için)
    if (e.button === 2) return;

    // Tıklama pozisyonunu al (ekran -> dünya koordinatları)
    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    // Snap uygulanmış pozisyonu al
    let snappedPos = getSmartSnapPoint(e);

    // Seçim modunda ise
    if (state.currentMode === "select") {
        // Eğer uzunluk düzenleme modundaysa, iptal et
        if (state.isEditingLength) {
            cancelLengthEdit();
            return;
        }

        // Tıklanan noktadaki nesneyi al
        const selectedObj = getObjectAtPoint(pos);
        // Tıklanan nesne kolon köşesi mi? (Alt tuşu ile silme kontrolü için)
        // DÖNME GÜNCELLEMESİ: Artık 'corner_X' formatında
        const isColumnCornerSelected = selectedObj?.type === 'column' && selectedObj?.handle.startsWith('corner_');

        // Sadece Alt tuşuna basılıysa (Ctrl/Shift değil)
        if (e.altKey && !e.shiftKey && !e.ctrlKey) {
            const objectAtMouse = getObjectAtPoint(pos); // Tekrar kontrol et

            // Eğer tıklanan veya zaten seçili olan nesne kolon değilse silme moduna geç
            if (objectAtMouse?.type !== 'column' &&
                state.selectedObject?.type !== 'column') {
                setState({ isCtrlDeleting: true }); // Silme modunu başlat
                return; // Başka işlem yapma
            }
        }


        const selectedObject = getObjectAtPoint(pos); // Seçilen nesneyi tekrar al

        // Eğer bir odaya tıklandıysa, odayı seçili yap
        if (selectedObject && selectedObject.type === 'room') {
            setState({ selectedRoom: selectedObject.object, selectedObject: null });
        } else if (!selectedObject) { // Boş alana tıklandıysa oda seçimini kaldır
            setState({ selectedRoom: null });
        }
        // Eğer oda ismine veya alanına tıklandıysa, isim taşıma modunu başlat
        if (selectedObject && (selectedObject.type === 'roomName' || selectedObject.type === 'roomArea')) {
            setState({
                isDraggingRoomName: selectedObject.object, // Taşınan oda
                roomDragStartPos: { x: pos.x, y: pos.y }, // Taşıma başlangıç noktası
                roomOriginalCenter: [...selectedObject.object.center], // Orijinal merkez (referans için)
                selectedObject: null // Diğer seçimleri kaldır
            });
            return; // Başka işlem yapma
        }

        // Genel state sıfırlamaları (sürükleme öncesi)
        setState({
            selectedObject, // Yeni seçilen nesne
            selectedGroup: [], // Seçili grubu temizle
            affectedWalls: [], // Etkilenen duvarları temizle
            preDragWallStates: new Map(), // Duvarların önceki durumunu temizle
            preDragNodeStates: new Map(), // Nodeların/Kolonların önceki durumunu temizle
            dragAxis: null, // Sürükleme eksenini temizle
            isSweeping: false, // Sweep modunu kapat
            sweepWalls: [], // Sweep duvarlarını temizle
            dragOffset: { x: 0, y: 0 }, // Sürükleme ofsetini sıfırla
            columnRotationOffset: null // DÖNME GÜNCELLEMESİ: Döndürme ofsetini temizle
        });

        // Eğer seçilen nesne kolonsa, boyutlandırma/döndürme için başlangıç durumunu kaydet
        if (selectedObject && selectedObject.type === 'column') {
            const column = selectedObject.object;
            state.preDragNodeStates.set('center_x', column.center.x);
            state.preDragNodeStates.set('center_y', column.center.y);
            // state.preDragNodeStates.set('size', column.size); // Bu eski, width/height daha doğru
            state.preDragNodeStates.set('width', column.width || column.size);
            state.preDragNodeStates.set('height', column.height || column.size);
            state.preDragNodeStates.set('rotation', column.rotation || 0);
            state.preDragNodeStates.set('hollowWidth', column.hollowWidth || 0);
            state.preDragNodeStates.set('hollowHeight', column.hollowHeight || 0);
            state.preDragNodeStates.set('hollowOffsetX', column.hollowOffsetX || 0);
            state.preDragNodeStates.set('hollowOffsetY', column.hollowOffsetY || 0);
        }

        // Eğer bir nesne seçildiyse sürüklemeye hazırlan
        if (selectedObject) {
            let startPointForDragging; // Sürüklemenin başladığı *nesne* üzerindeki nokta
            let dragOffset = { x: 0, y: 0 }; // Mouse ile bu nokta arasındaki fark
            let columnRotationOffset = null; // DÖNME GÜNCELLEMESİ: Ofseti hesaplamak için

            // Seçilen nesneye göre başlangıç noktası ve ofseti belirle
            if (selectedObject.type === 'wall' && selectedObject.handle !== 'body') {
                // Duvarın ucu (node) seçildiyse
                const nodeToDrag = selectedObject.object[selectedObject.handle];
                startPointForDragging = { x: nodeToDrag.x, y: nodeToDrag.y };
                // Offset yok, direkt node'dan sürükleniyor
            } else if (selectedObject.type === 'door') {
                // Kapı seçildiyse
                const door = selectedObject.object;
                const wall = door.wall;
                // Gerekli kontroller
                if (!wall || !wall.p1 || !wall.p2) return;
                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                if (wallLen < 0.1) return;
                // Kapının merkez noktasını hesapla
                const dx = (wall.p2.x - wall.p1.x) / wallLen;
                const dy = (wall.p2.y - wall.p1.y) / wallLen;
                const doorCenterX = wall.p1.x + dx * door.pos;
                const doorCenterY = wall.p1.y + dy * door.pos;
                startPointForDragging = { x: doorCenterX, y: doorCenterY };
                // Offset, kapı merkezi ile mouse tıklama noktası arasındaki fark
                dragOffset = { x: doorCenterX - pos.x, y: doorCenterY - pos.y };
            } else if (selectedObject.type === 'window') {
                // Pencere seçildiyse (kapı ile aynı mantık)
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
                 // Menfez seçildiyse (kapı ile aynı mantık)
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
                // Kolon seçildiyse
                if (selectedObject.handle === 'body' || selectedObject.handle === 'center') {
                    // Body veya merkezden tutulduğunda mouse pozisyonu önemli
                    startPointForDragging = { x: pos.x, y: pos.y }; // Başlangıç noktası mouse pos
                    // Offset, mouse'dan kolon merkezine olan farktır
                    dragOffset = {
                        x: selectedObject.object.center.x - pos.x,
                        y: selectedObject.object.center.y - pos.y
                    };
                } else if (selectedObject.handle.startsWith('corner_')) {
                    // DÖNME GÜNCELLEMESİ: Köşeden tutulduğunda
                    const column = selectedObject.object;
                    // Döndürme merkez etrafında yapılır
                    startPointForDragging = { x: column.center.x, y: column.center.y };
                    dragOffset = { x: 0, y: 0 }; // Döndürmede offset olmaz
                    
                    // Döndürme açısı ofsetini hesapla
                    const initialAngle = Math.atan2(pos.y - column.center.y, pos.x - column.center.x);
                    const initialRotationRad = (column.rotation || 0) * Math.PI / 180;
                    columnRotationOffset = initialRotationRad - initialAngle; // Bu ofseti state'e kaydedeceğiz

                } else {
                    // Diğer durumlar için (kenar boyutlandırma) genel snap pozisyonu
                    startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                    dragOffset = { x: 0, y: 0 };
                }
            } else { // Diğer nesne tipleri (varsa)
                startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                dragOffset = { x: 0, y: 0 };
            }

            // Sürükleme state'ini başlat
            setState({
                isDragging: true,
                dragStartPoint: startPointForDragging, // Sürüklemenin başladığı *nesne* noktası
                initialDragPoint: { x: pos.x, y: pos.y }, // Sürüklemenin başladığı *mouse* noktası
                dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId }, // Ekran koordinatları (pointer up kontrolü için)
                dragOffset: dragOffset, // Mouse ile nesne arasındaki fark (gövdeden sürüklemede önemli)
                columnRotationOffset: columnRotationOffset // DÖNME GÜNCELLEMESİ: Ofseti state'e ekle
            });

            // Eğer duvar seçildiyse ek hazırlıklar
            if (selectedObject.type === "wall") {
                 if (selectedObject.handle !== "body") {
                     // Duvarın ucu seçildiyse
                     const nodeToDrag = selectedObject.object[selectedObject.handle];
                     // Bu node'a bağlı tüm duvarları bul
                     const affectedWalls = state.walls.filter((w) => w.p1 === nodeToDrag || w.p2 === nodeToDrag);
                     setState({ affectedWalls, dragAxis: null }); // Etkilenen duvarları ve eksen kilidini (yok) state'e kaydet
                     // Etkilenen duvarlardaki kapı/pencerelerin node'lara göre orantısal pozisyonlarını kaydet
                     affectedWalls.forEach((wall) => {
                         const wallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                         if (wallLength > 0.1) {
                             state.preDragWallStates.set(wall, {
                                 isP1Stationary: wall.p2 === nodeToDrag, // p1 mi sabit kalıyor?
                                 doors: state.doors.filter((d) => d.wall === wall).map((door) => ({ doorRef: door, distFromP1: door.pos, distFromP2: wallLength - door.pos })),
                                 windows: (wall.windows || []).map((win) => ({ windowRef: win, distFromP1: win.pos, distFromP2: wallLength - win.pos }))
                             });
                         }
                     });
                 } else { // Duvar gövdesi seçildi
                     const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey; // Sadece Ctrl = Kopyala
                     const isSweeping =  !e.ctrlKey && !e.altKey && e.shiftKey; // Sadece Shift = Sweep (İz bırakarak taşı)
                     let wallsBeingMoved; // Taşınacak duvar(lar) listesi
                     // Kopyalama veya Sweep modunda ise
                     if (isCopying || isSweeping) {
                         const originalWall = selectedObject.object;
                         // Nodeları kopyala
                         const newP1 = { x: originalWall.p1.x, y: originalWall.p1.y };
                         const newP2 = { x: originalWall.p2.x, y: originalWall.p2.y };
                         state.nodes.push(newP1, newP2); // Yeni nodeları state'e ekle
                         // Duvarı kopyala (pencere/menfez olmadan)
                         const newWall = { ...originalWall, p1: newP1, p2: newP2, windows: [], vents: [] };
                         state.walls.push(newWall); // Yeni duvarı state'e ekle
                         wallsBeingMoved = [newWall]; // Taşınacak duvar bu yeni duvar
                         // Seçili nesneyi de yeni kopyalanan duvar olarak güncelle
                         setState({ selectedObject: { ...selectedObject, object: newWall } });
                     }
                     else { // Normal taşıma modu
                          // Eğer Ctrl+Shift basılıysa, aynı hizada olan tüm duvarları seç (Zincirleme seçim)
                          if (e.ctrlKey && e.shiftKey) { const chain = findCollinearChain(selectedObject.object); setState({ selectedGroup: chain }); }
                          // Taşınacak duvarlar: Seçili grup varsa o, yoksa sadece tıklanan duvar
                          wallsBeingMoved = state.selectedGroup.length > 0 ? state.selectedGroup : [selectedObject.object];
                     }
                     // Taşınacak duvarlara ait (tekilleştirilmiş) nodeları bul
                     const nodesBeingMoved = new Set();
                     wallsBeingMoved.forEach((w) => { nodesBeingMoved.add(w.p1); nodesBeingMoved.add(w.p2); });

                     // Taşınacak TÜM nodeların orijinal pozisyonlarını kaydet
                     nodesBeingMoved.forEach(node => { state.preDragNodeStates.set(node, { x: node.x, y: node.y }); });

                     // --- DEĞİŞİKLİK: TÜM Kolonların orijinal pozisyonlarını kaydet ---
                     state.columns.forEach((col, index) => {
                         // Sadece döndürülmemiş kolonların pozisyonunu kaydetmek,
                         // birlikte hareket mantığı sadece onlar için çalıştığından yeterli.
                         // DÖNME GÜNCELLEMESİ: Artık döndürülmüş kolonları da taşıyabilmeli,
                         // bu yüzden (col.rotation || 0) === 0 kontrolünü kaldırıyoruz.
                         // (Ancak pointer-move'daki taşıma mantığı şimdilik sadece 0 derece için snap yapıyor,
                         // bu yüzden şimdilik 0 derece kısıtlaması kalabilir,
                         // ama kolon döndürme eklendiği için bu kısıtlamayı kaldırmak daha doğru olacak.)
                         //
                         // GÜNCELLEME: pointer-move'daki taşıma mantığı (getSnappedWallInfo)
                         // artık snapli kolonları döndürüyor, bu yüzden buradaki 0 derece
                         // kısıtlaması KALKMALI.
                         
                         // if ((col.rotation || 0) === 0) {
                             state.preDragNodeStates.set(`col_${index}_x`, col.center.x);
                             state.preDragNodeStates.set(`col_${index}_y`, col.center.y);
                         // }
                     });
                     // --- DEĞİŞİKLİK SONU ---

                     // Eksen kilidini belirle (duvarın açısına göre)
                     const wall = selectedObject.object; // İlk seçilen duvarı referans al
                     const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
                     let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI; // Açı (0-90 derece)
                     let dragAxis = null; // Kilit yok
                     if (Math.abs(angle - 45) < 1) dragAxis = null; // Yaklaşık 45 derece ise kilit yok
                     else if (angle < 45) dragAxis = 'y'; // Yataya yakınsa Y eksenini kilitle (sadece X hareketi izinli)
                     else dragAxis = 'x'; // Dikeye yakınsa X eksenini kilitle (sadece Y hareketi izinli)

                     // Gerekli state'leri güncelle
                     setState({ dragWallInitialVector: { dx, dy }, dragAxis, isSweeping: isSweeping });

                     // Sürüklenen duvarlarla ilişkili odaları bul (Oda merkezi güncellemesi için)
                     // Bu, duvar sürüklendiğinde odanın isminin/alanının da kaymasını sağlar
                     const startWall = selectedObject.object; // Referans olarak ilk seçilen duvarı alalım
                     const affectedRoomsForDrag = state.rooms.filter(room => {
                         if (!room.polygon || !room.polygon.geometry) return false; // Geçersiz oda ise atla
                         const roomCoords = room.polygon.geometry.coordinates[0]; // Odanın köşe koordinatları
                         // Bu odanın köşe noktalarından herhangi biri, taşınan nodelardan biri mi?
                         return roomCoords.some(coord => {
                             for (const node of nodesBeingMoved) {
                                 if (Math.hypot(coord[0] - node.x, coord[1] - node.y) < 0.1) { // Çok yakınsa
                                     return true; // Bu oda etkileniyor
                                 }
                             }
                             return false; // Bu köşe taşınan nodelardan değil
                         });
                     });

                     // Etkilenen odalar bulunduysa, bilgilerini kaydet
                     if (affectedRoomsForDrag.length > 0) {
                          const draggedRoomInfos = affectedRoomsForDrag.map(room => ({
                               room: room, // Oda nesnesi
                               originalCoords: JSON.parse(JSON.stringify(room.polygon.geometry.coordinates[0])), // Orijinal köşe koordinatları
                               tempPolygon: JSON.parse(JSON.stringify(room.polygon)) // Geçici poligon (sürükleme sırasında güncellenecek)
                          }));
                          //setState({ draggedRoomInfo: draggedRoomInfos }); // State'e ekle
                     }


                     // T-kavşaklarını ayırma mantığı (sweep veya kopya modunda değilse)
                     if (!isCopying && !isSweeping && !e.altKey && !e.shiftKey) {
                         // Verilen node'u, bağlı olduğu taşınmayan duvarlar varsa ve yönleri aynıysa ayırır
                         const checkAndSplitNode = (node) => {
                             // Bu node'a bağlı olan AMA taşınmayan duvarları bul
                             const connectedWalls = state.walls.filter(w => (w.p1 === node || w.p2 === node) && !wallsBeingMoved.includes(w));
                             if (connectedWalls.length === 0) return false; // Bağlı taşınmayan duvar yoksa ayırmaya gerek yok

                             // Ana sürüklenen duvarlardan birinin yönünü al (referans için)
                             const mainDraggedWall = selectedObject.object; // veya wallsBeingMoved[0]
                             // Ana duvar yatay mı? (Y farkı 1cm'den azsa yatay kabul et)
                             const isMainWallHorizontal = Math.abs(mainDraggedWall.p2.y - mainDraggedWall.p1.y) < 1;

                             let needsSplit = false; // Ayırma gerekiyor mu?
                             // Bağlı taşınmayan duvarları kontrol et
                             for (const connected of connectedWalls) {
                                 // Bağlı duvar yatay mı?
                                 const isConnectedHorizontal = Math.abs(connected.p2.y - connected.p1.y) < 1;
                                 // Eğer ana duvar ve bağlı duvar aynı yöndeyse (ikisi de yatay veya ikisi de dikey)
                                 if ((isMainWallHorizontal && isConnectedHorizontal) || (!isMainWallHorizontal && !isConnectedHorizontal)) {
                                     needsSplit = true; // Ayırma gerekiyor
                                     break; // Bir tane bulmak yeterli
                                 }
                             }

                             // Eğer ayırma gerekiyorsa
                             if (needsSplit) {
                                 // Yeni bir node oluştur (aynı pozisyonda)
                                 const newNode = { x: node.x, y: node.y };
                                 state.nodes.push(newNode); // State'e ekle
                                 // Taşınan duvarların bu node ile olan bağlantısını yeni node'a aktar
                                 wallsBeingMoved.forEach(wall => {
                                     if (wall.p1 === node) wall.p1 = newNode;
                                     if (wall.p2 === node) wall.p2 = newNode;
                                 });
                                 // Yeni node'un orijinal pozisyonunu da kaydet (sweep için gerekli)
                                 state.preDragNodeStates.set(newNode, { x: node.x, y: node.y });
                                 return true; // Ayırma yapıldı
                             }
                             return false; // Ayırma yapılmadı
                         };

                         let splitOccurred = false; // Ayırma yapıldı mı?
                         // Taşınan her node için ayırma kontrolü yap
                         nodesBeingMoved.forEach(node => {
                             if(checkAndSplitNode(node)) {
                                 splitOccurred = true; // Ayırma yapıldıysa işaretle
                             }
                         });
                         // Eğer en az bir node ayrıldıysa, sweep modunu aktif et (ayrılan çizgileri göstermek için)
                         if (splitOccurred) {
                             setState({ isSweeping: true });
                         }
                     } // T-kavşağı ayırma sonu
                 } // Duvar gövdesi seçildi sonu
            } // Duvar seçildi sonu
        } // selectedObject varsa if bloğu sonu
    } else if (state.currentMode === "drawDoor" || state.currentMode === "drawWindow" || state.currentMode === "drawVent") {
        // Kapı/Pencere/Menfez çizim modu tıklaması

        // Önce en yakın duvara yerleştirmeyi dene (önizleme mantığı gibi)
        if (state.currentMode === "drawWindow") {
            let previewWall = null, minDistSqPreview = Infinity;
            const bodyHitTolerancePreview = (WALL_THICKNESS * 1.5) ** 2; // Biraz daha toleranslı
            for (const w of [...state.walls].reverse()) { // Duvarları tersten kontrol et (üsttekiler öncelikli)
                if (!w.p1 || !w.p2) continue; // Geçersiz duvarı atla
                const distSq = distToSegmentSquared(pos, w.p1, w.p2); // Mesafenin karesi
                // Tolerans içinde ve daha yakınsa
                if (distSq < bodyHitTolerancePreview && distSq < minDistSqPreview) {
                    minDistSqPreview = distSq; previewWall = w; // En yakın duvarı güncelle
                }
            }
            if (previewWall) { // En yakın duvar bulunduysa
                const previewWindowData = getWindowPlacement(previewWall, pos); // Yerleşimi hesapla
                if (previewWindowData && isSpaceForWindow(previewWindowData)) { // Yer var mı kontrol et
                    if (!previewWall.windows) previewWall.windows = []; // windows dizisi yoksa oluştur
                    // Yeni pencereyi ekle
                    previewWall.windows.push({ pos: previewWindowData.pos, width: previewWindowData.width, type: 'window' });
                    saveState(); // Durumu kaydet
                    return; // Pencere eklendi, işlemi bitir
                }
                // Eğer yer yoksa, aşağıdaki oda bazlı eklemeye devam eder
            }
        } else if (state.currentMode === "drawDoor") {
            // Kapı için aynı mantık
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
                const previewDoor = getDoorPlacement(previewWall, pos); // Kapı yerleşimi
                if (previewDoor && isSpaceForDoor(previewDoor)) { // Yer kontrolü
                    state.doors.push(previewDoor); // Kapıyı ekle
                    saveState(); // Kaydet
                    return; // İşlemi bitir
                }
            }
        } else if (state.currentMode === "drawVent") {
            // Menfez için aynı mantık
            let closestWall = null; let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 1.5; // Tolerans
             for (const w of [...state.walls].reverse()) {
                 if (!w.p1 || !w.p2) continue;
                 const p1 = w.p1, p2 = w.p2; const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2; if(l2 < 0.1) continue; // Çok kısa duvarları atla
                 const d = distToSegmentSquared(snappedPos, p1, p2); // Snaplenmiş pozisyonu kullanmak daha iyi olabilir
                 if (d < bodyHitTolerance**2 && d < minDistSq) { minDistSq = d; closestWall = w; }
             }
             if(closestWall) { // En yakın duvar bulunduysa
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const ventWidth = 40; // Varsayılan menfez genişliği
                const ventMargin = 10; // Kenar boşluğu
                // Duvar yeterince uzun mu?
                if (wallLen >= ventWidth + 2 * ventMargin) {
                     const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                     // İzdüşüm hesapla
                     const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                     const ventPos = t * wallLen; // Pozisyon
                     // Pozisyon geçerli aralıkta mı? (Kenar boşlukları dahil)
                     if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                         if (!closestWall.vents) closestWall.vents = []; // vents dizisi yoksa oluştur
                         // Menfezi ekle
                         closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                         saveState(); // Kaydet
                         return; // İşlemi bitir
                     }
                 }
                 // Duvar kısa veya pozisyon geçersizse oda bazlı eklemeye devam eder
             }
        } // Menfez sonu

        // Eğer direkt duvara tıklanmadıysa veya yer yoksa, oda bazlı eklemeyi dene
        const clickedObject = getObjectAtPoint(pos); // Tıklanan nesneyi tekrar al

        if (state.currentMode === "drawWindow") {
            // Bir odaya tıklandıysa, o odanın dış duvarlarına (ortasına) pencere ekle
            const addWindowToWallMiddle = (wall) => {
                 // Eğer duvarda zaten pencere varsa ekleme (isteğe bağlı)
                 if (wall.windows && wall.windows.length > 0) return false;

                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); // Duvar uzunluğu
                const wallThickness = wall.thickness || WALL_THICKNESS; // Duvar kalınlığı
                const margin = (wallThickness / 2) + 5; // Kenar boşluğu
                const defaultWidth = 150; // Varsayılan pencere genişliği
                const minWidth = 40; // Minimum pencere genişliği

                let windowWidth = defaultWidth;
                // Kısa duvar kontrolü
                if (wallLen < 300) { // Duvar 3 metreden kısaysa
                     const availableSpace = wallLen - 2 * margin; // Kenar boşluklarını çıkar
                     // Kullanılabilir alanın yarısı kadar yap, min/max sınırları içinde
                     windowWidth = Math.max(minWidth, Math.min(availableSpace, wallLen / 2));
                } else { // Duvar 3 metre veya daha uzunsa
                     const availableSpace = wallLen - 2 * margin;
                     // Varsayılan genişlik veya sığan kadar yap
                     windowWidth = Math.min(defaultWidth, availableSpace);
                }

                 // Eğer hesaplanan genişlik minimumdan küçükse ekleme
                 if(windowWidth < minWidth) return false;

                const windowPos = wallLen / 2; // Ortaya yerleştir

                 // Geçici veri ile yer kontrolü yap (diğer kapı/pencerelerle çakışma)
                 const tempWindowData = { wall: wall, pos: windowPos, width: windowWidth };
                 if (!isSpaceForWindow(tempWindowData)) {
                     return false; // Ekleme
                 }

                // Ekleme işlemi
                if (!wall.windows) wall.windows = []; // windows dizisi yoksa oluştur
                wall.windows.push({
                    pos: windowPos,
                    width: windowWidth,
                    type: 'window'
                });
                return true; // Eklendi
            };

            if (clickedObject && clickedObject.type === 'room') { // Odaya tıklandıysa
                const clickedRoom = clickedObject.object; const TOLERANCE = 1; // Oda duvarı eşleştirme toleransı
                if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return; // Geçersiz oda ise atla
                const roomCoords = clickedRoom.polygon.geometry.coordinates[0]; const roomWalls = new Set(); // Odanın duvarları
                // Odanın duvarlarını bul (poligon kenarlarına göre)
                for (let i = 0; i < roomCoords.length - 1; i++) {
                     const p1Coord = roomCoords[i]; const p2Coord = roomCoords[i + 1];
                     // Bu kenara uyan duvarı bul
                     const wall = state.walls.find(w => {
                         if (!w || !w.p1 || !w.p2) return false;
                         // İki uç noktanın toplam mesafesi toleranstan küçükse aynı duvar kabul et
                         const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                         const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                          return Math.min(d1, d2) < TOLERANCE;
                      });
                     if (wall) roomWalls.add(wall); // Bulunan duvarı sete ekle
                }
                let windowAdded = false; // Pencere eklendi mi?
                // Odanın duvarları üzerinde dön
                // Sadece dış duvarlara (başka odaya bitişik olmayan - wallAdjacency == 1) pencere ekle
                roomWalls.forEach(wall => { if (state.wallAdjacency.get(wall) === 1) if (addWindowToWallMiddle(wall)) windowAdded = true; });
                if (windowAdded) saveState(); // En az bir pencere eklendiyse kaydet
                return; // İşlemi bitir
            }
            // Hiçbir nesneye tıklanmadıysa (boş alan)
            if (!clickedObject) {
                let windowAdded = false;
                // Tüm dış duvarlara (wallAdjacency == 1) pencere eklemeyi dene
                state.wallAdjacency.forEach((count, wall) => { if (count === 1) if (addWindowToWallMiddle(wall)) windowAdded = true; });
                if (windowAdded) saveState(); // En az bir pencere eklendiyse kaydet
                return; // İşlemi bitir
            }
        } // Pencere modu oda tıklama sonu

        // Kapı modu ve odaya tıklama (komşu odalar arası otomatik kapı ekleme)
        if (state.currentMode === "drawDoor" && clickedObject && clickedObject.type === 'room') {
            const clickedRoom = clickedObject.object; // Tıklanan oda
            if (!clickedRoom.polygon || !clickedRoom.polygon.geometry) return; // Geçersizse atla
            const coords = clickedRoom.polygon.geometry.coordinates[0]; // Köşe koordinatları
            const roomWalls = []; // Tıklanan odanın duvarları
            // Odanın duvarlarını bul
            for (let i = 0; i < coords.length - 1; i++) {
                const p1Coord = coords[i]; const p2Coord = coords[i + 1];
                const wall = state.walls.find(w => {
                    if (!w || !w.p1 || !w.p2) return false;
                   // Toleranslı eşleştirme
                   const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                   const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                   return Math.min(dist1, dist2) < 1; // Tolerans
                });
                if (wall) roomWalls.push(wall); // Bulunan duvarı listeye ekle
            }
            const neighborRooms = []; // Komşu odalar ve paylaşılan duvarları [{ room, sharedWalls }]
            // Diğer odaları kontrol et
            state.rooms.forEach(otherRoom => {
                if (otherRoom === clickedRoom || !otherRoom.polygon || !otherRoom.polygon.geometry) return; // Kendisi veya geçersizse atla
                const otherCoords = otherRoom.polygon.geometry.coordinates[0]; // Komşunun koordinatları
                const otherWalls = []; // Komşunun duvarları
                // Komşu odanın duvarlarını bul
                for (let i = 0; i < otherCoords.length - 1; i++) {
                     const p1Coord = otherCoords[i]; const p2Coord = otherCoords[i + 1];
                     const wall = state.walls.find(w => {
                         if (!w || !w.p1 || !w.p2) return false;
                        // Toleranslı eşleştirme
                        const dist1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                        const dist2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                        return Math.min(dist1, dist2) < 1; // Tolerans
                     });
                     if (wall) otherWalls.push(wall); // Bulunan duvarı listeye ekle
                }
                // Ortak duvarları bul (iki odanın da duvar listesinde olanlar)
                const sharedWalls = roomWalls.filter(w => otherWalls.includes(w));
                if (sharedWalls.length > 0) { // Ortak duvar varsa komşudur
                    neighborRooms.push({ room: otherRoom, sharedWalls: sharedWalls }); // Komşu listesine ekle
                }
            });
            let doorsAdded = 0; // Eklenen kapı sayısı
            // Her komşu için
            neighborRooms.forEach(neighbor => {
                const sharedWalls = neighbor.sharedWalls; // Ortak duvarlar
                // En uzun ortak duvarı bul
                let longestWall = sharedWalls[0]; // Başlangıçta ilkini en uzun kabul et
                let maxLength = 0;
                 if(longestWall && longestWall.p1 && longestWall.p2) maxLength = Math.hypot(longestWall.p2.x - longestWall.p1.x, longestWall.p2.y - longestWall.p1.y);
                // Diğer ortak duvarları kontrol et
                sharedWalls.forEach(wall => {
                     if (!wall || !wall.p1 || !wall.p2) return; // Geçersizse atla
                    const len = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); // Uzunluk
                    if (len > maxLength) { maxLength = len; longestWall = wall; } // Daha uzunsa güncelle
                });
                if(!longestWall || !longestWall.p1 || !longestWall.p2) return; // Geçerli en uzun duvar yoksa atla
                // Bu en uzun ortak duvarda zaten kapı var mı?
                const existingDoor = state.doors.find(d => d.wall === longestWall);
                if (!existingDoor) { // Kapı yoksa
                    // Duvarın ortasına kapı yerleştirmeyi dene
                    const midX = (longestWall.p1.x + longestWall.p2.x) / 2;
                    const midY = (longestWall.p1.y + longestWall.p2.y) / 2;
                    const newDoor = getDoorPlacement(longestWall, { x: midX, y: midY }); // Yerleşimi hesapla
                    if (newDoor && isSpaceForDoor(newDoor)) { // Yer varsa ekle
                        state.doors.push(newDoor); doorsAdded++; // Sayacı artır
                    }
                }
            });
            if (doorsAdded > 0) saveState(); // Kapı eklendiyse kaydet
            return; // İşlemi bitir
        } // Kapı modu oda tıklama sonu

        // Eğer menfez çizim modundaysa ve duvara yakın bir yere tıklandıysa (yukarıdaki direkt yerleştirme başarısız olduysa)
        // Bu blok genellikle çalışmaz çünkü yukarıdaki direkt yerleştirme çoğu durumu kapsar.
        // Ama bir güvenlik önlemi olarak kalabilir.
        if(state.currentMode === "drawVent") {
            let closestWall = null; let minDistSq = Infinity;
            const bodyHitTolerance = WALL_THICKNESS * 1.5; // Tolerans
             for (const w of [...state.walls].reverse()) {
                 if (!w.p1 || !w.p2) continue;
                 const p1 = w.p1, p2 = w.p2; const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2; if(l2 < 0.1) continue;
                 const d = distToSegmentSquared(snappedPos, p1, p2);
                 if (d < bodyHitTolerance**2 && d < minDistSq) { minDistSq = d; closestWall = w; }
             }
             if(closestWall) { // En yakın duvar bulunduysa
                const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
                const ventWidth = 40; const ventMargin = 10;
                // Duvar yeterince uzun mu?
                if (wallLen >= ventWidth + 2 * ventMargin) {
                     const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                     // İzdüşüm hesapla
                     const t = Math.max(0, Math.min(1, ((snappedPos.x - closestWall.p1.x) * dx + (snappedPos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                     const ventPos = t * wallLen; // Pozisyon
                     // Pozisyon geçerli aralıkta mı?
                     if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                         if (!closestWall.vents) closestWall.vents = []; // vents dizisi yoksa oluştur
                         // Menfezi ekle
                         closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                         saveState(); // Kaydet
                         return; // İşlemi bitir
                     }
                 }
                 // Duvar kısa veya pozisyon geçersizse işlem yapma
             }
        } // Menfez sonu

    } else if (state.currentMode === "drawColumn") {
        // Kolon çizim modu tıklaması
        const newColumn = createColumn(snappedPos.roundedX, snappedPos.roundedY, 40); // Snaplenmiş pozisyona 40x40 kolon ekle
        state.columns.push(newColumn);
        saveState(); // Durumu kaydet
        // setMode('select'); // İsteğe bağlı: Kolon ekledikten sonra seçim moduna geç
        return; // İşlemi bitir

    } else { // Duvar veya Oda çizim modu
        let placementPos = { x: snappedPos.roundedX, y: snappedPos.roundedY }; // Snaplenmiş veya grid'e yuvarlanmış pozisyon

        if (!state.startPoint) { // İlk tıklama ise
             // Yeni bir node oluştur veya mevcut snaplenmiş node'u kullan
             setState({ startPoint: getOrCreateNode(placementPos.x, placementPos.y) });
        } else { // İkinci veya sonraki tıklama ise
            // Başlangıç ve bitiş noktası arasındaki mesafeyi kontrol et
            const d = Math.hypot(state.startPoint.x - placementPos.x, state.startPoint.y - placementPos.y);
            if (d > 0.1) { // Çok yakın değilse devam et (minimum duvar/oda boyutu)
                let geometryChanged = false; // Geometri değişti mi flag'i

                if (state.currentMode === "drawWall") { // Duvar çizim modu
                     // Eğer snap yoksa veya sadece grid snap ise, 15 derecelik açılara snaple
                     if (!snappedPos.isSnapped || snappedPos.snapType === 'GRID') {
                          placementPos = snapTo15DegreeAngle(state.startPoint, placementPos);
                     }
                     // Hesaplanan bitiş noktasına göre mesafeyi al (snap sonrası)
                     const dx = placementPos.x - state.startPoint.x, dy = placementPos.y - state.startPoint.y;
                     const distance = Math.hypot(dx, dy);
                     const gridValue = state.gridOptions.visible ? state.gridOptions.spacing : 1; // Grid aralığı

                     // Eğer mesafe anlamlıysa ve snap yoksa veya grid snap ise, mesafeyi grid'e yuvarla
                     if (distance > 0.1 && (!snappedPos.isSnapped || snappedPos.snapType === 'GRID')) {
                         const snappedDistance = Math.round(distance / gridValue) * gridValue; // Mesafeyi grid'e yuvarla
                         if (Math.abs(snappedDistance - distance) > 0.01) { // Fark varsa (küçük hataları önlemek için) uygula
                            const scale = snappedDistance / distance; // Oran
                            // Bitiş pozisyonunu ölçekleyerek ayarla
                            placementPos.x = state.startPoint.x + dx * scale;
                            placementPos.y = state.startPoint.y + dy * scale;
                         }
                     }

                     const nodesBefore = state.nodes.length; // Node sayısını kaydet (yeni node oluştu mu kontrolü için)
                     // Bitiş node'unu al (yeni veya mevcut)
                     const endNode = getOrCreateNode(placementPos.x, placementPos.y);
                     // Mevcut bir node'a mı snaplendi? (Node sayısı değişmediyse evet)
                     const didSnapToExistingNode = (state.nodes.length === nodesBefore);
                     // Bir duvarın gövdesine mi bağlandı? (Yeni node oluşturulduysa VE duvar üzerinde ise)
                     const didConnectToWallBody = !didSnapToExistingNode && isPointOnWallBody(endNode);

                     // Eğer bitiş noktası başlangıçtan farklıysa ve bu duvar zaten yoksa
                     if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
                         // Yeni duvarı ekle
                         state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: WALL_THICKNESS, wallType: 'normal' });
                         geometryChanged = true; // Geometri değişti
                     }

                     // Çizime devam etme durumunu belirle:
                     // Eğer mevcut bir node'a snaplendiyse (başlangıç noktası hariç) VEYA duvar gövdesine bağlandıysa, çizime devam etme
                     if ((didSnapToExistingNode && endNode !== state.startPoint) || didConnectToWallBody) { setState({ startPoint: null }); }
                     else { setState({ startPoint: endNode }); } // Yoksa çizime devam et (yeni startPoint bu node olsun)

                } else if (state.currentMode === "drawRoom") { // Oda çizim modu
                    const p1 = state.startPoint; // Başlangıç köşesi
                    // Eğer anlamlı bir dikdörtgen çiziliyorsa (min 1cm x 1cm)
                    if (Math.abs(p1.x - placementPos.x) > 1 && Math.abs(p1.y - placementPos.y) > 1) {
                       // Dikdörtgenin 4 köşesini al (yeni veya mevcut nodelar)
                       const v1 = p1, // Başlangıç
                             v2 = getOrCreateNode(placementPos.x, v1.y), // Sağ üst/alt
                             v3 = getOrCreateNode(placementPos.x, placementPos.y), // Karşı köşe
                             v4 = getOrCreateNode(v1.x, placementPos.y); // Sol üst/alt
                       // 4 duvarı oluştur
                       [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }].forEach(pw => {
                            // Eğer duvar zaten yoksa ekle
                            if (!wallExists(pw.p1, pw.p2)) state.walls.push({ type: "wall", ...pw, thickness: WALL_THICKNESS, wallType: 'normal' });
                       });
                       geometryChanged = true; // Geometri değişti
                       setState({ startPoint: null }); // Oda çizimi bitti, startPoint'i sıfırla
                    }
                    // Eğer çok küçük bir dikdörtgen çizilmeye çalışıldıysa bir şey yapma
                } // Oda çizim modu sonu

                if (geometryChanged) { // Eğer duvar/oda eklendiyse
                    processWalls(); // Duvarları işle (kesişim, oda tespiti vs.)
                    saveState(); // Durumu kaydet
                }
            } // Mesafe kontrolü sonu
             else { // Çok yakın tıklandıysa (mesafe < 0.1)
                 // Belki startPoint'i sıfırlamak iyi olabilir? Şimdilik bir şey yapmıyor.
             }
        } // İkinci tıklama sonu
    } // Duvar/Oda çizim modu sonu
} // onPointerDown fonksiyonu sonu