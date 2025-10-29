// ahmedakbayir/ngcad/ngcad-00d54c478fa934506781fd05812470b2bba6874c/scene3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// Gerekli sabitleri main.js'ten import et
import { state, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, dom, BATHROOM_WINDOW_BOTTOM_HEIGHT, BATHROOM_WINDOW_TOP_HEIGHT } from "./main.js";

let scene, camera, renderer, controls;
// Malzeme değişkenlerini burada (dışarıda) tanımla
let sceneObjects, wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial, mullionMaterial, sillMaterial, handleMaterial, floorMaterial, stairMaterial, stairMaterialTop, ventMaterial, trimMaterial;
// Özel duvar tipleri için malzemeler
let balconyRailingMaterial, glassMaterial, halfWallCapMaterial;
// YENİ MERDİVEN MALZEMELERİ DE BURADA TANIMLANMALI
let handrailWoodMaterial, balusterMaterial, stepNosingMaterial;


// --- YENİ MENFEZ SABİTLERİ ---
const VENT_DIAMETER = 25; // Çap (cm)
const VENT_THICKNESS = 2; // Kalınlık (cm)
// --- YENİ SABİTLER SONU ---

// --- Özel Duvar Sabitleri ---
const BALCONY_WALL_HEIGHT = 60; // Balkon duvarı yüksekliği (cm)
const BALCONY_RAILING_HEIGHT = 60; // Korkuluk yüksekliği (cm) - toplam 120cm
const HALF_WALL_HEIGHT = 100; // Yarım duvar yüksekliği (cm)
const HALF_WALL_CAP_WIDTH = 5; // Şapka genişliği (her iki taraf için, cm)
const HALF_WALL_CAP_HEIGHT = 5; // Şapka kalınlığı (cm)
const GLASS_WALL_THICKNESS = 2; // Camekan kalınlığı (cm)

// --- PERVAZ SABİTLERİ ---
const TRIM_WIDTH = 5; // Pervaz genişliği (cm)
const TRIM_DEPTH = 1; // Pervaz kalınlığı (duvardan ne kadar çıkıntı yapacağı, cm)
// --- PERVAZ SABİTLERİ SONU ---


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
    controls.minDistance = 1; // Değeri küçülterek daha fazla yaklaşmaya izin verin (örneğin 1 veya 0.1)
    controls.zoomSpeed=1
    //controls.enableDamping = true; // Zaten varsa
    //controls.dampingFactor = 0.02; // Değeri küçültebilirsiniz (varsayılan 0.05)
    controls.update();

    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2000, 3000, 1500);
    scene.add(amb, dir);

    sceneObjects = new THREE.Group();
    scene.add(sceneObjects);

    const solidOpacity = 0.75;

    // --- Malzemeleri burada oluştur ---
    wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x979694,
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
        color: "#ADD8E6",
        roughness: 0.1,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });

    columnMaterial = new THREE.MeshStandardMaterial({
        color: state.wallBorderColor, // State'ten alınacak
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    beamMaterial = new THREE.MeshStandardMaterial({
        color: state.wallBorderColor, // State'ten alınacak
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    sillMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000, //mermer
        roughness: 0.5,
        transparent: true,
        opacity: solidOpacity + 0.1,
        side: THREE.DoubleSide
    });

    trimMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000, // Açık gri/beyazımsı - pervaz
        roughness: 0.8,
        transparent: true, // Diğerleriyle uyumlu
        opacity: solidOpacity,
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
        color: state.wallBorderColor, // State'ten alınacak
        roughness: 0.9,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });

    stairMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC,
        roughness: 0.8,
        transparent: true, // Bu saydam kalacak
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

    ventMaterial = new THREE.MeshStandardMaterial({
        color: 0xDDDDDD, // Açık gri metalik/plastik gibi
        roughness: 0.4,
        metalness: 0.2,
        transparent: true, // Diğerleriyle uyumlu
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    balconyRailingMaterial = new THREE.MeshStandardMaterial({
        color: 0x505050, // Koyu metalik renk
        metalness: 0.7,
        roughness: 0.3,
        transparent: true, // Diğerleriyle uyumlu
        opacity: 0.85,     // Biraz daha opak olabilir
        side: THREE.DoubleSide
    });

    glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0F7FA,
        roughness: 0.05,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        metalness: 0.1
    });

    halfWallCapMaterial = new THREE.MeshStandardMaterial({
        color: 0xBDBDBD,
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });


    // YENİ MERDİVEN MALZEMELERİNİ OLUŞTUR
    handrailWoodMaterial = new THREE.MeshStandardMaterial({
        color: '#b3b5b6', 
        roughness: 0.7,  // Biraz pürüzlü
        metalness: 0.1,  // Hafif metalik olmayan yansıma
        transparent: true,
        opacity: solidOpacity, // Diğerleriyle uyumlu
        side: THREE.DoubleSide
    });

    balusterMaterial = new THREE.MeshStandardMaterial({
        color: '#d0d2d3', 
        roughness: 0.75,
        metalness: 0.1,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });

    stepNosingMaterial = new THREE.MeshStandardMaterial({
        color: '#4c4c4d', // Mermer rengi (örneğin krem)
        roughness: 0.4,  // Daha pürüzsüz
        metalness: 0.05,
        transparent: true,
        opacity: solidOpacity + 0.1, // Biraz daha opak
        side: THREE.DoubleSide
    });
    // --- MALZEME OLUŞTURMA SONU ---
}

export { scene, camera, renderer, controls };

// --- Duvar Segmenti Oluşturma (Duvar Tipine Göre) ---
function createWallSegmentMesh(p1, p2, thickness, wallType, material) {
    const overlap = 0.5;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 1) return null;
    const effectiveLength = wallLength + overlap * 2;

    const wallGroup = new THREE.Group();

    if (wallType === 'balcony') {
        // Alt Duvar
        const baseWallGeom = new THREE.BoxGeometry(effectiveLength, BALCONY_WALL_HEIGHT, thickness);
        baseWallGeom.translate(0, BALCONY_WALL_HEIGHT / 2, 0);
        const baseWallMesh = new THREE.Mesh(baseWallGeom, material);
        wallGroup.add(baseWallMesh);

        // Korkuluk
        const railingHeight = BALCONY_RAILING_HEIGHT;
        const railingStartY = BALCONY_WALL_HEIGHT;
        const railingBarThickness = 2;
        const railingSpacing = 15;
        const numBars = Math.floor(effectiveLength / railingSpacing);

        const topBarGeom = new THREE.BoxGeometry(effectiveLength, railingBarThickness, railingBarThickness);
        topBarGeom.translate(0, railingStartY + railingHeight - railingBarThickness/2, 0);
        const topBarMesh = new THREE.Mesh(topBarGeom, balconyRailingMaterial);
        wallGroup.add(topBarMesh);

        const bottomBarGeom = new THREE.BoxGeometry(effectiveLength, railingBarThickness, railingBarThickness);
        bottomBarGeom.translate(0, railingStartY + railingBarThickness/2, 0);
        const bottomBarMesh = new THREE.Mesh(bottomBarGeom, balconyRailingMaterial);
        wallGroup.add(bottomBarMesh);

        for (let i = 0; i <= numBars; i++) {
            const x = -effectiveLength/2 + (i * railingSpacing);
            const vertBarGeom = new THREE.BoxGeometry(railingBarThickness, railingHeight, railingBarThickness);
            vertBarGeom.translate(x, railingStartY + railingHeight/2, 0);
            const vertBarMesh = new THREE.Mesh(vertBarGeom, balconyRailingMaterial);
            wallGroup.add(vertBarMesh);
        }

    } else if (wallType === 'glass') {
        // Camekan
        const glassGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, GLASS_WALL_THICKNESS);
        glassGeom.translate(0, WALL_HEIGHT / 2, 0);
        const glassMesh = new THREE.Mesh(glassGeom, glassMaterial);
        wallGroup.add(glassMesh);

    } else if (wallType === 'half') {
        // Yarım Duvar
        const halfWallGeom = new THREE.BoxGeometry(effectiveLength, HALF_WALL_HEIGHT, thickness);
        halfWallGeom.translate(0, HALF_WALL_HEIGHT / 2, 0);
        const halfWallMesh = new THREE.Mesh(halfWallGeom, material);
        wallGroup.add(halfWallMesh);

        // Şapka
        const capWidth = effectiveLength;
        const capDepth = thickness + (HALF_WALL_CAP_WIDTH * 2);
        const capGeom = new THREE.BoxGeometry(capWidth, HALF_WALL_CAP_HEIGHT, capDepth);
        capGeom.translate(0, HALF_WALL_HEIGHT + HALF_WALL_CAP_HEIGHT/2, 0);
        const capMesh = new THREE.Mesh(capGeom, halfWallCapMaterial);
        wallGroup.add(capMesh);

    } else {
        // Normal duvar
        const wallGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, thickness);
        wallGeom.translate(0, WALL_HEIGHT / 2, 0);
        const wallMesh = new THREE.Mesh(wallGeom, material);
        wallGroup.add(wallMesh);
    }

    // Pozisyon ve rotasyon
    wallGroup.position.set((p1.x + p2.x) / 2, 0, (p1.y + p2.y) / 2); // Z ekseni = 2D Y ekseni
    wallGroup.rotation.y = -Math.atan2(p2.y - p1.y, p2.x - p1.x); // Y ekseni etrafında döndür

    return wallGroup;
}


// --- Kapı Oluşturma (Pervaz Eklendi) ---
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
    handleGeom.rotateZ(Math.PI / 2); // Kolu yatay yap

    const handleMesh1 = new THREE.Mesh(handleGeom, handleMaterial);
    handleMesh1.position.set(door.width / 2 - handleDistanceFromEdge, handleHeight, handleOffsetZ);
    doorGroup.add(handleMesh1);

    const handleMesh2 = handleMesh1.clone();
    handleMesh2.position.z = -handleOffsetZ;
    doorGroup.add(handleMesh2);

    // --- PERVAZ EKLE ---
    const trimDepthActual = thickness / 2 + TRIM_DEPTH; // Duvarın yarısı + çıkıntı
    const trimYCenter = DOOR_HEIGHT / 2;
    const trimTopYCenter = DOOR_HEIGHT + TRIM_WIDTH / 2;

    // Sol Pervaz
    const leftTrim = createBoxMesh(TRIM_WIDTH, DOOR_HEIGHT + TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "left_trim");
    leftTrim.position.set(-door.width / 2 - TRIM_WIDTH / 2, trimYCenter, trimDepthActual);
    doorGroup.add(leftTrim);
    const leftTrimBack = leftTrim.clone();
    leftTrimBack.position.z = -trimDepthActual;
    doorGroup.add(leftTrimBack);


    // Sağ Pervaz
    const rightTrim = createBoxMesh(TRIM_WIDTH, DOOR_HEIGHT + TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "right_trim");
    rightTrim.position.set(door.width / 2 + TRIM_WIDTH / 2, trimYCenter, trimDepthActual);
    doorGroup.add(rightTrim);
    const rightTrimBack = rightTrim.clone();
    rightTrimBack.position.z = -trimDepthActual;
    doorGroup.add(rightTrimBack);

    // Üst Pervaz
    const topTrimWidth = door.width + 2 * TRIM_WIDTH; // Yan pervazların üzerine binecek
    const topTrim = createBoxMesh(topTrimWidth, TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "top_trim");
    topTrim.position.set(0, trimTopYCenter, trimDepthActual);
    doorGroup.add(topTrim);
    const topTrimBack = topTrim.clone();
    topTrimBack.position.z = -trimDepthActual;
    doorGroup.add(topTrimBack);
    // --- PERVAZ SONU ---

    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    doorGroup.position.set(doorCenterPos.x, 0, doorCenterPos.y); // Z = 2D Y
    doorGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return doorGroup;
}


// --- Lento Oluşturma ---
function createLintelMesh(door, thickness, material) {
    const wall = door.wall; if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT; if (lintelHeight <= 0) return null;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    const lintelGeom = new THREE.BoxGeometry(door.width, lintelHeight, thickness);
    lintelGeom.translate(0, DOOR_HEIGHT + lintelHeight / 2, 0); // Y pozisyonunu ayarla
    const lintelMesh = new THREE.Mesh(lintelGeom, material);
    lintelMesh.position.set(doorCenterPos.x, 0, doorCenterPos.y); // Z = 2D Y
    lintelMesh.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    return lintelMesh;
}


// --- Pencere Oluşturma (Banyo Kontrolü, Düzeltilmiş Kayıt, Pervaz ve Yükseltilmiş Mermer) ---
function createComplexWindow(wall, window, thickness) {
    const windowGroup = new THREE.Group();

    const isBathroom = window.roomName === 'BANYO';
    const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
    const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;

    const windowHeight = topHeight - bottomHeight;
    if (windowHeight <= 0) return null;

    const windowWidthCm = window.width;
    const targetPaneWidth = 45;
    const mullionWidth = 5;
    const minPaneWidth = 40;
    const maxPaneWidth = 50;

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

    const numTopPanes = numBottomPanes;
    let topPaneWidth = bottomPaneWidth;

    const hasHorizontalMullion = !isBathroom;
    const horizontalMullionY = bottomHeight + windowHeight * 0.7;
    const bottomSectionHeight = hasHorizontalMullion ? (horizontalMullionY - bottomHeight - mullionWidth / 2) : windowHeight;
    const topSectionHeight = hasHorizontalMullion ? (topHeight - horizontalMullionY - mullionWidth / 2) : 0;

    const bottomMullionPositions = [];

    // Yatay kayıt (varsa)
    if (hasHorizontalMullion) {
        const horizontalMullion = createBoxMesh(window.width, mullionWidth, thickness * 0.96, mullionMaterial, "h_mullion");
        horizontalMullion.position.y = horizontalMullionY; windowGroup.add(horizontalMullion);
    }

    // Alt Bölmeler ve Dikey Kayıtlar
    let currentX_bottom = -window.width / 2;
    for (let i = 0; i < numBottomPanes; i++) {
        const mullionX = currentX_bottom + mullionWidth / 2;
        const leftMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.96, mullionMaterial);
        leftMullion.position.set(mullionX, bottomHeight + bottomSectionHeight / 2, 0);
        windowGroup.add(leftMullion);
        if (i > 0) { bottomMullionPositions.push(mullionX); } // İlk dikmeyi atla (zaten solda var)
        currentX_bottom += mullionWidth;
        if (bottomPaneWidth > 0.1) {
             const bottomPane = createBoxMesh(bottomPaneWidth, bottomSectionHeight, thickness * 0.5, windowMaterial);
             bottomPane.position.set(currentX_bottom + bottomPaneWidth / 2, bottomHeight + bottomSectionHeight / 2, 0);
             windowGroup.add(bottomPane);
             currentX_bottom += bottomPaneWidth;
        }
    }
    const lastBottomMullionX = window.width / 2 - mullionWidth / 2;
    const lastBottomMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.96, mullionMaterial);
    lastBottomMullion.position.set(lastBottomMullionX, bottomHeight + bottomSectionHeight / 2, 0);
    windowGroup.add(lastBottomMullion);
    // Son dikey kaydın pozisyonunu da ekleyelim (üst bölme için lazım olabilir)
    if(numBottomPanes > 0) bottomMullionPositions.push(lastBottomMullionX);


    // Üst Bölmeler ve Dikey Kayıtlar (eğer varsa)
    if (hasHorizontalMullion && topSectionHeight > 0.1) {
        let currentX_top = -window.width / 2;

        const firstTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.96, mullionMaterial);
        firstTopMullion.position.set(currentX_top + mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
        windowGroup.add(firstTopMullion);
        currentX_top += mullionWidth;

        for (let i = 0; i < numTopPanes; i++) {
             if (topPaneWidth > 0.1) {
                 const topPane = createBoxMesh(topPaneWidth, topSectionHeight, thickness * 0.5, windowMaterial);
                 const paneStartX = currentX_top;
                 topPane.position.set(paneStartX + topPaneWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
                 windowGroup.add(topPane);
                 currentX_top += topPaneWidth;
             }
             // Ara dikey kayıtları ekle (numTopPanes > 1 ise)
             if (i < numTopPanes - 1) {
                 const mullionX = -window.width/2 + (i+1)*(mullionWidth+bottomPaneWidth) + mullionWidth/2 ;
                 const verticalMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.96, mullionMaterial);
                 verticalMullion.position.set(mullionX, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
                 windowGroup.add(verticalMullion);
             }
        }
         const lastTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.96, mullionMaterial);
         lastTopMullion.position.set(window.width / 2 - mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
         windowGroup.add(lastTopMullion);
    }

    // Mermer Denizlik (Sill) - YÜKSELTİLDİ
    const sillOverhang = 5;
    const sillDepth = thickness + sillOverhang * 2;
    const sillWidth = window.width + sillOverhang * 2;
    const sillHeight = 4 + 1; // Yüksekliği 1 cm artır
    const marbleSill = createBoxMesh(sillWidth, sillHeight, sillDepth, sillMaterial, "sill");
    marbleSill.position.y = bottomHeight - sillHeight / 2 + 0.5; // Y pozisyonunu 0.5 cm yukarı kaydır
    marbleSill.position.z = 0;
    windowGroup.add(marbleSill);

    // --- PERVAZ EKLE ---
    const trimDepthActual = thickness / 2 + TRIM_DEPTH;
    const trimSideHeight = windowHeight + TRIM_WIDTH; // Üst pervazı da hesaba kat
    const trimSideYCenter = bottomHeight + windowHeight / 2 - TRIM_WIDTH / 2; // Yüksekliği dengelemek için yarım trim aşağı
    const trimTopYCenter = topHeight + TRIM_WIDTH / 2;

    // Sol Pervaz
    const leftTrim = createBoxMesh(TRIM_WIDTH, trimSideHeight, TRIM_DEPTH, trimMaterial, "left_trim");
    leftTrim.position.set(-window.width / 2 - TRIM_WIDTH / 2, trimSideYCenter, trimDepthActual);
    windowGroup.add(leftTrim);
    const leftTrimBack = leftTrim.clone();
    leftTrimBack.position.z = -trimDepthActual;
    windowGroup.add(leftTrimBack);

    // Sağ Pervaz
    const rightTrim = createBoxMesh(TRIM_WIDTH, trimSideHeight, TRIM_DEPTH, trimMaterial, "right_trim");
    rightTrim.position.set(window.width / 2 + TRIM_WIDTH / 2, trimSideYCenter, trimDepthActual);
    windowGroup.add(rightTrim);
    const rightTrimBack = rightTrim.clone();
    rightTrimBack.position.z = -trimDepthActual;
    windowGroup.add(rightTrimBack);

    // Üst Pervaz
    const topTrimWidth = window.width + 2 * TRIM_WIDTH;
    const topTrim = createBoxMesh(topTrimWidth, TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "top_trim");
    topTrim.position.set(0, trimTopYCenter, trimDepthActual);
    windowGroup.add(topTrim);
    const topTrimBack = topTrim.clone();
    topTrimBack.position.z = -trimDepthActual;
    windowGroup.add(topTrimBack);
    // --- PERVAZ SONU ---


    // Konumlandırma ve Döndürme
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const windowCenterPos = { x: wall.p1.x + dx * window.pos, y: wall.p1.y + dy * window.pos };
    windowGroup.position.set(windowCenterPos.x, 0, windowCenterPos.y);
    windowGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return windowGroup;
}


// --- Duvar Parçası Oluşturma (Pencere altı/üstü için) ---
function createWallPieceMesh(wall, item, yPos, height, thickness, material) {
    if (!wall || !item || !wall.p1 || !wall.p2) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1 || height <= 0) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const centerPos = { x: wall.p1.x + dx * item.pos, y: wall.p1.y + dy * item.pos };
    const geom = new THREE.BoxGeometry(item.width, height, thickness);
    geom.translate(0, yPos + height / 2, 0);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(centerPos.x, 0, centerPos.y);
    mesh.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
    return mesh;
}

// --- Kolon Oluşturma ---
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

// --- Kiriş Oluşturma ---
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

function createRoundedBoxMesh(width, height, depth, radius, material) {
    const shape = new THREE.Shape();
    const halfWidth = width / 2 - radius;
    const halfHeight = height / 2 - radius; // Bu derinlik olacak (Z ekseni)
    const halfDepth = depth / 2; // Bu yükseklik olacak (Y ekseni)

    // Not: Three.js'de Shape 2D'dir (XY düzlemi). Extrude ile derinlik (Z) eklenir.
    // Ancak bizim merdiven basamaklarımız XZ düzleminde uzanıyor ve Y yüksekliği var.
    // Bu yüzden ExtrudeGeometry veya ShapeGeometry doğrudan uygun değil.
    // Box + Cylinder kombinasyonunu kullanacağız.

    const boxWidth = width - 2 * radius;
    const boxDepth = depth; // Yüksekliği depth olarak alıyoruz
    const boxHeight = height; // En'i height olarak alıyoruz

    const group = new THREE.Group();

    // Orta Kutu Kısmı (Eğer genişlik > 2*radius ise)
    if (boxWidth > 0) {
        const boxGeom = new THREE.BoxGeometry(boxWidth, boxDepth, boxHeight);
        const boxMesh = new THREE.Mesh(boxGeom, material);
        group.add(boxMesh);
    }

    // Uç Silindirler (Yarım)
    const cylinderGeom = new THREE.CylinderGeometry(radius, radius, boxDepth, 16);
    // Silindiri X ekseni etrafında 90 derece döndürerek Z eksenine paralel hale getir
    cylinderGeom.rotateX(Math.PI / 2);

    const leftCap = new THREE.Mesh(cylinderGeom, material);
    leftCap.position.x = -boxWidth / 2; // Sol uca taşı
    group.add(leftCap);

    const rightCap = new THREE.Mesh(cylinderGeom, material);
    rightCap.position.x = boxWidth / 2; // Sağ uca taşı
    group.add(rightCap);

    return group;
}


// ahmedakbayir/ngcad/ngcad-a560cec7fc337c4aaff6feec495df3495bee850d/scene3d.js
// ... (importlar ve diğer fonksiyonlar) ...

// ahmedakbayir/ngcad/ngcad-a560cec7fc337c4aaff6feec495df3495bee850d/scene3d.js

function createStairMesh(stair) {
    const totalRun = stair.width; // Merdiven uzunluğu (X ekseni)
    const stairWidth = stair.height; // Merdiven eni (Z ekseni)
    const stepCount = Math.max(1, stair.stepCount || 1);
    const bottomElevation = stair.bottomElevation || 0; // Alt kot
    const topElevation = stair.topElevation || 270; // Üst kot
    const totalRise = topElevation - bottomElevation; // Merdiven toplam yüksekliği (Y ekseni)
    const isLanding = stair.isLanding || false; // Sahanlık mı?

    // Geçersiz boyutlar veya negatif yükseklik için kontrol
    if (totalRun < 1 || stairWidth < 1 || stepCount < 1 || (!isLanding && totalRise <= 0)) {
        console.warn("Invalid stair dimensions or elevation:", stair);
        return null;
    }

    const stairGroup = new THREE.Group();
    stairGroup.position.set(stair.center.x, 0, stair.center.y); // Zemin Y=0'a göre merkezle
    stairGroup.rotation.y = -(stair.rotation || 0) * Math.PI / 180;

    // --- SAHANLIK DURUMU (Değişiklik yok) ---
    if (isLanding) {
        const landingThickness = 10;
        const marbleThickness = 2;
        const landingGeom = new THREE.BoxGeometry(totalRun, landingThickness, stairWidth);
        landingGeom.translate(0, landingThickness / 2, 0);
        const landingMesh = new THREE.Mesh(landingGeom, stairMaterial);
        landingMesh.position.y = bottomElevation;
        stairGroup.add(landingMesh);
        const marbleGeom = new THREE.BoxGeometry(totalRun, marbleThickness, stairWidth);
        marbleGeom.translate(0, marbleThickness / 2, 0);
        const marbleMesh = new THREE.Mesh(marbleGeom, stepNosingMaterial);
        marbleMesh.position.y = bottomElevation + landingThickness;
        stairGroup.add(marbleMesh);
        return stairGroup;
    }
    // --- SAHANLIK DURUMU SONU ---


    // --- NORMAL MERDİVEN HESAPLAMALARI (Değişiklik yok) ---
    const stepRun = totalRun / stepCount; // Rıht derinliği
    const stepRise = totalRise / stepCount; // Rıht yüksekliği
    const overlap = 10; // Basamak bindirme payı
    const NOSING_THICKNESS = 2; // Mermer kalınlığı
    const NOSING_OVERHANG = 2; // Öne çıkıntı miktarı

    // Malzemeler (değişiklik yok)
    const stepMaterials = [ stairMaterial, stairMaterial, stairMaterialTop, stairMaterial, stairMaterial, stairMaterial ];
    const stepNosingMaterials = [ stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial, stepNosingMaterial ];

    // --- BASAMAKLARI OLUŞTUR (Standart BoxGeometry ile) ---
    for (let i = 0; i < stepCount; i++) {
        const yPosBase = bottomElevation + i * stepRise; // Basamağın alt kotu
        const stepStartX = -totalRun / 2 + i * stepRun;

        // Beton Basamak Kısmı (Overlap dahil)
        const concreteStepRun = stepRun + overlap;
        const concreteStepGeom = new THREE.BoxGeometry(concreteStepRun, stepRise, stairWidth);
        // Geometriyi merkeze al, sonra pozisyonla
        concreteStepGeom.translate(concreteStepRun / 2, stepRise / 2, 0);
        const concreteStepMesh = new THREE.Mesh(concreteStepGeom, stepMaterials);
        concreteStepMesh.position.set(stepStartX, yPosBase, 0); // Alt kota göre yerleştir
        stairGroup.add(concreteStepMesh);

        // Mermer Tabla (Üst Yüzey) - Basamağın tüm yüzeyini kaplar
        const tablaRun = stepRun; // Basamağın tam uzunluğu
        const tablaGeom = new THREE.BoxGeometry(tablaRun, NOSING_THICKNESS, stairWidth);
        tablaGeom.translate(0, NOSING_THICKNESS / 2, 0); // Merkeze al
        const tablaMesh = new THREE.Mesh(tablaGeom, stepNosingMaterials);
        // Tablayı basamağın üst kotuna yerleştir
        tablaMesh.position.set(stepStartX + stepRun / 2, yPosBase + stepRise, 0);
        stairGroup.add(tablaMesh);

        // Mermer Burun Kısmı (Öne çıkıntı)
        const nosingRun = NOSING_OVERHANG;
        const nosingGeom = new THREE.BoxGeometry(nosingRun, NOSING_THICKNESS, stairWidth);
        nosingGeom.translate(0, NOSING_THICKNESS / 2, 0); // Merkeze al
        const nosingMesh = new THREE.Mesh(nosingGeom, stepNosingMaterials);
        // Burnu basamağın ön ucuna yerleştir
        nosingMesh.position.set(stepStartX + stepRun + NOSING_OVERHANG / 2, yPosBase + stepRise, 0);
        stairGroup.add(nosingMesh);
    }
    // --- BASAMAK OLUŞTURMA SONU ---

    // --- Korkulukları Oluştur (Kotları dikkate alarak - Küpeşte Uçları Yuvarlatılmış - Değişiklik Yok) ---
    const HANDRAIL_HEIGHT = 90;
    const HANDRAIL_INSET = 10;
    const POST_RADIUS = 3;
    const BALUSTER_RADIUS = 1.5;
    const HANDRAIL_RADIUS = 4; // Küpeşte yarıçapı
    const BALUSTER_SPACING = stepRun;

    const postMaterial = handrailWoodMaterial;
    const balusterMaterialUsed = balusterMaterial;
    const handrailMaterialUsed = handrailWoodMaterial;
    const sphereMaterial = handrailWoodMaterial; // Küreler için de aynı malzeme

    for (let side = -1; side <= 1; side += 2) {
        const handrailGroup = new THREE.Group();
        const zOffset = side * (stairWidth / 2 - HANDRAIL_INSET);

        // Başlangıç Dikmesi (Alt) - Alt kota göre
        const startPostHeight = HANDRAIL_HEIGHT - HANDRAIL_RADIUS;
        const startPostGeom = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, startPostHeight, 16);
        startPostGeom.translate(0, startPostHeight / 2, 0);
        const startPost = new THREE.Mesh(startPostGeom, postMaterial);
        startPost.position.set(-totalRun / 2 + POST_RADIUS, bottomElevation, zOffset);
        handrailGroup.add(startPost);

        // Bitiş Dikmesi (Üst) - Üst kota göre
        const endPostYBase = topElevation;
        const endPostHeight = HANDRAIL_HEIGHT - HANDRAIL_RADIUS;
        const endPostGeom = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, endPostHeight, 16);
        endPostGeom.translate(0, endPostHeight / 2, 0);
        const endPost = new THREE.Mesh(endPostGeom, postMaterial);
        endPost.position.set(totalRun / 2 - POST_RADIUS, endPostYBase, zOffset);
        handrailGroup.add(endPost);

        // Ara Dikmeler (Balusters) - Kotları dikkate alarak
        const numBalusters = stepCount -1;
        const stairSlope = totalRise / totalRun;
        for (let i = 0; i < numBalusters; i++) {
            const balusterX = -totalRun / 2 + (i + 1) * stepRun;
            const balusterYBase = bottomElevation + (i + 1) * stepRise + NOSING_THICKNESS;
            const handrailCenterYAtX = (bottomElevation + startPostHeight + HANDRAIL_RADIUS) + (balusterX - (-totalRun / 2 + POST_RADIUS)) * stairSlope;
            const balusterHeight = handrailCenterYAtX - balusterYBase - HANDRAIL_RADIUS;

            if (balusterHeight > 0.1) {
                const balusterGeom = new THREE.CylinderGeometry(BALUSTER_RADIUS, BALUSTER_RADIUS, balusterHeight, 12);
                balusterGeom.translate(0, balusterHeight / 2, 0);
                const baluster = new THREE.Mesh(balusterGeom, balusterMaterialUsed);
                baluster.position.set(balusterX, balusterYBase, zOffset);
                handrailGroup.add(baluster);
            }
        }

        // --- KÜPEŞTE (Silindir + Küreler) ---
        const railingStartX = startPost.position.x;
        const railingStartY = bottomElevation + startPostHeight + HANDRAIL_RADIUS;
        const railingEndX = endPost.position.x;
        const railingEndY = topElevation + endPostHeight + HANDRAIL_RADIUS;

        const deltaX = railingEndX - railingStartX;
        const deltaY = railingEndY - railingStartY;
        const railingLength = Math.hypot(deltaX, deltaY);
        const railingAngle = Math.atan2(deltaY, deltaX);

        // Ana Silindir Kısmı (Uçlardaki küreler için biraz kısaltılmış)
        const cylinderLength = Math.max(0.1, railingLength - HANDRAIL_RADIUS * 2);
        const railingGeom = new THREE.CylinderGeometry(HANDRAIL_RADIUS, HANDRAIL_RADIUS, cylinderLength, 16);
        const railingMesh = new THREE.Mesh(railingGeom, handrailMaterialUsed);

        // Küre Geometrisi
        const sphereGeom = new THREE.SphereGeometry(HANDRAIL_RADIUS, 16, 8);

        // Başlangıç Küresi
        const startSphere = new THREE.Mesh(sphereGeom, sphereMaterial);
        startSphere.position.set(railingStartX, railingStartY, zOffset);
        handrailGroup.add(startSphere);

        // Bitiş Küresi
        const endSphere = new THREE.Mesh(sphereGeom, sphereMaterial);
        endSphere.position.set(railingEndX, railingEndY, zOffset);
        handrailGroup.add(endSphere);

        // Silindiri kürelerin arasına yerleştir
        const railingCenterX = (railingStartX + railingEndX) / 2;
        const railingCenterY = (railingStartY + railingEndY) / 2;
        railingMesh.position.set(railingCenterX, railingCenterY, zOffset);
        railingMesh.rotation.z = Math.PI / 2 + railingAngle;

        handrailGroup.add(railingMesh);
        stairGroup.add(handrailGroup);
        // --- KÜPEŞTE SONU ---
    }
    // --- Korkuluk Sonu ---

    return stairGroup;
}


function createVentMesh(wall, vent) {
    if (!wall || !wall.p1 || !wall.p2) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const VENT_Y_POSITION = WALL_HEIGHT - (VENT_DIAMETER / 2) - 15; // Yüksekliği sabit
    const wallThickness = wall.thickness || state.wallThickness; // Duvar kalınlığı
    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy; // Duvar normali X
    const ny = dx;  // Duvar normali Y (3D'de Z)

    const ventCenterX_2D = wall.p1.x + dx * vent.pos;
    const ventCenterZ_2D = wall.p1.y + dy * vent.pos; // 2D Y -> 3D Z

    const ventRadius = VENT_DIAMETER / 2;
    const baseThickness = 1.0; // Diskin (silindirin) yüksekliği/kalınlığı

    const ventGroup = new THREE.Group();

    // Duvarın her iki yüzeyi için disk oluştur (-1 ve 1)
    for (let side = -1; side <= 1; side += 2) {
        // Menfezin 3D merkez koordinatları (duvar yüzeyinden YARIM disk kalınlığı kadar dışarıda)
        const ventCenterX_3D = ventCenterX_2D + nx * (wallThickness / 2 * side + baseThickness / 2 * side);
        const ventCenterY_3D = VENT_Y_POSITION; // Sabit Y konumu
        const ventCenterZ_3D = ventCenterZ_2D + ny * (wallThickness / 2 * side + baseThickness / 2 * side);

        // Ana Disk (İnce Silindir)
        const baseGeom = new THREE.CylinderGeometry(ventRadius, ventRadius, baseThickness, 32);
        const baseMesh = new THREE.Mesh(baseGeom, ventMaterial);

        // Silindiri doğru konuma taşı
        baseMesh.position.set(ventCenterX_3D, ventCenterY_3D, ventCenterZ_3D);

        // Silindiri duvarın açısına göre Y ekseni etrafında döndür.
        const wallAngle = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x); // Duvar açısı
        baseMesh.rotation.y = wallAngle;

        // Ardından, dairesel yüzeyini duvar yüzeyine paralel yapmak için
        // KENDİ LOKAL X ekseni etrafında 90 derece döndür.
        baseMesh.rotateX(Math.PI / 2); // rotateX lokal eksende çalışır

        ventGroup.add(baseMesh); // Diski ana gruba ekle
    }

    return ventGroup; // Ana grubu döndür
}

export function fit3DViewToScreen() {
    // Gerekli Three.js nesnelerinin varlığını kontrol et
    if (!sceneObjects || !camera || !controls || !renderer || !scene) {
        console.error("Fit 3D: Gerekli nesneler (sceneObjects, camera, controls, renderer, scene) bulunamadı.");
        return;
    }

    const boundingBox = new THREE.Box3();
    let hasContent = false;

    // Görünür olan ve zemin olmayan nesneleri dahil et
    sceneObjects.children.forEach(obj => {
        if (obj.visible && obj.material !== floorMaterial) {
            try {
                // Nesnenin dünya matrisinin güncel olduğundan emin ol
                obj.updateMatrixWorld(true);
                // Nesnenin sınırlayıcı kutusunu dünya koordinatlarında al
                const box = new THREE.Box3().setFromObject(obj, true); // true -> dünya koordinatları
                if (!box.isEmpty()) {
                    boundingBox.union(box); // Genel kutuya dahil et
                    hasContent = true;
                }
            } catch (error) {
                console.error("Fit 3D: Nesne sınırlayıcı kutusu hesaplanırken hata:", obj, error);
            }
        }
    });

    // İçerik yoksa veya kutu boşsa varsayılan görünüme dön
    if (!hasContent || boundingBox.isEmpty()) {
        console.log("Fit 3D: Sığdırılacak içerik bulunamadı, varsayılana dönülüyor.");
        controls.target.set(0, WALL_HEIGHT / 2, 0);
        camera.position.set(1500, 1800, 1500); // Varsayılan pozisyon
        controls.update();
        return;
    }

    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();

    try {
        boundingBox.getCenter(center);
        boundingBox.getBoundingSphere(sphere); // Kapsayan küreyi al
    } catch (error) {
        console.error("Fit 3D: Bounding box merkez/küre alınırken hata:", error);
        return; // Hata durumunda işlemi durdur
    }


    // Küre yarıçapı sıfır veya geçersizse işlemi durdur
    if (!sphere.radius || sphere.radius <= 0) {
        console.warn("Fit 3D: Hesaplanan küre yarıçapı geçersiz:", sphere.radius);
        // Hedefi merkeze alıp varsayılan bir mesafeye gitmeyi deneyebiliriz
        controls.target.copy(center);
        camera.position.set(center.x + 1000, center.y + 1000, center.z + 1000); // Örnek mesafe
        controls.update();
        return;
    }


    const radius = sphere.radius;
    const fov = camera.fov * (Math.PI / 180); // FOV'u radyana çevir

    // Küreyi dikey FOV'a sığdırmak için gereken mesafeyi hesapla
    let distance = radius / Math.sin(fov / 2);

    // Yatay FOV'u da hesaba kat (geniş nesneler için)
    const aspect = camera.aspect;
    const halfFovHorizontal = Math.atan(Math.tan(fov / 2) * aspect);
    const distanceHorizontal = radius / Math.sin(halfFovHorizontal);
    distance = Math.max(distance, distanceHorizontal); // İki mesafeden büyük olanı al

    // Yeni kamera pozisyonunu hesapla (mevcut yönü koruyarak)
    const direction = new THREE.Vector3();
    // Kamera pozisyonu hedefe çok yakınsa veya aynıysa varsayılan bir yön kullan
    if (camera.position.distanceTo(controls.target) < 0.1) {
        direction.set(0, 0.5, 1).normalize(); // Örnek bir yön
        console.warn("Fit 3D: Kamera hedefe çok yakın, varsayılan yön kullanılıyor.");
    } else {
        direction.subVectors(camera.position, controls.target).normalize();
    }

    const newPosition = new THREE.Vector3();
    // Merkezden hesaplanan mesafe kadar geriye git + biraz pay (1.1)
    newPosition.copy(center).addScaledVector(direction, distance * 1.1); // Padding faktörü 1.1

    // Kamera ve hedefi güncelle
    controls.target.copy(center);
    camera.position.copy(newPosition);

    // Kamera hedefe baktığından emin ol (opsiyonel ama faydalı olabilir)
    // camera.lookAt(center);

    controls.update();

    // Debugging için
    console.log("Fit 3D Başarılı: Center=", center.toArray().map(v => v.toFixed(2)), "Radius=", radius.toFixed(2), "Distance=", distance.toFixed(2), "NewPos=", newPosition.toArray().map(v => v.toFixed(2)));
}

// --- 3D Sahneyi Güncelleme ---
export function update3DScene() {
    if (!dom.mainContainer.classList.contains('show-3d') || !sceneObjects) return;
    sceneObjects.clear();

    const solidOpacity = 1 ;//0.75;

    // Materyal güncellemeleri
    // ... (diğer materyal güncellemeleri aynı) ...
    wallMaterial.color.set(state.wallBorderColor); wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
    doorMaterial.transparent = true; doorMaterial.opacity = solidOpacity; doorMaterial.needsUpdate = true;
    windowMaterial.opacity = 0.3; windowMaterial.transparent = true; windowMaterial.needsUpdate = true;
    columnMaterial.color.set(state.wallBorderColor); columnMaterial.transparent = true; columnMaterial.opacity = solidOpacity; columnMaterial.needsUpdate = true;
    beamMaterial.transparent = true; beamMaterial.opacity = solidOpacity; beamMaterial.needsUpdate = true;
    mullionMaterial.transparent = true; mullionMaterial.opacity = solidOpacity; mullionMaterial.needsUpdate = true;
    sillMaterial.transparent = true; sillMaterial.opacity = solidOpacity + 0.1; sillMaterial.needsUpdate = true;
    handleMaterial.transparent = false; handleMaterial.opacity = 1.0; handleMaterial.needsUpdate = true;
    floorMaterial.transparent = true; floorMaterial.opacity = 0.4; floorMaterial.needsUpdate = true;
    stairMaterial.transparent = true; stairMaterial.opacity = solidOpacity; stairMaterial.color.set(0xCCCCCC); stairMaterial.needsUpdate = true;
    stairMaterialTop.transparent = false; stairMaterialTop.opacity = 1.0; stairMaterialTop.color.set(0xCCCCCC); stairMaterialTop.needsUpdate = true;
    ventMaterial.transparent = true; ventMaterial.opacity = solidOpacity; ventMaterial.needsUpdate = true;
    trimMaterial.transparent = true; trimMaterial.opacity = solidOpacity; trimMaterial.needsUpdate = true;
    balconyRailingMaterial.transparent = true; balconyRailingMaterial.opacity = 0.85; balconyRailingMaterial.needsUpdate = true;
    glassMaterial.transparent = true; glassMaterial.opacity = 0.4; glassMaterial.needsUpdate = true;
    halfWallCapMaterial.transparent = true; halfWallCapMaterial.opacity = solidOpacity; halfWallCapMaterial.needsUpdate = true;
    // Yeni merdiven malzemeleri
    handrailWoodMaterial.transparent = true; handrailWoodMaterial.opacity = solidOpacity; handrailWoodMaterial.needsUpdate = true;
    balusterMaterial.transparent = true; balusterMaterial.opacity = solidOpacity; balusterMaterial.needsUpdate = true;
    stepNosingMaterial.transparent = true; stepNosingMaterial.opacity = solidOpacity + 0.1; stepNosingMaterial.needsUpdate = true;


    const { walls, doors, columns, beams, rooms, stairs } = state;

    // Duvarları, kapıları, pencereleri, menfezleri oluştur
    // ... (bu bölüm aynı) ...
    walls.forEach(w => {
        if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const wallType = w.wallType || 'normal';

        const itemsOnWall = [];
        (doors.filter(d => d.wall === w)).forEach(d => itemsOnWall.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        (w.windows || []).forEach(win => itemsOnWall.push({ item: { ...win, roomName: win.roomName }, type: 'window', pos: win.pos, width: win.width }));
        (w.vents || []).forEach(v => itemsOnWall.push({ item: v, type: 'vent', pos: v.pos, width: v.width }));
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
                const windowGroup = createComplexWindow(w, itemData.item, wallThickness);
                if(windowGroup) sceneObjects.add(windowGroup);
                const isBathroom = itemData.item.roomName === 'BANYO';
                const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
                const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;
                if (wallType === 'normal' || wallType === 'half') {
                    const lintelHeight = WALL_HEIGHT - topHeight;
                    const lintelMesh = createWallPieceMesh(w, itemData.item, topHeight, lintelHeight, wallThickness, wallMaterial);
                    if(lintelMesh) sceneObjects.add(lintelMesh);
                    const sillHeight = bottomHeight;
                    const sillMesh = createWallPieceMesh(w, itemData.item, 0, sillHeight, wallThickness, wallMaterial);
                    if(sillMesh) sceneObjects.add(sillMesh);
                }
            }
            else if (itemData.type === 'vent') {
                const ventMeshGroup = createVentMesh(w, itemData.item);
                if (ventMeshGroup) sceneObjects.add(ventMeshGroup);
            }

            if (itemData.type === 'door' || itemData.type === 'window') {
                lastPos = itemData.pos + itemData.width / 2;
            }
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
            const m = createStairMesh(stair);
            if (m) sceneObjects.add(m);
        });
    }

    // Zeminleri Ekle
    // ... (bu bölüm aynı) ...
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

    // Orbit Hedefini Ayarla (Ortala)
    // ... (bu bölüm aynı) ...
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