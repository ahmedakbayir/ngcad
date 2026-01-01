// main.js
import * as THREE from 'three';
import { saveState } from './history.js';
import { setupFileIOListeners } from './file-io.js';
import { setupInputListeners, handleDelete } from './input.js';
import { setupUIListeners, initializeSettings, toggle3DView, toggleIsoView, drawIsoView, setupIsometricControls } from './ui.js';
import { draw2D } from '../draw/draw2d.js';
import { initGuideContextMenu } from '../menu/guide-menu.js';
import { initFloorOperationsMenu } from '../menu/floor-operations-menu.js';
import { initPanelDisplayMenu } from '../menu/panel-display-menu.js';
import { fitDrawingToScreen } from '../draw/zoom.js';
// --- DEĞİŞİKLİK BURADA ---
import { updateFirstPersonCamera, setupFirstPersonMouseControls, isFPSMode } from '../scene3d/scene3d-camera.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { init3D, renderer as renderer3d, camera as camera3d, controls as controls3d, scene as scene3d } from '../scene3d/scene3d-core.js';
// --- DEĞİŞİKLİK SONU ---
import { createWallPanel } from '../wall/wall-panel.js';
import { createFloorPanel, showFloorPanel, renderMiniPanel } from '../floor/floor-panel.js';
import { initializeDefaultFloors } from '../floor/floor-handler.js';
import { plumbingManager, TESISAT_MODLARI } from '../plumbing_v2/plumbing-manager.js';


//export const BG = "#30302e"; // Dark mode varsayılan - GÜNCELLENDİ

// ═══════════════════════════════════════════════════════════════
// MERKEZİ RENK SİSTEMİ - TÜM RENKLER BURADA
// ═══════════════════════════════════════════════════════════════
export const THEME_COLORS = {
    // KOYU MOD RENKLERİ
    dark: {
        // Arkaplan
        background: '#30302e',
        backgroundGradient: null, // Koyu modda gradient yok
        canvas: '#30302e', // Canvas temizleme rengi
        canvasGradient: {
            center: '#363636',  // Merkez - koyu gri
            mid: '#252525',     // Orta
            edge: '#1a1a1a'     // Kenar - daha koyu
        },

        // Duvarlar
        wallStroke: '#e9e9e9', // Duvar çizgisi
        wallFill: '#333333', // Duvar dolgusu (BG ile aynı)



        // Mahaller
        roomFill: '#2e2d2dff', // Mahal dolgusu (BG'ye yakın)
        roomHover: '#8ab4f8', // Mahal hover
        roomSelected: '#363636', // Mahal seçili

        // Grid
        grid: '#141414',
        // Ölçülendirme
        dimensionArchitecture: '#b8b7b7', // Mimari ölçülendirme
        dimensionPlumbing: '#4dfff6', // Tesisat ölçülendirme

        // Boru uç noktası rengi
        pipeEndpoint: '#FF8C00',  // Turuncu
        pipeEndpointStroke: '#fff', // Beyaz

        // Cursor
        cursorWallDraw: '#8ab4f8', // Duvar çizme cursor rengi
    },

    // AÇIK MOD RENKLERİ
    light: {
        // Arkaplan
        background: '#e6e7e7',
        backgroundGradient: 'radial-gradient(ellipse at center, #fdffff 0%, #e7fafa 100%)',
        canvas: '#e6e7e7', // Canvas temizleme rengi
        canvasGradient: {
            center: '#fdfdff',  // Merkez - koyu gri
            mid: '#f3f3ff',     // Orta
            edge: '#efeffd'     // Kenar - daha koyu
        },

        // Grid
        grid: '#b6b6b6',

        // Duvarlar
        wallStroke: '#505050', // Duvar çizgisi (koyu)
        wallFill: '#dddddd', // Duvar dolgusu (açık)

        // Mahaller
        roomFill: '#fefefe', // Mahal dolgusu (BG'ye yakın)
        roomHover: '#fff1f1', // Mahal hover
        roomSelected: '#fff1f1', // Mahal seçili

        // Ölçülendirme
        dimensionArchitecture: '#3a3a3a', // Mimari ölçülendirme (koyu mavi)
        dimensionPlumbing: '#fc0000', // Tesisat ölçülendirme (koyu teal)

        // Boru uç noktası rengi
        pipeEndpoint: '#0066CC',  // Koyu mavi
        pipeEndpointStroke: '#333', // Koyu gri
        // Cursor
        cursorWallDraw: '#1a5490', // Duvar çizme cursor rengi (koyu mavi)
    }
};

// ═══════════════════════════════════════════════════════════════
// GETTER FONKSİYONLARI - Temaya göre renk döndürür
// ═══════════════════════════════════════════════════════════════

export function isLightMode() {
    return document.body.classList.contains('light-mode');
}

export function getBG() {
    // Light mode için gradient döndür (CSS ile kullanılacak)
    return isLightMode() ? THEME_COLORS.light.backgroundGradient : THEME_COLORS.dark.background;
}

export function getCanvasClearColor() {
    return isLightMode() ? THEME_COLORS.light.canvas : THEME_COLORS.dark.canvas;
}

export function getGridColor() {
    return isLightMode() ? THEME_COLORS.light.grid : THEME_COLORS.dark.grid;
}

export function getWallStrokeColor() {
    return isLightMode() ? THEME_COLORS.light.wallStroke : THEME_COLORS.dark.wallStroke;
}

export function getWallFillColor() {
    return isLightMode() ? THEME_COLORS.light.wallFill : THEME_COLORS.dark.wallFill;
}


export function getRoomFillColor() {
    return isLightMode() ? THEME_COLORS.light.roomFill : THEME_COLORS.dark.roomFill;
}

export function getRoomHoverColor() {
    return isLightMode() ? THEME_COLORS.light.roomHover : THEME_COLORS.dark.roomHover;
}

export function getRoomSelectedColor() {
    return isLightMode() ? THEME_COLORS.light.roomSelected : THEME_COLORS.dark.roomSelected;
}

export function getDimensionArchitectureColor() {
    return isLightMode() ? THEME_COLORS.light.dimensionArchitecture : THEME_COLORS.dark.dimensionArchitecture;
}

export function getDimensionPlumbingColor() {
    return isLightMode() ? THEME_COLORS.light.dimensionPlumbing : THEME_COLORS.dark.dimensionPlumbing;
}

export function getCursorWallDrawColor() {
    return isLightMode() ? THEME_COLORS.light.cursorWallDraw : THEME_COLORS.dark.cursorWallDraw;
}

export function getShadow(ctx, shadowColor = null, shadowBlur = 3, shadowOffsetX = 0.5, shadowOffsetY = 0.5) {
    if (isLightMode()) {
        ctx.shadowColor = 'rgba(139, 139, 139, 1)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;
    } else {
        ctx.shadowColor = 'rgba(139, 139, 139, 1)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0.5;
        ctx.shadowOffsetY = 0.5;
    }

}

export function applyBG(element = document.body) {
    if (isLightMode()) {
        element.style.background = 'none';
        element.style.backgroundImage = THEME_COLORS.light.backgroundGradient;
    } else {
        element.style.backgroundImage = 'none';
        element.style.background = THEME_COLORS.dark.background;
    }
}

/**
 * Mevcut temaya göre renk döndürür (deprecated - spesifik getter kullanın)
 * @param {string} colorKey - Renk anahtarı
 * @returns {string} Renk değeri
 */
export function getThemeColor(colorKey) {
    const theme = isLightMode() ? THEME_COLORS.light : THEME_COLORS.dark;
    return theme[colorKey] || '#000000';
}

export const METER_SCALE = 1;
// export const WALL_THICKNESS = 20; // SABİT KALDIRILDI
export const WALL_HEIGHT = 270;
export const DOOR_HEIGHT = 220; // <-- DEĞİŞTİRİLDİ (220 -> 200)
export const WINDOW_BOTTOM_HEIGHT = 80;
export const WINDOW_TOP_HEIGHT = 220;
export const BATHROOM_WINDOW_BOTTOM_HEIGHT = 170;
export const BATHROOM_WINDOW_TOP_HEIGHT = 220; // 170 + 50
export const BATHROOM_WINDOW_DEFAULT_WIDTH = 50;
export const DRAG_HANDLE_RADIUS = 8;
export const EXTEND_RANGE = 500;
export const SNAP_UNLOCK_DISTANCE_CM = 10;
export const MAHAL_LISTESI = [
    'MAHAL', 'SAHANLIK', 'ODA', 'MUTFAK', 'SALON', 'YATAK ODASI', 'OTURMA ODASI', 'BANYO',
    'AÇIK BALKON', 'KAPALI BALKON', 'AÇIK SAHANLIK', 'ASANSÖR', 'KORİDOR', 'ANTRE', 'AÇIK MUTFAK',
    'ÇOCUK ODASI', 'YEMEK ODASI', 'ÇALIŞMA ODASI', 'DUBLEKS ANTRE', 'HOL', 'WC', 'LAVABO', 'OFİS',
    'DAİRE', 'KAZAN DAİRESİ', 'DÜKKAN', 'YAN BİNA', 'KİLER', 'DEPO', 'BAHÇE', 'AYDINLIK', 'GARAJ',
    'TERAS', 'BODRUM', 'AÇIK OTOPARK', 'KAPALI OTOPARK', 'BACA', 'AÇIK AYDINLIK', 'ÇATI ARASI',
    'YANGIN MERDİVENİ', 'TESİSAT ŞAFTI', 'SAYAÇ ODASI', 'SAYAÇ ŞAFTI', 'KURANGLEZ', 'SIĞINAK',
    'CİHAZ ODASI', 'HAVALANDIRMA', 'TOPRAK DOLGU', 'ÇAY OCAĞİ', 'LOKANTA', 'KANTİN', 'YEMEKHANE',
    'KAHVEHANE', 'BAKKAL', 'MARKET', 'SINIF', 'REVİR', 'SPOR SALONU', 'MESCİD', 'CAMİ', 'OKUL',
    'SAĞLIK OCAĞI', 'MUAYENEHANE', 'İMALATHANE', 'FIRIN', 'KAFE', 'SHOWROOM', 'BEKLEME ODASI',
    'TOPLANTI ODASI', 'MAĞAZA', 'ENDÜSTRİYEL MUTFAK', 'BACA ŞAFTI', 'KÖMÜRLÜK', 'ARŞİV',
    'ISI MERKEZİ', 'FABRİKA', 'LABARATUVAR', 'TEKNİK HACİM', 'DANIŞMA', 'ATÖLYE', 'BÜFE',
    'SOSYAL TESİS', 'HAMAM', 'ORTAK ALAN'];

// VectorDraw XML'den gelen AreaType enum değerlerinin MAHAL_LISTESI'ndeki karşılıkları
// NOT: Bu değerler MAHAL_LISTESI'ndeki isimlerle TAM AYNI olmak zorunda
export const VECTORDRAW_AREA_TYPES = {
    0: 'MAHAL',
    1: 'ASANSÖR',
    3: 'BACA ŞAFTI',
    4: 'BAHÇE',
    5: 'AÇIK BALKON',
    6: 'KAPALI BALKON',
    8: 'CİHAZ ODASI',
    9: 'DAİRE',
    10: 'DUBLEKS ANTRE',
    11: 'DÜKKAN',
    12: 'MAHAL',
    13: 'KAZAN DAİRESİ',
    14: 'KORİDOR',
    15: 'SAHANLIK',
    16: 'MUTFAK',
    18: 'SALON',
    19: 'TERAS',
    20: 'TESİSAT ŞAFTI',
    22: 'YAN BİNA',
    23: 'YATAK ODASI',
    24: 'DEPO',
    25: 'KİLER',
    26: 'TOPRAK DOLGU',
    27: 'AÇIK AYDINLIK',
    28: 'KÖMÜRLÜK',
    29: 'DEPO',
    30: 'AÇIK OTOPARK',
    31: 'KAPALI OTOPARK',
    32: 'OTURMA ODASI',
    35: 'HAVALANDIRMA',
    36: 'YANGIN MERDİVENİ',
    37: 'WC',
    38: 'BANYO',
    39: 'AÇIK MUTFAK',
    40: 'SIĞINAK',
    41: 'ÇATI ARASI',
    42: 'OFİS',
    43: 'LAVABO',
    45: 'SINIF',
    46: 'TESİSAT ŞAFTI',
    50: 'LOKANTA',
    51: 'BÜFE',
    52: 'KANTİN',
    54: 'SPOR SALONU',
    56: 'CAMİ',
    59: 'SOSYAL TESİS',
    60: 'HAMAM',
    61: 'TOPLANTI ODASI',
    62: 'SHOWROOM',
    63: 'SAYAÇ ODASI',
    64: 'KURANGLEZ',
    65: 'ORTAK ALAN',
    66: 'BACA ŞAFTI',
    67: 'İMALATHANE',
    68: 'FABRİKA',
    69: 'LABARATUVAR',
    70: 'MESCİD',
    71: 'DANIŞMA',
    72: 'AÇIK MUTFAK',
    73: 'ANTRE',
    74: 'AÇIK SAHANLIK',
    75: 'ODA',
    76: 'ODA',
    77: 'ODA',
    78: 'ODA',
    79: 'ODA',
    80: 'ODA',
    81: 'ODA',
    82: 'ODA',
    83: 'ODA',
    84: 'ODA',
    85: 'ODA',
    86: 'ODA',
    87: 'ODA',
    88: 'ODA',
    89: 'ODA',
    90: 'ODA',
    91: 'ODA',
    92: 'ODA',
    93: 'ODA',
    94: 'ODA',
    95: 'ODA',
    96: 'ODA',
    97: 'ODA',
    98: 'ODA',
    99: 'ODA',
    100: 'ODA',
};







export let state = {
    currentMode: "select", // Başlangıç modu "SEÇ"
    lastUsedMode: "select", // Son kullanılan da "SEÇ"
    currentDrawingMode: "KARMA", // MİMARİ, TESİSAT, KARMA - Hangi tip nesnelerle çalışılabilir
    currentPlumbingBlockType: 'SERVIS_KUTUSU', // Aktif tesisat bloğu tipi
    startPoint: null,
    nodes: [],
    walls: [],
    doors: [],
    rooms: [],
    columns: [],
    beams: [],
    stairs: [],
    plumbingBlocks: [], // TESİSAT BLOKLARI
    plumbingPipes: [], // TESİSAT BORULARI
    clipboard: null, // <-- YENİ SATIR EKLE
    wallAdjacency: new Map(),
    selectedObject: null,
    selectedRoom: null,
    isDraggingRoomName: null,
    roomDragStartPos: null,
    roomOriginalCenter: null,
    dimensionMode: 0,
    viewMode3D: 'floor', // 3D görünüm modu: 'floor' (sadece aktif kat) veya 'building' (tüm bina)
    zoom: 1.5,
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
    wallBorderColor: THEME_COLORS.dark.wallStroke, // Getter ile değiştirilecek
    roomFillColor: THEME_COLORS.dark.roomFill, // Getter ile değiştirilecek
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
        color: THEME_COLORS.dark.grid, // Getter ile değiştirilecek
        weight: 0.5,
    },
    dimensionOptions: {
        fontSize: 12,
        color: THEME_COLORS.dark.dimensionArchitecture, // Getter ile değiştirilecek
        defaultView: 0,
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
    symmetryPreviewTimer: null, // <-- DÜZELTME: Kilitlenme sorununu çözmek için eklendi
    guides: [],
    // --- YENİ: RESİM ÇERÇEVESİ İÇİN STATE ---
    pictureFrameCache: [], // Unsplash URL'lerini tutar
    pictureFrameMaterials: {}, // 3D Malzemeleri (URL'ye göre) cache'ler
    // --- YENİ STATE SONU ---

    // --- YENİ: 3D FARE DURUMU ---
    is3DMouseDown: false, // 3D canvas'ta fare basılı mı?
    // --- YENİ STATE SONU ---

    // --- YENİ: KAT YÖNETİMİ ---
    floors: [], // Katlar dizisi
    currentFloor: null, // Aktif kat
    defaultFloorHeight: 270, // Varsayılan kat yüksekliği (cm)
    // --- KAT YÖNETİMİ SONU ---

    // --- MERDİVEN AYARLARI ---
    stairSettings: {
        showRailing: false, // Varsayılan korkuluk durumu
        stepDepthRange: "30-40" // Varsayılan basamak derinliği aralığı
    },
    // --- MERDİVEN AYARLARI SONU ---

    // --- OPACITY AYARLARI ---
    opacitySettings: {
        wall: 100,    // Duvar saydamlığı (0-100)
        floor: 100,   // Zemin saydamlığı (0-100)
        door: 100,    // Kapı saydamlığı (0-100)
        window: 100,  // Pencere saydamlığı (0-100)
        column: 100,  // Kolon saydamlığı (0-100)
        beam: 100,    // Kiriş saydamlığı (0-100)
        stair: 100,   // Merdiven saydamlığı (0-100)
        plumbing: 100 // Tesisat saydamlığı (0-100)
    },
    // --- OPACITY AYARLARI SONU ---

    // --- PENCERE YERLEŞTIRME AŞAMASI ---
    windowPlacementStage: 0, // 0: ilk tıklama (en geniş duvarlara), 1: ikinci tıklama (kalan duvarlara)
    // --- PENCERE YERLEŞTIRME SONU ---

    // --- İZOMETRİK GÖRÜNÜM ---
    isoZoom: 0.5,
    isoPanOffset: { x: 0, y: 0 },
    isoPanning: false,
    isoPanStart: { x: 0, y: 0 },
    // --- İZOMETRİK GÖRÜNÜM SONU ---
};

export function setState(newState) {
    if (newState.isDragging === false) {
        newState.draggedRoomInfo = [];
    }

    // Walls veya doors değiştiğinde mini paneli güncelle
    const wallsChanged = newState.walls !== undefined && newState.walls !== state.walls;
    const doorsChanged = newState.doors !== undefined && newState.doors !== state.doors;

    state = { ...state, ...newState };

    // Debug: State güncellendiğinde window'u da güncelle
    window.DEBUG_state = state;

    // Kat içerik durumu değiştiyse mini panel'i güncelle
    if (wallsChanged || doorsChanged) {
        renderMiniPanel();
    }
}

// Debug: State'i global erişime aç
window.DEBUG_state = state;

export const dom = {
    mainContainer: document.getElementById("main-container"),
    p2d: document.getElementById("p2d"),
    c2d: document.getElementById("c2d"),
    ctx2d: document.getElementById("c2d").getContext("2d"),
    p3d: document.getElementById("p3d"),
    c3d: document.getElementById("c3d"),
    pIso: document.getElementById("pIso"),
    cIso: document.getElementById("cIso"),
    ctxIso: document.getElementById("cIso").getContext("2d"),
    bSel: document.getElementById("bSel"),
    bDelete: document.getElementById("bDelete"),
    bWall: document.getElementById("bWall"),
    bRoom: document.getElementById("bRoom"),
    bDoor: document.getElementById("bDoor"),
    bWindow: document.getElementById("bWindow"),
    bColumn: document.getElementById("bColumn"),
    bBeam: document.getElementById("bBeam"),
    bStairs: document.getElementById("bStairs"),
    bServisKutusu: document.getElementById("bServisKutusu"),
    bSayac: document.getElementById("bSayac"),
    bVana: document.getElementById("bVana"),
    bKombi: document.getElementById("bKombi"),
    bOcak: document.getElementById("bOcak"),
    bBaca: document.getElementById("bBaca"),
    bBoru: document.getElementById("bBoru"),
    lengthInput: document.getElementById("length-input"),
    bSave: document.getElementById("bSave"),
    bOpen: document.getElementById("bOpen"),
    fileInput: document.getElementById("file-input"),
    bFirstPerson: document.getElementById("bFirstPerson"),
    bFloorView: document.getElementById("bFloorView"),
    bAssignNames: document.getElementById("bAssignNames"),
    settingsBtn: document.getElementById("settings-btn"),
    settingsPopup: document.getElementById("settings-popup"),
    closeSettingsPopupBtn: document.getElementById("close-settings-popup"),
    tabButtons: {
        general: document.getElementById("tab-btn-general"),
        grid: document.getElementById("tab-btn-grid"),
        snap: document.getElementById("tab-btn-snap"),
        dimension: document.getElementById("tab-btn-dimension"),
        stairs: document.getElementById("tab-btn-stairs"),
    },
    tabPanes: {
        general: document.getElementById("tab-pane-general"),
        grid: document.getElementById("tab-pane-grid"),
        snap: document.getElementById("tab-pane-snap"),
        dimension: document.getElementById("tab-pane-dimension"),
        stairs: document.getElementById("tab-pane-stairs"),
    },
    darkModeToggle: document.getElementById("dark-mode-toggle"), // DARK MODE TOGGLE
    borderPicker: document.getElementById("borderPicker"),
    roomPicker: document.getElementById("roomPicker"),
    lineThicknessInput: document.getElementById("line-thickness"),
    wallThicknessInput: document.getElementById("wall-thickness"), // YENİ EKLENDİ
    drawingAngleInput: document.getElementById("drawing-angle"), // YENİ EKLENDİ
    defaultFloorHeightInput: document.getElementById("default-floor-height"), // YENİ EKLENDİ
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
    stairsShowRailingInput: document.getElementById("stairs-show-railing"), // YENİ EKLENDİ
    stairsStepDepthSelect: document.getElementById("stairs-step-depth"), // YENİ EKLENDİ
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
    b3d: document.getElementById("b3d"), // 3D Göster butonu
    bIso: document.getElementById("bIso"), // İzometri Göster butonu
};

// Proje modu butonlarını kurar (MİMARİ, TESİSAT, KARMA)
function setupModeButtons() {
    const modeMimari = document.getElementById("mode-mimari");
    const modeTesisat = document.getElementById("mode-tesisat");
    const modeKarma = document.getElementById("mode-karma");

    if (!modeMimari || !modeTesisat || !modeKarma) {
        console.warn('Mode buttons not found in DOM');
        return;
    }

    // Mimari mod butonu
    modeMimari.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('MİMARİ');
    });

    // Tesisat mod butonu
    modeTesisat.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('TESİSAT');
    });

    // Karma mod butonu
    modeKarma.addEventListener('click', (e) => {
        e.stopPropagation();
        setDrawingMode('KARMA');
        // KARMA modunda mevcut ikon korunur (setDrawingMode içinde kontrol ediliyor)
    });
}

// Çizim modu değiştirme fonksiyonu (MİMARİ, TESİSAT, KARMA)
export function setDrawingMode(mode) {
    const previousMode = state.currentDrawingMode;
    const currentDrawMode = state.currentMode;

    setState({ currentDrawingMode: mode });

    // Hangi modların hangi kategoriye ait olduğunu belirle
    const architecturalModes = ['drawWall', 'drawRoom', 'drawDoor', 'drawWindow', 'drawColumn', 'drawBeam', 'drawStairs', 'drawSymmetry'];
    const plumbingModes = ['plumbingV2'];

    // KARMA moduna geçiş - mevcut çizim modunu koru
    if (mode === 'KARMA') {
        // Hiçbir şey yapma, mevcut ikon korunur
    }
    // KARMA modundan MİMARİ veya TESİSAT'a geçiş
    else if (previousMode === 'KARMA') {
        const isArchitecturalMode = architecturalModes.includes(currentDrawMode);
        const isPlumbingMode = plumbingModes.includes(currentDrawMode);

        // Eğer aktif ikon ile gidilen mod uyumsuzsa SEÇ moduna geç
        if ((mode === 'MİMARİ' && !isArchitecturalMode) ||
            (mode === 'TESİSAT' && !isPlumbingMode)) {
            setMode('select', true);
        }
        // Uyumluysa ikon korunur (hiçbir şey yapma)
    }
    // MİMARİ veya TESİSAT modlarından diğerine geçiş
    else {
        setMode('select', true);
    }

    // Butonların active durumunu güncelle (dinamik olarak query)
    const modeMimari = document.getElementById("mode-mimari");
    const modeTesisat = document.getElementById("mode-tesisat");
    const modeKarma = document.getElementById("mode-karma");

    if (modeMimari && modeTesisat && modeKarma) {
        // Tüm butonları pasif yap
        [modeMimari, modeTesisat, modeKarma].forEach(btn => {
            btn.classList.remove('active');
            btn.style.background = 'rgba(60, 64, 67, 0.8)';
            btn.style.borderColor = '#5f6368';
            btn.style.color = '#e8eaed';
            btn.style.boxShadow = 'none';
        });

        // Aktif butonu ayarla
        const activeBtn = mode === 'MİMARİ' ? modeMimari :
            mode === 'TESİSAT' ? modeTesisat : modeKarma;
        activeBtn.classList.add('active');
        activeBtn.style.background = 'rgba(100, 149, 237, 0.4)';
        activeBtn.style.borderColor = '#87CEEB';
        activeBtn.style.color = '#87CEEB';
        activeBtn.style.boxShadow = '0 0 8px rgba(135, 206, 235, 0.5)';
    }
}


function blendColorWithBackground(color, blendAmount) {
    // BG rengini tam olarak al (#222325ff formatından #222325'e)
    const bgColor = getBG().substring(0, 7);

    const parseHex = (hex) => {
        const clean = hex.replace('#', '');
        if (clean.length === 3) {
            return {
                r: parseInt(clean[0] + clean[0], 16),
                g: parseInt(clean[1] + clean[1], 16),
                b: parseInt(clean[2] + clean[2], 16)
            };
        }
        return {
            r: parseInt(clean.substring(0, 2), 16),
            g: parseInt(clean.substring(2, 4), 16),
            b: parseInt(clean.substring(4, 6), 16)
        };
    };

    let src;
    if (typeof color === 'string' && color.startsWith('rgba')) {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        src = m ? { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) } : parseHex('#808080');
    } else {
        src = parseHex(typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color);
    }

    const bg = parseHex(bgColor);

    // %89 arka plan, %11 orijinal renk
    const r = Math.round(src.r * (1 - blendAmount) + bg.r * blendAmount);
    const g = Math.round(src.g * (1 - blendAmount) + bg.g * blendAmount);
    const b = Math.round(src.b * (1 - blendAmount) + bg.b * blendAmount);

    return `rgb(${r}, ${g}, ${b})`;
}

export function getAdjustedColor(originalColor, objectType) {
    const mode = state.currentDrawingMode;

    // Mimari öğeler listesi
    const archTags = ['wall', 'door', 'window', 'room', 'roomName', 'column', 'beam', 'stair', 'stairs', 'dimension', 'vent'];

    if (mode === "TESİSAT" && archTags.includes(objectType)) {
        // %89 Arka planla karıştır (İstediğiniz %11 açıklık/belirginlik oranı)
        return blendColorWithBackground(originalColor, 0.89);
    }

    // Normal durumda (KARMA veya MİMARİ) rengi döndür
    if (typeof originalColor === 'number') {
        return '#' + originalColor.toString(16).padStart(6, '0');
    }
    return originalColor;
}

// DEPRECATED: Artık kullanılmıyor, geriye uyumluluk için bırakıldı
export function getObjectOpacity(objectType) {
    // Artık her zaman 1.0 döndür, renk ayarlamasını getAdjustedColor kullan
    return 1.0;
}

// Nesne tipine göre aktif modda opacity değerini döndürür
/*
export function getObjectOpacity_OLD(objectType) {
    const mode = state.currentDrawingMode;

    // KARMA modunda her şey normal görünür
    if (mode === "KARMA") {
        return 1.0;
    }

    // Mimari nesneler listesi
    const architecturalObjects = [
        'wall', 'door', 'window', 'room', 'column', 'beam', 'stair'
    ];

    // Tesisat nesneleri listesi
    const plumbingObjects = [
        'plumbing', 'pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz'
    ];

    const isArchitectural = architecturalObjects.includes(objectType);
    const isPlumbing = plumbingObjects.includes(objectType);

    // MİMARİ modunda
    if (mode === "MİMARİ") {
        if (isArchitectural) return 1.0; // Mimari nesneler normal
        if (isPlumbing) return 0.3; // Tesisat nesneleri soluk
    }

    // TESİSAT modunda
    if (mode === "TESİSAT") {
        if (isPlumbing) return 1.0; // Tesisat nesneleri normal
        if (isArchitectural) return 0.3; // Mimari nesneler soluk
    }

    // Varsayılan: normal görünüm
    return 1.0;
}
*/
// Nesne tipine göre aktif modda dokunulabilir mi kontrol eder
export function isObjectInteractable(objectType) {
    const mode = state.currentDrawingMode;

// KARMA modunda her şeye dokunulabilir
    if (mode === "KARMA") {
        return true;
    }

    // Mimari nesneler listesi
    const architecturalObjects = [
        'wall', 'door', 'window', 'room', 'roomName', 'roomArea', 'column', 'beam', 'stair', 'stairs', 'arcControl', 'guide' // guide eklendi
    ];

    // Tesisat nesneleri listesi - GÜNCELLENDİ
    const plumbingObjects = [
        'plumbing', 'pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz',
        'plumbingPipe', 'plumbingComponent', 'plumbingBlock', 'valve', 'baca' // <-- 'baca' EKLENDİ
    ];

    const isArchitectural = architecturalObjects.includes(objectType);
    const isPlumbing = plumbingObjects.includes(objectType);

    // MİMARİ modunda sadece mimari nesnelere dokunulabilir
    if (mode === "MİMARİ") {
        return isArchitectural;
    }

    // TESİSAT modunda sadece tesisat nesnelerine dokunulabilir
    if (mode === "TESİSAT") {
        return isPlumbing;
    }

    // Varsayılan: dokunulabilir
    return true;
}


// GÜNCELLENMİŞ setMode fonksiyonu
export function setMode(mode, forceSet = false) { // forceSet parametresi eklendi
    // Sadece zorla ayarlanmıyorsa ve seç modu değilse son kullanılanı güncelle
    if (!forceSet && mode !== "select") {
        setState({ lastUsedMode: mode });
    }

    // Eğer zorla ayarlama (forceSet) yoksa VE mevcut mod ile istenen mod aynıysa VE bu mod "select" değilse, "select" moduna geç (toggle).
    // Aksi halde (zorla ayarlama varsa VEYA modlar farklıysa VEYA istenen mod "select" ise), doğrudan istenen modu (mode) kullan.
    const newMode = (!forceSet && state.currentMode === mode && mode !== "select") ? "select" : mode;

    if (mode === "drawStairs" || newMode === "drawStairs") {
    }

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
        },

        // Pencere modundan çıkıldığında stage'i sıfırla
        windowPlacementStage: newMode === "drawWindow" ? state.windowPlacementStage : 0
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
    // Tesisat blokları - plumbingV2 modunda activeTool'a göre göster
    const isPlumbingV2 = newMode === "plumbingV2";
    const activeTool = plumbingManager?.activeTool;
    dom.bServisKutusu.classList.toggle("active", isPlumbingV2 && activeTool === 'servis_kutusu');
    dom.bSayac.classList.toggle("active", isPlumbingV2 && activeTool === 'sayac');
    dom.bVana.classList.toggle("active", isPlumbingV2 && activeTool === 'vana');
    dom.bKombi.classList.toggle("active", isPlumbingV2 && activeTool === 'cihaz' && plumbingManager?.tempComponent?.cihazTipi === 'KOMBI');
    dom.bOcak.classList.toggle("active", isPlumbingV2 && activeTool === 'cihaz' && plumbingManager?.tempComponent?.cihazTipi === 'OCAK');
    dom.bBaca.classList.toggle("active", isPlumbingV2 && activeTool === 'baca');
    dom.bBoru.classList.toggle("active", isPlumbingV2 && activeTool === 'boru');
    dom.bSymmetry.classList.toggle("active", newMode === "drawSymmetry");
    dom.p2d.className = `panel ${newMode}-mode`;

    // Tesisat modunda aktif araca göre cursor sınıfı ekle
    if (newMode === "plumbingV2" && plumbingManager?.activeTool) {
        dom.p2d.classList.add(`tool-${plumbingManager.activeTool}`);
    }

}

export function resize() {
    const r2d = dom.p2d.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size with device pixel ratio for crisp rendering
    dom.c2d.width = r2d.width * dpr;
    dom.c2d.height = r2d.height * dpr;
    dom.c2d.style.width = r2d.width + 'px';
    dom.c2d.style.height = r2d.height + 'px';

    // Disable image smoothing for crisp vector lines
    dom.ctx2d.imageSmoothingEnabled = false;
    dom.ctx2d.webkitImageSmoothingEnabled = false;
    dom.ctx2d.mozImageSmoothingEnabled = false;
    dom.ctx2d.msImageSmoothingEnabled = false;

    const r3d = dom.p3d.getBoundingClientRect();
    if (r3d.width > 0 && r3d.height > 0 && camera3d && renderer3d) {
        camera3d.aspect = r3d.width / r3d.height;
        camera3d.updateProjectionMatrix();
        renderer3d.setPixelRatio(window.devicePixelRatio);
        renderer3d.setSize(r3d.width, r3d.height);
    }

    // İzometrik canvas'ı resize et
    if (dom.mainContainer.classList.contains('show-iso')) {
        const rIso = dom.pIso.getBoundingClientRect();
        if (rIso.width > 0 && rIso.height > 0) {
            dom.cIso.width = rIso.width * dpr;
            dom.cIso.height = rIso.height * dpr;
            dom.cIso.style.width = rIso.width + 'px';
            dom.cIso.style.height = rIso.height + 'px';

            dom.ctxIso.imageSmoothingEnabled = false;
            dom.ctxIso.webkitImageSmoothingEnabled = false;
            dom.ctxIso.mozImageSmoothingEnabled = false;
            dom.ctxIso.msImageSmoothingEnabled = false;
        }
    }
}

let lastTime = performance.now();

// FPS Tracking
let fpsFrames = 0;
let fpsTime = 0;
let currentFPS = 60;

// Mouse 3D Coordinates Tracking
let mouse3DCoords = { x: 0, y: 0, z: 0 };

// --- GÜNCELLENMİŞ ANIMATE FONKSİYONU ---
window.IS_DEBUG_MODE = false;
function animate() {
    requestAnimationFrame(animate);

    // Delta time hesaplama (saniye cinsinden)
    const currentTime = performance.now();
    const delta = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    // FPS Calculation
    fpsFrames++;
    fpsTime += delta;
    if (fpsTime >= 0.5) { // Her 0.5 saniyede bir FPS'i güncelle
        currentFPS = Math.round(fpsFrames / fpsTime);
        fpsFrames = 0;
        fpsTime = 0;

        // FPS Display güncelleme
        const fpsDisplay = document.getElementById('fps-display');
        if (fpsDisplay) {
            fpsDisplay.textContent = `FPS: ${currentFPS}`;
        }


    }

    // Camera Coordinates Display güncelleme (her zaman göster)
    const cameraCoords = document.getElementById('camera-coords');
    if (cameraCoords && camera3d) {
        // Kamera konumunu tam sayı olarak göster
        const x = Math.round(camera3d.position.x);
        const y = Math.round(camera3d.position.y);
        const z = Math.round(camera3d.position.z);
        cameraCoords.textContent = `x: ${x}, y: ${y}, z: ${z}`;
    }

    // YENİ: TWEEN animasyonlarını güncelle
    if (!window.IS_DEBUG_MODE) {
        if (typeof TWEEN !== 'undefined') {
            TWEEN.update();
        }
    }
    draw2D();

    if (dom.mainContainer.classList.contains('show-3d')) {

        // First-person kamera güncellemesi (HER ZAMAN ÇAĞRILIR)
        // (Bu fonksiyon kendi içinde 'cameraMode'u kontrol edip FPS değilse hemen çıkacak)
        updateFirstPersonCamera(delta);

        // OrbitControls'ü SADECE aktifse güncelle
        // (controls3d değişkeni 'scene3d-core.js'den gelir ve
        // toggleCameraMode tarafından 'orbitControls' veya 'null' olarak ayarlanır)
        if (controls3d && controls3d.update) {
            controls3d.update();
        }

        renderer3d.render(scene3d, camera3d);
    }

    // İzometrik görünümü çiz
    if (dom.mainContainer.classList.contains('show-iso')) {
        drawIsoView();
    }
}
// --- GÜNCELLEME SONU ---


// ===================================================================
// === GÜNCELLENMİŞ assignRoomNames (SAHANLIK + DÖNGÜ HATASI DÜZELTİLDİ) ===
// ===================================================================

/**
 * Mahal isimlerini sağlanan kurallara göre otomatik olarak atar.
 */
function assignRoomNames() {
    // Sadece 'MAHAL' ismindeki odaları al
    const unassignedRooms = state.rooms.filter(r => r.name === 'MAHAL');
    if (unassignedRooms.length === 0) return; // Atanacak oda yoksa çık

    let roomsToAssign = [...unassignedRooms]; // Üzerinde çalışılacak kopya liste
    const allRooms = state.rooms;
    const allWalls = state.walls;
    const allStairs = state.stairs || [];

    // --- Yardımcı Fonksiyonlar ---

    /**
     * Bir odayı oluşturan duvar segmentlerini bulur.
     * @param {object} room - Oda nesnesi
     * @returns {Array<object>} - Duvar nesneleri dizisi
     */
    function getRoomWalls(room) {
        const roomWalls = new Set();
        if (!room.polygon?.geometry?.coordinates) return [];
        const coords = room.polygon.geometry.coordinates[0];
        const TOLERANCE = 1.0; // Eşleşme toleransı
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i];
            const p2Coord = coords[i + 1];
            // Poligon kenarına uyan duvarı bul
            const wall = allWalls.find(w => {
                if (!w || !w.p1 || !w.p2) return false;
                // İki yönlü kontrol (p1->p1, p2->p2) veya (p1->p2, p2->p1)
                const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                return Math.min(d1, d2) < TOLERANCE;
            });
            if (wall) roomWalls.add(wall);
        }
        return Array.from(roomWalls);
    }

    // Verimlilik için tüm odaların duvarlarını ve komşularını önceden hesapla
    const roomWallMap = new Map();
    allRooms.forEach(r => {
        roomWallMap.set(r, getRoomWalls(r));
    });

    const neighborMap = new Map();
    allRooms.forEach(r => {
        const neighbors = new Set();
        const roomWalls = roomWallMap.get(r) || [];
        if (roomWalls.length > 0) {
            for (const otherRoom of allRooms) {
                if (otherRoom === r) continue;
                const otherRoomWalls = roomWallMap.get(otherRoom) || [];
                // Ortak duvar var mı?
                if (roomWalls.some(wall => otherRoomWalls.includes(wall))) {
                    neighbors.add(otherRoom);
                }
            }
        }
        neighborMap.set(r, Array.from(neighbors));
    });

    const assignedRooms = new Set(); // Atama yapılan odaları (nesne) takip et
    const assignedNames = new Set(state.rooms.filter(r => r.name !== 'MAHAL').map(r => r.name)); // Atanan isimleri (string) takip et

    /**
     * GÜNCELLENMİŞ (Düzeltilmiş) assignName helper'ı
     * Bu fonksiyon, atama yapar ve odayı roomsToAssign listesinden ÇIKARIR.
     */
    function assignName(room, name) {
        // (HATA DÜZELTMESİ: roomsToAssign.includes(room) KONTROLÜ BURADA GEREKLİ)
        if (room && !assignedRooms.has(room) && roomsToAssign.includes(room)) {
            room.name = name;
            assignedRooms.add(room);
            assignedNames.add(name); // İsmi de kaydet

            const index = roomsToAssign.indexOf(room);
            if (index > -1) {
                roomsToAssign.splice(index, 1);
            }
            return true;
        }
        return false;
    }

    // --- Kuralları Sırayla Uygula (Yeni Sıralama) ---


    // Kural 1: BALKONLAR (Duvar tipine göre, kaç tane varsa)
    // (SAHANLIK'tan sonra, SALON'dan önce)
    const balkonRooms = [];
    const camekanRooms = [];
    for (const room of roomsToAssign) {
        const walls = roomWallMap.get(room) || [];
        let hasBalconyWall = false;
        let hasGlassWall = false;
        const exteriorWalls = walls.filter(w => state.wallAdjacency.get(w) === 1);
        for (const wall of exteriorWalls) {
            if (wall.wallType === 'balcony') hasBalconyWall = true;
            if (wall.wallType === 'glass') hasGlassWall = true;
        }
        if (hasBalconyWall) balkonRooms.push(room);
        else if (hasGlassWall) camekanRooms.push(room);
    }
    balkonRooms.forEach(room => assignName(room, 'AÇIK BALKON'));
    camekanRooms.forEach(room => assignName(room, 'KAPALI BALKON'));


    // Kural 2: SAHANLIK (Merdiven varsa, kaç tane varsa)
    // (HATA DÜZELTMESİ: 'isLanding' kontrolü kaldırıldı)
    const sahanlikRooms = [];
    for (const room of roomsToAssign) { // Kalanları kontrol et
        const roomPoly = room.polygon;
        if (!roomPoly || typeof turf === 'undefined') continue;
        for (const stair of allStairs) {
            // [FIX] Kural: Herhangi bir merdiven objesi (sahanlık VEYA normal)
            if (stair.center && turf.booleanPointInPolygon([stair.center.x, stair.center.y], roomPoly)) {
                sahanlikRooms.push(room);
                break; // Bu oda bir merdiven/sahanlık alanı, sonraki odaya geç
            }
        }
    }
    sahanlikRooms.forEach(room => {
        assignName(room, 'SAHANLIK'); // (unique=false gibi davranır)
    });



    // Kural 3: DAİRE (Alanı >= 50 m², kaç tane varsa)
    // (Iterate over a copy, 'assignName' modifies 'roomsToAssign')
    const daireRooms = [...roomsToAssign].filter(room => room.area >= 50);
    daireRooms.forEach(room => {
        assignName(room, 'DAİRE'); // (unique=false gibi davranır, listeden çıkarır)
    });



    // Kural 4: ANTRE (En fazla komşu, 1 defa)
    if (roomsToAssign.length > 0 && !assignedNames.has('ANTRE')) { // 'ANTRE' ismi hiç kullanılmadıysa
        let maxNeighbors = -1;
        let antreRoom = null;
        for (const room of roomsToAssign) { // Kalanları kontrol et
            const neighbors = neighborMap.get(room) || [];
            if (neighbors.length > maxNeighbors) {
                maxNeighbors = neighbors.length;
                antreRoom = room;
            }
        }
        if (antreRoom) {
            assignName(antreRoom, 'ANTRE');
        }
    }


    // Kural 5: SALON (Kalan en büyük, 1 defa)
    if (roomsToAssign.length > 0 && !assignedNames.has('SALON')) {
        roomsToAssign.sort((a, b) => b.area - a.area);
        const salonRoom = roomsToAssign[0];
        assignName(salonRoom, 'SALON');
    }

    // Kural 6: BANYO (Kalan en küçük, 1 defa)
    if (roomsToAssign.length > 0 && !assignedNames.has('BANYO')) {
        roomsToAssign.sort((a, b) => a.area - b.area);
        const banyoRoom = roomsToAssign[0];
        assignName(banyoRoom, 'BANYO');
    }

    // Kural 7: MUTFAK (Salona komşu en büyük, yoksa 2. büyük, 1 defa)
    if (roomsToAssign.length > 0 && !assignedNames.has('MUTFAK')) {
        const salonRoom = allRooms.find(r => r.name === 'SALON');
        let mutfakRoom = null;
        if (salonRoom) {
            const salonNeighbors = neighborMap.get(salonRoom) || [];
            // Kalan (atanmamış) komşuları bul
            const unassignedNeighbors = salonNeighbors.filter(neighbor => roomsToAssign.includes(neighbor));
            if (unassignedNeighbors.length > 0) {
                unassignedNeighbors.sort((a, b) => b.area - a.area); // Komşuların en büyüğü
                mutfakRoom = unassignedNeighbors[0];
            }
        }
        // Eğer Salona komşu atanmamış oda yoksa, kalanlar içinde en büyüğü (2. büyük) al
        if (!mutfakRoom && roomsToAssign.length > 0) {
            roomsToAssign.sort((a, b) => b.area - a.area); // (Banyo ataması sırayı bozdu)
            mutfakRoom = roomsToAssign[0]; // Kalanların en büyüğü
        }
        if (mutfakRoom) {
            assignName(mutfakRoom, 'MUTFAK');
        }
    }

    // Kural 8: Kalanlar (Dönüşümlü Liste)
    // (HATA DÜZELTMESİ)
    roomsToAssign.sort((a, b) => b.area - a.area); // Kalanları alana göre sırala

    const sequentialNamesList = ['YATAK ODASI', 'OTURMA ODASI', 'ÇOCUK ODASI', 'YEMEK ODASI', 'ÇALIŞMA ODASI', 'KORİDOR', 'KİLER', 'DEPO'];
    let nameIndex = 0;

    // 'roomsToAssign' listesi 'assignName' tarafından küçültüleceği için,
    // 'while' döngüsü kullanmak artık GÜVENLİDİR.

    while (roomsToAssign.length > 0) {
        // Döngünün başında en büyüğü al (sıralama zaten yapıldı)
        const room = roomsToAssign[0]; // (shift() değil, sadece [0]'ı al)

        const baseName = sequentialNamesList[nameIndex % sequentialNamesList.length];
        let finalName = baseName;

        // Bu isim (örn: YATAK ODASI) zaten kullanılmış mı?
        if (assignedNames.has(baseName)) {
            let counter = 2;
            finalName = `${baseName} ${counter}`;
            // 'YATAK ODASI 2' de varsa, 'YATAK ODASI 3'ü dene...
            while (assignedNames.has(finalName)) {
                counter++;
                finalName = `${baseName} ${counter}`;
            }
        }

        // assignName(room, finalName) -> 'room'u roomsToAssign'den çıkaracak
        // ve 'finalName'i 'assignedNames'e ekleyecek
        assignName(room, finalName);

        nameIndex++; // Sıradaki isme (OTURMA ODASI vb.) geç
    }

    // Değişiklikleri kaydet
    saveState();
    if (dom.mainContainer.classList.contains('show-3d')) {
        setTimeout(update3DScene, 0);
    }
}

// ===================================================================
// === GÜNCELLENMİŞ assignRoomNames FONKSİYONU SONU ===
// ===================================================================


// GÜNCELLENMİŞ initialize fonksiyonu
function initialize() {
    init3D(dom.c3d);
    // --- DEĞİŞİKLİK BURADA ---
    // Hata veren fonksiyon çağrısı (setupFirstPersonMouseControls) kaldırıldı
    // --- DEĞİŞİKLİK SONU ---
    initializeSettings();
    setupUIListeners();
    setupInputListeners();
    setupFileIOListeners();
    setupIsometricControls(); // İzometrik zoom ve pan kontrollerini kur
    createWallPanel();
    initializeDefaultFloors(); // Önce katları initialize et
    createFloorPanel(); // Sonra paneli oluştur
    initGuideContextMenu();
    initFloorOperationsMenu();
    initPanelDisplayMenu();

    //loadPictureFrameImages(); // <-- YENİ: Resimleri yüklemeyi burada başlatın

    if (dom.bSel) {
        dom.bSel.addEventListener("click", () => {
            // ESC tuşu ile TAM OLARAK aynı davranış
            // Settings popup açıksa zaten kapatmaya gerek yok (buton tıklaması)

            // Length input açıksa kapat
            if (state.isEditingLength) cancelLengthEdit();

            // Sürükleme aktifse iptal et ve state'i restore et
            if (state.isDragging) {
                setState({
                    isDragging: false,
                    isStretchDragging: false,
                    selectedGroup: [],
                    affectedWalls: [],
                    preDragWallStates: new Map(),
                    preDragNodeStates: new Map()
                });
                restoreState(state.history[state.historyIndex]);
            } else {
                // Sürükleme yoksa sadece seçimleri temizle
                setState({ selectedObject: null, selectedGroup: [] });
            }

            // startPoint'i temizle
            setState({ startPoint: null });

            // v2 plumbing seçimini de temizle ve aktif eylemleri iptal et
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.cancelCurrentAction();
            }

            // Seç moduna geç
            setMode("select", true);
        });
    }

    // DELETE butonu - mousedown'da HEMEN handleDelete çağır (blur öncesi)
    let deleteButtonPressed = false;
    if (dom.bDelete) {
        dom.bDelete.addEventListener("mousedown", (e) => {
            e.preventDefault(); // Blur event'ini engelle
            e.stopPropagation();

            // Seçim kaybolmadan HEMEN handleDelete çağır
            deleteButtonPressed = true;
            handleDelete();
            deleteButtonPressed = false;

            // Focus'u canvas'a geri ver
            setTimeout(() => {
                dom.c2d.focus();
            }, 0);

            return false;
        });
        dom.bDelete.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            // mousedown'da zaten handleDelete çağrıldı, tekrar çağırma
            return false;
        });
    }

    // Mimari butonlar - KARMA modunda değilse MİMARİ moduna geç
    if (dom.bWall) {
        dom.bWall.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawWall", true);
        });
    }
    if (dom.bRoom) {
        dom.bRoom.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawRoom", true);
        });
    }
    if (dom.bDoor) {
        dom.bDoor.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawDoor", true);
        });
    }
    if (dom.bWindow) {
        dom.bWindow.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawWindow", true);
        });
    }
    if (dom.bColumn) {
        dom.bColumn.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawColumn", true);
        });
    }
    if (dom.bBeam) {
        dom.bBeam.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawBeam", true);
        });
    }
    if (dom.bStairs) {
        dom.bStairs.addEventListener("click", () => {
            if (plumbingManager.interactionManager) plumbingManager.interactionManager.boruCizimAktif = false;
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawStairs", true);
        });
    }

    // Tesisat butonları - KARMA modunda değilse TESİSAT moduna geç
    if (dom.bServisKutusu) {
        dom.bServisKutusu.addEventListener("click", () => {
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.SERVIS_KUTUSU);
            setMode("plumbingV2", true);
        });
    }
    if (dom.bSayac) {
        dom.bSayac.addEventListener("click", () => {
            // Önceki modu kaydet (icon ile eklenmeden önceki durumu restore için)
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.previousMode = state.currentMode;
                plumbingManager.interactionManager.previousDrawingMode = state.currentDrawingMode;
                plumbingManager.interactionManager.previousActiveTool = plumbingManager.activeTool;
            }
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.SAYAC);
            setMode("plumbingV2", true);
        });
    }
    if (dom.bVana) {
        dom.bVana.addEventListener("click", () => {
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.VANA);
            setMode("plumbingV2", true);
        });
    }
    if (dom.bKombi) {
        dom.bKombi.addEventListener("click", () => {
            // Önceki modu kaydet (icon ile eklenmeden önceki durumu restore için)
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.previousMode = state.currentMode;
                plumbingManager.interactionManager.previousDrawingMode = state.currentDrawingMode;
                plumbingManager.interactionManager.previousActiveTool = plumbingManager.activeTool;
            }
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.CIHAZ, { cihazTipi: 'KOMBI' });
            setMode("plumbingV2", true);
        });
    }
    if (dom.bOcak) {
        dom.bOcak.addEventListener("click", () => {
            // Önceki modu kaydet (icon ile eklenmeden önceki durumu restore için)
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.previousMode = state.currentMode;
                plumbingManager.interactionManager.previousDrawingMode = state.currentDrawingMode;
                plumbingManager.interactionManager.previousActiveTool = plumbingManager.activeTool;
            }
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.CIHAZ, { cihazTipi: 'OCAK' });
            setMode("plumbingV2", true);
        });
    }
    if (dom.bBaca) {
        dom.bBaca.addEventListener("click", () => {
            // Önceki modu kaydet
            if (plumbingManager.interactionManager) {
                plumbingManager.interactionManager.previousMode = state.currentMode;
                plumbingManager.interactionManager.previousDrawingMode = state.currentDrawingMode;
                plumbingManager.interactionManager.previousActiveTool = plumbingManager.activeTool;
            }
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPlacement(TESISAT_MODLARI.BACA);
            setMode("plumbingV2", true);
        });
    }
    if (dom.bBoru) {
        dom.bBoru.addEventListener("click", () => {
            // Aktif boru çizimini iptal et
            plumbingManager.interactionManager?.cancelCurrentAction();
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("TESİSAT");
            }
            plumbingManager.startPipeMode();
            setMode("plumbingV2", true);
        });
    }

    if (dom.bSymmetry) {
        dom.bSymmetry.addEventListener("click", () => {
            if (state.currentDrawingMode !== "KARMA") {
                setDrawingMode("MİMARİ");
            }
            setMode("drawSymmetry", true);
        });
    }

    if (dom.bAssignNames) {
        dom.bAssignNames.addEventListener("click", assignRoomNames); // Artık güncellenmiş fonksiyonu çağıracak
    }

    // Proje modu butonları (MİMARİ, TESİSAT, KARMA)
    setupModeButtons();

    window.addEventListener("resize", resize);

    // 3D Canvas Mouse Tracking
    if (dom.c3d) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Y=0 plane (zemin)

        dom.c3d.addEventListener('mousemove', (event) => {
            if (!dom.mainContainer.classList.contains('show-3d')) return;

            const rect = dom.c3d.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera3d);

            // Zemin düzlemi ile kesişim noktasını bul
            const intersectPoint = new THREE.Vector3();
            raycaster.ray.intersectPlane(floorPlane, intersectPoint);

            if (intersectPoint) {
                // Koordinatları cm cinsinden sakla (Three.js cm birimiyle çalışıyor)
                mouse3DCoords.x = intersectPoint.x;
                mouse3DCoords.y = intersectPoint.y;
                mouse3DCoords.z = intersectPoint.z;
            }
        });
    }

    // Başlangıç modunu zorla ayarla
    setMode(state.currentMode, true);

    // Sürüklenebilir gruplar için drag & drop
    initializeDraggableGroups();

    resize();
    animate();
    setTimeout(fitDrawingToScreen, 100); // 100ms sonra fitDrawingToScreen'i çağır
    saveState();
}

// Sürüklenebilir grup fonksiyonu
function initializeDraggableGroups() {
    const groups = document.querySelectorAll('.draggable-group');

    groups.forEach(group => {
        const handle = group.querySelector('.drag-handle');
        if (!handle) return;

        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;

        // localStorage'dan pozisyonları yükle
        const savedPos = localStorage.getItem(`group-pos-${group.id}`);
        if (savedPos) {
            const { x, y } = JSON.parse(savedPos);
            group.style.left = x + 'px';
            group.style.top = y + 'px';
        }

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;
            group.classList.add('dragging');

            // Mevcut pozisyonu al (parent'a göre)
            const currentLeft = parseInt(group.style.left) || 0;
            const currentTop = parseInt(group.style.top) || 0;

            // Fare ile mevcut pozisyon arasındaki offset
            initialX = e.clientX - currentLeft;
            initialY = e.clientY - currentTop;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            e.preventDefault();

            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            group.style.left = currentX + 'px';
            group.style.top = currentY + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                group.classList.remove('dragging');

                // Pozisyonu kaydet
                const rect = group.getBoundingClientRect();
                localStorage.setItem(`group-pos-${group.id}`, JSON.stringify({
                    x: parseInt(group.style.left),
                    y: parseInt(group.style.top)
                }));
            }
        });
    });
}

initialize(); // Bu satır zaten dosyanın sonunda olmalı


/*
// --- RESİM ÇERÇEVESİ KODU ---
// config.js'den (eğer varsa) API anahtarını güvenli bir şekilde okur
const UNSPLASH_API_KEY = (window.NG_CONFIG && window.NG_CONFIG.UNSPLASH_API_KEY) ? window.NG_CONFIG.UNSPLASH_API_KEY : null;
const IMAGE_COUNT_TO_CACHE = 50; // Başlangıçta 50 resim çek


async function loadPictureFrameImages() {
    //bu kodu silmeyin. ilerde kullanılabilir.
    console.log("Resim çerçevesi resimleri yükleniyor...");
    if (!UNSPLASH_API_KEY || UNSPLASH_API_KEY === 'BURAYA_UNSPLASH_API_KEY_GİRİN') {
        console.warn("Unsplash API Anahtarı (config.js) bulunamadı. Placeholder resimler kullanılıyor.");
        // Placeholder URL'lerini (imgur) kullan
        const placeholderImages = [
            'https://i.imgur.com/S6RjY6A.jpeg', // Doğa
            'https://i.imgur.com/GzQvjQy.jpeg', // Soyut
            'https://i.imgur.com/PqN3pE0.jpeg', // Mimari
            'https://i.imgur.com/yF9EMs8.jpeg'  // Teknoloji
        ];
        const fullCache = [];
        for(let i=0; i<IMAGE_COUNT_TO_CACHE; i++) {
            fullCache.push(placeholderImages[i % placeholderImages.length]);
        }
        setState({ pictureFrameCache: fullCache });
        console.log(`${fullCache.length} adet placeholder resim cache'lendi.`);
        return;
    }
    
    // API Anahtarı varsa Unsplash'ten çek:
    try {
        // --- GÜNCELLEME: Sorguyu "canlı" resimler için değiştir ---
        const url = `https://api.unsplash.com/photos/random?client_id=${UNSPLASH_API_KEY}&count=${IMAGE_COUNT_TO_CACHE}&query=business-strategy,desktop,office,town,artificial-intelligence,code,construction,building,city,city-at-night,urban,street,road,nature,architecture&content_filter=high&orientation=landscape`;
        // --- GÜNCELLEME SONU ---

        const response = await fetch(url);
        if (!response.ok) { 
             throw new Error(`API Hatası: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        const urls = data.map(item => item.urls.regular);
        setState({ pictureFrameCache: urls });
        console.log(`${urls.length} adet Unsplash resmi cache'lendi.`);
    } catch (error) {
        console.error("Unsplash resimleri çekilemedi, placeholder resimler kullanılıyor:", error);
        // Hata durumunda da placeholder'ları yükle
        // API anahtarını null olarak ayarlayıp (geçici) tekrar çağırarak placeholder'a zorla
        const originalKey = UNSPLASH_API_KEY; // Orijinal anahtarı sakla
        window.NG_CONFIG.UNSPLASH_API_KEY = null; // Geçici olarak null yap
        await loadPictureFrameImages(); // Placeholder'ları yükle
        window.NG_CONFIG.UNSPLASH_API_KEY = originalKey; // Anahtarı geri yükle
    }
}
*/