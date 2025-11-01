// scene3d-update.js
// Ana 3D güncelleme döngüsünü (update3DScene) yönetir.

import * as THREE from "three";
import { state, dom, WALL_HEIGHT, DOOR_HEIGHT, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, BATHROOM_WINDOW_BOTTOM_HEIGHT, BATHROOM_WINDOW_TOP_HEIGHT } from "./main.js";
import { getArcWallPoints } from "./geometry.js";

// Core nesneleri ve malzemeleri import et
import {
    scene, camera, renderer, controls, sceneObjects,orbitControls,
    wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial,
    mullionMaterial, sillMaterial, handleMaterial, floorMaterial,
    stairMaterial, stairMaterialTop, ventMaterial, trimMaterial,
    balconyRailingMaterial, glassMaterial, halfWallCapMaterial,
    handrailWoodMaterial, balusterMaterial, stepNosingMaterial
} from "./scene3d-core.js";

// Mesh oluşturma fonksiyonlarını import et
import {
    createWallSegmentMesh, createDoorMesh, createLintelMesh,
    createComplexWindow, createWallPieceMesh, createVentMesh
} from "./scene3d-walls.js";

import {
    createColumnMesh, createBeamMesh, createStairMesh
} from "./scene3d-structures.js";


/**
 * 2D veriye (state) dayanarak 3D sahneyi temizler ve yeniden oluşturur.
 */
export function update3DScene() {
    if (!dom.mainContainer.classList.contains('show-3d') || !sceneObjects) return;
    sceneObjects.clear(); // Sahnedeki eski objeleri temizle

    const solidOpacity = 1; // 0.75;

    // Malzemelerin opaklık/şeffaflık ayarlarını güncelle
    wallMaterial.transparent = true; wallMaterial.opacity = solidOpacity; wallMaterial.needsUpdate = true;
    doorMaterial.transparent = true; doorMaterial.opacity = solidOpacity; doorMaterial.needsUpdate = true;
    windowMaterial.opacity = 0.3; windowMaterial.transparent = true; windowMaterial.needsUpdate = true;
    columnMaterial.transparent = true; columnMaterial.opacity = solidOpacity; columnMaterial.needsUpdate = true;
    beamMaterial.transparent = true; beamMaterial.opacity = solidOpacity; beamMaterial.needsUpdate = true;
    mullionMaterial.transparent = true; mullionMaterial.opacity = solidOpacity; mullionMaterial.needsUpdate = true;
    sillMaterial.transparent = true; sillMaterial.opacity = solidOpacity + 0.1; sillMaterial.needsUpdate = true;
    handleMaterial.transparent = false; handleMaterial.opacity = 1.0; handleMaterial.needsUpdate = true;
    floorMaterial.transparent = true; floorMaterial.opacity = 0.8; floorMaterial.needsUpdate = true;
    stairMaterial.transparent = true; stairMaterial.opacity = solidOpacity; stairMaterial.needsUpdate = true;
    stairMaterialTop.transparent = false; stairMaterialTop.opacity = 1.0; stairMaterialTop.needsUpdate = true;
    ventMaterial.transparent = true; ventMaterial.opacity = solidOpacity; ventMaterial.needsUpdate = true;
    trimMaterial.transparent = true; trimMaterial.opacity = solidOpacity; trimMaterial.needsUpdate = true;
    balconyRailingMaterial.transparent = true; balconyRailingMaterial.opacity = 0.85; balconyRailingMaterial.needsUpdate = true;
    glassMaterial.transparent = true; glassMaterial.opacity = 0.4; glassMaterial.needsUpdate = true;
    halfWallCapMaterial.transparent = true; halfWallCapMaterial.opacity = solidOpacity; halfWallCapMaterial.needsUpdate = true;
    handrailWoodMaterial.transparent = true; handrailWoodMaterial.opacity = solidOpacity; handrailWoodMaterial.needsUpdate = true;
    balusterMaterial.transparent = true; balusterMaterial.opacity = solidOpacity; balusterMaterial.needsUpdate = true;
    stepNosingMaterial.transparent = true; stepNosingMaterial.opacity = solidOpacity + 0.1; stepNosingMaterial.needsUpdate = true;

    const { walls, doors, columns, beams, rooms, stairs } = state;

    // --- Duvarları, Kapıları, Pencereleri ve Menfezleri Oluştur ---
    walls.forEach(w => {
        if (!w.p1 || !w.p2) return;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 1) return;
        const wallThickness = w.thickness || state.wallThickness;
        const wallType = w.wallType || 'normal';

        if (w.isArc && w.arcControl1 && w.arcControl2) {
            const arcPoints = getArcWallPoints(w, 30);
            for (let i = 0; i < arcPoints.length - 1; i++) {
                const p1 = arcPoints[i];
                const p2 = arcPoints[i + 1];
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, false, false);
                if (segMesh) sceneObjects.add(segMesh);
            }
            return; // Arc duvarlarda kapı/pencere desteği şimdilik yok
        }

        const segmentBreakingItems = []; 
        (doors.filter(d => d.wall === w)).forEach(d => segmentBreakingItems.push({ item: d, type: 'door', pos: d.pos, width: d.width }));
        (w.windows || []).forEach(win => segmentBreakingItems.push({ item: { ...win, roomName: win.roomName }, type: 'window', pos: win.pos, width: win.width }));
        segmentBreakingItems.sort((a, b) => a.pos - b.pos);
        
        let lastPos = 0;
        let lastPosIsNode = true; 
        const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;

        segmentBreakingItems.forEach(itemData => {
            const itemStart = itemData.pos - itemData.width / 2;
            if (itemStart > lastPos + 0.1) {
                const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
                const p2={x:w.p1.x+dx*itemStart, y:w.p1.y+dy*itemStart};
                const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, lastPosIsNode, false);
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
            
            if (itemData.type === 'door' || itemData.type === 'window') {
                 lastPos = itemData.pos + itemData.width / 2;
                 lastPosIsNode = false; 
            }
        });

        if (wallLen - lastPos > 0.1) {
            const p1={x:w.p1.x+dx*lastPos, y:w.p1.y+dy*lastPos};
            const p2={x:w.p1.x+dx*wallLen, y:w.p1.y+dy*wallLen};
            const segMesh = createWallSegmentMesh(p1, p2, wallThickness, wallType, wallMaterial, lastPosIsNode, true);
            if(segMesh) sceneObjects.add(segMesh);
        }
        
        (w.vents || []).forEach(v => {
            const ventMeshGroup = createVentMesh(w, v);
            if (ventMeshGroup) sceneObjects.add(ventMeshGroup);
        });
    });

    // --- Kolonları Ekle ---
    if (columns) { columns.forEach(column => { const m = createColumnMesh(column, columnMaterial); if (m) sceneObjects.add(m); }); }

    // --- Kirişleri Ekle ---
    if (beams) { beams.forEach(beam => { const m = createBeamMesh(beam, beamMaterial); if (m) sceneObjects.add(m); }); }

    // --- Merdivenleri Ekle ---
    if (stairs) {
        stairs.forEach(stair => {
            const m = createStairMesh(stair);
            if (m) sceneObjects.add(m);
        });
    }

    // --- Zeminleri Ekle ---
    if (rooms) {
        rooms.forEach(room => {
            if (room.polygon?.geometry?.coordinates) {
                const coords = room.polygon.geometry.coordinates[0];
                if (coords.length >= 3) {
                    try {
                        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                        coords.forEach(p => { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
                        const centerX = (minX + maxX) / 2; const centerZ = (minY + maxY) / 2;
                        const shapePoints = coords.map(p => new THREE.Vector2(p[0] - centerX, -(p[1] - centerZ)) );
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

    // --- Orbit Hedefini Ayarla ---
    if (controls === orbitControls) { // Sadece orbit modundaysa hedefi ayarla
        if (sceneObjects.children.length > 0) {
            const boundingBox = new THREE.Box3();
            sceneObjects.children.forEach(obj => { if (obj.material !== floorMaterial) boundingBox.expandByObject(obj); });
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
}