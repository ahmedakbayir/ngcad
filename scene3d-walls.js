// scene3d-walls.js
// Duvarlar, kapılar, pencereler ve menfezler için 3D mesh oluşturma fonksiyonları.

import * as THREE from "three";
import {
    state, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT,
    BATHROOM_WINDOW_BOTTOM_HEIGHT, BATHROOM_WINDOW_TOP_HEIGHT
} from "./main.js";
import { getArcWallPoints } from "./geometry.js";
import {
    wallMaterial, doorMaterial, windowMaterial, mullionMaterial, sillMaterial,
    handleMaterial, ventMaterial, trimMaterial, balconyRailingMaterial,
    glassMaterial, halfWallCapMaterial
} from "./scene3d-core.js"; // Malzemeleri import et

// --- Sabitler ---
const VENT_DIAMETER = 25;
const VENT_THICKNESS = 2;
const BALCONY_WALL_HEIGHT = 60;
const BALCONY_RAILING_HEIGHT = 60;
const HALF_WALL_HEIGHT = 100;
const HALF_WALL_CAP_WIDTH = 5;
const HALF_WALL_CAP_HEIGHT = 5;
const GLASS_WALL_THICKNESS = 2;
const TRIM_WIDTH = 5;
const TRIM_DEPTH = 1;

// Yardımcı Fonksiyon: Kutu Mesh
function createBoxMesh(width, height, depth, material, name = "") {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geom, material);
    mesh.name = name;
    return mesh;
}

/**
 * Duvar tipine göre (normal, balkon, cam, yarım) bir duvar segmenti mesh'i oluşturur.
 */
export function createWallSegmentMesh(p1, p2, thickness, wallType, material, extendStart = false, extendEnd = false) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 1) return null;

    const startExtension = extendStart ? thickness / 2 : 0.1;
    const endExtension = extendEnd ? thickness / 2 : 0.1;
    const effectiveLength = wallLength + startExtension + endExtension;
    const dirX = dx / wallLength;
    const dirY = dy / wallLength;
    const wallGroup = new THREE.Group();
    const groupCenterOffsetX = dirX * (endExtension - startExtension) / 2;
    const groupCenterOffsetZ = dirY * (endExtension - startExtension) / 2;

    if (wallType === 'balcony') {
        const railingLength = wallLength + 0.1 + 0.1; 
        const railingOffsetX = (startExtension - endExtension) / 2;
        const baseWallGeom = new THREE.BoxGeometry(effectiveLength, BALCONY_WALL_HEIGHT, thickness);
        const baseWallMesh = new THREE.Mesh(baseWallGeom, material);
        baseWallMesh.position.y = BALCONY_WALL_HEIGHT / 2; 
        wallGroup.add(baseWallMesh);

        const railingHeight = BALCONY_RAILING_HEIGHT;
        const railingStartY = BALCONY_WALL_HEIGHT;
        const railingBarThickness = 2;
        const railingSpacing = 15;
        const numBars = Math.floor(railingLength / railingSpacing);

        const topBarGeom = new THREE.BoxGeometry(railingLength, railingBarThickness, railingBarThickness);
        const topBarMesh = new THREE.Mesh(topBarGeom, balconyRailingMaterial);
        topBarMesh.position.y = railingStartY + railingHeight - railingBarThickness/2; 
        topBarMesh.position.x = railingOffsetX;
        wallGroup.add(topBarMesh);

        const bottomBarGeom = new THREE.BoxGeometry(railingLength, railingBarThickness, railingBarThickness);
        const bottomBarMesh = new THREE.Mesh(bottomBarGeom, balconyRailingMaterial);
        bottomBarMesh.position.y = railingStartY + railingBarThickness/2; 
        bottomBarMesh.position.x = railingOffsetX;
        wallGroup.add(bottomBarMesh);

        for (let i = 0; i <= numBars; i++) {
            const x = -railingLength/2 + (i * railingSpacing);
            const vertBarGeom = new THREE.BoxGeometry(railingBarThickness, railingHeight, railingBarThickness); 
            const vertBarMesh = new THREE.Mesh(vertBarGeom, balconyRailingMaterial);
            vertBarMesh.position.set(x + railingOffsetX, railingStartY + railingHeight/2, 0); 
            wallGroup.add(vertBarMesh);
        }

    } else if (wallType === 'glass') {
        const glassGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, GLASS_WALL_THICKNESS);
        const glassMesh = new THREE.Mesh(glassGeom, glassMaterial);
        glassMesh.position.y = WALL_HEIGHT / 2; 
        wallGroup.add(glassMesh);

    } else if (wallType === 'half') {
        const capLength = wallLength + 0.1 + 0.1;
        const capOffsetX = (startExtension - endExtension) / 2;
        const halfWallGeom = new THREE.BoxGeometry(effectiveLength, HALF_WALL_HEIGHT, thickness);
        const halfWallMesh = new THREE.Mesh(halfWallGeom, material);
        halfWallMesh.position.y = HALF_WALL_HEIGHT / 2; 
        wallGroup.add(halfWallMesh);

        const capWidth = capLength;
        const capDepth = thickness + (HALF_WALL_CAP_WIDTH * 2);
        const capGeom = new THREE.BoxGeometry(capWidth, HALF_WALL_CAP_HEIGHT, capDepth);
        const capMesh = new THREE.Mesh(capGeom, halfWallCapMaterial);
        capMesh.position.y = HALF_WALL_HEIGHT + HALF_WALL_CAP_HEIGHT/2; 
        capMesh.position.x = capOffsetX;
        wallGroup.add(capMesh);

    } else { // normal
        const wallGeom = new THREE.BoxGeometry(effectiveLength, WALL_HEIGHT, thickness);
        const wallMesh = new THREE.Mesh(wallGeom, material);
        wallMesh.position.y = WALL_HEIGHT / 2; 
        wallGroup.add(wallMesh);
    }

    const originalMidX = (p1.x + p2.x) / 2;
    const originalMidZ = (p1.y + p2.y) / 2;
    wallGroup.position.set(originalMidX + groupCenterOffsetX, 0, originalMidZ + groupCenterOffsetZ);
    wallGroup.rotation.y = -Math.atan2(p2.y - p1.y, p2.x - p1.x);

    return wallGroup;
}

/**
 * Pervazlar, kapı kolu ve animasyon pivotu dahil bir kapı mesh'i oluşturur.
 */
export function createDoorMesh(door) {
    const wall = door.wall; if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;

    const thickness = wall.thickness/4 || state.wallThickness/4;
    const handleRadius = 2, handleLength = 10, handleHeight = DOOR_HEIGHT * 0.5;
    const handleDistanceFromEdge = 10, handleOffsetZ = thickness / 2;
    const glassInset = 5, glassHeight = 50, glassTopY = DOOR_HEIGHT - glassInset;
    const glassBottomY = glassTopY - glassHeight, glassWidth = door.width - 2 * glassInset, glassThickness = 2;

    const doorGroup = new THREE.Group();
    const doorPanelGroup = new THREE.Group();
    doorPanelGroup.position.x = -door.width / 2; // Pivotu sola kaydır
    doorGroup.add(doorPanelGroup);

    const doorGeom = new THREE.BoxGeometry(door.width, DOOR_HEIGHT, thickness);
    doorGeom.translate(door.width / 2, DOOR_HEIGHT / 2, 0); // Geometriyi pivota göre ayarla
    const doorMesh = new THREE.Mesh(doorGeom, doorMaterial);
    doorPanelGroup.add(doorMesh);

    if (glassWidth > 0 && glassHeight > 0) {
        const glassGeom = new THREE.BoxGeometry(glassWidth, glassHeight, glassThickness);
        glassGeom.translate(door.width / 2, (glassTopY + glassBottomY) / 2, 0); 
        const glassMesh = new THREE.Mesh(glassGeom, windowMaterial);
        doorPanelGroup.add(glassMesh);
    }

    const handleGeom = new THREE.CylinderGeometry(handleRadius, handleRadius, handleLength, 16);
    handleGeom.rotateZ(Math.PI / 2); 
    const handleMesh1 = new THREE.Mesh(handleGeom, handleMaterial);
    handleMesh1.position.set(door.width - handleDistanceFromEdge, handleHeight, handleOffsetZ); 
    doorPanelGroup.add(handleMesh1);
    const handleMesh2 = handleMesh1.clone();
    handleMesh2.position.z = -handleOffsetZ;
    doorPanelGroup.add(handleMesh2);

    // --- Pervazlar (Sabit) ---
    const trimDepthActual = thickness / 2 + TRIM_DEPTH; 
    const trimYCenter = DOOR_HEIGHT / 2;
    const trimTopYCenter = DOOR_HEIGHT + TRIM_WIDTH / 2;

    const leftTrim = createBoxMesh(TRIM_WIDTH, DOOR_HEIGHT + TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "left_trim");
    leftTrim.position.set(-door.width / 2 - TRIM_WIDTH / 2, trimYCenter, trimDepthActual);
    doorGroup.add(leftTrim);
    const leftTrimBack = leftTrim.clone(); leftTrimBack.position.z = -trimDepthActual; doorGroup.add(leftTrimBack);

    const rightTrim = createBoxMesh(TRIM_WIDTH, DOOR_HEIGHT + TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "right_trim");
    rightTrim.position.set(door.width / 2 + TRIM_WIDTH / 2, trimYCenter, trimDepthActual);
    doorGroup.add(rightTrim);
    const rightTrimBack = rightTrim.clone(); rightTrimBack.position.z = -trimDepthActual; doorGroup.add(rightTrimBack);

    const topTrimWidth = door.width + 2 * TRIM_WIDTH; 
    const topTrim = createBoxMesh(topTrimWidth, TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "top_trim");
    topTrim.position.set(0, trimTopYCenter, trimDepthActual);
    doorGroup.add(topTrim);
    const topTrimBack = topTrim.clone(); topTrimBack.position.z = -trimDepthActual; doorGroup.add(topTrimBack);
    // --- Pervaz Sonu ---

    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    doorGroup.position.set(doorCenterPos.x, 0, doorCenterPos.y);
    doorGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    doorPanelGroup.userData = {
        type: 'door', doorObject: door,
        originalRotation: doorPanelGroup.rotation.y, isOpen: false, isOpening: false
    };
    doorGroup.userData = {
        type: 'door', doorObject: door, doorPanel: doorPanelGroup
    };

    return doorGroup;
}

/**
 * Kapının üzerindeki duvar parçasını (lento) oluşturur.
 */
export function createLintelMesh(door, thickness, material) {
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

/**
 * Pervazlar, mermerlik ve bölmeler dahil karmaşık bir pencere mesh'i oluşturur.
 */
export function createComplexWindow(wall, window, thickness) {
    const windowGroup = new THREE.Group();
    const isBathroom = window.roomName === 'BANYO';
    const bottomHeight = isBathroom ? BATHROOM_WINDOW_BOTTOM_HEIGHT : WINDOW_BOTTOM_HEIGHT;
    const topHeight = isBathroom ? BATHROOM_WINDOW_TOP_HEIGHT : WINDOW_TOP_HEIGHT;
    const windowHeight = topHeight - bottomHeight;
    if (windowHeight <= 0) return null;

    const windowWidthCm = window.width;
    const targetPaneWidth = 45; const mullionWidth = 5; const minPaneWidth = 40; const maxPaneWidth = 50;

    let numBottomPanes = Math.max(1, Math.round(windowWidthCm / targetPaneWidth));
    let bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    if (bottomPaneWidth < minPaneWidth && numBottomPanes > 1) {
        numBottomPanes--; bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    } else if (bottomPaneWidth > maxPaneWidth) {
        numBottomPanes++; bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidth) / numBottomPanes;
    }
    if (numBottomPanes === 1 && bottomPaneWidth < minPaneWidth) bottomPaneWidth = windowWidthCm - 2*mullionWidth;

    const numTopPanes = numBottomPanes; let topPaneWidth = bottomPaneWidth;
    const hasHorizontalMullion = !isBathroom;
    const horizontalMullionY = bottomHeight + windowHeight * 0.7;
    const bottomSectionHeight = hasHorizontalMullion ? (horizontalMullionY - bottomHeight - mullionWidth / 2) : windowHeight;
    const topSectionHeight = hasHorizontalMullion ? (topHeight - horizontalMullionY - mullionWidth / 2) : 0;
    const bottomMullionPositions = [];

    if (hasHorizontalMullion) {
        const horizontalMullion = createBoxMesh(window.width, mullionWidth, thickness * 0.96, mullionMaterial, "h_mullion");
        horizontalMullion.position.y = horizontalMullionY; windowGroup.add(horizontalMullion);
    }

    let currentX_bottom = -window.width / 2;
    for (let i = 0; i < numBottomPanes; i++) {
        const mullionX = currentX_bottom + mullionWidth / 2;
        const leftMullion = createBoxMesh(mullionWidth, bottomSectionHeight, thickness * 0.96, mullionMaterial);
        leftMullion.position.set(mullionX, bottomHeight + bottomSectionHeight / 2, 0);
        windowGroup.add(leftMullion);
        if (i > 0) bottomMullionPositions.push(mullionX);
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
    if(numBottomPanes > 0) bottomMullionPositions.push(lastBottomMullionX);

    if (hasHorizontalMullion && topSectionHeight > 0.1) {
        let currentX_top = -window.width / 2;
        const firstTopMullion = createBoxMesh(mullionWidth, topSectionHeight, thickness * 0.96, mullionMaterial);
        firstTopMullion.position.set(currentX_top + mullionWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
        windowGroup.add(firstTopMullion);
        currentX_top += mullionWidth;
        for (let i = 0; i < numTopPanes; i++) {
             if (topPaneWidth > 0.1) {
                 const topPane = createBoxMesh(topPaneWidth, topSectionHeight, thickness * 0.5, windowMaterial);
                 topPane.position.set(currentX_top + topPaneWidth / 2, horizontalMullionY + mullionWidth / 2 + topSectionHeight / 2, 0);
                 windowGroup.add(topPane);
                 currentX_top += topPaneWidth;
             }
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

    const sillOverhang = 5, sillDepth = thickness + sillOverhang * 2, sillWidth = window.width + sillOverhang * 2;
    const sillHeight = 4 + 1;
    const marbleSill = createBoxMesh(sillWidth, sillHeight, sillDepth, sillMaterial, "sill");
    marbleSill.position.y = bottomHeight - sillHeight / 2 + 0.5;
    windowGroup.add(marbleSill);

    // --- Pervazlar ---
    const trimDepthActual = thickness / 2 + TRIM_DEPTH;
    const trimSideHeight = windowHeight + TRIM_WIDTH;
    const trimSideYCenter = bottomHeight + windowHeight / 2 - TRIM_WIDTH / 2;
    const trimTopYCenter = topHeight + TRIM_WIDTH / 2;
    const leftTrim = createBoxMesh(TRIM_WIDTH, trimSideHeight, TRIM_DEPTH, trimMaterial, "left_trim");
    leftTrim.position.set(-window.width / 2 - TRIM_WIDTH / 2, trimSideYCenter, trimDepthActual);
    windowGroup.add(leftTrim);
    const leftTrimBack = leftTrim.clone(); leftTrimBack.position.z = -trimDepthActual; windowGroup.add(leftTrimBack);
    const rightTrim = createBoxMesh(TRIM_WIDTH, trimSideHeight, TRIM_DEPTH, trimMaterial, "right_trim");
    rightTrim.position.set(window.width / 2 + TRIM_WIDTH / 2, trimSideYCenter, trimDepthActual);
    windowGroup.add(rightTrim);
    const rightTrimBack = rightTrim.clone(); rightTrimBack.position.z = -trimDepthActual; windowGroup.add(rightTrimBack);
    const topTrimWidth = window.width + 2 * TRIM_WIDTH;
    const topTrim = createBoxMesh(topTrimWidth, TRIM_WIDTH, TRIM_DEPTH, trimMaterial, "top_trim");
    topTrim.position.set(0, trimTopYCenter, trimDepthActual);
    windowGroup.add(topTrim);
    const topTrimBack = topTrim.clone(); topTrimBack.position.z = -trimDepthActual; windowGroup.add(topTrimBack);
    // --- Pervaz Sonu ---

    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const windowCenterPos = { x: wall.p1.x + dx * window.pos, y: wall.p1.y + dy * window.pos };
    windowGroup.position.set(windowCenterPos.x, 0, windowCenterPos.y);
    windowGroup.rotation.y = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);

    return windowGroup;
}

/**
 * Pencerenin altındaki veya üstündeki duvar parçasını oluşturur.
 */
export function createWallPieceMesh(wall, item, yPos, height, thickness, material) {
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

/**
 * Bir menfez (vent) mesh'i oluşturur.
 */
export function createVentMesh(wall, vent) {
    if (!wall || !wall.p1 || !wall.p2) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;

    const VENT_Y_POSITION = WALL_HEIGHT - (VENT_DIAMETER / 2) - 15;
    const wallThickness = wall.thickness || state.wallThickness;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy; const ny = dx;
    const ventCenterX_2D = wall.p1.x + dx * vent.pos;
    const ventCenterZ_2D = wall.p1.y + dy * vent.pos;
    const ventRadius = VENT_DIAMETER / 2;
    const baseThickness = 1.0;
    const ventGroup = new THREE.Group();

    for (let side = -1; side <= 1; side += 2) {
        const ventCenterX_3D = ventCenterX_2D + nx * (wallThickness / 2 * side + baseThickness / 2 * side);
        const ventCenterY_3D = VENT_Y_POSITION;
        const ventCenterZ_3D = ventCenterZ_2D + ny * (wallThickness / 2 * side + baseThickness / 2 * side);

        const baseGeom = new THREE.CylinderGeometry(ventRadius, ventRadius, baseThickness, 32);
        const baseMesh = new THREE.Mesh(baseGeom, ventMaterial);
        baseMesh.position.set(ventCenterX_3D, ventCenterY_3D, ventCenterZ_3D);
        const wallAngle = -Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x);
        baseMesh.rotation.y = wallAngle;
        baseMesh.rotateX(Math.PI / 2);
        ventGroup.add(baseMesh);
    }
    return ventGroup;
}