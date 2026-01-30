// ahmedakbayir/ngcad/ngcad-25cb8b9daa7f201d20b7282862eee992cd9d77b2/general-files/input.js
// GÜNCELLENDİ: Çift CTRL iptal edildi, yerine CTRL + " (Terminal Kısayolu) eklendi.

import * as THREE from "three"; // YENİ
import { state, setState, setMode, dom, EXTEND_RANGE, isObjectInteractable } from './main.js'; // dom import edildiğinden emin olun
import { getObjectAtPoint } from './actions.js';
import { undo, redo, saveState, restoreState } from './history.js';
import { startLengthEdit, cancelLengthEdit, showStairPopup, showRoomNamePopup, hideRoomNamePopup, positionLengthInput, toggle3DFullscreen, toggle3DPerspective, toggleTheme } from './ui.js';
import { createStairs, recalculateStepCount, isPointInStair, getNextStairLetter } from '../architectural-objects/stairs.js'; // isPointInStair eklendi
import { createColumn, isPointInColumn } from '../architectural-objects/columns.js'; // isPointInColumn eklendi
import { createBeam, isPointInBeam } from '../architectural-objects/beams.js'; // isPointInBeam eklendi
import { screenToWorld, worldToScreen, getOrCreateNode, distToSegmentSquared, findNodeAt, isPointOnWallBody, snapTo15DegreeAngle } from '../draw/geometry.js'; // distToSegmentSquared ekleyin
import { showGuideContextMenu, hideGuideContextMenu } from '../menu/guide-menu.js';
import { fitDrawingToScreen, onWheel } from '../draw/zoom.js'; // Fit to Screen ve onWheel zoom.js'den
import { showWallPanel, hideWallPanel } from '../wall/wall-panel.js'; // <-- HIDEWALLPANEL EKLENDİ
import { copyFloorArchitecture, pasteFloorArchitecture } from '../menu/floor-operations-menu.js'; // <-- KAT MİMARİSİ KOPYALA/YAPIŞTIR
import { onPointerDownDraw as doorPointerDownDraw } from '../architectural-objects/door-handler.js'; // SAĞTIK İÇİN
import { onPointerDownDraw as windowPointerDownDraw } from '../architectural-objects/window-handler.js'; // SAĞTIK İÇİN
import { onPointerDown } from '../pointer/pointer-down.js';
import { onPointerMove } from '../pointer/pointer-move.js';
import { onPointerUp } from '../pointer/pointer-up.js';
import { isFPSMode } from '../scene3d/scene3d-camera.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { fit3DViewToScreen, scene, camera, renderer, sceneObjects } from '../scene3d/scene3d-core.js';
import { wallExists } from '../wall/wall-handler.js';
import { splitWallAtMousePosition, processWalls } from '../wall/wall-processor.js'; // <-- splitWallAtMousePosition import edildi
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';



// ... (dosyanın üst kısmı değişmedi: currentModifierKeys, extendWallOnTabPress, handleCopy, handlePaste) ...
export let currentModifierKeys = {
    ctrl: false,
    alt: false,
    shift: false
};

// Çift CTRL takibi için değişken
let lastCtrlPressTime = 0;

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
        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: state.wallThickness, wallType: 'normal', floorId: state.currentFloor?.id });
        setState({ startPoint: endNode });
        processWalls();
        saveState();
    }
}


// Kopyalama Fonksiyonu
function handleCopy(e) {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement === dom.roomNameSelect) return; // roomNameSelect eklendi

    // Tesisat nesneleri için plumbing manager'ın kendi handler'ını kullan
    if (state.selectedObject && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(state.selectedObject.type)) {
        e.preventDefault();
        return; // Plumbing handler devreye girecek
    }

    // Hiçbir obje seçili değilse, kat mimarisini kopyala
    if (!state.selectedObject && state.selectedGroup.length === 0) {
        e.preventDefault();
        copyFloorArchitecture();
        return;
    }

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
            if (wall.p1 && wall.p2) { minX = Math.min(minX, wall.p1.x, wall.p2.x); minY = Math.min(minY, wall.p1.y, wall.p2.y); maxX = Math.max(maxX, wall.p1.x, wall.p2.x); maxY = Math.max(maxY, wall.p1.y, wall.p2.y); }
        });
        if (minX !== Infinity) referencePoint = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    if (dataToCopy && referencePoint) {
        if (dataToCopy.type === 'wall' || dataToCopy.type === 'wallGroup') {
            dataToCopy.items.forEach(wall => { /* Koordinat kontrolü (opsiyonel) */ });
        }
        setState({ clipboard: { data: dataToCopy, ref: referencePoint } });
    } else {
        setState({ clipboard: null });
    }
}

// Yapıştırma Fonksiyonu
function handlePaste(e) {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement === dom.roomNameSelect) return; // roomNameSelect eklendi

    // Tesisat nesneleri için plumbing manager'ın kendi handler'ını kullan
    if (state.selectedObject && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(state.selectedObject.type)) {
        return; // Plumbing handler devreye girecek
    }

    // Plumbing manager'da kopyalanmış/kesilmiş tesisat parçası varsa, mimari paste yapma
    if (plumbingManager && plumbingManager.interactionManager &&
        (plumbingManager.interactionManager.copiedPipes || plumbingManager.interactionManager.cutPipes)) {
        return; // Plumbing handler devreye girecek
    }

    // Eğer clipboard boşsa, kat mimarisi yapıştırmayı dene
    if (!state.clipboard) {
        e.preventDefault();
        pasteFloorArchitecture();
        return;
    }

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
        // Aktif kata ata (önemli!)
        newItem.floorId = state.currentFloor?.id;
        if (data.type === 'column')
            state.columns.push(newItem);
        else if (data.type === 'beam')
            state.beams.push(newItem);
        else if (data.type === 'stairs') {
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
            if (wall.p1?.x !== undefined) uniqueOriginalNodeCoords.set(JSON.stringify(wall.p1), wall.p1);
            if (wall.p2?.x !== undefined) uniqueOriginalNodeCoords.set(JSON.stringify(wall.p2), wall.p2);
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
                const { p1, p2, windows, vents, ...wallProps } = originalWall;
                // Pencereleri ve menfezleri kopyala
                const newWindows = (windows || []).map(w => JSON.parse(JSON.stringify(w)));
                const newVents = (vents || []).map(v => JSON.parse(JSON.stringify(v)));
                // Kopyalanan duvarların tüm özelliklerini koru
                const newWall = {
                    ...wallProps, // thickness, wallType, isArc, arcControl1, arcControl2, floorId vb.
                    type: 'wall',
                    p1: newP1,
                    p2: newP2,
                    windows: newWindows, // Pencereleri kopyala
                    vents: newVents      // Menfezleri kopyala
                };
                state.walls.push(newWall);
                newWalls.push(newWall);
                geometryChanged = true;
            }
        });
        if (newWalls.length > 0) setState({ selectedObject: null, selectedGroup: newWalls });
        else setState({ selectedObject: null, selectedGroup: [] });
    }
    if (geometryChanged) { processWalls(); saveState(); update3DScene(); }
}


// Silme Fonksiyonu
// GÜNCELLENDİ: Boru silme (Heal) mantığı eklendi
export function handleDelete() {
    // Seçimi HEMEN yakala (blur olayından etkilenmemesi için)
    const selectedObjectSnapshot = state.selectedObject;
    const selectedGroupSnapshot = [...(state.selectedGroup || [])];

    
    if (!selectedObjectSnapshot && selectedGroupSnapshot.length === 0) {
        return;
    }

    let deleted = false;
    let isGuideDeleted = false;
    let isPlumbingV2Deleted = false; // Flag for v2 plumbing objects

    // Önce selectedGroup'u kontrol et (toplu silme)
    if (selectedGroupSnapshot.length > 0) {
        // Grup içindeki her nesneyi tipine göre sil
        selectedGroupSnapshot.forEach(item => {
            if (item.type === 'column') {
                state.columns = state.columns.filter(c => c !== item.object);
                deleted = true;
            } else if (item.type === 'beam') {
                state.beams = state.beams.filter(b => b !== item.object);
                deleted = true;
            } else if (item.type === 'stairs') {
                state.stairs = state.stairs.filter(s => s !== item.object);
                deleted = true;
            } else if (item.type === 'plumbingBlock') {
                state.plumbingBlocks = state.plumbingBlocks.filter(pb => pb !== item.object);
                deleted = true;
            } else if (item.type === 'plumbingPipe') {
                // --- YENİ: Toplu silme için "Heal" mantığı (Basitleştirilmiş: Sadece sil) ---
                // Toplu silmede heal yapmak çok karmaşık, şimdilik sadece silelim.
                state.plumbingPipes = state.plumbingPipes.filter(pp => pp !== item.object);
                deleted = true;
                // --- YENİ SONU ---
            } else if (item.type === 'door') {
                state.doors = state.doors.filter(d => d !== item.object);
                deleted = true;
            } else if (item.type === 'window') {
                if (item.wall && item.wall.windows) {
                    item.wall.windows = item.wall.windows.filter(w => w !== item.object);
                    deleted = true;
                }
            } else if (item.type === 'wall') {
                // Duvar silme için özel işlem (kapıları da sil)
                state.walls = state.walls.filter(w => w !== item.object);
                state.doors = state.doors.filter(d => d.wall !== item.object);
                deleted = true;
            }
        });
    }
    // Tek nesne seçimi varsa
    else if (selectedObjectSnapshot) {
        const objType = selectedObjectSnapshot.type;

        // Plumbing v2 nesneleri için (boru, servis kutusu, sayaç, vana, cihaz)
        if (objType === 'pipe' || objType === 'boru' || objType === 'servis_kutusu' || objType === 'sayac' || objType === 'vana' || objType === 'cihaz') {
            // plumbingManager v2'nin kendi silme mekanizmasını kullan
            const plumbingManager = window.plumbingManager;
            if (plumbingManager && plumbingManager.interactionManager) {
                plumbingManager.interactionManager.deleteSelectedObject();
                deleted = true;
                isPlumbingV2Deleted = true; // v2 already called saveState()
            }
        }
        else if (objType === 'column') {
            state.columns = state.columns.filter(c => c !== selectedObjectSnapshot.object);
            deleted = true;
        }
        else if (objType === 'beam') {
            state.beams = state.beams.filter(b => b !== selectedObjectSnapshot.object);
            deleted = true;
        }
        else if (objType === 'stairs') {
            state.stairs = state.stairs.filter(s => s !== selectedObjectSnapshot.object);
            deleted = true;
        }
        else if (objType === 'valve') {
            const pipe = selectedObjectSnapshot.pipe;
            const valve = selectedObjectSnapshot.object;
            if (pipe && pipe.valves) {
                pipe.valves = pipe.valves.filter(v => v !== valve);
                deleted = true;
            }
        }
        else if (objType === 'plumbingBlock') {
            state.plumbingBlocks = state.plumbingBlocks.filter(pb => pb !== selectedObjectSnapshot.object);
            deleted = true;
        }
        // --- YENİ: BORU SİLME VE "HEAL" MANTIĞI ---
        else if (objType === 'plumbingPipe') {
            const pipeToDelete = selectedObjectSnapshot.object;

            // Bağlantı "iyileştirme" (heal) mantığı
            const startConn = pipeToDelete.connections.start;
            const endConn = pipeToDelete.connections.end;

            let connectedPipeAtStart = null;
            let connectedPipeAtEnd = null;
            let startPointToConnect = null; // A'nın p2'si veya BlockA'nın cp'si
            let endPointToConnect = null; // C'nin p1'i veya BlockC'nin cp'si
            let pipeToModify = null; // C borusu (eğer varsa)
            let blockToModify = null; // A bloğu (eğer varsa)
            let pipeToModifyHandle = null; // A borusu (eğer varsa)

            const tolerance = 15; // 15 cm (bağlantı toleransı)

            // 1. Silinen borunun BAŞLANGICINA (p1) ne bağlı?
            if (startConn && startConn.blockId) {
                // Bir bloğa bağlı (BlockA)
                const blockA = state.plumbingBlocks.find(b => b.id === startConn.blockId);
                if (blockA) {
                    // v2'de connection points plumbingManager üzerinden alınmalı
                    startPointToConnect = pipeToDelete.p1;
                    blockToModify = startConn.blockId; // A Bloğu ID'si
                }
            } else {
                // Bir bloğa bağlı değil, başka bir boruya (PipeA.p2) mı bağlı?
                connectedPipeAtStart = (state.plumbingPipes || []).find(p =>
                    p !== pipeToDelete &&
                    (Math.hypot(p.p2.x - pipeToDelete.p1.x, p.p2.y - pipeToDelete.p1.y) < tolerance)
                );
                if (connectedPipeAtStart) {
                    startPointToConnect = connectedPipeAtStart.p2; // A'nın p2'si
                    pipeToModifyHandle = connectedPipeAtStart; // A Borusu
                }
            }

            // 2. Silinen borunun BİTİŞİNE (p2) ne bağlı?
            if (endConn && endConn.blockId) {
                // Bir bloğa bağlı (BlockC)
                const blockC = state.plumbingBlocks.find(b => b.id === endConn.blockId);
                if (blockC) {
                    // v2'de connection points plumbingManager üzerinden alınmalı
                    endPointToConnect = pipeToDelete.p2;
                }
                // (Eğer A da bloksa, hiçbir şey yapma, sadece boruyu sil)
            } else {
                // Bir bloğa bağlı değil, başka bir boruya (PipeC.p1) mı bağlı?
                connectedPipeAtEnd = (state.plumbingPipes || []).find(p =>
                    p !== pipeToDelete &&
                    (Math.hypot(p.p1.x - pipeToDelete.p2.x, p.p1.y - pipeToDelete.p2.y) < tolerance)
                );
                if (connectedPipeAtEnd) {
                    endPointToConnect = connectedPipeAtEnd.p1; // C'nin p1'i
                    pipeToModify = connectedPipeAtEnd; // C Borusu
                }
            }

            // 3. Durumları Değerlendir ve İyileştir (Heal)

            // Durum: PipeA -> pipeToDelete -> PipeC
            if (connectedPipeAtStart && connectedPipeAtEnd && startPointToConnect && pipeToModify) {
                // PipeC'nin p1'ini (endPointToConnect), PipeA'nın p2'sine (startPointToConnect) taşı
                pipeToModify.p1.x = startPointToConnect.x;
                pipeToModify.p1.y = startPointToConnect.y;
                // PipeC'nin 'start' bağlantısını PipeA'nın 'end' bağlantısına ayarla (eğer varsa)
                if (pipeToModify.connections) {
                    pipeToModify.connections.start = connectedPipeAtStart.connections.end;
                }
            }
            // Durum: BlockA -> pipeToDelete -> PipeC
            else if (blockToModify && connectedPipeAtEnd && startPointToConnect && pipeToModify) {
                // PipeC'nin p1'ini (endPointToConnect), BlockA'nın cp'sine (startPointToConnect) taşı
                pipeToModify.p1.x = startPointToConnect.x;
                pipeToModify.p1.y = startPointToConnect.y;
                // PipeC'nin 'start' bağlantısını BlockA olarak ayarla
                if (pipeToModify.connections) {
                    pipeToModify.connections.start = { ...startConn };
                }
            }
            // Durum: PipeA -> pipeToDelete -> BlockC
            else if (connectedPipeAtStart && endConn && startPointToConnect && endPointToConnect) {
                // PipeA'nın p2'sini (startPointToConnect), BlockC'nin cp'sine (endPointToConnect) taşı
                pipeToModifyHandle.p2.x = endPointToConnect.x;
                pipeToModifyHandle.p2.y = endPointToConnect.y;
                // PipeA'nın 'end' bağlantısını BlockC olarak ayarla
                if (pipeToModifyHandle.connections) {
                    pipeToModifyHandle.connections.end = { ...endConn };
                }
            }
            // Durum: BlockA -> pipeToDelete -> BlockC
            // (Hiçbir şey yapma, sadece boruyu sil)

            // 4. Boruyu sil
            state.plumbingPipes = state.plumbingPipes.filter(pp => pp !== pipeToDelete);
            deleted = true;
        }
        // --- BORU SİLME SONU ---
        else if (objType === 'guide') {
            state.guides = state.guides.filter(g => g !== selectedObjectSnapshot.object);
            deleted = true;
            isGuideDeleted = true;
        }
        else if (objType === "door") {
            state.doors = state.doors.filter((d) => d !== selectedObjectSnapshot.object);
            deleted = true;
        }
        else if (objType === "window") {
            const wall = selectedObjectSnapshot.wall;
            if (wall?.windows) {
                wall.windows = wall.windows.filter(w => w !== selectedObjectSnapshot.object);
                deleted = true;
            }
        }
        else if (objType === "vent") {
            const wall = selectedObjectSnapshot.wall;
            if (wall?.vents) {
                wall.vents = wall.vents.filter(v => v !== selectedObjectSnapshot.object);
                deleted = true;
            }
        }
        else if (objType === "wall") {
            state.walls = state.walls.filter((w) => w !== selectedObjectSnapshot.object);
            state.doors = state.doors.filter((d) => d.wall !== selectedObjectSnapshot.object);
            deleted = true;
        }
    }

    if (deleted) {
        state.selectedObject = null;
        state.selectedGroup = [];
        // processWalls() sadece rehber silindiyse çağrılmaz
        if (!isGuideDeleted) {
            processWalls();
        }
        // V2 plumbing objects already called saveState() in their delete handler
        if (!isPlumbingV2Deleted) {
            saveState();
        }
        update3DScene();
    } else {
    }
}

// ... (dosyanın kalanı değişmedi: onKeyDown, onKeyUp, on3DPointerDown, setupInputListeners, splitWallAtClickPosition) ...
function onKeyDown(e) {
    // Modifier tuşları
    if (e.key === 'Control') {
        currentModifierKeys.ctrl = true;

        /* --- ÇİFT CTRL MANTIĞI İPTAL EDİLDİ ---
        const now = Date.now();
        if (now - lastCtrlPressTime < 300) { 
            toggle3DPerspective(); 
            lastCtrlPressTime = 0; 
        } else {
            lastCtrlPressTime = now;
        }
        ------------------------- */
    }
    
    // YENİ EKLENEN KISAYOL: CTRL + " (veya Türkçe klavyede 'é' / Backquote)
    // VS Code'da terminal açma kısayolu: Ctrl + ` (Backquote)
    if (e.ctrlKey && (e.key === '"' || e.key === 'é' || e.code === 'Backquote' || e.key === '`')) {
         e.preventDefault();
         toggle3DPerspective();
         return;
    }

    if (e.key === 'Alt') currentModifierKeys.alt = true;
    if (e.key === 'Shift') currentModifierKeys.shift = true;


    // --- Input alanı aktifse çoğu kısayolu engelleme mantığı ---
    const activeEl = document.activeElement;
    const isInputActive = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT'; // SELECT eklendi
    const isSettingsPopupActive = activeEl.closest("#settings-popup");

    // --- YENİ EKLENDİ: Rehber menüsü de input sayılır ---
    const isGuideMenuActive = activeEl.closest("#guide-context-menu");
    if (isInputActive || isSettingsPopupActive || isGuideMenuActive) {
        // --- YENİ SONU ---

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
                // Ctrl+L - Tema değiştir (input içindeyken de çalışsın)
                if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                    e.preventDefault();
                    toggleTheme();
                    return;
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
            // Ctrl+L - Tema değiştir
            else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                toggleTheme();
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
            // Ctrl+L - Tema değiştir
            if (e.ctrlKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                toggleTheme();
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

    // Dark/Light Mode Toggle (Ctrl+L)
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        toggleTheme();
        return;
    }

    // TAB ile duvar uzatma veya kat değiştirme
    if (e.key === "Tab") {
        // Shift+Tab veya Ctrl+Shift+Tab ile kat değiştirme
        if (e.shiftKey) {
            e.preventDefault();

            // Görünür katları al ve sırala
            const visibleFloors = (state.floors || [])
                .filter(f => !f.isPlaceholder && f.visible !== false)
                .sort((a, b) => a.bottomElevation - b.bottomElevation);

            if (visibleFloors.length === 0) return;

            const currentIndex = visibleFloors.findIndex(f => f.id === state.currentFloor?.id);

            let newIndex;
            if (e.ctrlKey) {
                // Ctrl+Shift+Tab: Önceki kat (circular)
                newIndex = currentIndex <= 0 ? visibleFloors.length - 1 : currentIndex - 1;
            } else {
                // Shift+Tab: Sonraki kat (circular)
                newIndex = currentIndex >= visibleFloors.length - 1 ? 0 : currentIndex + 1;
            }

            setState({ currentFloor: visibleFloors[newIndex] });

            // Mini panel'i güncelle (eğer varsa)
            if (window.renderMiniPanel) window.renderMiniPanel();

            return;
        }
        // Tab ile duvar uzatma (sadece drawWall modundayken ve startPoint varsa)
        else if (state.currentMode === "drawWall" && state.startPoint) {
            e.preventDefault();
            extendWallOnTabPress();
            return;
        }
    }

    // Sayısal giriş ile boyut düzenleme
    if (state.selectedObject &&
        (state.selectedObject.type === "wall" || state.selectedObject.type === "door" || state.selectedObject.type === "window") &&
        !state.isEditingLength && /^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        startLengthEdit(e.key);
        return;
    }

    // Mahal (room) seçiliyken harf girişi ile filtreleme
    if (state.selectedRoom && /^[a-zA-ZçğıöşüÇĞİÖŞÜ]$/.test(e.key)) {
        e.preventDefault();
        const room = state.selectedRoom;
        // Get room center position (stored as array [x, y]) and convert to screen coordinates
        const centerX = room.center ? room.center[0] : 0;
        const centerY = room.center ? room.center[1] : 0;
        const screenPos = worldToScreen(centerX, centerY);
        // Create a synthetic event with screen position
        const syntheticEvent = { clientX: screenPos.x, clientY: screenPos.y };
        showRoomNamePopup(room, syntheticEvent, e.key);
        return;
    }

    // --- Yeni Tesisat Sistemi (v2) Klavye İşlemleri ---
    // PlumbingV2, Select, MİMARİ-TESİSAT modlarında VEYA tesisat nesnesi seçiliyse
    // CTRL+C/V için önce plumbing handler'ını kontrol et
    if (state.currentMode === "plumbingV2" || state.currentMode === "select" || state.currentMode === "MİMARİ-TESİSAT" ||
        (state.selectedObject && ['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'].includes(state.selectedObject.type))) {
        const handled = plumbingManager.interactionManager.handleKeyDown(e);
        if (handled) {
            return;
        }
    }
    // --- Yeni Tesisat Sistemi Sonu ---

    // Kopyala / Yapıştır (Input dışındayken)
    if (e.ctrlKey && e.key.toLowerCase() === 'c') { handleCopy(e); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'v') { handlePaste(e); return; }


    // Geri Alma / İleri Alma
    if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }

    // Escape veya Space ile iptal/seç moduna dönme
    if (e.key === "Escape" || e.code === "Space") {
        if (e.code === "Space") e.preventDefault();

        // Settings popup açıksa kapat
        if (dom.settingsPopup.style.display === 'block') {
            dom.settingsPopup.style.display = 'none';
            return;
        }

        // Mahal popup kontrolü ZATEN YUKARIDA yapıldığı için burada tekrar gerekmez.

        if (state.isEditingLength) cancelLengthEdit(); // Length input açıksa kapatır
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map(), preDragNodeStates: new Map() });
            restoreState(state.history[state.historyIndex]);
        } else {
            setState({ selectedObject: null, selectedGroup: [] });
        }
        setState({ startPoint: null });

        // v2 plumbing seçimini de temizle
        if (plumbingManager.interactionManager) {
            plumbingManager.interactionManager.cancelCurrentAction();
        }

        setMode("select");
    }

    // Delete veya Backspace ile silme
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
        e.preventDefault();
        handleDelete();
    }

    // Ok tuşları ile seçili nesneleri hareket ettirme (1cm artışlarla)
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Tek nesne veya grup seçimi kontrolü
        const hasSelection = state.selectedGroup.length > 0 ||
            (state.selectedObject && ['column', 'beam', 'stairs', 'door', 'window', 'plumbingBlock', 'plumbingPipe'].includes(state.selectedObject.type));

        if (!hasSelection) return; // Hiç seçili nesne yoksa çık

        e.preventDefault();

        const MOVE_STEP = 1; // 1 cm hareket miktarı
        let deltaX = 0, deltaY = 0;

        // Hareket yönünü belirle
        if (e.key === 'ArrowUp') deltaY = -MOVE_STEP;
        else if (e.key === 'ArrowDown') deltaY = MOVE_STEP;
        else if (e.key === 'ArrowLeft') deltaX = -MOVE_STEP;
        else if (e.key === 'ArrowRight') deltaX = MOVE_STEP;

        // Grup seçimi varsa, tüm grup nesnelerini hareket ettir
        if (state.selectedGroup.length > 0) {
            state.selectedGroup.forEach(selectedItem => {
                const obj = selectedItem.object;

                if (selectedItem.type === 'column' && obj.center) {
                    obj.center.x += deltaX;
                    obj.center.y += deltaY;
                } else if (selectedItem.type === 'beam' && obj.center) {
                    obj.center.x += deltaX;
                    obj.center.y += deltaY;
                } else if (selectedItem.type === 'stairs' && obj.center) {
                    obj.center.x += deltaX;
                    obj.center.y += deltaY;
                } else if (selectedItem.type === 'plumbingBlock' && obj.center) {
                    obj.center.x += deltaX;
                    obj.center.y += deltaY;
                } else if (selectedItem.type === 'plumbingPipe' && obj.p1 && obj.p2) {
                    obj.p1.x += deltaX;
                    obj.p1.y += deltaY;
                    obj.p2.x += deltaX;
                    obj.p2.y += deltaY;
                } else if (selectedItem.type === 'door' && obj.wall) {
                    // Kapı için: mevcut pozisyonunu hesapla, hareket ettir, yeni pos'u bul
                    const wall = obj.wall;
                    if (wall.p1 && wall.p2) {
                        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (wallLen > 0.1) {
                            const dx = (wall.p2.x - wall.p1.x) / wallLen;
                            const dy = (wall.p2.y - wall.p1.y) / wallLen;
                            // Mevcut merkez
                            let centerX = wall.p1.x + dx * obj.pos;
                            let centerY = wall.p1.y + dy * obj.pos;
                            // Hareket ettir
                            centerX += deltaX;
                            centerY += deltaY;
                            // Yeni pos'u hesapla (duvara izdüşüm)
                            const newPos = Math.max(obj.width / 2, Math.min(wallLen - obj.width / 2,
                                ((centerX - wall.p1.x) * dx + (centerY - wall.p1.y) * dy)));
                            obj.pos = newPos;
                        }
                    }
                } else if (selectedItem.type === 'window' && selectedItem.wall) {
                    // Pencere için: wall referansı selectedItem içinde
                    const wall = selectedItem.wall;
                    if (wall.p1 && wall.p2) {
                        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        if (wallLen > 0.1) {
                            const dx = (wall.p2.x - wall.p1.x) / wallLen;
                            const dy = (wall.p2.y - wall.p1.y) / wallLen;
                            // Mevcut merkez
                            let centerX = wall.p1.x + dx * obj.pos;
                            let centerY = wall.p1.y + dy * obj.pos;
                            // Hareket ettir
                            centerX += deltaX;
                            centerY += deltaY;
                            // Yeni pos'u hesapla (duvara izdüşüm)
                            const newPos = Math.max(obj.width / 2, Math.min(wallLen - obj.width / 2,
                                ((centerX - wall.p1.x) * dx + (centerY - wall.p1.y) * dy)));
                            obj.pos = newPos;
                        }
                    }
                }
            });
        }
        // Tek nesne seçimi varsa, sadece onu hareket ettir
        else if (state.selectedObject) {
            const obj = state.selectedObject.object;
            const type = state.selectedObject.type;

            if (obj && obj.center && ['column', 'beam', 'stairs', 'plumbingBlock'].includes(type)) {
                obj.center.x += deltaX;
                obj.center.y += deltaY;
            } else if (type === 'plumbingPipe' && obj.p1 && obj.p2) {
                obj.p1.x += deltaX;
                obj.p1.y += deltaY;
                obj.p2.x += deltaX;
                obj.p2.y += deltaY;
            } else if (type === 'door' && obj.wall) {
                // Kapı için
                const wall = obj.wall;
                if (wall.p1 && wall.p2) {
                    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                    if (wallLen > 0.1) {
                        const dx = (wall.p2.x - wall.p1.x) / wallLen;
                        const dy = (wall.p2.y - wall.p1.y) / wallLen;
                        let centerX = wall.p1.x + dx * obj.pos;
                        let centerY = wall.p1.y + dy * obj.pos;
                        centerX += deltaX;
                        centerY += deltaY;
                        const newPos = Math.max(obj.width / 2, Math.min(wallLen - obj.width / 2,
                            ((centerX - wall.p1.x) * dx + (centerY - wall.p1.y) * dy)));
                        obj.pos = newPos;
                    }
                }
            } else if (type === 'window' && state.selectedObject.wall) {
                // Pencere için
                const wall = state.selectedObject.wall;
                if (wall.p1 && wall.p2) {
                    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                    if (wallLen > 0.1) {
                        const dx = (wall.p2.x - wall.p1.x) / wallLen;
                        const dy = (wall.p2.y - wall.p1.y) / wallLen;
                        let centerX = wall.p1.x + dx * obj.pos;
                        let centerY = wall.p1.y + dy * obj.pos;
                        centerX += deltaX;
                        centerY += deltaY;
                        const newPos = Math.max(obj.width / 2, Math.min(wallLen - obj.width / 2,
                            ((centerX - wall.p1.x) * dx + (centerY - wall.p1.y) * dy)));
                        obj.pos = newPos;
                    }
                }
            }
        }

        // Değişiklikleri kaydet ve 3D sahneyi güncelle
        processWalls(); // Duvar elemanları değiştiğinde processWalls çağır
        saveState();
        if (dom.mainContainer.classList.contains('show-3d')) {
            update3DScene();
        }
        return;
    }

    // Mod değiştirme kısayolları (FPS modundayken W/A/S/D engellenecek)
    const inFPSMode = isFPSMode();

    // F tuşu ile 3D fullscreen toggle
    if (e.key.toLowerCase() === "f" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (dom.mainContainer.classList.contains('show-3d')) {
            e.preventDefault();
            toggle3DFullscreen();
        }
    }

    if (e.key.toLowerCase() === "d" && !inFPSMode) { const newMode = (state.dimensionMode + 1) % 3; setState({ dimensionMode: newMode }); state.dimensionOptions.defaultView = newMode; dom.dimensionDefaultViewSelect.value = newMode; }
    if (e.key.toLowerCase() === "w" && !e.ctrlKey && !e.altKey && !e.shiftKey && !inFPSMode) setMode("drawWall");
    if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.altKey && !e.shiftKey) setMode("drawRoom");
    if (e.key.toLowerCase() === "p" && !e.ctrlKey && !e.altKey && !e.shiftKey) setMode("drawWindow");
    if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.altKey && !e.shiftKey) setMode("drawColumn");
    if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.altKey && !e.shiftKey) setMode("drawBeam");
    if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.altKey && !e.shiftKey) setMode("drawStairs");
    if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        plumbingManager.startPipeMode(); // Boru çizim aracını başlat
        setMode("plumbingV2", true); // UI'yı güncelle (ikonu aktif et)
    }
    // S tuşu artık sayaç eklemek için kullanılıyor (interaction-manager.js'de)
    // if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.altKey && !e.shiftKey && !inFPSMode) setMode("drawSymmetry");

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
    if (window.IS_DEBUG_MODE) return;
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

        console.log('🔍 DOUBLE-CLICK EVENT:', {
            clickPos,
            object,
            type: object?.type,
            handle: object?.handle,
            interactable: object ? isObjectInteractable(object.type) : null
        });

        // Nesneye çift tıklama için interaktif olup olmadığını kontrol et
        if (object && !isObjectInteractable(object.type)) {
            // TESİSAT modunda mimari nesnelere çift tıklanamaz
            console.warn('⚠️ Object not interactable:', object.type);
            return;
        }

        if (object && (object.type === 'room' || object.type === 'roomName' || object.type === 'roomArea')) {
            showRoomNamePopup(object.object, e);
        } else if (object && object.type === 'wall' && object.handle === 'body') {
            // Duvar gövdesine çift tıklanırsa bölme işlemi yap
            splitWallAtClickPosition(clickPos); // <-- Pozisyonu parametre olarak gönder
        } else if (object && object.type === 'stairs') { // YENİ: Merdiven çift tıklama
            showStairPopup(object.object, e); // Merdiven popup'ını göster
        } else if (object && object.type === 'plumbingPipe' && object.handle === 'body') {
            // Boru gövdesine çift tıklanırsa bölme işlemi yap
            splitPipeAtClickPosition(object.object, clickPos);
        } else if (object && object.type === 'baca' && object.handle === 'body') {
            // Baca gövdesine çift tıklanırsa bölme işlemi yap
            console.log('🔥 BACA DOUBLE-CLICK DETECTED!', object);
            splitChimneyAtClickPosition(object.object, clickPos);
        }
    });
    c2d.addEventListener("wheel", onWheel, { passive: false }); // onWheel'i zoom.js'den kullan
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const rect = c2d.getBoundingClientRect();
        const clickPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const object = getObjectAtPoint(clickPos);

        if (object && !isObjectInteractable(object.type)) {
            return;
        }
        // drawDoor modundayken sağ tıklanırsa kapı ekle (sadece duvara)
        if (state.currentMode === 'drawDoor') {
            doorPointerDownDraw(clickPos, object);
            return;
        }

        // drawWindow modundayken sağ tıklanırsa pencere ekle (sadece duvara)
        if (state.currentMode === 'drawWindow') {
            windowPointerDownDraw(clickPos, object);
            return;
        }

        // Diğer tüm popupları/menüleri kapat
        hideRoomNamePopup();
        hideWallPanel();
        hideGuideContextMenu();

        if (object && (object.type === 'room' || object.type === 'roomName')) {
            showRoomNamePopup(object.object, e);
        } else if (object && object.type === 'wall') {
            showWallPanel(object.object, e.clientX, e.clientY);
        } else if (object && object.type === 'stairs') {
            showStairPopup(object.object, e); // Merdiven sağ tık
        } else if (!object) {
            if (state.currentDrawingMode === 'TESİSAT') {
                return;
            }
            // Boş alana tıklandı
            showGuideContextMenu(e.clientX, e.clientY, clickPos);
        } else {
            // Diğer nesneler (kolon, kiriş, rehber vb.)
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

    // ALT+TAB stuck state fix: Window focus kaybolduğunda state'i temizle
    window.addEventListener("blur", () => {

        // Tüm modifier key'leri resetle
        currentModifierKeys.ctrl = false;
        currentModifierKeys.alt = false;
        currentModifierKeys.shift = false;

        // Dragging state'i temizle
        if (state.isDragging) {
            setState({
                isDragging: false,
                isStretchDragging: false,
                affectedWalls: [],
                preDragWallStates: new Map(),
                preDragNodeStates: new Map()
            });
            if (state.history[state.historyIndex]) restoreState(state.history[state.historyIndex]);
        }

        // Panning state'i temizle
        if (state.isPanning) {
            setState({ isPanning: false });
            dom.p2d.classList.remove('panning');
        }

        // Delete mode'u temizle
        if (state.isCtrlDeleting) {
            setState({ isCtrlDeleting: false });
            dom.p2d.style.cursor = '';
        }

        // Cursor'u resetle
        if (dom.p2d) {
            dom.p2d.style.cursor = '';
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
        return;
    }


    const splitNode = getOrCreateNode(splitPoint.x, splitPoint.y);
    const wallIndex = walls.indexOf(wallToSplit);
    if (wallIndex > -1) walls.splice(wallIndex, 1);

    const distToSplitNode = Math.hypot(splitNode.x - p1.x, splitNode.y - p1.y);

    // Orijinal duvar özelliklerini koru
    const wall_props = {
        thickness: wallToSplit.thickness || state.wallThickness,
        wallType: wallToSplit.wallType || 'normal',
        floorId: wallToSplit.floorId
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

}

// Boru bölme
// Boru bölme fonksiyonunu güncelleyin
function splitPipeAtClickPosition(pipeToSplit, clickPos) {
    if (!pipeToSplit || !pipeToSplit.p1 || !pipeToSplit.p2) {
        return;
    }

    const MIN_SPLIT_DIST = 10;
    const distToP1 = Math.hypot(clickPos.x - pipeToSplit.p1.x, clickPos.y - pipeToSplit.p1.y);
    const distToP2 = Math.hypot(clickPos.x - pipeToSplit.p2.x, clickPos.y - pipeToSplit.p2.y);

    if (distToP1 < MIN_SPLIT_DIST || distToP2 < MIN_SPLIT_DIST) {
        return;
    }

    if (window.plumbingManager && window.plumbingManager.interactionManager) {
        // ✨ BURASI DEĞİŞTİ: false parametresi ile çizim modunu engelliyoruz
        window.plumbingManager.interactionManager.handlePipeSplit(pipeToSplit, clickPos, false);

        setState({ selectedObject: null });
    }
}

// Baca bölme fonksiyonu
function splitChimneyAtClickPosition(chimneyToSplit, clickPos) {
    console.log('🔥 splitChimneyAtClickPosition called', {
        chimney: chimneyToSplit,
        clickPos,
        segments: chimneyToSplit?.segments?.length
    });

    if (!chimneyToSplit || !chimneyToSplit.segments || chimneyToSplit.segments.length === 0) {
        console.warn('⚠️ Baca bölme iptal - geçersiz baca veya segment yok');
        return;
    }

    // Bacayı böl
    const result = chimneyToSplit.splitAt(clickPos);
    console.log('🔥 splitAt result:', result);

    if (result) {
        console.log('✅ Baca başarıyla bölündü:', result);
        // Başarılı bölme - render'ı güncelle
        requestRender();
        setState({ selectedObject: null });

        // Undo/redo için kaydet
        if (window.undoRedoManager) {
            window.undoRedoManager.recordState();
        }
    } else {
        console.warn('❌ Baca bölme başarısız - splitAt null döndü');
    }
}