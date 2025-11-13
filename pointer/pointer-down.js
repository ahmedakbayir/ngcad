// pointer-down.js
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from '../architectural-objects/columns.js';
import { createBeam, onPointerDown as onPointerDownBeam } from '../architectural-objects/beams.js';
import { createStairs, onPointerDown as onPointerDownStairs, recalculateStepCount } from '../architectural-objects/stairs.js';
import { createPlumbingBlock, onPointerDown as onPointerDownPlumbingBlock, getConnectionPoints, PLUMBING_BLOCK_TYPES } from '../architectural-objects/plumbing-blocks.js';
import { createPlumbingPipe, snapToConnectionPoint, snapToPipeEndpoint, onPointerDown as onPointerDownPlumbingPipe, isSpaceForValve } from '../architectural-objects/plumbing-pipes.js';
import { onPointerDownDraw as onPointerDownDrawWall, onPointerDownSelect as onPointerDownSelectWall, wallExists } from '../wall/wall-handler.js';
import { onPointerDownDraw as onPointerDownDrawDoor, onPointerDownSelect as onPointerDownSelectDoor } from '../architectural-objects/door-handler.js';
import { onPointerDownGuide } from '../architectural-objects/guide-handler.js';
import { onPointerDownDraw as onPointerDownDrawWindow, onPointerDownSelect as onPointerDownSelectWindow } from '../architectural-objects/window-handler.js';
import { hideGuideContextMenu } from '../draw/guide-menu.js'; 
import { screenToWorld, findNodeAt, getOrCreateNode, isPointOnWallBody, distToSegmentSquared, snapTo15DegreeAngle } from '../draw/geometry.js';
import { applySymmetry, applyCopy } from '../draw/symmetry.js';
import { state, dom, setState, setMode } from '../general-files/main.js';
import { getSmartSnapPoint } from '../general-files/snap.js';
import { currentModifierKeys } from '../general-files/input.js';
import { saveState } from '../general-files/history.js';
import { cancelLengthEdit } from '../general-files/ui.js';
import { getObjectAtPoint } from '../general-files/actions.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { processWalls } from '../wall/wall-processor.js';

/**
 * Vanadan/Sayaçtan sonraki tüm bağlı boruları düz çizgi yap
 */
function markAllDownstreamPipesAsConnected(startPipe) {
    const visited = new Set();
    const queue = [startPipe];

    while (queue.length > 0) {
        const pipe = queue.shift();
        if (visited.has(pipe)) continue;
        visited.add(pipe);

        pipe.isConnectedToValve = true;

        // p2 ucuna bağlı diğer boruları bul
        const connectedPipes = (state.plumbingPipes || []).filter(p =>
            !visited.has(p) && (
                (Math.hypot(p.p1.x - pipe.p2.x, p.p1.y - pipe.p2.y) < 1) ||
                (Math.hypot(p.p2.x - pipe.p2.x, p.p2.y - pipe.p2.y) < 1)
            )
        );

        queue.push(...connectedPipes);
    }

    console.log('✅ Marked', visited.size, 'pipes as connected to valve');
}

export function onPointerDown(e) {
    if (e.target !== dom.c2d) return; // Sadece canvas üzerindeki tıklamaları işle
    if (e.button === 1) { // Orta tuş ile pan
        setState({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } });
        dom.p2d.classList.add('panning'); // Pan cursor'ı ekle
        return;
    }
    if (e.button === 2) return; // Sağ tuş (context menu için ayrılmış)

    // Tıklama konumunu dünya koordinatlarına çevir
    const rect = dom.c2d.getBoundingClientRect();
    const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    // Tıklama konumunu snap noktalarına göre ayarla
    let snappedPos = getSmartSnapPoint(e);

    // Güncelleme bayrakları
    let needsUpdate3D = false; // 3D sahne güncellenmeli mi?
    let objectJustCreated = false; // Yeni bir nesne oluşturuldu mu?
    let geometryChanged = false; // Geometri değişti mi (saveState için)?

    // --- Seçim Modu ---
    if (state.currentMode === "select") {
        // Uzunluk düzenleme modu aktifse iptal et
        if (state.isEditingLength) { cancelLengthEdit(); return; }

        // Tıklanan nesneyi bul
        const clickedObject = getObjectAtPoint(pos);

        // Debug logging for CTRL multi-select
 /*
        console.log('🔍 Pointer Down Debug:', {
            'e.ctrlKey': e.ctrlKey,
            'e.altKey': e.altKey,
            'e.shiftKey': e.shiftKey,
            'currentModifierKeys.ctrl': currentModifierKeys.ctrl,
            'currentModifierKeys.alt': currentModifierKeys.alt,
            'currentModifierKeys.shift': currentModifierKeys.shift,
            clickedObject: clickedObject ? {
                type: clickedObject.type,
                handle: clickedObject.handle,
                object: clickedObject.object
            } : null,
            currentSelectedGroup: state.selectedGroup.length
        });
*/
        // Silme modu (Sadece Alt tuşu basılıysa)
        if (currentModifierKeys.alt && !currentModifierKeys.ctrl && !currentModifierKeys.shift) {
            setState({ isCtrlDeleting: true }); // Silme modunu başlat
            dom.p2d.style.cursor = 'crosshair'; // Silme cursor'ı ayarla
            return; // Başka işlem yapma
        }

        // CTRL ile multi-select modu (sadece CTRL basılıyken, body'ye tıklandığında)
        // Handle'lara (köşe, kenar) tıklandığında normal işlemler devam eder
        if (currentModifierKeys.ctrl && !currentModifierKeys.alt && !currentModifierKeys.shift && clickedObject &&
            ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) &&
            clickedObject.handle === 'body') {
            console.log('✅ CTRL Multi-Select Mode Active');

            // Eğer selectedGroup boş ama selectedObject varsa, önce onu gruba ekle
            let currentGroup = [...state.selectedGroup];
            if (currentGroup.length === 0 && state.selectedObject &&
                ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(state.selectedObject.type)) {
                console.log('🔄 Converting selectedObject to selectedGroup');
                currentGroup.push(state.selectedObject);
            }

            // Seçili grup içinde bu nesne var mı kontrol et
            const existingIndex = currentGroup.findIndex(item =>
                item.type === clickedObject.type && item.object === clickedObject.object
            );

            if (existingIndex !== -1) {
                // Zaten seçiliyse, seçimden çıkar (toggle off)
                console.log('➖ Removing from selection');
                currentGroup.splice(existingIndex, 1);
                setState({ selectedGroup: currentGroup, selectedObject: null });
            } else {
                // Seçili değilse, gruba ekle (toggle on)
                console.log('➕ Adding to selection');
                currentGroup.push(clickedObject);
                setState({
                    selectedGroup: currentGroup,
                    selectedObject: null
                });
            }
            console.log('📊 Updated selectedGroup:', state.selectedGroup.length, 'items');
            return; // Multi-select işlemi bitti, sürükleme başlatma
        }

        // CTRL basılı DEĞİLSE ve multi-select yapılabilir bir nesneye tıklandıysa,
        // selectedGroup'u temizle ve normal tek seçime dön
        if (!currentModifierKeys.ctrl && clickedObject &&
            ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) &&
            state.selectedGroup.length > 0) {
            console.log('🔄 Clearing selectedGroup - returning to single selection');
            // selectedGroup'u temizle, normal seçime geç
            // (Aşağıdaki kod zaten bunu yapacak, ama açıkça belirtelim)
        }

        // Önceki seçimi temizle (eğer yeni bir nesneye tıklanmadıysa veya boşluğa tıklandıysa)
        // Eğer tıklanan nesne varsa ve bu bir oda DEĞİLSE, seçimi daha sonra yapacağız.
        // Eğer tıklanan nesne yoksa veya oda ise, seçimi şimdi temizleyebiliriz.
        if (!clickedObject || clickedObject.type === 'room') {
            setState({
                selectedObject: null, selectedGroup: [],
                affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map(),
                dragAxis: null, isSweeping: false, sweepWalls: [], dragOffset: { x: 0, y: 0 },
                columnRotationOffset: null // Döndürme offset'ini de temizle
            });
        }

        // FLOOR VALIDATION: Farklı kattaki objeleri seçmeyi engelle
        if (clickedObject && state.currentFloor?.id) {
            const currentFloorId = state.currentFloor.id;
            const obj = clickedObject.object;

            // Wall, door, window, vent, column, beam, stairs, plumbingBlock, plumbingPipe için floor kontrolü
            if (['wall', 'door', 'window', 'vent', 'column', 'beam', 'stairs', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type)) {
                // Wall için direkt object'ten kontrol
                if (clickedObject.type === 'wall' && obj.floorId && obj.floorId !== currentFloorId) {
                    console.log('🚫 Cross-floor wall selection blocked:', obj.floorId, '!==', currentFloorId);
                    clickedObject = null;
                }
                // Door/window/vent için wall üzerinden kontrol
                else if (['door', 'window', 'vent'].includes(clickedObject.type) && clickedObject.wall?.floorId && clickedObject.wall.floorId !== currentFloorId) {
                    console.log('🚫 Cross-floor', clickedObject.type, 'selection blocked');
                    clickedObject = null;
                }
                // Column, beam, stairs, plumbingBlock, plumbingPipe için direkt object'ten kontrol
                else if (['column', 'beam', 'stairs', 'plumbingBlock', 'plumbingPipe'].includes(clickedObject.type) && obj.floorId && obj.floorId !== currentFloorId) {
                    console.log('🚫 Cross-floor', clickedObject.type, 'selection blocked');
                    clickedObject = null;
                }
            }
        }

        // Tıklanan nesne varsa seçili yap ve sürüklemeyi başlat
        if (clickedObject) {
            if (clickedObject.type === 'room') {
                // Oda seçimi: Oda bilgisini sakla, nesne seçimini temizle
                setState({ selectedRoom: clickedObject.object, selectedObject: null });
            } else if (clickedObject.type === 'roomName' || clickedObject.type === 'roomArea') {
                 // Oda ismi/alanı sürükleme: İlgili state'leri ayarla, nesne seçimini temizle
                 setState({
                     isDraggingRoomName: clickedObject.object,
                     roomDragStartPos: { x: pos.x, y: pos.y },
                     roomOriginalCenter: [...clickedObject.object.center],
                     selectedObject: null // Nesne seçimini temizle
                 });
                 dom.p2d.classList.add('dragging'); // Sürükleme cursor'ı ekle (grabbing)
            } else {
                 // Diğer nesneler (duvar, kapı, kolon vb.) için:
                 setState({ selectedObject: clickedObject, selectedRoom: null, selectedGroup: [] });

                 // Sürükleme için başlangıç bilgilerini nesne tipine göre al
                 let dragInfo = { startPointForDragging: pos, dragOffset: { x: 0, y: 0 }, additionalState: {} };
                 switch (clickedObject.type) {
                     case 'camera':
                         // Kamera pozisyon veya yön sürükleme
                         const camInfo = clickedObject.object;
                         if (clickedObject.handle === 'position') {
                             dragInfo = {
                                 startPointForDragging: { x: camInfo.position.x, y: camInfo.position.z },
                                 dragOffset: { x: camInfo.position.x - pos.x, y: camInfo.position.z - pos.y },
                                 additionalState: { cameraHandle: 'position' }
                             };
                         } else if (clickedObject.handle === 'direction') {
                             dragInfo = {
                                 startPointForDragging: pos,
                                 dragOffset: { x: 0, y: 0 },
                                 additionalState: {
                                     cameraHandle: 'direction',
                                     initialYaw: camInfo.yaw,
                                     cameraCenter: { x: camInfo.position.x, y: camInfo.position.z }
                                 }
                             };
                         }
                         break;
                     case 'arcControl':
                         // Arc kontrol noktası sürükleme
                         dragInfo = {
                             startPointForDragging: clickedObject.handle === 'control1' ?
                                 { x: clickedObject.object.arcControl1.x, y: clickedObject.object.arcControl1.y } :
                                 { x: clickedObject.object.arcControl2.x, y: clickedObject.object.arcControl2.y },
                             dragOffset: { x: 0, y: 0 },
                             additionalState: {}
                         };
                         break;
                     case 'guide': dragInfo = onPointerDownGuide(clickedObject, pos, snappedPos, e); break; 
                     case 'column': dragInfo = onPointerDownColumn(clickedObject, pos, snappedPos, e); break;
                     case 'beam': dragInfo = onPointerDownBeam(clickedObject, pos, snappedPos, e); break;
                     case 'stairs': dragInfo = onPointerDownStairs(clickedObject, pos, snappedPos, e); break; // stairs.js'den gelen fonksiyonu kullan
                     case 'plumbingBlock': dragInfo = onPointerDownPlumbingBlock(clickedObject, pos, snappedPos, e); break;
                     case 'plumbingPipe': dragInfo = onPointerDownPlumbingPipe(clickedObject, pos, snappedPos, e); break;
                     case 'wall': dragInfo = onPointerDownSelectWall(clickedObject, pos, snappedPos, e); break;
                     case 'door': dragInfo = onPointerDownSelectDoor(clickedObject, pos); break;
                     case 'window': dragInfo = onPointerDownSelectWindow(clickedObject, pos); break;
                     case 'vent':
                         // Menfez sürükleme başlangıcı
                         const vent = clickedObject.object; const wall = clickedObject.wall;
                         if (wall && wall.p1 && wall.p2) { // Duvar geçerliyse
                             const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                             if (wallLen > 0.1) { // Duvar uzunluğu yeterliyse
                                 const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
                                 const ventCenterX = wall.p1.x + dx * vent.pos; const ventCenterY = wall.p1.y + dy * vent.pos;
                                 dragInfo.startPointForDragging = { x: ventCenterX, y: ventCenterY }; // Başlangıç noktası
                                 dragInfo.dragOffset = { x: ventCenterX - pos.x, y: ventCenterY - pos.y }; // Offset
                             }
                         }
                         break;
                 }
                 // Sürükleme state'lerini ayarla
                 setState({
                    isDragging: true, // Sürükleme başladı
                    dragStartPoint: dragInfo.startPointForDragging, // Sürüklemenin referans noktası
                    initialDragPoint: { x: pos.x, y: pos.y }, // İlk tıklama noktası (snaplenmemiş)
                    dragStartScreen: { x: e.clientX, y: e.clientY, pointerId: e.pointerId }, // Ekran koordinatları
                    dragOffset: dragInfo.dragOffset, // Fare ile nesne arasındaki fark
                    ...(dragInfo.additionalState || {}) // Nesneye özel ek state (örn: döndürme offset'i)
                 });
                 dom.p2d.classList.add('dragging'); // Sürükleme cursor'ı ekle
            }
        } else {
            // Boşluğa tıklandıysa oda seçimini de temizle
            setState({ selectedRoom: null });
        }

    // --- Duvar veya Oda Çizim Modu ---
    } else if (state.currentMode === "drawWall" || state.currentMode === "drawRoom") {
        onPointerDownDrawWall(snappedPos); // Duvar çizme/ekleme işlemini yap (bu fonksiyon saveState'i yapar)
        needsUpdate3D = true; // Duvar/Oda çizimi 3D'yi etkiler
        // Eğer çizim bittiyse (startPoint sıfırlandıysa) seçimi kaldır
        if (!state.startPoint) setState({ selectedObject: null });

    // --- Kapı Çizim Modu ---
    } else if (state.currentMode === "drawDoor") {
        onPointerDownDrawDoor(pos, getObjectAtPoint(pos)); // Kapı ekleme işlemini yap (bu fonksiyon saveState'i yapar)
        needsUpdate3D = true; // Kapı 3D'yi etkiler
        objectJustCreated = true; // Yeni nesne oluşturuldu
        setState({ selectedObject: null }); // Seçimi kaldır

    // --- Pencere Çizim Modu ---
    } else if (state.currentMode === "drawWindow") {
        onPointerDownDrawWindow(pos, getObjectAtPoint(pos)); // Pencere ekleme işlemini yap (bu fonksiyon saveState'i yapar)
        needsUpdate3D = true; // Pencere 3D'yi etkiler
        objectJustCreated = true; // Yeni nesne oluşturuldu
        setState({ selectedObject: null }); // Seçimi kaldır

    // --- Kolon Çizim Modu ---
    } else if (state.currentMode === "drawColumn") {
         if (!state.startPoint) {
             // İlk tıklama: Başlangıç noktasını ayarla
            setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
         } else {
             // İkinci tıklama: Kolonu oluştur
             const p1 = state.startPoint;
             const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
             // Dikdörtgenin boyutları yeterince büyükse
             if (Math.abs(p1.x - p2.x) > 1 && Math.abs(p1.y - p2.y) > 1) {
                 const centerX = (p1.x + p2.x) / 2; const centerY = (p1.y + p2.y) / 2;
                 const width = Math.abs(p1.x - p2.x); const height = Math.abs(p1.y - p2.y);
                 // Yeni kolonu oluştur
                 const newColumn = createColumn(centerX, centerY, 0); // Başlangıç boyutu 0
                 newColumn.width = width; newColumn.height = height; // Hesaplanan boyutları ata
                 newColumn.size = Math.max(width, height); // Genel boyut
                 newColumn.rotation = 0; // Başlangıç açısı
                 if (!state.columns) state.columns = []; // Kolon dizisi yoksa oluştur
                 state.columns.push(newColumn); // Kolonu ekle
                 geometryChanged = true; // Geometri değişti
                 needsUpdate3D = true; // 3D güncellemesi gerekiyor
                 objectJustCreated = true; // Yeni nesne oluşturuldu
             }
             // İkinci tıklamadan sonra başlangıç noktasını sıfırla
             setState({ startPoint: null });
         }
    // --- Kiriş Çizim Modu ---
    } else if (state.currentMode === "drawBeam") {
         if (!state.startPoint) {
             // İlk tıklama: Başlangıç noktasını ayarla
             setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
         } else {
             // İkinci tıklama: Kirişi oluştur
             const p1 = state.startPoint;
             const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };
             const dx = p2.x - p1.x; const dy = p2.y - p1.y;
             const length = Math.hypot(dx, dy); // Kiriş uzunluğu
             if (length > 1) { // Minimum uzunluk kontrolü
                 const centerX = (p1.x + p2.x) / 2; const centerY = (p1.y + p2.y) / 2;
                 const width = length; // Kiriş uzunluğu = width
                 const height = state.wallThickness; // Kiriş eni = varsayılan duvar kalınlığı
                 const rotation = Math.atan2(dy, dx) * 180 / Math.PI; // Kiriş açısı
                 // Yeni kirişi oluştur
                 const newBeam = createBeam(centerX, centerY, width, height, rotation);
                 state.beams = state.beams || []; // Kiriş dizisi yoksa oluştur
                 state.beams.push(newBeam); // Kirişi ekle
                 geometryChanged = true; // Geometri değişti
                 needsUpdate3D = true; // 3D güncellemesi gerekiyor
                 objectJustCreated = true; // Yeni nesne oluşturuldu
             }
             // İkinci tıklamadan sonra başlangıç noktasını sıfırla
             setState({ startPoint: null });
         }
    // --- Tesisat Bloğu Çizim Modu ---
} else if (state.currentMode === "drawPlumbingBlock") {
        const blockType = state.currentPlumbingBlockType || 'SERVIS_KUTUSU';

        // SAYAÇ için boru üzerine ekleme kontrolü
        if (blockType === 'SAYAC') {
            // Boru üzerine mi tıklandı kontrol et
            const clickedPipe = getObjectAtPoint(pos);

            if (clickedPipe && clickedPipe.type === 'plumbingPipe') {
                // ... (VANA ve SAYAÇ ekleme mantığı değişmedi) ...
                const pipe = clickedPipe.object;
                console.log('🔧 Adding', blockType, 'to pipe');

                // Borunun yönünü hesapla
                const dx = pipe.p2.x - pipe.p1.x;
                const dy = pipe.p2.y - pipe.p1.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                // Tıklama noktasına en yakın noktayı borudan bul
                const t = Math.max(0, Math.min(1,
                    ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / (dx * dx + dy * dy)
                ));
                const splitX = pipe.p1.x + t * dx;
                const splitY = pipe.p1.y + t * dy;

                // SAYAÇ İÇİN: Hattın düzlüğünü bozmamak için HATTA GÖRENİN KENDİNİ AYARLA
                let blockX = splitX;
                let blockY = splitY;
                let blockRotation = Math.round(angle / 15) * 15; // Varsayılan: boru yönü

                if (blockType === 'SAYAC') {
                    // Sayacı boruya PARALEL yerleştir, connection point'ler otomatik olarak dik çıkar

                    // Açıyı normalize et (-180 ile 180 arası)
                    let normalizedAngle = angle;
                    while (normalizedAngle > 180) normalizedAngle -= 360;
                    while (normalizedAngle < -180) normalizedAngle += 360;

                    // Sayaç rotasyonu = borunun rotasyonu (paralel)
                    blockRotation = Math.round(normalizedAngle / 15) * 15;

                    // SAYACIN CONNECTION POINT'LERİNİN ORTASI BORUYA GELSİN
                    // Connection point'ler lokal koordinatlarda y=-17.5'te (offset: -7.5 - 10)
                    // Yani connection point'lerin ortası boru üzerinde olacak şekilde merkezi ayarla
                    const connectionPointAvgOffset = 19; // y ekseni, lokal koordinat

                    // Rotasyonu uygula (boru yönüne göre)
                    const rotRad = blockRotation * Math.PI / 180;
                    const offsetX = -connectionPointAvgOffset * Math.sin(rotRad);
                    const offsetY = connectionPointAvgOffset * Math.cos(rotRad);

                    // Merkezi offset et
                    blockX = splitX + offsetX;
                    blockY = splitY + offsetY;
                }

                // Yeni blok oluştur
                const newBlock = createPlumbingBlock(blockX, blockY, blockType);
                newBlock.rotation = blockRotation;

                // Bloğun bağlantı noktalarını al
                const connectionPoints = getConnectionPoints(newBlock);

                // Eski boruyu sil
                const oldP1 = { ...pipe.p1 };
                const oldP2 = { ...pipe.p2 };
                const oldPipeType = pipe.pipeType;
                const oldIsConnected = pipe.isConnectedToValve;

                state.plumbingPipes = state.plumbingPipes.filter(p => p !== pipe);

                // İki yeni boru ekle - bağlantı noktalarına snap
                // Vana/Sayaç için: connectionPoints[0] = giriş (sol), connectionPoints[1] = çıkış (sağ)
                const pipe1 = createPlumbingPipe(oldP1.x, oldP1.y, connectionPoints[0].x, connectionPoints[0].y, oldPipeType);
                const pipe2 = createPlumbingPipe(connectionPoints[1].x, connectionPoints[1].y, oldP2.x, oldP2.y, oldPipeType);

                // Vanadan/Sayaçtan önceki borunun isConnectedToValve durumunu koru
                pipe1.isConnectedToValve = oldIsConnected;

                // Vanadan sonraki boru ve ondan sonraki TÜM borular düz çizgi olsun
                pipe2.isConnectedToValve = true;

                if (!state.plumbingPipes) state.plumbingPipes = [];
                state.plumbingPipes.push(pipe1, pipe2);

                // Vanadan sonraki tüm bağlı boruları düz yap
                markAllDownstreamPipesAsConnected(pipe2);

                if (!state.plumbingBlocks) state.plumbingBlocks = [];
                state.plumbingBlocks.push(newBlock);

                geometryChanged = true; // saveState çağırılacak
                needsUpdate3D = true;
                objectJustCreated = true;

                console.log('✅ Block added to pipe, pipe split into 2 and connected to connection points');
                setMode("select");
                return;
            }
        }

        // OCAK ve KOMBI sadece boru ucuna veya servis kutusuna eklenebilir
        // GÜNCELLEME: ÖNCE VANA, SONRA CİHAZ EKLENİR MANTIĞI KALDIRILDI.
        if (blockType === 'OCAK' || blockType === 'KOMBI') {
            // Önce boru uçlarına snap et
            const pipeSnap = snapToPipeEndpoint(pos, 15);

            // Eğer boru ucu yoksa, sadece servis kutusuna snap et
            const blockSnap = pipeSnap ? null : snapToConnectionPoint(pos, 15, (block) => {
                // Sadece servis kutusu connection point'lerine izin ver
                return block.blockType === 'SERVIS_KUTUSU';
            });

            const snap = pipeSnap || blockSnap;

            if (!snap) {
                console.warn('⚠️', blockType, 'can only be placed at pipe ends or service box connection points');
                return;
            }

            // Borunun yönünü hesapla (eğer boru varsa)
            const nearbyPipe = state.plumbingPipes?.find(p =>
                Math.hypot(p.p1.x - snap.x, p.p1.y - snap.y) < 1 ||
                Math.hypot(p.p2.x - snap.x, p.p2.y - snap.y) < 1
            );

            let pipeAngle = 0;
            if (nearbyPipe) {
                const dx = nearbyPipe.p2.x - nearbyPipe.p1.x;
                const dy = nearbyPipe.p2.y - nearbyPipe.p1.y;
                pipeAngle = Math.atan2(dy, dx) * 180 / Math.PI;
            }

            // --- GÜNCELLENMİŞ BLOK ---
            // KULLANICI İSTEĞİ: Sadece cihazı ekle, vana ekleme.
            // Cihazı doğrudan snap noktasına yerleştir.
            
            // 1. CİHAZI (OCAK/KOMBI) EKLE
            const newBlock = createPlumbingBlock(snap.x, snap.y, blockType);
            newBlock.rotation = Math.round(pipeAngle / 15) * 15;

            // State'e ekle (Sadece newBlock)
            if (!state.plumbingBlocks) state.plumbingBlocks = [];
            state.plumbingBlocks.push(newBlock);
            // --- GÜNCELLEME SONU ---


            geometryChanged = true;
            needsUpdate3D = true;
            objectJustCreated = true;

            console.log('✅ Valve +', blockType, 'added directly (no pipe between)');
            setMode("select");
            return;
        }

        // Diğer bloklar (SERVIS_KUTUSU) - normal yerleştirme
        const newBlock = createPlumbingBlock(snappedPos.roundedX, snappedPos.roundedY, blockType);

        if (newBlock) {
            if (!state.plumbingBlocks) state.plumbingBlocks = [];
            state.plumbingBlocks.push(newBlock);
            geometryChanged = true;
            needsUpdate3D = true;
            objectJustCreated = true;

            setMode("select");
        }
    // --- Vana Çizim Modu (Boru Üzerinde) ---
    } else if (state.currentMode === "drawValve") {
        // Sadece boru üzerine tıklanırsa vana ekle
        const clickedPipe = getObjectAtPoint(pos);

        if (!clickedPipe || clickedPipe.type !== 'plumbingPipe') {
            console.warn('⚠️ Vana sadece boru üzerine eklenebilir');
            return;
        }

        const pipe = clickedPipe.object;
        console.log('🔧 Adding valve to pipe');

        // Borunun yönünü hesapla
        const dx = pipe.p2.x - pipe.p1.x;
        const dy = pipe.p2.y - pipe.p1.y;
        const pipeLength = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        // Tıklama noktasına en yakın noktayı borudan bul (p1'e göre uzaklık)
        const t = Math.max(0, Math.min(1,
            ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / (dx * dx + dy * dy)
        ));
        const valvePos = t * pipeLength; // p1'den uzaklık (cm)

        // Vana genişliği
        const valveWidth = PLUMBING_BLOCK_TYPES.VANA.width; // 12 cm

        // Vana için yer var mı kontrol et
        if (!isSpaceForValve(pipe, valvePos, valveWidth)) {
            console.warn('⚠️ Bu konumda vana için yeterli yer yok');
            return;
        }

        // Yeni vana nesnesi oluştur
        const newValve = {
            pos: valvePos,
            width: valveWidth,
            rotation: angle // Boru yönünü doğrudan ata
        };

        // Borunun valves dizisine ekle
        if (!pipe.valves) pipe.valves = [];
        pipe.valves.push(newValve);

        // İşlem başarılı
        geometryChanged = true;
        needsUpdate3D = true;
        objectJustCreated = true;

        console.log('✅ Valve added to pipe at position', valvePos);
        // setMode("select"); // Mod değiştirme, zincirleme vana eklemek için
    // --- Merdiven Çizim Modu ---
    } else if (state.currentMode === "drawStairs") {
     if (!state.startPoint) {
        // İlk tıklama: Başlangıç noktasını ayarla
        setState({ startPoint: { x: snappedPos.roundedX, y: snappedPos.roundedY } });
     } else {
         // İkinci tıklama: Merdiveni oluştur
         const p1 = state.startPoint;
         const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY };

         const deltaX = p2.x - p1.x;
         const deltaY = p2.y - p1.y;
         const absWidth = Math.abs(deltaX);
         const absHeight = Math.abs(deltaY);

         // Minimum boyuttan büyükse merdiveni oluştur
         if (absWidth > 10 && absHeight > 10) { // Minimum 10x10 cm
             const centerX = (p1.x + p2.x) / 2; // Merkez X
             const centerY = (p1.y + p2.y) / 2; // Merkez Y

             let width, height, rotation; // Boyutlar ve açı

             // Genişlik ve yüksekliği, çizilen dikdörtgenin yönüne göre ata
             if (absWidth >= absHeight) { // Yatay veya kare dikdörtgen
                 width = absWidth;  // Uzun kenar (merdiven uzunluğu) -> width
                 height = absHeight; // Kısa kenar (merdiven eni) -> height
                 rotation = (deltaX >= 0) ? 0 : 180; // Sağa (0 derece) veya sola (180 derece)
             } else { // Dikey dikdörtgen
                 width = absHeight; // Uzun kenar (merdiven uzunluğu) -> width
                 height = absWidth;  // Kısa kenar (merdiven eni) -> height
                 rotation = (deltaY >= 0) ? 90 : -90; // Aşağı (90 derece) veya yukarı (-90 derece)
             }

             // Ctrl tuşuna basılıp basılmadığını kontrol et (sahanlık için)
             const isLanding = currentModifierKeys.ctrl;

             // createStairs fonksiyonuna isLanding bilgisini gönder
             const newStairs = createStairs(centerX, centerY, width, height, rotation, isLanding);

             // state.stairs dizisi yoksa oluştur
             if (!state.stairs) {
                 state.stairs = [];
             }
             state.stairs.push(newStairs); // Yeni merdiveni ekle

             needsUpdate3D = true;     // 3D güncellemesi gerekiyor
             objectJustCreated = true; // Yeni nesne oluşturuldu
             geometryChanged = true;   // Geometri değişti, kaydet
         }
         // İkinci tıklamadan sonra başlangıç noktasını sıfırla ve seçimi kaldır
         setState({ startPoint: null, selectedObject: null });
     }
    // --- Tesisat Borusu Çizim Modu ---
    } else if (state.currentMode === "drawPlumbingPipe") {
        console.log('🚀 PIPE DRAWING MODE - Click registered:', { hasStartPoint: !!state.startPoint, pos });

        if (!state.startPoint) {
            // İlk tıklama: Başlangıç noktasını ayarla

            // ÖNCELİK 1: Projede boşta Servis Kutusu varsa onun çıkış noktasından başla
            const currentFloorId = state.currentFloor?.id;
            const blocks = (state.plumbingBlocks || []).filter(b =>
                b.floorId === currentFloorId && b.blockType === 'SERVIS_KUTUSU'
            );

            let startPos = null;

            // Eğer Servis Kutusu varsa ve hiç borusu yoksa
            if (blocks.length > 0) {
                const servKutusu = blocks[0];
                const connections = getConnectionPoints(servKutusu);

                // Servis kutusunun çıkış noktasından boru çıkıyor mu kontrol et
                const hasConnectedPipe = (state.plumbingPipes || []).some(p =>
                    Math.hypot(p.p1.x - connections[0].x, p.p1.y - connections[0].y) < 1 ||
                    Math.hypot(p.p2.x - connections[0].x, p.p2.y - connections[0].y) < 1
                );

                if (!hasConnectedPipe) {
                    // Servis kutusundan boru çıkmamışsa, çıkış noktasından başla
                    startPos = { x: connections[0].x, y: connections[0].y };
                    console.log('✅ Starting from Servis Kutusu connection point:', startPos);
                }
            }

            // ÖNCELİK 2: Boru ucuna snap (pipe endpoint)
            if (!startPos) {
                const pipeEndSnap = snapToPipeEndpoint(pos, 10);
                if (pipeEndSnap) {
                    startPos = { x: pipeEndSnap.x, y: pipeEndSnap.y };
                    console.log('✅ Starting from pipe endpoint:', startPos);
                }
            }

            // ÖNCELİK 3: Bağlantı noktasına snap
            if (!startPos) {
                const blockSnap = snapToConnectionPoint(pos, 10);
                if (blockSnap) {
                    startPos = { x: blockSnap.x, y: blockSnap.y };
                    console.log('✅ Starting from block connection point:', startPos);
                }
            }

            // ÖNCELİK 4: Boru üzerine tıklama (branch/dal oluşturma)
            if (!startPos) {
                const clickedPipe = getObjectAtPoint(pos);
                if (clickedPipe && clickedPipe.type === 'plumbingPipe') {
                    const pipe = clickedPipe.object;

                    // Tıklama noktasına en yakın noktayı borudan bul
                    const dx = pipe.p2.x - pipe.p1.x;
                    const dy = pipe.p2.y - pipe.p1.y;
                    const lengthSq = dx * dx + dy * dy;

                    if (lengthSq > 0.1) { // Boru yeterince uzunsa
                        const t = Math.max(0, Math.min(1,
                            ((pos.x - pipe.p1.x) * dx + (pos.y - pipe.p1.y) * dy) / lengthSq
                        ));
                        const splitX = pipe.p1.x + t * dx;
                        const splitY = pipe.p1.y + t * dy;

                        // Eğer boru ucuna çok yakınsa (10 cm), dal oluşturma (endpoint snap kullan)
                        const distToP1 = Math.hypot(splitX - pipe.p1.x, splitY - pipe.p1.y);
                        const distToP2 = Math.hypot(splitX - pipe.p2.x, splitY - pipe.p2.y);

                        if (distToP1 < 10 || distToP2 < 10) {
                            // Uç noktaya çok yakın, normal endpoint snap kullan
                            startPos = distToP1 < distToP2 ?
                                { x: pipe.p1.x, y: pipe.p1.y } :
                                { x: pipe.p2.x, y: pipe.p2.y };
                            console.log('✅ Starting from pipe endpoint (near click):', startPos);
                        } else {
                            // Boru ortasında, BORUYU BÖL ve dal oluştur
                            const originalP1 = { ...pipe.p1 };
                            const originalP2 = { ...pipe.p2 };
                            const splitPoint = { x: splitX, y: splitY };

                            // Orijinal borunun özelliklerini sakla
                            const pipeType = pipe.pipeType;
                            const pipeConfig = pipe.typeConfig;
                            const isConnected = pipe.isConnectedToValve;

                            // Orijinal boruyu sil
                            const pipeIndex = state.plumbingPipes.indexOf(pipe);
                            if (pipeIndex > -1) {
                                state.plumbingPipes.splice(pipeIndex, 1);
                            }

                            // İki yeni boru oluştur: p1->splitPoint ve splitPoint->p2
                            const pipe1 = createPlumbingPipe(originalP1.x, originalP1.y, splitX, splitY, pipeType);
                            const pipe2 = createPlumbingPipe(splitX, splitY, originalP2.x, originalP2.y, pipeType);

                            // Bağlantı durumunu koru
                            if (pipe1) {
                                pipe1.isConnectedToValve = isConnected;
                                // Orijinal p1 bağlantısını koru
                                if (pipe.connections?.start) {
                                    pipe1.connections.start = pipe.connections.start;
                                }
                                state.plumbingPipes.push(pipe1);
                            }

                            if (pipe2) {
                                pipe2.isConnectedToValve = isConnected;
                                // Orijinal p2 bağlantısını koru
                                if (pipe.connections?.end) {
                                    pipe2.connections.end = pipe.connections.end;
                                }
                                state.plumbingPipes.push(pipe2);
                            }

                            startPos = splitPoint;
                            console.log('✅ Pipe split at body, branch starting from:', startPos);
                            geometryChanged = true;
                            needsUpdate3D = true;
                        }
                    }
                }
            }

            // ÖNCELİK 5: Normal snapped pozisyon
            if (!startPos) {
                startPos = { x: snappedPos.roundedX, y: snappedPos.roundedY };
                console.log('✅ Start point set (normal):', startPos);
            }

            setState({ startPoint: startPos });
        } else {
            // İkinci tıklama: Boruyu oluştur
            const p1 = state.startPoint;
            const snap = snapToConnectionPoint(pos, 10);
            const p2 = snap ? { x: snap.x, y: snap.y } : { x: snappedPos.roundedX, y: snappedPos.roundedY };

            // Minimum uzunluk kontrolü (5 cm)
            const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            console.log('🔧 Creating pipe:', { p1, p2, length, minLength: 5 });

            if (length > 5) {
                const pipeType = state.currentPlumbingPipeType || 'STANDARD';
                const newPipe = createPlumbingPipe(p1.x, p1.y, p2.x, p2.y, pipeType);

                console.log('🔧 Pipe created:', newPipe);

                if (newPipe) {
                    // EXPLICIT CONNECTION TRACKING - p1 ve p2 için bağlantı bilgilerini kaydet
                    const startBlockSnap = snapToConnectionPoint(p1, 2); // 2 cm tolerans
                    if (startBlockSnap) {
                        // p1 bir bloğa bağlı
                        newPipe.connections.start = {
                            blockId: startBlockSnap.block,
                            connectionIndex: startBlockSnap.connectionIndex,
                            blockType: startBlockSnap.block.blockType
                        };
                        console.log('✅ P1 connected to', startBlockSnap.block.blockType, 'connection', startBlockSnap.connectionIndex);
                    }

                    const endBlockSnap = snapToConnectionPoint(p2, 2); // 2 cm tolerans
                    if (endBlockSnap) {
                        // p2 bir bloğa bağlı
                        newPipe.connections.end = {
                            blockId: endBlockSnap.block,
                            connectionIndex: endBlockSnap.connectionIndex,
                            blockType: endBlockSnap.block.blockType
                        };
                        console.log('✅ P2 connected to', endBlockSnap.block.blockType, 'connection', endBlockSnap.connectionIndex);
                    }

                    // Borunun bağlantı durumunu belirle (kesikli/düz çizgi için)
                    if (startBlockSnap &&
                        (startBlockSnap.block.blockType === 'SERVIS_KUTUSU' ||
                         startBlockSnap.block.blockType === 'VANA' ||
                         startBlockSnap.block.blockType === 'SAYAC')) {
                        newPipe.isConnectedToValve = true;
                        console.log('✅ Pipe starts from', startBlockSnap.block.blockType, '-> solid line');
                    } else {
                        // Veya önceki boru connected mıydı?
                        const prevPipe = state.plumbingPipes?.find(p =>
                            Math.hypot(p.p2.x - p1.x, p.p2.y - p1.y) < 1
                        );
                        if (prevPipe && prevPipe.isConnectedToValve) {
                            newPipe.isConnectedToValve = true;
                            console.log('✅ Pipe continues from connected pipe -> solid line');
                        } else {
                            newPipe.isConnectedToValve = false;
                            console.log('⚠️ Pipe not connected to source -> dashed line');
                        }
                    }

                    if (!state.plumbingPipes) state.plumbingPipes = [];
                    state.plumbingPipes.push(newPipe);
                    console.log('✅ Pipe added to state. Total pipes:', state.plumbingPipes.length);
                    geometryChanged = true;
                    needsUpdate3D = true;
                    objectJustCreated = true;
                } else {
                    console.error('❌ newPipe is null/undefined!');
                }
            } else {
                console.warn('⚠️ Pipe too short:', length, '< 5');
            }

            // Başlangıç noktasını tekrar ikinci tıklama pozisyonuna ayarla (zincirleme çizim)
            const nextSnap = snapToConnectionPoint(p2, 10);
            const nextStart = nextSnap ? { x: nextSnap.x, y: nextSnap.y } : p2;
            setState({ startPoint: nextStart });
        }
    // --- Menfez Çizim Modu ---
    } else if (state.currentMode === "drawVent") {
        let closestWall = null; let minDistSq = Infinity;
        const bodyHitTolerance = (state.wallThickness * 1.5)**2; // Duvar gövdesine tıklama toleransı
         // Tıklamaya en yakın duvarı bul
         for (const w of [...state.walls].reverse()) {
             if (!w.p1 || !w.p2) continue; // Geçersiz duvarı atla
             const distSq = distToSegmentSquared(pos, w.p1, w.p2); // Snaplenmemiş pozisyonu kullan
             // Tolerans içinde ve en yakınsa
             if (distSq < bodyHitTolerance && distSq < minDistSq) { minDistSq = distSq; closestWall = w; }
         }
         // Duvar bulunduysa
         if(closestWall) {
            const wallLen = Math.hypot(closestWall.p2.x - closestWall.p1.x, closestWall.p2.y - closestWall.p1.y);
            const ventWidth = 25; // Menfez genişliği (çapı)
            const ventMargin = 10; // Duvar uçlarına minimum mesafe
            // Duvar, menfez ve marjlar için yeterince uzunsa
            if (wallLen >= ventWidth + 2 * ventMargin) {
                 const dx = closestWall.p2.x - closestWall.p1.x; const dy = closestWall.p2.y - closestWall.p1.y;
                 // Tıklama noktasının duvar üzerindeki izdüşümünü bul (0-1 arası)
                 const t = Math.max(0, Math.min(1, ((pos.x - closestWall.p1.x) * dx + (pos.y - closestWall.p1.y) * dy) / (dx*dx + dy*dy) ));
                 const ventPos = t * wallLen; // Duvar üzerindeki pozisyon (cm)
                 // Pozisyon marjlar içinde kalıyorsa
                 if (ventPos >= ventWidth/2 + ventMargin && ventPos <= wallLen - ventWidth/2 - ventMargin) {
                     if (!closestWall.vents) closestWall.vents = []; // Menfez dizisi yoksa oluştur
                     // Çakışma kontrolü
                     let overlaps = false;
                     const newVentStart = ventPos - ventWidth / 2;
                     const newVentEnd = ventPos + ventWidth / 2;
                     // Diğer menfezlerle çakışıyor mu?
                     (closestWall.vents || []).forEach(existingVent => {
                          const existingStart = existingVent.pos - existingVent.width / 2;
                          const existingEnd = existingVent.pos + existingVent.width / 2;
                          // Aralıklar kesişiyorsa çakışma var
                          if (!(newVentEnd <= existingStart || newVentStart >= existingEnd)) { overlaps = true; }
                     });
                     // Diğer elemanlarla (kapı, pencere) çakışma kontrolü eklenebilir

                     // Çakışma yoksa menfezi ekle
                     if (!overlaps) {
                         closestWall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
                         geometryChanged = true; // Geometri değişti
                         objectJustCreated = true; // Yeni nesne oluşturuldu
                         needsUpdate3D = true; // Menfezler 3D'de gösteriliyor
                     }
                 }
             }
         }
         // Menfez ekledikten sonra seçimi kaldır
         setState({ selectedObject: null });
    // --- Simetri Modu ---
    } else if (state.currentMode === "drawSymmetry") {
        
        // --- DÜZELTME: Bekleyen önizleme timer'ını iptal et ---
        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
            setState({ symmetryPreviewTimer: null });
        }
        // --- DÜZELTME SONU ---

        if (!state.symmetryAxisP1) {
            // İlk tıklama: Eksenin başlangıç noktasını ayarla
            setState({
                symmetryAxisP1: { x: snappedPos.roundedX, y: snappedPos.roundedY }, // Snaplenmiş nokta
                symmetryAxisP2: null // İkinci noktayı temizle
            });
        } else {
            // İkinci tıklama: Simetri veya kopya işlemini uygula
            let axisP1 = state.symmetryAxisP1; // Eksenin başlangıcı
            let axisP2 = { x: snappedPos.roundedX, y: snappedPos.roundedY }; // Eksenin sonu (snaplenmiş)

            // Shift basılıysa ekseni 15 derecelik açılara snap yap
            if (currentModifierKeys.shift) {
                const dx = axisP2.x - axisP1.x;
                const dy = axisP2.y - axisP1.y;
                const distance = Math.hypot(dx, dy); // Eksen uzunluğu
                if (distance > 1) { // Çok kısaysa snap yapma
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI; // Mevcut açı (derece)
                    const snappedAngle = Math.round(angle / 15) * 15; // En yakın 15 derece katı
                    const snappedAngleRad = snappedAngle * Math.PI / 180; // Radyana çevir
                    // Yeni eksen bitiş noktasını hesapla
                    axisP2 = {
                        x: axisP1.x + distance * Math.cos(snappedAngleRad),
                        y: axisP1.y + distance * Math.sin(snappedAngleRad)
                    };
                }
            }

            // Eksen yeterince uzunsa işlemi yap
            const axisLength = Math.hypot(axisP2.x - axisP1.x, axisP2.y - axisP1.y);
            if (axisLength > 10) { // Minimum 10cm eksen uzunluğu
                // Ctrl basılıysa: Birebir kopya (applyCopy)
                // Değilse: Simetri al (applySymmetry)
                if (currentModifierKeys.ctrl) {
                    applyCopy(axisP1, axisP2);
                } else {
                    applySymmetry(axisP1, axisP2);
                }
                geometryChanged = true; // Geometri değişti
                needsUpdate3D = true;   // 3D güncellemesi gerekebilir
            }

            // Simetri modunu ve önizlemeyi temizle
            setState({
                symmetryAxisP1: null,
                symmetryAxisP2: null,
                symmetryPreviewElements: { // Önizleme elemanlarını boşalt
                    nodes: [], walls: [], doors: [], windows: [], vents: [],
                    columns: [], beams: [], stairs: [], rooms: []
                }
            });
            setMode("select"); // İşlem sonrası Seçim moduna dön
        }
    // --- YENİ EKLENDİ: Rehber Çizim Modları ---
    } else if (state.currentMode === "drawGuideAngular" || state.currentMode === "drawGuideFree") {
        
        // Simetri ile aynı timer'ı kullanabiliriz
        if (state.symmetryPreviewTimer) {
            clearTimeout(state.symmetryPreviewTimer);
            setState({ symmetryPreviewTimer: null });
        }

        if (state.startPoint) { // Bu ikinci tıklama
            const p1 = state.startPoint;
            const p2 = { x: snappedPos.roundedX, y: snappedPos.roundedY }; // Snaplenmiş pozisyonu kullan
            
            if (Math.hypot(p1.x - p2.x, p1.y - p2.y) > 1) { // Minimum uzunluk
                const subType = state.currentMode === "drawGuideAngular" ? 'angular' : 'free';
                
                if (!state.guides) state.guides = []; // guides dizisi yoksa oluştur
                state.guides.push({
                    type: 'guide',
                    subType: subType,
                    // p1 ve p2'nin referans değil, kopya olduğundan emin ol
                    p1: { x: p1.x, y: p1.y }, 
                    p2: { x: p2.x, y: p2.y }
                });
                
                geometryChanged = true; // saveState'i tetikler
            }
            
            // İkinci tıklamadan sonra modu sıfırla
            setState({ startPoint: null });
            setMode("select"); // Seçim moduna dön
        }
        // İlk tıklama (sağ tık menüsünden) zaten startPoint'i ayarlar
        // ve onPointerDownDraw'da (yukarıda) olduğu gibi tekrar ayarlanmaz.
    }
    // --- YENİ SONU ---


    // --- Son İşlemler ---

    // Eğer yeni bir nesne oluşturulduysa (ve mod 'select' değilse), seçimi temizle
    if (objectJustCreated && state.currentMode !== "select") {
        setState({ selectedObject: null });
    }

    // Geometri değiştiyse (yeni nesne eklendi, simetri/kopya yapıldı vb.) state'i kaydet
    if (geometryChanged) {
        saveState();
    }

    // 3D sahne güncellenmesi gerekiyorsa ve 3D görünüm aktifse, gecikmeli olarak güncelle
    if (needsUpdate3D && dom.mainContainer.classList.contains('show-3d')) {
        // Kısa bir gecikme ekleyerek state güncellemelerinin tamamlanmasını bekle
        setTimeout(update3DScene, 0);
    }
}