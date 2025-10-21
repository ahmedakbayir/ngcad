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

export function update3DScene() {
    if (!document.getElementById("main-container").classList.contains('show-3d')) return;

    if (!sceneObjects) return;
    sceneObjects.clear();
    
    const { walls, doors, wallBorderColor } = state;
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

    if (sceneObjects.children.length > 0) {
        const box = new THREE.Box3().setFromObject(sceneObjects);
        const center = new THREE.Vector3();
        box.getCenter(center);
        controls.target.copy(center);
    }
    controls.update();
}