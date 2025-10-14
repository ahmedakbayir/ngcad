import { draw2D } from './draw2d.js';
import { init3D, renderer as renderer3d, camera as camera3d, controls as controls3d, update3DScene, scene as scene3d } from './scene3d.js';
import { setupInputListeners } from './input.js';
import { setupUIListeners, initializeSettings, toggle3DView } from './ui.js';
import { saveState } from './history.js';
import { setupFileIOListeners } from './file-io.js';
import { createWallPanel } from './wall-panel.js';

export const BG = "#1e1f20";
export const METER_SCALE = 1;
export const WALL_THICKNESS = 20;
export const WALL_HEIGHT = 270;
export const DOOR_HEIGHT = 220;
export const DRAG_HANDLE_RADIUS = 8;
export const EXTEND_RANGE = 500;
export const SNAP_UNLOCK_DISTANCE_CM = 10;
export const MAHAL_LISTESI = [
    'MAHAL', 'ODA', 'MUTFAK', 'AÇIK MUTFAK', 'SALON', 'YATAK ODASI',
    'OTURMA ODASI', 'ÇOCUK ODASI', 'KORİDOR', 'ANTRE', 'HOL', 'WC',
    'BANYO', 'BALKON (AÇIK)', 'BALKON (KAPALI)', 'DAİRE', 'SAHANLIK',
    'AÇIK SAHANLIK', 'AYDINLIK', 'ASANSÖR', 'KİLER', 'DEPO', 'CİHAZ ODASI',
    'KAZAN D.', 'DÜKKAN', 'OFİS', 'YAN BİNA'
];

export let state = {
    currentMode: "select",
    lastUsedMode: "drawWall",
    startPoint: null,
    nodes: [],
    walls: [],
    doors: [],
    rooms: [],
    selectedObject: null,
    selectedRoom: null, 
    isDraggingRoomName: null,
    dimensionMode: 1,
    zoom: 1,
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
    wallBorderColor: "#e1dbdb",
    roomFillColor: "#1e1f20",
    lineThickness: 2.5,
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
        spacing: 10,
        color: "#27292a",
        weight: 0.5,
    },
    dimensionOptions: {
        fontSize: 14,
        color: "rgba(4, 206, 210, 1)",
        defaultView: 1, // 0: Kapalı, 1: Özet, 2: Detaylı
        showOuter: true,
    },
    isSweeping: false,
    sweepWalls: [],
};

export function setState(newState) {
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
    lengthInput: document.getElementById("length-input"),
    bSave: document.getElementById("bSave"),
    bOpen: document.getElementById("bOpen"),
    fileInput: document.getElementById("file-input"),
    b3d: document.getElementById("b3d"),
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
    dimensionShowOuterInput: document.getElementById("dimension-show-outer"),
    roomNamePopup: document.getElementById("room-name-popup"),
    roomNameSelect: document.getElementById("room-name-select"),
    roomNameInput: document.getElementById("room-name-input"),
    splitter: document.getElementById("splitter"),
};

export function setMode(mode) {
    if (mode !== "select") {
        setState({ lastUsedMode: mode });
    }
    const newMode = state.currentMode === mode && mode !== "select" ? "select" : mode;
    setState({
        currentMode: newMode,
        startPoint: null,
        selectedObject: null,
        selectedGroup: [],
        isDragging: false,
    });

    dom.bSel.classList.toggle("active", newMode === "select");
    dom.bWall.classList.toggle("active", newMode === "drawWall");
    dom.bRoom.classList.toggle("active", newMode === "drawRoom");
    dom.bDoor.classList.toggle("active", newMode === "drawDoor");
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

function animate() {
    requestAnimationFrame(animate);
    draw2D();
    if(dom.mainContainer.classList.contains('show-3d')) {
        controls3d.update();
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

function initialize() {
    init3D(dom.c3d);
    initializeSettings();
    setupUIListeners();
    setupInputListeners();
    setupFileIOListeners();
    createWallPanel();
    
    dom.bSel.addEventListener("click", () => setMode("select"));
    dom.bWall.addEventListener("click", () => setMode("drawWall"));
    dom.bRoom.addEventListener("click", () => setMode("drawRoom"));
    dom.bDoor.addEventListener("click", () => setMode("drawDoor"));
    dom.b3d.addEventListener("click", toggle3DView);
    dom.bAssignNames.addEventListener("click", assignRoomNames);
    
    window.addEventListener("resize", resize);
    
    resize();
    animate();
    saveState();
}

initialize();