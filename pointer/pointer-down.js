// pointer-down.js
import { createColumn, onPointerDown as onPointerDownColumn, isPointInColumn } from '../architectural-objects/columns.js';
import { createBeam, onPointerDown as onPointerDownBeam } from '../architectural-objects/beams.js';
import { createStairs, onPointerDown as onPointerDownStairs, recalculateStepCount } from '../architectural-objects/stairs.js';
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

        // Silme modu (Sadece Alt tuşu basılıysa)
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
            setState({ isCtrlDeleting: true }); // Silme modunu başlat
            dom.p2d.style.cursor = 'crosshair'; // Silme cursor'ı ayarla
            return; // Başka işlem yapma
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
                 // Seçimi yap
                 setState({ selectedObject: clickedObject, selectedRoom: null }); // Oda seçimini temizle

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
                         } else if (clickedObject.handle === 'fov') {
                             // FOV üçgeninden yön döndürme
                             dragInfo = {
                                 startPointForDragging: pos,
                                 dragOffset: { x: 0, y: 0 },
                                 additionalState: {
                                     cameraHandle: 'fov',
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