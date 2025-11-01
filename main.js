// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/main.js
import { draw2D } from './draw2d.js';
import { init3D, renderer as renderer3d, camera as camera3d, controls as controls3d, update3DScene, scene as scene3d, updateKeyboardCameraControls } from './scene3d.js';
import { setupInputListeners } from './input.js';
import { setupUIListeners, initializeSettings, toggle3DView } from './ui.js';
import { saveState } from './history.js';
import { setupFileIOListeners } from './file-io.js';
import { createWallPanel } from './wall-panel.js';
import { fitDrawingToScreen } from './zoom.js'; // <-- BU SATIRI EKLEYİN

export const BG = "#1e1f20";
export const METER_SCALE = 1;
// export const WALL_THICKNESS = 20; // SABİT KALDIRILDI
export const WALL_HEIGHT = 270;
export const DOOR_HEIGHT = 220; // <-- DEĞİŞTİRİLDİ (220 -> 200)
export const WINDOW_BOTTOM_HEIGHT = 80; // <-- YENİ EKLENDİ
export const WINDOW_TOP_HEIGHT = 220; // <-- YENİ EKLENDİ
export const BATHROOM_WINDOW_BOTTOM_HEIGHT = 170;
export const BATHROOM_WINDOW_TOP_HEIGHT = 220; // 170 + 50
export const BATHROOM_WINDOW_DEFAULT_WIDTH = 50;
export const DRAG_HANDLE_RADIUS = 8;
export const EXTEND_RANGE = 500;
export const SNAP_UNLOCK_DISTANCE_CM = 10;
export const MAHAL_LISTESI = [
    'MAHAL','SAHANLIK','ODA','MUTFAK','SALON','YATAK ODASI','OTURMA ODASI','BANYO',
    'AÇIK BALKON','KAPALI BALKON','AÇIK SAHANLIK','ASANSÖR','KORİDOR','ANTRE','AÇIK MUTFAK',
    'ÇOCUK ODASI','YEMEK ODASI','ÇALIŞMA ODASI','DUBLEKS ANTRE','HOL','WC','LAVABO','OFİS',
    'DAİRE','KAZAN DAİRESİ','DÜKKAN','YAN BİNA','KİLER','DEPO','BAHÇE','AYDINLIK','GARAJ',
    'TERAS','BODRUM','AÇIK OTOPARK','KAPALI OTOPARK','BACA','AÇIK AYDINLIK','ÇATI ARASI',
    'YANGIN MERDİVENİ','TESİSAT ŞAFTI','SAYAÇ ODASI','SAYAÇ ŞAFTI','KURANGLEZ','SIĞINAK',
    'CİHAZ ODASI','HAVALANDIRMA','TOPRAK DOLGU','ÇAY OCAĞI','LOKANTA','KANTİN','YEMEKHANE',
    'KAHVEHANE','BAKKAL','MARKET','SINIF','REVİR','SPOR SALONU','MESCİD','CAMİ','OKUL',
    'SAĞLIK OCAĞI','MUAYENEHANE','İMALATHANE','FIRIN','KAFE','SHOWROOM','BEKLEME ODASI',
    'TOPLANTI ODASI','MAĞAZA','ENDÜSTRİYEL MUTFAK','BACA ŞAFTI','KÖMÜRLÜK','ARŞİV',
    'ISI MERKEZİ','FABRİKA','LABARATUVAR','TEKNİK HACİM','DANIŞMA','ATÖLYE'];

export let state = {
    currentMode: "drawRoom", // Başlangıç modu "Oda Çiz"
    lastUsedMode: "drawRoom", // Son kullanılan da "Oda Çiz"
    startPoint: null,
    nodes: [],
    walls: [],
    doors: [],
    rooms: [],
    columns: [],
    beams: [],
    stairs: [], // <-- YENİ SATIRI EKLEYİN
    clipboard: null, // <-- YENİ SATIR EKLE
    wallAdjacency: new Map(),
    selectedObject: null,
    selectedRoom: null,
    isDraggingRoomName: null,
    roomDragStartPos: null,
    roomOriginalCenter: null,
    dimensionMode: 1,
    zoom: 0.75,
    panOffset: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    isDragging: false,
    dragStartPoint: null,
    initialDragPoint: null,
    dragOffset: { x: 0, y: 0 },
    dragStartScreen: { x: 0, y: 0, pointerId: null },
    aDragOccurred: false,
    mousePos: {
        x: 0,
        y: 0,
        isSnapped: false,
        snapLines: { h_origins: [], v_origins: [] },
    },
    history: [],
    historyIndex: -1,
    isEditingLength: false,
    isStretchDragging: false,
    stretchMode: null,
    stretchWallOrigin: null,
    selectedGroup: [],
    affectedWalls: [],
    preDragWallStates: new Map(),
    preDragNodeStates: new Map(),
    dragWallInitialVector: null,
    dragAxis: null,
    dragOriginalNodes: null,
    roomToEdit: null,
    clickOutsideRoomPopupListener: null,
    wallBorderColor: "#ffffff",
    roomFillColor: "#232425",
    lineThickness: 2,
    wallThickness: 20, // YENİ: Duvar kalınlığı state'e taşındı
    drawingAngle: 0, // YENİ: Çizim açısı eklendi
    snapOptions: {
        endpoint: true,
        midpoint: true,
        endpointExtension: true,
        midpointExtension: false,
        nearestOnly: true,
    },
    isSnapLocked: false,
    lockedSnapPoint: null,
    gridOptions: {
        visible: true,
        spacing: 1,
        color: "#27292a",
        weight: 0.5,
    },
    dimensionOptions: {
        fontSize: 16,
        color: "#24ffda",
        defaultView: 1,
        showArea: 1,
        showOuter: 0,
    },
    isSweeping: false,
    sweepWalls: [],
    draggedRoomInfo: [],
    isCtrlDeleting: false,
    isStairPopupVisible: false,
    columnRotationOffset: null, // DÖNDÜRME İÇİN EKLENDİ
    tempNeighborWallsToDimension: null, // Komşu duvar ölçüleri için geçici Set
    symmetryAxisP1: null, // Simetri ekseninin ilk noktası
    symmetryAxisP2: null, // Simetri ekseninin ikinci noktası (mouse pozisyonu)
    symmetryPreviewElements: { // Önizleme elemanları
        nodes: [], walls: [], doors: [], windows: [], vents: [],
        columns: [], beams: [], stairs: [], rooms: []
    },
    symmetryPreviewTimer: null // <-- DÜZELTME: Kilitlenme sorununu çözmek için eklendi
};

export function setState(newState) {
    if (newState.isDragging === false) {
        newState.draggedRoomInfo = [];
    }
    state = { ...state, ...newState };
}

export const dom = {
    mainContainer: document.getElementById("main-container"),
    p2d: document.getElementById("p2d"),
    c2d: document.getElementById("c2d"),
    ctx2d: document.getElementById("c2d").getContext("2d"),
    p3d: document.getElementById("p3d"),
    c3d: document.getElementById("c3d"),
    bSel: document.getElementById("bSel"),
    bWall: document.getElementById("bWall"),
    bRoom: document.getElementById("bRoom"),
    bDoor: document.getElementById("bDoor"),
    bWindow: document.getElementById("bWindow"),
    bColumn: document.getElementById("bColumn"),
    bBeam: document.getElementById("bBeam"),
    bStairs: document.getElementById("bStairs"), // <-- YENİ SATIRI EKLEYİN
    lengthInput: document.getElementById("length-input"),
    bSave: document.getElementById("bSave"),
    bOpen: document.getElementById("bOpen"),
    fileInput: document.getElementById("file-input"),
    b3d: document.getElementById("b3d"),
    bFirstPerson: document.getElementById("bFirstPerson"),
    bAssignNames: document.getElementById("bAssignNames"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsPopup: document.getElementById("settings-popup"),
    closeSettingsPopupBtn: document.getElementById("close-settings-popup"),
    tabButtons: {
        general: document.getElementById("tab-btn-general"),
        grid: document.getElementById("tab-btn-grid"),
        snap: document.getElementById("tab-btn-snap"),
        dimension: document.getElementById("tab-btn-dimension"),
    },
    tabPanes: {
        general: document.getElementById("tab-pane-general"),
        grid: document.getElementById("tab-pane-grid"),
        snap: document.getElementById("tab-pane-snap"),
        dimension: document.getElementById("tab-pane-dimension"),
    },
    borderPicker: document.getElementById("borderPicker"),
    roomPicker: document.getElementById("roomPicker"),
    lineThicknessInput: document.getElementById("line-thickness"),
    wallThicknessInput: document.getElementById("wall-thickness"), // YENİ EKLENDİ
    drawingAngleInput: document.getElementById("drawing-angle"), // YENİ EKLENDİ
    gridVisibleInput: document.getElementById("grid-visible"),
    gridColorInput: document.getElementById("grid-color"),
    gridWeightInput: document.getElementById("grid-weight"),
    gridSpaceInput: document.getElementById("grid-space"),
    snapEndpointInput: document.getElementById("snap-endpoint"),
    snapMidpointInput: document.getElementById("snap-midpoint"),
    snapEndpointExtInput: document.getElementById("snap-endpoint-ext"),
    snapMidpointExtInput: document.getElementById("snap-midpoint-ext"),
    snapNearestOnlyInput: document.getElementById("snap-nearest-only"),
    dimensionFontSizeInput: document.getElementById("dimension-font-size"),
    dimensionColorInput: document.getElementById("dimension-color"),
    dimensionDefaultViewSelect: document.getElementById("dimension-default-view"),
    dimensionShowAreaSelect: document.getElementById("dimension-show-area"),
    dimensionShowOuterSelect: document.getElementById("dimension-show-outer"),
    roomNamePopup: document.getElementById("room-name-popup"),
    roomNameSelect: document.getElementById("room-name-select"),
    roomNameInput: document.getElementById("room-name-input"),
    splitter: document.getElementById("splitter"),
    bSymmetry: document.getElementById("bSymmetry"), // YENİ SATIR
    stairPopup: document.getElementById("stair-popup"),
    stairNameInput: document.getElementById("stair-name"),
    stairBottomElevationInput: document.getElementById("stair-bottom-elevation"),
    stairTopElevationInput: document.getElementById("stair-top-elevation"),
    stairWidthEditInput: document.getElementById("stair-width-edit"),
    stairConnectedStairSelect: document.getElementById("stair-connected-stair"),
    stairIsLandingCheckbox: document.getElementById("stair-is-landing"),
    stairShowRailingCheckbox: document.getElementById("stair-show-railing"), // <-- YENİ SATIR BURAYA EKLENECEK
    confirmStairPopupButton: document.getElementById("confirm-stair-popup"),
    cancelStairPopupButton: document.getElementById("cancel-stair-popup"),
};

// GÜNCELLENMİŞ setMode fonksiyonu
export function setMode(mode, forceSet = false) { // forceSet parametresi eklendi
    // Sadece zorla ayarlanmıyorsa ve seç modu değilse son kullanılanı güncelle
    if (!forceSet && mode !== "select") {
        setState({ lastUsedMode: mode });
    }

    // Eğer zorla ayarlama (forceSet) yoksa VE mevcut mod ile istenen mod aynıysa VE bu mod "select" değilse, "select" moduna geç (toggle).
    // Aksi halde (zorla ayarlama varsa VEYA modlar farklıysa VEYA istenen mod "select" ise), doğrudan istenen modu (mode) kullan.
    const newMode = (!forceSet && state.currentMode === mode && mode !== "select") ? "select" : mode;

    // --- DÜZELTME: Mod değiştiğinde simetri timer'ını iptal et ---
    if (newMode !== "drawSymmetry" && state.symmetryPreviewTimer) {
        clearTimeout(state.symmetryPreviewTimer);
        setState({ symmetryPreviewTimer: null });
    }
    // --- DÜZELTME SONU ---

    // State'i yeni mod ile güncelle (geri kalanı aynı)
    setState({
        currentMode: newMode,
        startPoint: null,
        selectedObject: null,
        selectedGroup: [],
        isDragging: false,

        symmetryAxisP1: null,
        symmetryAxisP2: null,
        symmetryPreviewElements: {
            nodes: [], walls: [], doors: [], windows: [], vents: [],
            columns: [], beams: [], stairs: [], rooms: []
        }
    });

    // Butonların 'active' durumunu güncelle (geri kalanı aynı)
    dom.bSel.classList.toggle("active", newMode === "select");
    dom.bWall.classList.toggle("active", newMode === "drawWall");
    dom.bRoom.classList.toggle("active", newMode === "drawRoom");
    dom.bDoor.classList.toggle("active", newMode === "drawDoor");
    dom.bWindow.classList.toggle("active", newMode === "drawWindow");
    dom.bColumn.classList.toggle("active", newMode === "drawColumn");
    dom.bBeam.classList.toggle("active", newMode === "drawBeam");
    dom.bStairs.classList.toggle("active", newMode === "drawStairs");
    dom.bSymmetry.classList.toggle("active", newMode === "drawSymmetry");
    dom.p2d.className = `panel ${newMode}-mode`;

}

export function resize() {
    const r2d = dom.p2d.getBoundingClientRect();
    dom.c2d.width = r2d.width;
    dom.c2d.height = r2d.height;

    const r3d = dom.p3d.getBoundingClientRect();
    if (r3d.width > 0 && r3d.height > 0 && camera3d && renderer3d) {
        camera3d.aspect = r3d.width / r3d.height;
        camera3d.updateProjectionMatrix();
        renderer3d.setPixelRatio(window.devicePixelRatio);
        renderer3d.setSize(r3d.width, r3d.height);
    }
}

let lastTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    // Delta time hesaplama (saniye cinsinden)
    const currentTime = performance.now();
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // YENİ: TWEEN animasyonlarını güncelle
    if (typeof TWEEN !== 'undefined') {
        TWEEN.update();
    }
    // YENİ SONU

    draw2D();

    if(dom.mainContainer.classList.contains('show-3d')) {
        // Klavye kamera kontrolleri güncelle
        updateKeyboardCameraControls(delta);

        // PointerLockControls'un update() metodu yok, sadece OrbitControls'da var
        if (controls3d && controls3d.update) {
            controls3d.update();
        }
        renderer3d.render(scene3d, camera3d);
    }
}

function assignRoomNames() {
    const unassignedRooms = state.rooms.filter(r => r.name === 'MAHAL');

    if (unassignedRooms.length > 0) {
        let roomsToAssign = [...unassignedRooms];
        let assignedNames = new Set(state.rooms.filter(r => r.name !== 'MAHAL').map(r => r.name));

        if (roomsToAssign.length > 0) {
            const antre = roomsToAssign.shift();
            antre.name = "ANTRE";
            assignedNames.add("ANTRE");
        }
        if (roomsToAssign.length > 0) {
            roomsToAssign.sort((a, b) => a.area - b.area);
            const bathroom = roomsToAssign.shift();
            bathroom.name = "BANYO";
            assignedNames.add("BANYO");
        }
        if (roomsToAssign.length > 0) {
            roomsToAssign.sort((a, b) => b.area - a.area);
            const livingRoom = roomsToAssign.shift();
            livingRoom.name = "SALON";
            assignedNames.add("SALON");
        }
        const otherRoomNames = ["MUTFAK", "YATAK ODASI", "OTURMA ODASI", "ÇOCUK ODASI"];
        for (const name of otherRoomNames) {
            if (roomsToAssign.length > 0 && !assignedNames.has(name)) {
                const room = roomsToAssign.shift();
                room.name = name;
                assignedNames.add(name);
            }
        }
        const remainingDefaultNames = MAHAL_LISTESI.filter(name => !assignedNames.has(name) && name !== 'MAHAL');
        roomsToAssign.forEach(room => {
            if (remainingDefaultNames.length > 0) {
                room.name = remainingDefaultNames.shift();
            }
        });

    } else {
        let availableNames = MAHAL_LISTESI.filter(name => name !== 'MAHAL');
        for (let i = availableNames.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableNames[i], availableNames[j]] = [availableNames[j], availableNames[i]];
        }

        state.rooms.forEach(room => {
            if (availableNames.length > 0) {
                room.name = availableNames.pop();
            } else {
                room.name = "ODA";
            }
        });
    }

    saveState();
}

// GÜNCELLENMİŞ initialize fonksiyonu
function initialize() {
    init3D(dom.c3d);
    initializeSettings();
    setupUIListeners();
    setupInputListeners();
    setupFileIOListeners();
    createWallPanel();

    dom.bSel.addEventListener("click", () => setMode("select", true)); // forceSet ekleyin
    dom.bWall.addEventListener("click", () => setMode("drawWall", true));
    dom.bRoom.addEventListener("click", () => setMode("drawRoom", true));
    dom.bDoor.addEventListener("click", () => setMode("drawDoor", true));
    dom.bWindow.addEventListener("click", () => setMode("drawWindow", true));
    dom.bColumn.addEventListener("click", () => setMode("drawColumn", true));
    dom.bBeam.addEventListener("click", () => setMode("drawBeam", true));
    dom.bStairs.addEventListener("click", () => setMode("drawStairs", true)); // forceSet ekleyin
    dom.bSymmetry.addEventListener("click", () => setMode("drawSymmetry", true)); // forceSet ekleyin
    
    dom.b3d.addEventListener("click", toggle3DView);
    dom.bAssignNames.addEventListener("click", assignRoomNames);

    window.addEventListener("resize", resize);

    // Başlangıç modunu zorla ayarla
    setMode(state.currentMode, true);

    resize();
    animate();
    setTimeout(fitDrawingToScreen, 100); // 100ms sonra fitDrawingToScreen'i çağır
    saveState();
}

initialize(); // Bu satır zaten dosyanın sonunda olmalı