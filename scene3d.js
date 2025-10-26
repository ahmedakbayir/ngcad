// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/scene3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { state, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, dom, BATHROOM_WINDOW_BOTTOM_HEIGHT, BATHROOM_WINDOW_TOP_HEIGHT } from "./main.js"; // Banyo sabitlerini import et

let scene, camera, renderer, controls;
let sceneObjects, wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial, mullionMaterial, sillMaterial, handleMaterial, floorMaterial, stairMaterial, stairMaterialTop;
// YENİ: Özel duvar tipleri için malzemeler
let balconyRailingMaterial, glassMaterial, halfWallCapMaterial ;

// --- YENİ SABITLER ---
const BALCONY_WALL_HEIGHT = 70; // Balkon duvarı yüksekliği (cm)
const BALCONY_RAILING_HEIGHT = 30; // Korkuluk yüksekliği (cm) - toplam 120cm
const HALF_WALL_HEIGHT = 100; // Yarım duvar yüksekliği (cm)
const HALF_WALL_CAP_WIDTH = 5; // Şapka genişliği (her iki taraf için, cm)
const HALF_WALL_CAP_HEIGHT = 5; // Şapka kalınlığı (cm)
const GLASS_WALL_THICKNESS = 2; // Camekan kalınlığı (cm)

// Yardımcı Fonksiyon: Kutu Mesh
function createBoxMesh(width, height, depth, material, name = "") {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = name;
    return mesh;
}

export function init3D(canvasElement) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1f20);

    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    camera.position.set(1500, 1800, 1500);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: canvasElement,
    });

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, WALL_HEIGHT / 2, 0);
    controls.update();

    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2000, 3000, 1500);
    scene.add(amb, dir);

    sceneObjects = new THREE.Group();
    scene.add(sceneObjects);

    const solidOpacity = 0.75;
    
    // Mevcut malzemeler
    wallMaterial = new THREE.MeshStandardMaterial({
        color: '#dbdbdbff',
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    doorMaterial = new THREE.MeshStandardMaterial({
        color: '#146E70',
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    windowMaterial = new THREE.MeshStandardMaterial({
        color: 0xADD8E6,
        roughness: 0.1,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    
    columnMaterial = new THREE.MeshStandardMaterial({
        color: state.wallBorderColor,
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    beamMaterial = new THREE.MeshStandardMaterial({
        color: state.wallBorderColor,
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0x435e9b,
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    sillMaterial = new THREE.MeshStandardMaterial({
        color: 0x2B3C63,
        roughness: 0.5,
        transparent: true,
        opacity: solidOpacity + 0.1,
        side: THREE.DoubleSide
    });
    
    handleMaterial = new THREE.MeshStandardMaterial({
        color: 0xB0B0B0,
        metalness: 0.8,
        roughness: 0.4,
        transparent: false,
        opacity: 1.0
    });
    
    floorMaterial = new THREE.MeshStandardMaterial({
        color: state.wallBorderColor,
        roughness: 0.9,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });
    
    stairMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC,
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    // --- YENİ MALZEMELER ---
    
    // Balkon korkuluk malzemesi (Metalik, ince çubuklar)
    balconyRailingMaterial = new THREE.MeshStandardMaterial({
        color: 0x505050, // Koyu gri/siyah metal
        metalness: 0.7,
        roughness: 0.3,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
    });
    
    // Cam malzemesi (Camekan için)
    glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0F7FA, // Çok açık mavi-beyaz cam rengi
        roughness: 0.05,
        transparent: true,
        opacity: 0.4, // Daha saydam
        side: THREE.DoubleSide,
        metalness: 0.1
    });
    
    // Yarım duvar şapka malzemesi (Beton/taş)
    halfWallCapMaterial = new THREE.MeshStandardMaterial({
        color: 0xBDBDBD, // Açık gri (beton)
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    stairMaterialTop = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC, // Aynı renk
        roughness: 0.8,
        transparent: false, // Opak
        opacity: 1.0,      // Tam opaklık
        side: THREE.DoubleSide
    });
}

export { scene, camera, renderer, controls };

// --- GÜNCELLENMİŞ: createWallSegmentMesh - Duvar tipine göre ---
function createWallSegmentMesh(p1, p2, thickness, wallType, material) {
    const overlap = 0.5;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 1) return null;
    const effectiveLength = wallLength + overlap * 2;
    
    const wallGroup = new THREE.Group();

    // Duvar tipine göre özel çizim
    if (wallType === 'balcony') {
        // 1. Alt Duvar (60cm)
        const baseWallGeom = new THREE.BoxGeometry(effectiveLength, BALCONY_WALL_HEIGHT, thickness);
        baseWallGeom.translate(0, BALCONY_WALL_HEIGHT / 2, 0);
        const baseWallMesh = new THREE.Mesh(baseWallGeom, material);
        wallGroup.add(baseWallMesh);
        
        // 2. Korkuluk (Üst 60cm) - İnce çubuklar
        const railingHeight = BALCONY_RAILING_HEIGHT;
        const railingStartY = BALCONY_WALL_HEIGHT;
        const railingBarThickness = 2; // İnce çubuklar
        const railingSpacing = 15; // Çubuklar arası mesafe
        const numBars = Math.floor(effectiveLength / railingSpacing);
        
        // Üst ve alt yatay çubuklar
        const topBarGeom = new THREE.BoxGeometry(effectiveLength, railingBarThickness, railingBarThickness);
        topBarGeom.translate(0, railingStartY + railingHeight - railingBarThickness/2, 0);
        const topBarMesh = new THREE.Mesh(topBarGeom, balconyRailingMaterial);
        wallGroup.add(topBarMesh);
        
        const bottomBarGeom = new THREE.BoxGeometry(effectiveLength, railingBarThickness, railingBarThickness);
        bottomBarGeom.translate(0, railingStartY + railingBarThickness/2, 0);
        const bottomBarMesh = new THREE.Mesh(bottomBarGeom, balconyRailingMaterial);
        wallGroup.add(bottomBarMesh);
        
        // Dikey çubuklar
        for (let i = 0; i <= numBars; i++) {
            const x = -effectiveLength/2 + (i * railingSpacing);
            const vertBarGeom = new THREE.BoxGeometry(railingBarThickness, railingHeight, railingBarThickness);
            vertBarGeom.translate(x, railingStartY + railingHeight/2, 0);
            const vertBarMesh = new THREE.Mesh(vertBarGeom, balconyRailingMaterial);
            wallGroup.add(vertBarMesh);
        }
        
    } else if (wallType === 'glass') {
        // Camekan - Tek parça ince cam
        const glassGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, GLASS_WALL_THICKNESS);
        glassGeom.translate(0, WALL_HEIGHT / 2, 0);
        const glassMesh = new THREE.Mesh(glassGeom, glassMaterial);
        wallGroup.add(glassMesh);
        
    } else if (wallType === 'half') {
        // 1. Ana yarım duvar (100cm)
        const halfWallGeom = new THREE.BoxGeometry(effectiveLength, HALF_WALL_HEIGHT, thickness);
        halfWallGeom.translate(0, HALF_WALL_HEIGHT / 2, 0);
        const halfWallMesh = new THREE.Mesh(halfWallGeom, material);
        wallGroup.add(halfWallMesh);
        
        // 2. Şapka (üst kısım - her iki tarafa taşkın)
        const capWidth = effectiveLength;
        const capDepth = thickness + (HALF_WALL_CAP_WIDTH * 2); // İki taraftan 5cm taşar
        const capGeom = new THREE.BoxGeometry(capWidth, HALF_WALL_CAP_HEIGHT, capDepth);
        capGeom.translate(0, HALF_WALL_HEIGHT + HALF_WALL_CAP_HEIGHT/2, 0);
        const capMesh = new THREE.Mesh(capGeom, halfWallCapMaterial);
        wallGroup.add(capMesh);
        
    } else {
        // Normal duvar (varsayılan)
        const wallGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, thickness);
        wallGeom.translate(0, WALL_HEIGHT / 2, 0);
        const wallMesh = new THREE.Mesh(wallGeom, material);
        wallGroup.add(wallMesh);
    }
    
    // Pozisyon ve rotasyon
    wallGroup.position.set((p1.x + p2.x) / 2, 0, (p1.y + p2.y) / 2);
    wallGroup.rotation.y = -Math.atan2(p2.y - p1.y, p2.x - p1.x);
    
    return wallGroup;
}

// Kapı (değişiklik yok)
function createDoorMesh(door) {
    const wall = door.wall;
    if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const thickness = wall.thickness || state.wallThickness;
    const handleRadius = 2; const handleLength = 10; const handleHeight = DOOR_HEIGHT * 0.5;
    const handleDistanceFromEdge = 10; const handleOffsetZ = thickness / 2;
    const glassInset = 5; const glassHeight = 50; const glassTopY = DOOR_HEIGHT - glassInset;
    const glassBottomY = glassTopY - glassHeight; const glassWidth = door.width - 2 * glassInset;
    const glassThickness = 2;

    const doorGroup = new THREE.Group();
    const doorGeom = new THREE.BoxGeometry(door.width, DOOR_HEIGHT, thickness);
    doorGeom.translate(0, DOOR_HEIGHT / 2, 0);
    const doorMesh = new THREE.Mesh(doorGeom, doorMaterial);
    doorGroup.add(doorMesh);

    if (glassWidth > 0 && glassHeight > 0) {
        const glassGeom = new THREE.BoxGeometry(glassWidth, glassHeight, glassThickness);
        glassGeom.translate(0, (glassTopY + glassBottomY) / 2, 0);
        const glassMesh = new THREE.Mesh(glassGeom, windowMaterial);
        doorGroup.add(glassMesh);
    }

    const handleGeom = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 16);
    handleGeom.rotateZ(Math.PI / 2);

    const handleMesh1 = new THREE.Mesh(handleGeom, handleMaterial);
    handleMesh1.position.set(door.width / 2 - handleDistanceFromEdge, handleHeight, handleOffsetZ);
    doorGroup.add(handleMesh1);

    const handleMesh2 = handleMesh1.clone();
    handleMesh2.position.z = -handleOffsetZ;
    doorGroup.add(handleMesh2);

    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    doorGroup.position.set(doorCenterPos.x, 0, doorCenterPos.y);
    doorGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return doorGroup;
}

// Lento (değişiklik yok)
function createLintelMesh(door, thickness, material) {
    const wall = door.wall; if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT; if (lintelHeight <= 0) return null;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    const lintelGeom = new THREE.BoxGeometry(door.width, lintelHeight, thickness);
    lintelGeom.translate(0, DOOR_HEIGHT + lintelHeight / 2, 0);
    const lintelMesh = new THREE.Mesh(lintelGeom, material);
    lintelMesh.position.set(doorCenterPos.x, 0, doorCenterPos.y);
    lintelMesh.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    return lintelMesh;
}


function createComplexWindow(wall, window, thickness) {
    const windowGroup = new THREE.Group();

    // --- Banyo kontrolü ---
    const isBathroom = window.roomName === 'BANYO';
    const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
    const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;
    // --- Banyo kontrolü SONU ---

    const windowHeight = topHeight - bottomHeight;
    if (windowHeight <= 0) return null;

    // --- Bölme mantığı 2D ile senkronize edildi ---
    const windowWidthCm = window.width;
    const targetPaneWidth = 45;
    const mullionWidth = 5; // Kayıt kalınlığı (cm)
    const minPaneWidth = 40;
    const maxPaneWidth = 50;

    // Alt bölme sayısı
    let numBottomPanes = Math.max(1, Math.round(windowWidthCm / targetPaneWidth));
    let bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    if (bottomPaneWidth < minPaneWidth && numBottomPanes > 1) {
        numBottomPanes--;
        bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    } else if (bottomPaneWidth > maxPaneWidth) {
        numBottomPanes++;
        bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    }
     if (numBottomPanes === 1 && bottomPaneWidth < minPaneWidth){
         bottomPaneWidth = windowWidthCm - 2*mullionWidth;
     }

    // Üst bölme sayısı (alt ile aynı)
    const numTopPanes = numBottomPanes;
    // Üst bölme genişliği (alt ile aynı)
    let topPaneWidth = bottomPaneWidth;

    // Yatay kayıt pozisyonu (varsa, örneğin %70'de)
    const hasHorizontalMullion = !isBathroom; // Banyoda yatay kayıt olmasın
    const horizontalMullionY = bottomHeight + windowHeight * 0.7; // Eğer varsa pozisyonu
    const bottomSectionHeight = hasHorizontalMullion ? (horizontalMullionY - bottomHeight - mullionWidth / 2) : windowHeight;
    const topSectionHeight = hasHorizontalMullion ? (topHeight - horizontalMullionY - mullionWidth / 2) : 0; // Eğer yoksa üst bölüm yüksekliği 0
    // --- Bölme mantığı SONU ---

    // Yatay kayıt (varsa)
    if (hasHorizontalMullion) {
        const horizontalMullion = createBoxMesh(window.width, mullionWidth, thickness * 0.8, mullionMaterial, "h_mullion");
        horizontalMullion.position.y = horizontalMullionY; windowGroup.add(horizontalMullion);
    }

    // --- DÜZELTME: bottomMullionPositions burada tanımlanmalı ve doldurulmalı ---
    const bottomMullionPositions = []; // Diziyi burada tanımla
    // --- DÜZELTME SONU ---

    // Alt Bölmeler ve Dikey Kayıtlar
    let currentX_bottom = -window.width / 2;
    for (let i = 0; i < numBottomPanes; i++) {
        // Sol dikey kayıt
        const leftMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
        const mullionX = currentX_bottom + mullionWidth / 2; // Kayıt X pozisyonu
        leftMullion.position.set(mullionX, bottomHeight + bottomSectionHeight / 2, 0);
        windowGroup.add(leftMullion);

        // --- DÜZELTME: Kayıt pozisyonunu diziye ekle (ilk kayıt hariç) ---
        if (i > 0) { // İlk kenar kaydını değil, aradakileri ekle
            bottomMullionPositions.push(mullionX);
        }
        // --- DÜZELTME SONU ---

        currentX_bottom += mullionWidth;
        // Cam bölme
        if (bottomPaneWidth > 0.1) {
             const bottomPane = createBoxMesh(bottomPaneWidth, bottomSectionHeight, thickness * 0.5, windowMaterial);
             bottomPane.position.set(currentX_bottom + bottomPaneWidth / 2, bottomHeight + bottomSectionHeight / 2, 0);
             windowGroup.add(bottomPane);
             currentX_bottom += bottomPaneWidth;
        }
    }
    // Son sağ dikey kayıt (alt bölüm için)
    const lastBottomMullionX = window.width / 2 - mullionWidth / 2;
    const lastBottomMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
    lastBottomMullion.position.set(lastBottomMullionX, bottomHeight + bottomSectionHeight / 2, 0);
    windowGroup.add(lastBottomMullion);

    // --- DÜZELTME: Son kaydı da diziye ekle (eğer birden fazla bölme varsa) ---
    if (numBottomPanes > 1) {
         bottomMullionPositions.push(lastBottomMullionX); // Veya currentX_bottom ? Hayır, lastMullionX doğru.
    }
    // --- DÜZELTME SONU ---


    // Üst Bölmeler ve Dikey Kayıtlar (eğer varsa)
    if (hasHorizontalMullion && topSectionHeight > 0.1) {
        let currentX_top = -window.width / 2;

        // Sol kenar kaydı (üst bölüm)
        const firstTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
        firstTopMullion.position.set(currentX_top + mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
        windowGroup.add(firstTopMullion);
        currentX_top += mullionWidth;

        for (let i = 0; i < numTopPanes; i++) {
            // Üst cam bölme
             if (topPaneWidth > 0.1) {
                 const topPane = createBoxMesh(topPaneWidth, topSectionHeight, thickness * 0.5, windowMaterial);
                 const paneStartX = currentX_top;
                 topPane.position.set(paneStartX + topPaneWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
                 windowGroup.add(topPane);
                 currentX_top += topPaneWidth;
             }

            // Sağ dikey kayıt (alt kayıtlara hizalı) - Son bölme hariç
             if (i < numTopPanes - 1) {
                 // --- DÜZELTME: Tanımlı diziden pozisyonu al ---
                 // Hatanın olduğu yer burasıydı. Artık bottomMullionPositions tanımlı olmalı.
                 const mullionX = bottomMullionPositions[i]; // Alt kaydın X pozisyonunu kullan
                 // --- DÜZELTME SONU ---

                 const verticalMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
                 // Pozisyonu ayarla
                 verticalMullion.position.set(mullionX, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
                 windowGroup.add(verticalMullion);
                 currentX_top += mullionWidth;
             }
        }
         // Son sağ dikey kayıt (üst bölüm için)
         const lastTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
         lastTopMullion.position.set(window.width / 2 - mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
         windowGroup.add(lastTopMullion);
    }

    // Mermer Denizlik (Sill)
    const sillOverhang = 5;
    const sillDepth = thickness + sillOverhang * 2;
    const sillWidth = window.width + sillOverhang * 2;
    const sillHeight = 4;
    const marbleSill = createBoxMesh(sillWidth, sillHeight, sillDepth, sillMaterial, "sill");
    marbleSill.position.y = bottomHeight - sillHeight / 2;
    marbleSill.position.z = 0;
    windowGroup.add(marbleSill);

    // Konumlandırma ve Döndürme
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const windowCenterPos = { x: wall.p1.x + dx * window.pos, y: wall.p1.y + dy * window.pos };
    windowGroup.position.set(windowCenterPos.x, 0, windowCenterPos.y);
    windowGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return windowGroup;
}

// ... (Rest of scene3d.js) ...

// Duvar parçası (değişiklik yok)
function createWallPieceMesh(wall, item, yPos, height, thickness, material) {
    if (!wall || !item) return null; // Ekstra kontrol
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1 || height <= 0) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const centerPos = { x: wall.p1.x + dx * item.pos, y: wall.p1.y + dy * item.pos };
    const geom = new THREE.BoxGeometry(item.width, height, thickness);
    geom.translate(0, yPos + height / 2, 0); // Y pozisyonu doğru verilmeli
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(centerPos.x, 0, centerPos.y); // Dünya pozisyonu
    mesh.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    return mesh;
}

// Kolon (değişiklik yok)
function createColumnMesh(column, material) {
    const columnWidth = column.width || column.size; const columnHeight3D = WALL_HEIGHT;
    const columnDepth = column.height || column.size; if (columnWidth < 1 || columnDepth < 1) return null;
    const columnGeom = new THREE.BoxGeometry(columnWidth, columnHeight3D, columnDepth);
    columnGeom.translate(0, columnHeight3D / 2, 0);
    const columnMesh = new THREE.Mesh(columnGeom, material);
    columnMesh.position.set(column.center.x, 0, column.center.y);
    columnMesh.rotation.y = -(column.rotation || 0) * Math.PI / 180;
    return columnMesh;
}

// Kiriş (değişiklik yok)
function createBeamMesh(beam, material) {
     const beamLength = beam.width; const beamThickness = beam.height; const beamDepth = beam.depth || 20;
     if (beamLength < 1) return null;
    const beamGeom = new THREE.BoxGeometry(beamLength, beamDepth, beamThickness);
    const yPosition = WALL_HEIGHT - (beamDepth / 2);
    const beamMesh = new THREE.Mesh(beamGeom, material);
    beamMesh.position.set(beam.center.x, yPosition, beam.center.y);
    beamMesh.rotation.y = -(beam.rotation || 0) * Math.PI / 180;
    return beamMesh;
}

// Merdiven (değişiklik yok)
function createStairMesh(stair) { // material parametresini kaldırdık, içeride kullanacağız
    const totalRun = stair.width;
    const stairWidth = stair.height;
    const stepCount = Math.max(1, stair.stepCount || 1);
    const totalRise = WALL_HEIGHT;

    if (totalRun < 1 || stairWidth < 1 || stepCount < 1) {
        console.warn("Invalid stair dimensions:", stair);
        return null;
    }

    const stepRun = totalRun / stepCount;
    const stepRise = totalRise / stepCount;
    const overlap = 10;

    const stairGroup = new THREE.Group();

    // --- Materyal dizisini hazırla ---
    // BoxGeometry yüzey sırası: +X (sağ), -X (sol), +Y (üst), -Y (alt), +Z (ön), -Z (arka)
    const stepMaterials = [
        stairMaterial,      // Sağ (+X) - Saydam
        stairMaterial,      // Sol (-X) - Saydam
        stairMaterialTop,   // Üst (+Y) - OPAK
        stairMaterial,      // Alt (-Y) - Saydam
        stairMaterial,      // Ön (+Z) - Saydam
        stairMaterial       // Arka (-Z) - Saydam
    ];
    // --- Materyal dizisi sonu ---

    for (let i = 0; i < stepCount; i++) {
        const stepGeom = new THREE.BoxGeometry(stepRun + overlap, stepRise, stairWidth);
        stepGeom.translate(overlap / 2, stepRise / 2, 0);

        // --- Mesh oluştururken materyal dizisini kullan ---
        const stepMesh = new THREE.Mesh(stepGeom, stepMaterials);
        // --- Değişiklik sonu ---

        const stepStartX = -totalRun / 2 + i * stepRun;
        const yPos = i * stepRise;
        const zPos = 0;

        stepMesh.position.set(stepStartX, yPos, zPos);
        stairGroup.add(stepMesh);
    }

    stairGroup.position.set(stair.center.x, 0, stair.center.y);
    stairGroup.rotation.y = -(stair.rotation || 0) * Math.PI / 180;

    return stairGroup;
}

// --- GÜNCELLENMİŞ: update3DScene - Duvar tipi desteği ---
export function update3DScene() {
    if (!dom.mainContainer.classList.contains('show-3d') || !sceneObjects) return;
    sceneObjects.clear();

    const solidOpacity = 0.75;
    //wallMaterial.color.set(state.wallBorderColor); 
    wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
    doorMaterial.transparent = true; doorMaterial.opacity = solidOpacity; doorMaterial.needsUpdate = true;
    windowMaterial.opacity = 0.3; windowMaterial.transparent = true; windowMaterial.needsUpdate = true;
    columnMaterial.color.set(state.wallBorderColor); columnMaterial.transparent = true; columnMaterial.opacity = solidOpacity; columnMaterial.needsUpdate = true;
    beamMaterial.transparent = true; beamMaterial.opacity = solidOpacity; beamMaterial.needsUpdate = true;
    mullionMaterial.transparent = true; mullionMaterial.opacity = solidOpacity; mullionMaterial.needsUpdate = true;
    sillMaterial.transparent = true; sillMaterial.opacity = solidOpacity + 0.1; sillMaterial.needsUpdate = true;
    handleMaterial.transparent = false; handleMaterial.opacity = 1.0; handleMaterial.needsUpdate = true;
    floorMaterial.transparent = true; floorMaterial.opacity = 0.4; floorMaterial.needsUpdate = true;
    stairMaterial.transparent = true; 
    stairMaterial.opacity = solidOpacity;
    stairMaterial.color.set(0xCCCCCC);
    stairMaterial.needsUpdate = true;

    stairMaterialTop.transparent = false; // Opak olduğundan emin ol
    stairMaterialTop.opacity = 1.0;
    stairMaterialTop.color.set(0xCCCCCC); // Rengi eşitle
    stairMaterialTop.needsUpdate = true;

    const { walls, doors, columns, beams, rooms, stairs } = state;

    // Duvarları, kapıları, pencereleri oluştur - DUVAR TİPİ DESTEĞİ İLE
walls.forEach(w => {
         if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const wallType = w.wallType || 'normal';

        const itemsOnWall = [];
        (doors.filter(d => d.wall === w)).forEach(d => itemsOnWall.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        // --- YENİ: Pencere verisine oda adı ekleniyor ---
        (w.windows || []).forEach(win => itemsOnWall.push({ item: { ...win, roomName: win.roomName }, type: 'window', pos: win.pos, width: win.width }));
        // --- YENİ SONU ---
        itemsOnWall.sort((a, b) => a.pos - b.pos);

        let lastPos = 0; const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;

        itemsOnWall.forEach(itemData => {
            const itemStart = itemData.pos - itemData.width / 2;
            if (itemStart > lastPos + 0.1) {
                const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
                const p2={x:w.p1.x+dx*itemStart, y:w.p1.y+dy*itemStart};
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial);
                if(segMesh) sceneObjects.add(segMesh);
            }

            if (itemData.type === 'door') {
                const doorGroup = createDoorMesh(itemData.item);
                if(doorGroup) sceneObjects.add(doorGroup);
                if (wallType === 'normal' || wallType === 'half') {
                    const lintelMesh = createLintelMesh(itemData.item, wallThickness, wallMaterial);
                    if(lintelMesh) sceneObjects.add(lintelMesh);
                }
            }
            else if (itemData.type === 'window') {
                // createComplexWindow artık oda adını itemData.item.roomName olarak alacak
                const windowGroup = createComplexWindow(w, itemData.item, wallThickness);
                if(windowGroup) sceneObjects.add(windowGroup);

                // --- YENİ: Banyo kontrolü ile lento/alt dolgu yükseklikleri ---
                const isBathroom = itemData.item.roomName === 'BANYO';
                const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
                const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;
                // --- YENİ SONU ---

                if (wallType === 'normal' || wallType === 'half') {
                    const lintelHeight = WALL_HEIGHT - topHeight; // topHeight kullanıldı
                    const lintelMesh = createWallPieceMesh(w, itemData.item, topHeight, lintelHeight, wallThickness, wallMaterial); // topHeight kullanıldı
                    if(lintelMesh) sceneObjects.add(lintelMesh);

                    const sillHeight = bottomHeight; // bottomHeight kullanıldı
                    const sillMesh = createWallPieceMesh(w, itemData.item, 0, sillHeight, wallThickness, wallMaterial); // 0 ve sillHeight kullanıldı
                    if(sillMesh) sceneObjects.add(sillMesh);
                }
            }
            lastPos = itemData.pos + itemData.width / 2;
        });

        if (wallLen - lastPos > 0.1) {
            const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
            const p2={x:w.p1.x+dx*wallLen, y:w.p1.y+dy*wallLen};
            const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial);
            if(segMesh) sceneObjects.add(segMesh);
        }
    });

    // Kolonları ekle
    if (columns) { columns.forEach(column => { const m = createColumnMesh(column, columnMaterial); if (m) sceneObjects.add(m); }); }
    
    // Kirişleri ekle
    if (beams) { beams.forEach(beam => { const m = createBeamMesh(beam, beamMaterial); if (m) sceneObjects.add(m); }); }

    // Merdivenleri ekle
if (stairs) {
        stairs.forEach(stair => {
            // createStairMesh artık materyal parametresi almıyor
            const m = createStairMesh(stair);
            if (m) sceneObjects.add(m);
        });
    }

    // Zeminleri Ekle
    if (rooms) {
        rooms.forEach(room => {
            if (room.polygon?.geometry?.coordinates) {
                const coords = room.polygon.geometry.coordinates[0];
                if (coords.length >= 3) {
                    try {
                        let minX = Infinity, maxX = -Infinity;
                        let minY = Infinity, maxY = -Infinity;
                        coords.forEach(p => {
                            minX = Math.min(minX, p[0]);
                            maxX = Math.max(maxX, p[0]);
                            minY = Math.min(minY, p[1]);
                            maxY = Math.max(maxY, p[1]);
                        });
                        const centerX = (minX + maxX) / 2;
                        const centerZ = (minY + maxY) / 2;

                        const shapePoints = coords.map(p =>
                            new THREE.Vector2(p[0] - centerX, -(p[1] - centerZ))
                        );
                        const roomShape = new THREE.Shape(shapePoints);
                        const geometry = new THREE.ShapeGeometry(roomShape);

                        const floorMesh = new THREE.Mesh(geometry, floorMaterial);
                        floorMesh.rotation.x = -Math.PI / 2;
                        floorMesh.position.set(centerX, 0.1, centerZ);

                        sceneObjects.add(floorMesh);
                    } catch (error) {
                        console.error("Zemin oluşturulurken hata:", error, room);
                    }
                }
            }
        });
    }

    // Orbit Hedefini Geri Yükle
    if (sceneObjects.children.length > 0) {
        const boundingBox = new THREE.Box3();
        sceneObjects.children.forEach(obj => {
             if (obj.material !== floorMaterial) {
                 boundingBox.expandByObject(obj);
             }
         });

        if (!boundingBox.isEmpty()) {
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            controls.target.copy(center);
        } else {
             controls.target.set(0, WALL_HEIGHT/2, 0);
        }
    } else {
         controls.target.set(0, WALL_HEIGHT/2, 0);
    }

    controls.update();
}