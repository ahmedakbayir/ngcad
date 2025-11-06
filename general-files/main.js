// main.js
import { saveState } from './history.js';
import { setupFileIOListeners } from './file-io.js';
import { setupInputListeners } from './input.js';
import { setupUIListeners, initializeSettings, toggle3DView } from './ui.js';
import { draw2D } from '../draw/draw2d.js';
import { initGuideContextMenu } from '../draw/guide-menu.js'; 
import { fitDrawingToScreen } from '../draw/zoom.js';
// --- DEĞİŞİKLİK BURADA ---
import { updateFirstPersonCamera, setupFirstPersonMouseControls } from '../scene3d/scene3d-camera.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { init3D, renderer as renderer3d, camera as camera3d, controls as controls3d, scene as scene3d } from '../scene3d/scene3d-core.js';
// --- DEĞİŞİKLİK SONU ---
import { createWallPanel } from '../wall/wall-panel.js';
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

export const BG = "#1e1f20";
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
    'MAHAL','SAHANLIK','ODA','MUTFAK','SALON','YATAK ODASI','OTURMA ODASI','BANYO',
    'AÇIK BALKON','KAPALI BALKON','AÇIK SAHANLIK','ASANSÖR','KORİDOR','ANTRE','AÇIK MUTFAK',
    'ÇOCUK ODASI','YEMEK ODASI','ÇALIŞMA ODASI','DUBLEKS ANTRE','HOL','WC','LAVABO','OFİS',
    'DAİRE','KAZAN DAİRESİ','DÜKKAN','YAN BİNA','KİLER','DEPO','BAHÇE','AYDINLIK','GARAJ',
    'TERAS','BODRUM','AÇIK OTOPARK','KAPALI OTOPARK','BACA','AÇIK AYDINLIK','ÇATI ARASI',
    'YANGIN MERDİVENİ','TESİSAT ŞAFTI','SAYAÇ ODASI','SAYAÇ ŞAFTI','KURANGLEZ','SIĞINAK',
    'CİHAZ ODASI','HAVALANDIRMA','TOPRAK DOLGU','ÇAY OCAĞİ','LOKANTA','KANTİN','YEMEKHANE',
    'KAHVEHANE','BAKKAL','MARKET','SINIF','REVİR','SPOR SALONU','MESCİD','CAMİ','OKUL',
    'SAĞLIK OCAĞI','MUAYENEHANE','İMALATHANE','FIRIN','KAFE','SHOWROOM','BEKLEME ODASI',
    'TOPLANTI ODASI','MAĞAZA','ENDÜSTRİYEL MUTFAK','BACA ŞAFTI','KÖMÜRLÜK','ARŞİV',
    'ISI MERKEZİ','FABRİKA','LABARATUVAR','TEKNİK HACİM','DANIŞMA','ATÖLYE', 'BÜFE', 
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
 100:'ODA',
};







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
    stairs: [], 
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
    symmetryPreviewTimer: null, // <-- DÜZELTME: Kilitlenme sorununu çözmek için eklendi
    guides: [], 
    // --- YENİ: RESİM ÇERÇEVESİ İÇİN STATE ---
    pictureFrameCache: [], // Unsplash URL'lerini tutar
    pictureFrameMaterials: {}, // 3D Malzemeleri (URL'ye göre) cache'ler
    // --- YENİ STATE SONU ---
    
    // --- YENİ: 3D FARE DURUMU ---
    is3DMouseDown: false // 3D canvas'ta fare basılı mı?
    // --- YENİ STATE SONU ---
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
    bStairs: document.getElementById("bStairs"), 
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

// --- GÜNCELLENMİŞ ANIMATE FONKSİYONU ---
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
            while(assignedNames.has(finalName)) {
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
    createWallPanel();
    initGuideContextMenu();  

    //loadPictureFrameImages(); // <-- YENİ: Resimleri yüklemeyi burada başlatın

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
    dom.bAssignNames.addEventListener("click", assignRoomNames); // Artık güncellenmiş fonksiyonu çağıracak

    window.addEventListener("resize", resize);

    // Başlangıç modunu zorla ayarla
    setMode(state.currentMode, true);

    resize();
    animate();
    setTimeout(fitDrawingToScreen, 100); // 100ms sonra fitDrawingToScreen'i çağır
    saveState();
}

initialize(); // Bu satır zaten dosyanın sonunda olmalı