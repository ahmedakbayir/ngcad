// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/scene3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// dom eklendi
import { state, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, dom } from "./main.js";

let scene, camera, renderer, controls;
// Malzemeler güncellendi (opacity) ve floorMaterial eklendi
// Malzemelere stairMaterial ekle
let sceneObjects, wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial, mullionMaterial, sillMaterial, handleMaterial, floorMaterial, stairMaterial;

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
    controls.target.set(0, WALL_HEIGHT / 2, 0); // Başlangıç hedefi
    controls.update(); // İlk hedefi uygula

    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2000, 3000, 1500);
    scene.add(amb, dir);

    sceneObjects = new THREE.Group();
    scene.add(sceneObjects);

    // --- Malzemeler Güncellendi: Opaklık %75 (cam hariç) ve Kapı Rengi ---
    const solidOpacity = 0.75;
    wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x979694,
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    // Kapı rengi güncellendi
    doorMaterial = new THREE.MeshStandardMaterial({
        color: '#146E70', // <-- Değişti: rgba(20, 110, 112, 1)
        roughness: 0.8,
        transparent: true, // Cam içerdiği için true kalmalı
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    windowMaterial = new THREE.MeshStandardMaterial({
        color: 0xADD8E6, // Açık mavi cam rengi
        roughness: 0.1,
        transparent: true,
        opacity: 0.3,      // Cam %30 opak
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
        color: '#e57373', // Kırmızımsı
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC, // Açık gri kayıt rengi
        roughness: 0.7,
        transparent: true,
        opacity: solidOpacity,
        side: THREE.DoubleSide
    });
    sillMaterial = new THREE.MeshStandardMaterial({
        color: 0xF5F5F5, // Beyaz mermer rengi
        roughness: 0.5,
        transparent: true,
        opacity: solidOpacity + 0.1,
        side: THREE.DoubleSide
    });
    // Kapı kolu opak kalabilir
    handleMaterial = new THREE.MeshStandardMaterial({
        color: 0xB0B0B0, // Gri metalik renk
        metalness: 0.8,
        roughness: 0.4,
        transparent: false,
        opacity: 1.0
    });
    // Zemin Malzemesi (%40 opak)
    floorMaterial = new THREE.MeshStandardMaterial({
        color:  state.wallBorderColor, // Koyu Gri
        roughness: 0.9,
        transparent: true,
        opacity: 0.4,      // Yarı Saydam
        side: THREE.DoubleSide
    });
    // --- Güncelleme Sonu ---
    // YENİ MALZEMEYİ AŞAĞIYA EKLEYİN
    stairMaterial = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC, // Açık gri beton rengi (Beyaz DEĞİL)
        roughness: 0.8,
        transparent: true,
        opacity: solidOpacity, // Diğerleriyle aynı opaklık
        side: THREE.DoubleSide
    });
    // --- Güncelleme Sonu ---
}

export { scene, camera, renderer, controls };

// Duvar segmenti (overlap arttırıldı)
function createWallSegmentMesh(p1, p2, thickness, material) {
    const overlap = 0.5; // Köşe boşlukları için
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 1) return null;
    const effectiveLength = wallLength + overlap * 2;
    const wallGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, thickness);
    wallGeom.translate(0, WALL_HEIGHT / 2, 0);
    const wallMesh = new THREE.Mesh(wallGeom, material);
    wallMesh.position.set((p1.x + p2.x) / 2, 0, (p1.y + p2.y) / 2);
    wallMesh.rotation.y = -Math.atan2(p2.y - p1.y, p2.x - p1.x);
    return wallMesh;
}

// Kapı (cam kalınlığı arttırıldı)
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
    const glassThickness = 2; // Cam kalınlığı

    const doorGroup = new THREE.Group();
    const doorGeom = new THREE.BoxGeometry(door.width, DOOR_HEIGHT, thickness);
    doorGeom.translate(0, DOOR_HEIGHT / 2, 0);
    const doorMesh = new THREE.Mesh(doorGeom, doorMaterial);
    doorGroup.add(doorMesh);

    if (glassWidth > 0 && glassHeight > 0) {
        const glassGeom = new THREE.BoxGeometry(glassWidth, glassHeight, glassThickness);
        glassGeom.translate(0, (glassTopY + glassBottomY) / 2, 0); // Z=0 merkezli
        const glassMesh = new THREE.Mesh(glassGeom, windowMaterial); // Cam malzemesi KULLANILDI
        doorGroup.add(glassMesh);
    }

    const handleGeom = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 16);
    handleGeom.rotateZ(Math.PI / 2); // X eksenine paralel yap

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

// Detaylı pencere (mermer düzeltmesiyle)
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

    // 1. Yatay Kayıt
    const horizontalMullion = createBoxMesh(window.width, mullionWidth, thickness * 0.8, mullionMaterial, "h_mullion");
    horizontalMullion.position.y = horizontalMullionY; windowGroup.add(horizontalMullion);

    // 2. Alt Dikey Kayıtlar ve Cam Paneller
    let currentX = -window.width / 2;
    for (let i = 0; i < numBottomPanes; i++) { /* ... alt kayıtlar ve camlar ... */
        const leftMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
        leftMullion.position.set(currentX + mullionWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(leftMullion); currentX += mullionWidth;
        if (bottomPaneWidth > 0.1) { const bottomPane = createBoxMesh(bottomPaneWidth, bottomSectionHeight, thickness * 0.5, windowMaterial); bottomPane.position.set(currentX + bottomPaneWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(bottomPane); currentX += bottomPaneWidth; }
    }
    const lastBottomMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.8, mullionMaterial);
    lastBottomMullion.position.set(window.width / 2 - mullionWidth / 2, WINDOW_BOTTOM_HEIGHT + bottomSectionHeight / 2, 0); windowGroup.add(lastBottomMullion);

    // 3. Üst Dikey Kayıtlar ve Cam Paneller
    currentX = -window.width / 2;
    for (let i = 0; i < numTopPanes; i++) { /* ... üst kayıtlar ve camlar ... */
        const leftMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
        leftMullion.position.set(currentX + mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(leftMullion); currentX += mullionWidth;
        if (topPaneWidth > 0.1) { const topPane = createBoxMesh(topPaneWidth, topSectionHeight, thickness * 0.5, windowMaterial); topPane.position.set(currentX + topPaneWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(topPane); currentX += topPaneWidth; }
    }
    const lastTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.8, mullionMaterial);
    lastTopMullion.position.set(window.width / 2 - mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0); windowGroup.add(lastTopMullion);

    // 4. Mermer Denizlik (Düzeltildi)
    const sillOverhang = 5;
    // Derinlik: Duvar kalınlığı + İki tarafa taşma
    const sillDepth = thickness + sillOverhang * 2; // <-- Düzeltildi
    const sillWidth = window.width + sillOverhang * 2;
    const sillHeight = 4;
    const marbleSill = createBoxMesh(sillWidth, sillHeight, sillDepth, sillMaterial, "sill");
    // Pozisyon: Alt pencere seviyesinin biraz altı, Z ekseninde merkezli
    marbleSill.position.y = WINDOW_BOTTOM_HEIGHT - sillHeight / 2;
    marbleSill.position.z = 0; // <-- Düzeltildi (Merkezde)
    windowGroup.add(marbleSill);

    // Grup Pozisyonu ve Rotasyonu
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

// YENİ MERDİVEN MESH FONKSİYONU (GÜNCELLENMİŞ)
function createStairMesh(stair, material) {
    const totalRun = stair.width; // Merdivenin 2D'deki "width"i (uzunluğu)
    const stairWidth = stair.height; // Merdivenin 2D'deki "height"i (eni)
    // Nesneden stepCount'u oku
    const stepCount = stair.stepCount || 1; // Varsayılan 1 olsun (0 olmamalı)
    const totalRise = WALL_HEIGHT; // Sabit duvar yüksekliği

    // Negatif veya sıfır basamak sayısını engelle
    if (totalRun < 1 || stairWidth < 1 || stepCount < 1) return null;

    const stepRun = totalRun / stepCount; // Her bir basamağın derinliği
    const stepRise = totalRise / stepCount; // Her bir basamağın yüksekliği

    const stairGroup = new THREE.Group();

    // stepCount kadar basamak oluştur
    for (let i = 0; i < stepCount; i++) {
        const stepGeom = new THREE.BoxGeometry(stepRun, stepRise, stairWidth);

        // Geometrinin merkezini basamağın "alt-ön-merkezine" taşıyalım
        stepGeom.translate(0, stepRise / 2, 0);

        const stepMesh = new THREE.Mesh(stepGeom, material);

        // Her basamağı konumlandır
        // x: Merdiven grubunun merkezi (0) eksi yarım uzunluk + yarım basamak + (basamak * adım)
        const xPos = -totalRun / 2 + stepRun / 2 + i * stepRun;
        // y: (basamak * yükseklik)
        const yPos = i * stepRise;
        // z: 0 (Grup içinde merkezli)
        const zPos = 0;

        stepMesh.position.set(xPos, yPos, zPos);
        stairGroup.add(stepMesh);
    }

    // Tüm grubu merdivenin 2D merkezine taşı ve döndür
    stairGroup.position.set(stair.center.x, 0, stair.center.y);
    stairGroup.rotation.y = -(stair.rotation || 0) * Math.PI / 180;

    return stairGroup;
}
// YENİ FONKSİYON BİTİŞİ


// --- GÜNCELLENDİ: Malzeme Güncellemesi ve Zemin Yönü/Pozisyonu ---
export function update3DScene() {
    if (!dom.mainContainer.classList.contains('show-3d') || !sceneObjects) return;
    sceneObjects.clear();

    // Malzemeleri güncelle (opaklık %75, cam %30, kol opak)
    const solidOpacity = 0.75;
    wallMaterial.color.set(state.wallBorderColor); wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
    doorMaterial.transparent = true; doorMaterial.opacity = solidOpacity; doorMaterial.needsUpdate = true;
    windowMaterial.opacity = 0.3; windowMaterial.transparent = true; windowMaterial.needsUpdate = true;
    columnMaterial.color.set(state.wallBorderColor); columnMaterial.transparent = true; columnMaterial.opacity = solidOpacity; columnMaterial.needsUpdate = true;
    beamMaterial.transparent = true; beamMaterial.opacity = solidOpacity; beamMaterial.needsUpdate = true;
    mullionMaterial.transparent = true; mullionMaterial.opacity = solidOpacity; mullionMaterial.needsUpdate = true;
    sillMaterial.transparent = true; sillMaterial.opacity = solidOpacity + 0.1; sillMaterial.needsUpdate = true;
    handleMaterial.transparent = false; handleMaterial.opacity = 1.0; handleMaterial.needsUpdate = true; // Kol opak
    floorMaterial.transparent = true; floorMaterial.opacity = 0.4; floorMaterial.needsUpdate = true;
    stairMaterial.transparent = true; stairMaterial.opacity = solidOpacity;stairMaterial.color.set(0xCCCCCC);     
    stairMaterial.needsUpdate = true;

    const { walls, doors, columns, beams, rooms, stairs } = state; // <-- stairs EKLEYİN

    // Duvarları, kapıları, pencereleri oluştur
    walls.forEach(w => {
        // ... (duvar parçalama ve eleman ekleme kodu aynı kaldı) ...
         if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const itemsOnWall = [];
        (doors.filter(d => d.wall === w)).forEach(d => itemsOnWall.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        (w.windows || []).forEach(win => itemsOnWall.push({ item: win, type: 'window', pos: win.pos, width: win.width }));
        itemsOnWall.sort((a, b) => a.pos - b.pos);
        let lastPos = 0; const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;
        itemsOnWall.forEach(itemData => {
            const itemStart = itemData.pos - itemData.width / 2;
            if (itemStart > lastPos + 0.1) { const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos}; const p2={x:w.p1.x+dx*itemStart, y:w.p1.y+dy*itemStart}; const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallMaterial); if(segMesh) sceneObjects.add(segMesh); }
            if (itemData.type === 'door') { const doorGroup = createDoorMesh(itemData.item); if(doorGroup) sceneObjects.add(doorGroup); const lintelMesh = createLintelMesh(itemData.item, wallThickness, wallMaterial); if(lintelMesh) sceneObjects.add(lintelMesh); }
            else if (itemData.type === 'window') { const windowGroup = createComplexWindow(w, itemData.item, wallThickness); if(windowGroup) sceneObjects.add(windowGroup); const lintelHeight = WALL_HEIGHT - WINDOW_TOP_HEIGHT; const lintelMesh = createWallPieceMesh(w, itemData.item, WINDOW_TOP_HEIGHT, lintelHeight, wallThickness, wallMaterial); if(lintelMesh) sceneObjects.add(lintelMesh); const sillHeight = WINDOW_BOTTOM_HEIGHT; const sillMesh = createWallPieceMesh(w, itemData.item, 0, sillHeight, wallThickness, wallMaterial); if(sillMesh) sceneObjects.add(sillMesh); }
            lastPos = itemData.pos + itemData.width / 2;
        });
        if (wallLen - lastPos > 0.1) { const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos}; const p2={x:w.p1.x+dx*wallLen, y:w.p1.y+dy*wallLen}; const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallMaterial); if(segMesh) sceneObjects.add(segMesh); }
    });

    // Kolonları ekle
    if (columns) { columns.forEach(column => { const m = createColumnMesh(column, columnMaterial); if (m) sceneObjects.add(m); }); }
    // Kirişleri ekle
    if (beams) { beams.forEach(beam => { const m = createBeamMesh(beam, beamMaterial); if (m) sceneObjects.add(m); }); }

    // YENİ MERDİVEN EKLEME BLOĞUNU AŞAĞIYA EKLEYİN
    // Merdivenleri ekle
if (stairs) {
        stairs.forEach(stair => {
            // createStairMesh doğru malzemeyi (stairMaterial) kullanıyor
            const m = createStairMesh(stair, stairMaterial);
            if (m) sceneObjects.add(m);
        });
    }
    // YENİ BLOK BİTİŞİ


    // --- Zeminleri Ekle (Yön Düzeltmesiyle) ---
    // --- Zeminleri Ekle (Y İşareti Düzeltmesiyle) ---
    if (rooms) {
        rooms.forEach(room => {
            if (room.polygon?.geometry?.coordinates) {
                const coords = room.polygon.geometry.coordinates[0];
                if (coords.length >= 3) {
                    try {
                        // Koordinatları Shape için hazırla (merkeze göre)
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

                        // Shape'i merkeze göre oluştur - Y işaretini TERS ÇEVİR
                        const shapePoints = coords.map(p =>
                            new THREE.Vector2(p[0] - centerX, -(p[1] - centerZ)) // Eksi işareti eklendi
                        );
                        const roomShape = new THREE.Shape(shapePoints);
                        const geometry = new THREE.ShapeGeometry(roomShape);

                        const floorMesh = new THREE.Mesh(geometry, floorMaterial);

                        // XY düzleminden XZ düzlemine döndür
                        floorMesh.rotation.x = -Math.PI / 2;

                        // Gerçek dünya pozisyonuna yerleştir
                        floorMesh.position.set(centerX, 0.1, centerZ);

                        sceneObjects.add(floorMesh);
                    } catch (error) {
                        console.error("Zemin oluşturulurken hata:", error, room);
                    }
                }
            }
        });
    }
    // --- Zemin Ekleme Sonu ---

    // --- Orbit Hedefini Geri Yükle ---
    if (sceneObjects.children.length > 0) {
        const boundingBox = new THREE.Box3();
        // Zeminleri hariç tutarak bounding box hesapla
        sceneObjects.children.forEach(obj => {
             // Merdivenleri de bounding box'a dahil et
             if (obj.material !== floorMaterial) {
                 boundingBox.expandByObject(obj);
             }
         });

        if (!boundingBox.isEmpty()) {
            const center = new THREE.Vector3();
            boundingBox.getCenter(center);
            controls.target.copy(center); // <-- Aktif
        } else {
             controls.target.set(0, WALL_HEIGHT/2, 0); // Sadece zemin veya boşsa varsayılan
        }
    } else {
         controls.target.set(0, WALL_HEIGHT/2, 0); // Tamamen boşsa varsayılan
    }
    // --- GÜNCELLEME SONU ---

    controls.update(); // Kontrolleri her zaman güncelle
}
// --- update3DScene Sonu ---