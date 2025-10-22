import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { state, WALL_HEIGHT, DOOR_HEIGHT } from "./main.js";

let scene, camera, renderer, controls;
let sceneObjects, doorMaterial;

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

    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2000, 3000, 1500);
    scene.add(amb, dir);

    sceneObjects = new THREE.Group();
    scene.add(sceneObjects);

    doorMaterial = new THREE.MeshStandardMaterial({ color: '#333333', roughness: 0.8 });
}

export { scene, camera, renderer, controls };

function createWallSegmentMesh(p1, p2, material) {
    const wallLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (wallLength < 1) return null;

    const wallGeom = new THREE.BoxGeometry(wallLength, WALL_HEIGHT, state.wallThickness);
    wallGeom.translate(0, WALL_HEIGHT / 2, 0);
    const wallMesh = new THREE.Mesh(wallGeom, material);

    wallMesh.position.set((p1.x + p2.x) / 2, 0, -(p1.y + p2.y) / 2);
    wallMesh.rotation.y = Math.atan2(p1.y - p2.y, p2.x - p1.x);

    return wallMesh;
}

function createDoorMesh(door) {
    const wall = door.wall;
    if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    const doorGeom = new THREE.BoxGeometry(door.width, DOOR_HEIGHT, 5);
    doorGeom.translate(0, DOOR_HEIGHT / 2, 0);
    const doorMesh = new THREE.Mesh(doorGeom, doorMaterial);
    doorMesh.position.set(doorCenterPos.x, 0, -doorCenterPos.y);
    doorMesh.rotation.y = Math.atan2(wall.p1.y - wall.p2.y, wall.p2.x - wall.p1.x);
    return doorMesh;
}

function createLintelMesh(door, material) {
    const wall = door.wall;
    if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
     if (wallLen < 0.1) return null;
    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const lintelHeight = WALL_HEIGHT - DOOR_HEIGHT;
    if (lintelHeight <= 0) return null;
    const doorCenterPos = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
    const lintelGeom = new THREE.BoxGeometry(door.width, lintelHeight, state.wallThickness);
    lintelGeom.translate(0, DOOR_HEIGHT + lintelHeight / 2, 0);
    const lintelMesh = new THREE.Mesh(lintelGeom, material);
    lintelMesh.position.set(doorCenterPos.x, 0, -doorCenterPos.y);
    lintelMesh.rotation.y = Math.atan2(wall.p1.y - wall.p2.y, wall.p2.x - wall.p1.x);
    return lintelMesh;
}

// YENİ KOLON OLUŞTURMA FONKSİYONU
function createColumnMesh(column, material) {
    const columnWidth = column.width || column.size;
    const columnHeight3D = WALL_HEIGHT; // Kolon yüksekliği duvar yüksekliği kadar
    const columnDepth = column.height || column.size;

    if (columnWidth < 1 || columnDepth < 1) return null;

    // Geometri: Genişlik (X), Yükseklik (Y), Derinlik (Z)
    const columnGeom = new THREE.BoxGeometry(columnWidth, columnHeight3D, columnDepth);
    columnGeom.translate(0, columnHeight3D / 2, 0); // Y ekseninde yukarı kaydır

    const columnMesh = new THREE.Mesh(columnGeom, material);

    // Kolonun 2D merkezini (X, -Z) ve 3D Y pozisyonunu (0) ayarla
    columnMesh.position.set(column.center.x, 0, -column.center.y);
    // 2D açısını 3D Y rotasyonuna çevir
    columnMesh.rotation.y = -(column.rotation || 0) * Math.PI / 180;

    return columnMesh;
}
// YENİ FONKSİYON BİTİŞİ

// KİRİŞ OLUŞTURMA FONKSİYONU
function createBeamMesh(beam, material) {
    const beamLength = beam.width; // Kiriş uzunluğu
    const beamThickness = beam.height; // Kiriş eni
    const beamDepth = beam.depth || 20; // Kiriş 3D yüksekliği

    if (beamLength < 1) return null;

    // Geometri: Uzunluk (X), Yükseklik (Y), En (Z)
    const beamGeom = new THREE.BoxGeometry(beamLength, beamDepth, beamThickness);
    
    // 3D pozisyon (Y): Tavanın 20cm altı
    const yPosition = WALL_HEIGHT - (beamDepth / 2);
    
    const beamMesh = new THREE.Mesh(beamGeom, material);

    // Kirişin 2D merkezini (X, -Z) ve 3D Y pozisyonunu ayarla
    beamMesh.position.set(beam.center.x, yPosition, -beam.center.y); 
    // 2D açısını 3D Y rotasyonuna çevir (Y-up koordinat sistemi için -Z'ye bakarken açı ters döner)
    beamMesh.rotation.y = - (beam.rotation || 0) * Math.PI / 180; 

    return beamMesh;
}
// FONKSİYON BİTİŞİ

export function update3DScene() {
    if (!document.getElementById("main-container").classList.contains('show-3d')) return;

    if (!sceneObjects) return;
    sceneObjects.clear();
    
    // "beams" ve "columns" değişkenlerini state'ten alın
    const { walls, doors, columns, beams, wallBorderColor } = state; // <-- beams ve columns EKLEYİN
    const wallMaterial = new THREE.MeshStandardMaterial({ color: wallBorderColor });

    walls.forEach(w => {
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y);
        if (wallLen < 1) return;
        const wallDoors = doors.filter(d => d.wall === w).sort((a, b) => a.pos - b.pos);
        let lastPos = 0;
        const wallSegments = [];
        wallDoors.forEach(door => {
            const doorStart = door.pos - door.width / 2;
            if (doorStart > lastPos) wallSegments.push({ start: lastPos, end: doorStart });
            lastPos = door.pos + door.width / 2;
        });
        if (lastPos < wallLen) wallSegments.push({ start: lastPos, end: wallLen });
        const dx = (w.p2.x - w.p1.x) / wallLen;
        const dy = (w.p2.y - w.p1.y) / wallLen;
        wallSegments.forEach(seg => {
            const p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start };
            const p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end };
            const segMesh = createWallSegmentMesh(p1, p2, wallMaterial);
            if (segMesh) sceneObjects.add(segMesh);
        });
    });

    doors.forEach(door => {
        const doorMesh = createDoorMesh(door);
        if (doorMesh) sceneObjects.add(doorMesh);
        const lintelMesh = createLintelMesh(door, wallMaterial);
        if (lintelMesh) sceneObjects.add(lintelMesh);
    });

    // YENİ KOLON DÖNGÜSÜ
    const columnMaterial = new THREE.MeshStandardMaterial({ color: wallBorderColor }); // Duvar rengiyle aynı
    if (columns) {
        columns.forEach(column => {
            const columnMesh = createColumnMesh(column, columnMaterial);
            if (columnMesh) sceneObjects.add(columnMesh);
        });
    }
    // YENİ DÖNGÜ BİTİŞİ

    // KİRİŞ DÖNGÜSÜ
    const beamMaterial = new THREE.MeshStandardMaterial({ color: '#e57373' }); // Kırmızı malzeme
    if (beams) {
        beams.forEach(beam => {
            const beamMesh = createBeamMesh(beam, beamMaterial);
            if (beamMesh) sceneObjects.add(beamMesh);
        });
    }
    // DÖNGÜ BİTİŞİ

    if (sceneObjects.children.length > 0) {
        const box = new THREE.Box3().setFromObject(sceneObjects);
        const center = new THREE.Vector3();
        box.getCenter(center);
        controls.target.copy(center);
    }
    controls.update();
}