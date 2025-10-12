import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { state, WALL_HEIGHT, DOOR_HEIGHT } from './main.js';

export let scene, camera, renderer, controls;

export function init3D(canvas) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 10000);
    camera.position.set(500, 400, 500);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0, 0);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(500, 1000, 500);
    dirLight.castShadow = true;
    dirLight.shadow.camera.left = -1000;
    dirLight.shadow.camera.right = 1000;
    dirLight.shadow.camera.top = 1000;
    dirLight.shadow.camera.bottom = -1000;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 2000;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(2000, 40, 0x444444, 0x222222);
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);
}

export function update3DScene() {
    if (!scene) return;

    // Eski duvarları ve kapıları temizle
    scene.children = scene.children.filter(child => {
        if (child.userData.isWall || child.userData.isDoor || child.userData.isArcWall) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            return false;
        }
        return true;
    });

    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xe7e6d0, 
        roughness: 0.8,
        metalness: 0.2 
    });

    const doorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x8b4513,
        roughness: 0.7,
        metalness: 0.1
    });

    // Normal duvarları çiz
    state.walls.forEach(wall => {
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const thickness = wall.thickness || 20;
        const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT, thickness);
        const mesh = new THREE.Mesh(geometry, wallMaterial);

        mesh.position.x = (wall.p1.x + wall.p2.x) / 2;
        mesh.position.y = WALL_HEIGHT / 2;
        mesh.position.z = (wall.p1.y + wall.p2.y) / 2;
        mesh.rotation.y = -angle;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isWall = true;

        scene.add(mesh);
    });

    // Yay duvarları çiz
    if (state.arcWalls) {
        state.arcWalls.forEach(arcWall => {
            const steps = 30;
            const points = [];
            
            // Bezier eğrisi noktalarını hesapla
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const x = Math.pow(1 - t, 2) * arcWall.p1.x + 
                          2 * (1 - t) * t * arcWall.control.x + 
                          Math.pow(t, 2) * arcWall.p2.x;
                const z = Math.pow(1 - t, 2) * arcWall.p1.y + 
                          2 * (1 - t) * t * arcWall.control.y + 
                          Math.pow(t, 2) * arcWall.p2.y;
                points.push(new THREE.Vector3(x, 0, z));
            }

            // Her segment için kutu oluştur
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];
                
                const dx = p2.x - p1.x;
                const dz = p2.z - p1.z;
                const length = Math.sqrt(dx * dx + dz * dz);
                const angle = Math.atan2(dz, dx);

                const thickness = arcWall.thickness || 20;
                const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT, thickness);
                const mesh = new THREE.Mesh(geometry, wallMaterial);

                mesh.position.x = (p1.x + p2.x) / 2;
                mesh.position.y = WALL_HEIGHT / 2;
                mesh.position.z = (p1.z + p2.z) / 2;
                mesh.rotation.y = -angle;

                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.isArcWall = true;

                scene.add(mesh);
            }
        });
    }

    // Kapıları çiz
    state.doors.forEach(door => {
        const wall = door.wall;
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const wallLength = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const doorPosRatio = door.pos / wallLength;
        const doorX = wall.p1.x + dx * doorPosRatio;
        const doorZ = wall.p1.y + dy * doorPosRatio;

        const thickness = wall.thickness || 20;
        const geometry = new THREE.BoxGeometry(door.width, DOOR_HEIGHT, thickness + 2);
        const mesh = new THREE.Mesh(geometry, doorMaterial);

        mesh.position.x = doorX;
        mesh.position.y = DOOR_HEIGHT / 2;
        mesh.position.z = doorZ;
        mesh.rotation.y = -angle;

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.isDoor = true;

        scene.add(mesh);
    });

    // Zemin
    const floorGeometry = new THREE.PlaneGeometry(2000, 2000);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x2a2b2c,
        roughness: 0.9,
        metalness: 0.1
    });
    const existingFloor = scene.children.find(child => child.userData.isFloor);
    if (!existingFloor) {
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        floor.userData.isFloor = true;
        scene.add(floor);
    }
}