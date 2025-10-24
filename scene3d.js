// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/scene3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { state, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, dom } from "./main.js";

let scene, camera, renderer, controls;
let sceneObjects, wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial, mullionMaterial, sillMaterial, handleMaterial, floorMaterial, stairMaterial;
// YENİ: Özel duvar tipleri için malzemeler
let balconyRailingMaterial, glassMaterial, halfWallCapMaterial;

// --- YENİ SABITLER ---
const BALCONY_WALL_HEIGHT = 60; // Balkon duvarı yüksekliği (cm)
const BALCONY_RAILING_HEIGHT = 20; // Korkuluk yüksekliği (cm) - toplam 120cm
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
        color: '#e57373',
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC,
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    
    sillMaterial = new THREE.MeshStandardMaterial({
        color: 0xF5F5F5,
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

// Detaylı pencere (değişiklik yok)
function createComplexWindow(wall, window, thickness) {
    const windowGroup = new THREE.Group();
    const windowHeight = WINDOW_TOP_HEIGHT - WINDOW_BOTTOM_HEIGHT; if (windowHeight <= 0) return null;
    const mullionWidth = 5; const numBottomPanes = 3; const numTopPanes = 2;
    const totalBottomGlassWidth = window.width - (numBottomPanes + 1) * mullionWidth;
    const bottomPaneWidth = totalBottomGlassWidth / numBottomPanes;
    const totalTopGlassWidth = window.width - (numTopPanes + 1) * mullionWidth;
    const topPaneWidth = totalTopGlassWidth / numTopPanes;
    const horizontalMullionY = WINDOW_BOTTOM_HEIGHT + windowHeight * 0.7;
    const bottomSectionHeight = horizontalMullionY - WINDOW_BOTTOM_HEIGHT - mullionWidth / 2;
    const topSectionHeight = WINDOW_TOP_HEIGHT - horizontalMullionY - mullionWidth / 2;

    const horizontalMullion = createBoxMesh(window.width, mullionWidth, thickness * 0.8, mullionMaterial, "h_mullion");
    horizontalMullion.position.y = horizontalMullionY; windowGroup.add(horizontalMullion);

    let currentX = -window.width / 2;
    for (let i = 0; i < numBottomPanes; i++) {
        const leftMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
        leftMullion.position.set(currentX + mullionWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(leftMullion); currentX += mullionWidth;
        if (bottomPaneWidth > 0.1) { const bottomPane = createBoxMesh(bottomPaneWidth, bottomSectionHeight, thickness * 0.5, windowMaterial); bottomPane.position.set(currentX + bottomPaneWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(bottomPane); currentX += bottomPaneWidth; }
    }
    const lastBottomMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
    lastBottomMullion.position.set(window.width / 2 - mullionWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(lastBottomMullion);

    currentX = -window.width / 2;
    for (let i = 0; i < numTopPanes; i++) {
        const leftMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
        leftMullion.position.set(currentX + mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(leftMullion); currentX += mullionWidth;
        if (topPaneWidth > 0.1) { const topPane = createBoxMesh(topPaneWidth, topSectionHeight, thickness * 0.5, windowMaterial); topPane.position.set(currentX + topPaneWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(topPane); currentX += topPaneWidth; }
    }
    const lastTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
    lastTopMullion.position.set(window.width / 2 - mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(lastTopMullion);

    const sillOverhang = 5;
    const sillDepth = thickness + sillOverhang * 2;
    const sillWidth = window.width + sillOverhang * 2;
    const sillHeight = 4;
    const marbleSill = createBoxMesh(sillWidth, sillHeight, sillDepth, sillMaterial, "sill");
    marbleSill.position.y = WINDOW_BOTTOM_HEIGHT - sillHeight / 2;
    marbleSill.position.z = 0;
    windowGroup.add(marbleSill);

    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const windowCenterPos = { x: wall.p1.x + dx * window.pos, y: wall.p1.y + dy * window.pos };
    windowGroup.position.set(windowCenterPos.x, 0, windowCenterPos.y);
    windowGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return windowGroup;
}

// Duvar parçası (değişiklik yok)
function createWallPieceMesh(wall, item, yPos, height, thickness, material) {
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
function createStairMesh(stair, material) {
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

    const stairGroup = new THREE.Group();

    for (let i = 0; i < stepCount; i++) {
        const stepGeom = new THREE.BoxGeometry(stepRun, stepRise, stairWidth);
        stepGeom.translate(0, stepRise / 2, 0);

        const stepMesh = new THREE.Mesh(stepGeom, material);

        const xPos = -totalRun / 2 + stepRun / 2 + i * stepRun;
        const yPos = i * stepRise;
        const zPos = 0;

        stepMesh.position.set(xPos, yPos, zPos);
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
    wallMaterial.color.set(state.wallBorderColor); wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
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

    const { walls, doors, columns, beams, rooms, stairs } = state;

    // Duvarları, kapıları, pencereleri oluştur - DUVAR TİPİ DESTEĞİ İLE
    walls.forEach(w => {
         if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const wallType = w.wallType || 'normal'; // Duvar tipini al
        
        const itemsOnWall = [];
        (doors.filter(d => d.wall === w)).forEach(d => itemsOnWall.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        (w.windows || []).forEach(win => itemsOnWall.push({ item: win, type: 'window', pos: win.pos, width: win.width }));
        itemsOnWall.sort((a, b) => a.pos - b.pos);
        
        let lastPos = 0; const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;
        
        itemsOnWall.forEach(itemData => {
            const itemStart = itemData.pos - itemData.width / 2;
            if (itemStart > lastPos + 0.1) { 
                const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos}; 
                const p2={x:w.p1.x+dx*itemStart, y:w.p1.y+dy*itemStart}; 
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial); // DUVAR TİPİ EKLENDİ
                if(segMesh) sceneObjects.add(segMesh); 
            }
            
            if (itemData.type === 'door') { 
                const doorGroup = createDoorMesh(itemData.item); 
                if(doorGroup) sceneObjects.add(doorGroup); 
                
                // Lento - özel duvar tiplerinde farklı davran
                if (wallType === 'normal' || wallType === 'half') { // Sadece normal ve yarım duvarlarda lento
                    const lintelMesh = createLintelMesh(itemData.item, wallThickness, wallMaterial); 
                    if(lintelMesh) sceneObjects.add(lintelMesh); 
                }
            }
            else if (itemData.type === 'window') { 
                const windowGroup = createComplexWindow(w, itemData.item, wallThickness); 
                if(windowGroup) sceneObjects.add(windowGroup); 
                
                // Lento ve alt dolgu - özel duvar tiplerinde farklı davran
                if (wallType === 'normal' || wallType === 'half') {
                    const lintelHeight = WALL_HEIGHT - WINDOW_TOP_HEIGHT; 
                    const lintelMesh = createWallPieceMesh(w, itemData.item, WINDOW_TOP_HEIGHT, lintelHeight, wallThickness, wallMaterial); 
                    if(lintelMesh) sceneObjects.add(lintelMesh); 
                    
                    const sillHeight = WINDOW_BOTTOM_HEIGHT; 
                    const sillMesh = createWallPieceMesh(w, itemData.item, 0, sillHeight, wallThickness, wallMaterial); 
                    if(sillMesh) sceneObjects.add(sillMesh); 
                }
            }
            lastPos = itemData.pos + itemData.width / 2;
        });
        
        if (wallLen - lastPos > 0.1) { 
            const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos}; 
            const p2={x:w.p1.x+dx*wallLen, y:w.p1.y+dy*wallLen}; 
            const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial); // DUVAR TİPİ EKLENDİ
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
            const m = createStairMesh(stair, stairMaterial);
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