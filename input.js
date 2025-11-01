// ahmedakbayir/ngcad/ngcad-e7feb4c0224e7a314687ae1c86e34cb9211a573d/input.js

import { state, setState, setMode, dom, EXTEND_RANGE } from './main.js'; // dom import edildiğinden emin olun
import { screenToWorld, getOrCreateNode, distToSegmentSquared, findNodeAt, isPointOnWallBody, snapTo15DegreeAngle } from './geometry.js'; // distToSegmentSquared ekleyin
import { splitWallAtMousePosition, processWalls } from './wall-processor.js'; // <-- splitWallAtMousePosition import edildi
import { undo, redo, saveState, restoreState } from './history.js';
import { startLengthEdit, cancelLengthEdit, showRoomNamePopup, hideRoomNamePopup, positionLengthInput, toggle3DFullscreen } from './ui.js';
import { onPointerDown } from './pointer-down.js';
import { onPointerMove } from './pointer-move.js';
import { onPointerUp } from './pointer-up.js';
import { getObjectAtPoint } from './actions.js';
// GÜNCELLENDİ: 3D tıklama için importlar eklendi
import { update3DScene, fit3DViewToScreen, scene, camera, renderer, sceneObjects, isFPSMode } from './scene3d.js';
import * as THREE from "three"; // YENİ
// --- YENİ İMPORTLAR ---
import { fitDrawingToScreen, onWheel } from './zoom.js'; // Fit to Screen ve onWheel zoom.js'den
import { wallExists } from './wall-handler.js';
// --- YENİ İMPORTLAR SONU ---
import { showWallPanel } from './wall-panel.js';
import { createColumn, isPointInColumn } from './columns.js'; // isPointInColumn eklendi
import { createBeam, isPointInBeam } from './beams.js'; // isPointInBeam eklendi
import { createStairs, recalculateStepCount, isPointInStair,getNextStairLetter} from './stairs.js'; // isPointInStair eklendi
import { showStairPopup } from './ui.js'; // showStairPopup import edildi

// Modifier tuşları için global state
export let currentModifierKeys = {
    ctrl: false,
    alt: false,
    shift: false
};

// function wallExists(p1, p2) {
//     return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
// }

function extendWallOnTabPress() {
    if (!state.startPoint || !state.mousePos) return;
    let dir = { x: state.mousePos.x - state.startPoint.x, y: state.mousePos.y - state.startPoint.y };
    const L = Math.hypot(dir.x, dir.y);
    if (L < 1) return;
    dir.x /= L; dir.y /= L;
    const rayEnd = { x: state.startPoint.x + dir.x * EXTEND_RANGE, y: state.startPoint.y + dir.y * EXTEND_RANGE };
    let bestIntersection = null;
    let minDistanceSq = EXTEND_RANGE * EXTEND_RANGE;
    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue; // Eklendi
        const p1 = state.startPoint, p2 = rayEnd, p3 = wall.p1, p4 = wall.p2;
        const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (d === 0) continue;
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
        if (t >= 0.0001 && t <= 1 && u >= 0 && u <= 1) {
            const intersectPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
            const distSq = (intersectPoint.x - state.startPoint.x) ** 2 + (intersectPoint.y - state.startPoint.y) ** 2;
            if (distSq < minDistanceSq) { minDistanceSq = distSq; bestIntersection = intersectPoint; }
        }
    }
    const finalEndPoint = bestIntersection ? bestIntersection : rayEnd;
    const endNode = getOrCreateNode(finalEndPoint.x, finalEndPoint.y);
    if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: state.wallThickness, wallType: 'normal' });
        setState({ startPoint: endNode });
        processWalls();
        saveState();
    }
}


// Kopyalama Fonksiyonu
function handleCopy(e) {
    if (!state.selectedObject && state.selectedGroup.length === 0) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement === dom.roomNameSelect) return; // roomNameSelect eklendi
    e.preventDefault();
    let dataToCopy = null;
    let referencePoint = null;

    if (state.selectedObject) {
        const obj = state.selectedObject.object;
        const type = state.selectedObject.type;
        if (type === 'column' || type === 'beam' || type === 'stairs' || type === 'wall') {
            dataToCopy = { type: type, items: [JSON.parse(JSON.stringify(obj))] };
            if (obj.center) referencePoint = { x: obj.center.x, y: obj.center.y };
            else if (type === 'wall' && obj.p1 && obj.p2) referencePoint = { x: (obj.p1.x + obj.p2.x) / 2, y: (obj.p1.y + obj.p2.y) / 2 };
        }
    } else if (state.selectedGroup.length > 0 && state.selectedGroup.every(item => item.type === 'wall')) {
        dataToCopy = { type: 'wallGroup', items: JSON.parse(JSON.stringify(state.selectedGroup)) };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.selectedGroup.forEach(wall => {
            if(wall.p1 && wall.p2){ minX = Math.min(minX, wall.p1.x, wall.p2.x); minY = Math.min(minY, wall.p1.y, wall.p2.y); maxX = Math.max(maxX, wall.p1.x, wall.p2.x); maxY = Math.max(maxY, wall.p1.y, wall.p2.y); }
        });
         if (minX !== Infinity) referencePoint = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    if (dataToCopy && referencePoint) {
        if (dataToCopy.type === 'wall' || dataToCopy.type === 'wallGroup') {
            dataToCopy.items.forEach(wall => { /* Koordinat kontrolü (opsiyonel) */ });
        }
        setState({ clipboard: { data: dataToCopy, ref: referencePoint } });
        console.log("Kopyalandı:", state.clipboard);
    } else {
         setState({ clipboard: null });
         console.log("Kopyalanamadı veya desteklenmiyor.");
    }
}

// Yapıştırma Fonksiyonu
function handlePaste(e) {
    if (!state.clipboard) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement === dom.roomNameSelect) return; // roomNameSelect eklendi
    e.preventDefault();
    const pastePos = state.mousePos;
    if (!pastePos) return;

    const { data, ref } = state.clipboard;
    const deltaX = pastePos.x - ref.x;
    const deltaY = pastePos.y - ref.y;
    let geometryChanged = false;

    if (data.type === 'column' || data.type === 'beam' || data.type === 'stairs') {
        const originalItem = data.items[0];
        const newItem = JSON.parse(JSON.stringify(originalItem));
        newItem.center.x += deltaX; newItem.center.y += deltaY;
        if (data.type === 'column') 
            state.columns.push(newItem);
        else if (data.type === 'beam') 
            state.beams.push(newItem);
        else if (data.type === 'stairs') {
            const originalItem = data.items[0];
            const newItem = JSON.parse(JSON.stringify(originalItem));
            newItem.center.x += deltaX;
            newItem.center.y += deltaY;
            // --- YENİ İSİM VE ID ATAMA ---
            newItem.name = getNextStairLetter(); // Yeni isim al
            newItem.id = `stair_${Date.now()}_${Math.random().toString(16).slice(2)}`; // Yeni ID oluştur
            newItem.connectedStairId = null; // Yapıştırılanın bağlantısını kaldır
            // --- ATAMA SONU ---
            state.stairs.push(newItem);
            setState({ selectedObject: { type: data.type, object: newItem, handle: 'body' }, selectedGroup: [] });
            geometryChanged = true;
        }
        setState({ selectedObject: { type: data.type, object: newItem, handle: 'body' }, selectedGroup: [] });
        geometryChanged = true;
    } else if (data.type === 'wall' || data.type === 'wallGroup') {
        const newNodesMap = new Map();
        const newWalls = [];
        const originalWalls = data.items;
        const uniqueOriginalNodeCoords = new Map();
         originalWalls.forEach(wall => {
             if(wall.p1?.x !== undefined) uniqueOriginalNodeCoords.set(JSON.stringify(wall.p1), wall.p1);
             if(wall.p2?.x !== undefined) uniqueOriginalNodeCoords.set(JSON.stringify(wall.p2), wall.p2);
         });
         uniqueOriginalNodeCoords.forEach((originalNode, nodeStr) => {
             const newNodeCoords = { x: originalNode.x + deltaX, y: originalNode.y + deltaY };
             const newNode = getOrCreateNode(newNodeCoords.x, newNodeCoords.y);
             newNodesMap.set(nodeStr, newNode);
         });
        originalWalls.forEach(originalWall => {
            const originalP1Str = JSON.stringify(originalWall.p1);
            const originalP2Str = JSON.stringify(originalWall.p2);
            const newP1 = newNodesMap.get(originalP1Str);
            const newP2 = newNodesMap.get(originalP2Str);
            if (newP1 && newP2 && newP1 !== newP2 && !wallExists(newP1, newP2)) {
                 const { p1, p2, ...wallProps } = originalWall;
                 // Kopyalanan duvarların kalınlık ve tipini koru
                const newWall = {
                    ...wallProps, // thickness ve wallType burada olmalı
                    type: 'wall',
                    p1: newP1,
                    p2: newP2,
                    windows: [], // Pencereleri kopyalama
                    vents: []    // Menfezleri kopyalama
                 };
                state.walls.push(newWall);
                newWalls.push(newWall);
                geometryChanged = true;
            }
        });
         if (newWalls.length > 0) setState({ selectedObject: null, selectedGroup: newWalls });
         else setState({ selectedObject: null, selectedGroup: [] });
    }
    if(geometryChanged){ processWalls(); saveState(); update3DScene(); }
}


function onKeyDown(e) {
    // Modifier tuşları
    if (e.key === 'Control') currentModifierKeys.ctrl = true;
    if (e.key === 'Alt') currentModifierKeys.alt = true;
    if (e.key === 'Shift') currentModifierKeys.shift = true;


    // --- Input alanı aktifse çoğu kısayolu engelleme mantığı ---
    const activeEl = document.activeElement;
    const isInputActive = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'; // SELECT eklendi
    const isSettingsPopupActive = activeEl.closest("#settings-popup");

    if (isInputActive || isSettingsPopupActive) {
        // Mahal ismi popup'ı için özel tuşlar (Enter, Escape, ArrowDown)
        if (activeEl === dom.roomNameInput || activeEl === dom.roomNameSelect) {
            // ui.js bu tuşları handle ediyor, biz burada engelleme yapmayalım
            // Ancak, aşağıdaki genel kısayolların çalışmaması için return KULLANILMAMALI
            // Eğer Enter, Esc, ArrowDown değilse, diğer kısayolları engellemek için return edelim
            if (!['Enter', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) { // ArrowUp eklendi
                // F tuşunu burada da engelle
                if (e.key.toLowerCase() === 'f') {
                        e.preventDefault(); // Tarayıcının varsayılan 'F' işlemini (Find) engelle

                        // 3D Ekran aktif mi kontrol et
                        if (dom.mainContainer.classList.contains('show-3d')) {
                            fit3DViewToScreen(); // 3D sığdırmayı çağır
                        } else {
                            fitDrawingToScreen(); // 2D sığdırmayı çağır
                        }
                        return; // Diğer kısayollarla çakışmasın
                    }
                // Ctrl+C/V'yi engelleme (input içinde çalışsın)
                if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v')) {
                    // Tarayıcının kendi kopyala/yapıştırına izin ver
                }
                // Diğer çoğu kısayolu engelle
                else if (e.key.length === 1 || (e.ctrlKey && ['z', 'y'].includes(e.key.toLowerCase()))) {
                     return;
                }
            }
        }
        // Length input için özel tuşlar (Escape, Enter)
        else if (activeEl === dom.lengthInput) {
            if (e.key === 'Escape') {
                cancelLengthEdit();
                return;
            } else if (e.key === 'Enter') {
                e.preventDefault();
                dom.lengthInput.blur();
                return;
            }
             // F tuşunu burada da engelle
             else if (e.key.toLowerCase() === 'f') {
                 e.preventDefault();
                 return;
             }
             // Ctrl+C/V'yi engelleme (input içinde çalışsın)
             else if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v')) {
                  // Tarayıcının kendi kopyala/yapıştırına izin ver
             }
            // Diğer harf/sayı olmayan kısayolları engelle
            else if (e.key.length > 1 && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                return;
            }
        }
        // Diğer input/settings alanları için (genel engelleme)
        else {
             // F tuşunu engelle
             if (e.key.toLowerCase() === 'f') {
                 e.preventDefault();
                 return;
             }
             // Ctrl+C/V'yi engelleme (input içinde çalışsın)
             if (e.ctrlKey && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v')) {
                 // Tarayıcının kendi kopyala/yapıştırına izin ver
             }
             // Diğer çoğu kısayolu engelle
             else if (e.key.length === 1 || (e.ctrlKey && ['z', 'y'].includes(e.key.toLowerCase())) || ['Escape', 'Delete', 'Backspace', 'Tab', 'Space'].includes(e.key)) {
                  return;
             }
        }
    }


    // --- Buradan sonrası, HİÇBİR input alanı aktif değilken çalışacak kısayollar ---

    // Fit to Screen ('F' tuşu)
    if (e.key.toLowerCase() === 'f') {
        e.preventDefault(); // Tarayıcının varsayılan 'F' işlemini (Find) engelle
        fitDrawingToScreen();
        return; // Diğer kısayollarla çakışmasın
    }

    // TAB ile duvar uzatma
    if (e.key === "Tab" && state.currentMode === "drawWall" && state.startPoint) {
        e.preventDefault();
        extendWallOnTabPress();
        return;
    }

    // Sayısal giriş ile boyut düzenleme
    if (state.selectedObject &&
        (state.selectedObject.type === "wall" || state.selectedObject.type === "door" || state.selectedObject.type === "window") &&
        !state.isEditingLength && /^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        startLengthEdit(e.key);
        return;
    }

    // Kopyala / Yapıştır (Input dışındayken)
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { handleCopy(e); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') { handlePaste(e); return; }


    // Geri Alma / İleri Alma
    if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }

    // Escape veya Space ile iptal/seç moduna dönme
    if (e.key === "Escape" || e.code === "Space") {
        if (e.code === "Space") e.preventDefault();

        // Mahal popup kontrolü ZATEN YUKARIDA yapıldığı için burada tekrar gerekmez.

        if (state.isEditingLength) cancelLengthEdit(); // Length input açıksa kapatır
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map() });
            restoreState(state.history[state.historyIndex]);
        } else {
            setState({ selectedObject: null, selectedGroup: [] });
        }
        setState({ startPoint: null });
        setMode("select");
    }

    // Delete veya Backspace ile silme
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
        e.preventDefault();
        let deleted = false;
        // ... (Silme mantığı - önceki gibi) ...
        if (state.selectedObject?.type === 'column') { state.columns = state.columns.filter(c => c !== state.selectedObject.object); deleted = true; }
        else if (state.selectedObject?.type === 'beam') { state.beams = state.beams.filter(b => b !== state.selectedObject.object); deleted = true; }
        else if (state.selectedObject?.type === 'stairs') { state.stairs = state.stairs.filter(s => s !== state.selectedObject.object); deleted = true; }
        else if (state.selectedObject) {
            if (state.selectedObject.type === "door") { setState({ doors: state.doors.filter((d) => d !== state.selectedObject.object) }); deleted = true; }
            else if (state.selectedObject.type === "window") { const wall = state.selectedObject.wall; if (wall?.windows) { wall.windows = wall.windows.filter(w => w !== state.selectedObject.object); deleted = true; } }
            else if (state.selectedObject.type === "vent") { const wall = state.selectedObject.wall; if (wall?.vents) { wall.vents = wall.vents.filter(v => v !== state.selectedObject.object); deleted = true; } }
            else if (state.selectedObject.type === "wall") { const wallsToDelete = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object]; const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w)); const newDoors = state.doors.filter((d) => d.wall && !wallsToDelete.includes(d.wall)); setState({ walls: newWalls, doors: newDoors }); deleted = true; }
        } else if (state.selectedGroup.length > 0) { const wallsToDelete = state.selectedGroup; const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w)); const newDoors = state.doors.filter((d) => d.wall && !wallsToDelete.includes(d.wall)); setState({ walls: newWalls, doors: newDoors }); deleted = true; }

        if (deleted) {
            setState({ selectedObject: null, selectedGroup: [] });
            processWalls(); saveState(); update3DScene();
        }
    }

    // Mod değiştirme kısayolları (FPS modundayken W/A/S/D engellenecek)
    const inFPSMode = isFPSMode();

    // F tuşu ile 3D fullscreen toggle
    if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (dom.mainContainer.classList.contains('show-3d')) {
            toggle3DFullscreen();
        }
    }

    if (e.key.toLowerCase() === "d" && !inFPSMode) { const newMode = (state.dimensionMode + 1) % 3; setState({ dimensionMode: newMode }); state.dimensionOptions.defaultView = newMode; dom.dimensionDefaultViewSelect.value = newMode; }
    if (e.key.toLowerCase() === "w" && !e.ctrlKey && !e.altKey && !e.shiftKey && !inFPSMode) setMode("drawWall");
    if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawRoom");
    if (e.key.toLowerCase() === "k" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawDoor");
    if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawWindow");
    if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawColumn");
    if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawBeam");
    if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.altKey && !e.shiftKey ) setMode("drawStairs");
    if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.altKey && !e.shiftKey && !inFPSMode) setMode("drawSymmetry"); // YENİ SATIR

}

function onKeyUp(e) {
    // Modifier tuşları
    if (e.key === 'Control') currentModifierKeys.ctrl = false;
    if (e.key === 'Alt') currentModifierKeys.alt = false;
    if (e.key === 'Shift') currentModifierKeys.shift = false;
     // Alt bırakıldığında silme modunu bitir
     if (e.key === 'Alt' && state.isCtrlDeleting) {
        setState({ isCtrlDeleting: false });
        saveState();
     }
}

// Fare tekerleği (zoom) - Artık zoom.js'den import ediliyor

// --- YENİ: 3D KAPI AÇMA MANTIĞI ---

// Animasyon döngüsünü başlat (Bu, TWEEN kütüphanesinin (index.html'e eklenmeli) çalışması için gereklidir)
function animateTweens(time) {
    requestAnimationFrame(animateTweens);
    TWEEN.update(time);
}
animateTweens();

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

/**
 * 3D Sahnedeki tıklamaları yönetir (Kapı açmak için)
 */
function on3DPointerDown(event) {
    // Sadece sol tıklama
    if (event.button !== 0) return;
    
    // Gerekli 3D nesneleri kontrol et
    if (!renderer || !camera || !sceneObjects) return;

    // Fare koordinatlarını normalize et (-1 to +1)
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycaster'ı ayarla
    raycaster.setFromCamera(mouse, camera);

    // Çarpışmaları bul (recursive = true, tüm alt objeleri de kontrol et)
    const intersects = raycaster.intersectObjects(sceneObjects.children, true);

    if (intersects.length > 0) {
        let clickedDoorGroup = null;
        let obj = intersects[0].object;

        // Tıkladığımız nesnenin en üstteki "door" grubunu bul
        // (scene3d.js'de kapı grubuna userData eklenmelidir)
        while (obj.parent) {
            // Not: scene3d.js'nin bu veriyi eklediğini varsayıyoruz:
            // doorGroup.userData = { type: 'door', doorObject: door };
            if (obj.userData?.type === 'door' && obj.userData?.doorObject) {
                clickedDoorGroup = obj;
                break;
            }
            if (obj.parent === sceneObjects || !obj.parent) break; // Ana gruba ulaştıysak dur
            obj = obj.parent;
        }

        if (clickedDoorGroup) {
            // console.log("Kapı tıklandı:", clickedDoorGroup.userData.doorObject);
            
            // Orijinal rotasyonu (eğer ayarlanmadıysa) kaydet
            if (clickedDoorGroup.userData.originalRotation === undefined) {
                 clickedDoorGroup.userData.originalRotation = clickedDoorGroup.rotation.y;
            }

            // Kapının zaten açık olup olmadığını veya animasyonda olup olmadığını kontrol et
            if (clickedDoorGroup.userData.isOpening || clickedDoorGroup.userData.isOpen) {
                // Kapatma animasyonu
                new TWEEN.Tween(clickedDoorGroup.rotation)
                    .to({ y: clickedDoorGroup.userData.originalRotation }, 1000) // 1 saniye
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .onStart(() => { clickedDoorGroup.userData.isOpening = true; })
                    .onComplete(() => {
                        clickedDoorGroup.userData.isOpening = false;
                        clickedDoorGroup.userData.isOpen = false;
                    })
                    .start();
            } else {
                // Açma animasyonu (90 derece = Math.PI / 2)
                // Not: Menteşe yönünü (pivot) scene3d.js'de ayarladığımızı varsayıyoruz
                // (scene3d.js'de doorGeom.translate(door.width / 2, ...) yapılmalı)
                const targetRotation = (clickedDoorGroup.userData.originalRotation || 0) + (Math.PI / 2 * 0.95); // 90 derece aç
                
                new TWEEN.Tween(clickedDoorGroup.rotation)
                    .to({ y: targetRotation }, 1000) // 1 saniye
                    .easing(TWEEN.Easing.Cubic.InOut)
                    .onStart(() => { clickedDoorGroup.userData.isOpening = true; })
                    .onComplete(() => {
                        clickedDoorGroup.userData.isOpening = false;
                        clickedDoorGroup.userData.isOpen = true;
                    })
                    .start();
            }
        }
    }
}
// --- 3D KAPI AÇMA MANTIĞI SONU ---


// Olay dinleyicilerini ayarlama
export function setupInputListeners() {
    const { p2d, c2d, c3d } = dom; // <-- c3d eklendi
    c2d.addEventListener("pointerdown", onPointerDown);
    p2d.addEventListener("pointermove", onPointerMove);
    p2d.addEventListener("pointerup", onPointerUp);
    
    // --- YENİ EKLENEN LİSTENER ---
    if (c3d) { // c3d'nin varlığını kontrol et
        c3d.addEventListener("pointerdown", on3DPointerDown);
    }
    // --- YENİ LİSTENER SONU ---

    c2d.addEventListener("dblclick", (e) => {
        e.preventDefault();
        const rect = dom.c2d.getBoundingClientRect();
        const clickPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const object = getObjectAtPoint(clickPos);

        if (object && (object.type === 'room' || object.type === 'roomName' || object.type === 'roomArea')) {
            showRoomNamePopup(object.object, e);
        } else if (object && object.type === 'wall' && object.handle === 'body') {
            // Duvar gövdesine çift tıklanırsa bölme işlemi yap
            splitWallAtClickPosition(clickPos); // <-- Pozisyonu parametre olarak gönder
        } else if (object && object.type === 'stairs') { // YENİ: Merdiven çift tıklama
            showStairPopup(object.object, e); // Merdiven popup'ını göster
        }
    });
    c2d.addEventListener("wheel", onWheel, { passive: false }); // onWheel'i zoom.js'den kullan
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const clickPos = screenToWorld(e.clientX - c2d.getBoundingClientRect().left, e.clientY - c2d.getBoundingClientRect().top);
        const object = getObjectAtPoint(clickPos);
        if (object && (object.type === 'room' || object.type === 'roomName')) {
            showRoomNamePopup(object.object, e);
        } else if (object && object.type === 'wall') {
            showWallPanel(object.object, e.clientX, e.clientY);
        } else {
            setState({ startPoint: null, isSnapLocked: false, lockedSnapPoint: null, selectedObject: null, selectedGroup: [] });
            setMode("select");
        }
    });
    p2d.addEventListener("pointerleave", (e) => {
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map() });
            if (state.history[state.historyIndex]) restoreState(state.history[state.historyIndex]);
        }
        if (state.isPanning) {
             setState({ isPanning: false });
             dom.p2d.classList.remove('panning'); // Pan sınıfını kaldır
        }
        if (state.isCtrlDeleting) {
             setState({ isCtrlDeleting: false });
             saveState();
        }
    });
    window.addEventListener("copy", handleCopy);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
}

// Duvar bölme (birleştirmesiz) - DÜZELTİLMİŞ
function splitWallAtClickPosition(clickPos) { // <-- Parametre ekledik
    const { walls } = state;
    if (state.currentMode !== 'select') return;

    let wallToSplit = null;
    let minDistSq = Infinity;
    const hitToleranceSq = (state.wallThickness * 1.5) ** 2;

    // clickPos'u kullan (mousePos yerine)
    for (const wall of walls) {
        if (!wall || !wall.p1 || !wall.p2) continue;
        const distSq = distToSegmentSquared(clickPos, wall.p1, wall.p2);
        if (distSq < hitToleranceSq && distSq < minDistSq) {
            minDistSq = distSq;
            wallToSplit = wall;
        }
    }

    if (!wallToSplit) {
        console.log("Bölünecek duvar bulunamadı"); // Debug için
        return;
    }

    const p1 = wallToSplit.p1, p2 = wallToSplit.p2;
    const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    if (l2 < 0.1) return;

    // clickPos'u kullan (mousePos yerine)
    let t = ((clickPos.x - p1.x) * (p2.x - p1.x) + (clickPos.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const splitPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };

    const MIN_SPLIT_DIST = 10;
    if (Math.hypot(splitPoint.x - p1.x, splitPoint.y - p1.y) < MIN_SPLIT_DIST ||
        Math.hypot(splitPoint.x - p2.x, splitPoint.y - p2.y) < MIN_SPLIT_DIST) {
        console.log("Bölme noktası duvar ucuna çok yakın"); // Debug için
        return;
    }

    console.log("Duvar bölünüyor:", splitPoint); // Debug için

    const splitNode = getOrCreateNode(splitPoint.x, splitPoint.y);
    const wallIndex = walls.indexOf(wallToSplit);
    if (wallIndex > -1) walls.splice(wallIndex, 1);

    const distToSplitNode = Math.hypot(splitNode.x - p1.x, splitNode.y - p1.y);

    // Orijinal duvar özelliklerini koru
    const wall_props = {
        thickness: wallToSplit.thickness || state.wallThickness,
        wallType: wallToSplit.wallType || 'normal'
    };

    const newWall1 = { type: "wall", p1: p1, p2: splitNode, ...wall_props, windows: [], vents: [] };
    const newWall2 = { type: "wall", p1: splitNode, p2: p2, ...wall_props, windows: [], vents: [] };

    // Kapıları aktar
    state.doors.forEach((door) => {
        if (door.wall === wallToSplit) {
            if (door.pos < distToSplitNode) {
                door.wall = newWall1;
            } else {
                door.wall = newWall2;
                door.pos -= distToSplitNode;
            }
        }
    });

    // Pencereleri aktar
    (wallToSplit.windows || []).forEach(window => {
        if (window.pos < distToSplitNode) {
            newWall1.windows.push(window);
        } else {
            window.pos -= distToSplitNode;
            newWall2.windows.push(window);
        }
    });

    // Menfezleri aktar
    (wallToSplit.vents || []).forEach(vent => {
        if (vent.pos < distToSplitNode) {
            newWall1.vents.push(vent);
        } else {
            vent.pos -= distToSplitNode;
            newWall2.vents.push(vent);
        }
    });

    walls.push(newWall1, newWall2);
    setState({ selectedObject: null });
    processWalls(true); // true = skipMerge (birleştirme yapma)
    saveState();
    update3DScene();

    console.log("Duvar başarıyla bölündü"); // Debug için
}   