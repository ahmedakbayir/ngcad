// scene3d-camera.js
// FPS kamera kontrollerini, çarpışma tespitini ve kamera geçişlerini yönetir.

import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import {
    scene, camera, orbitControls, pointerLockControls, sceneObjects,
    cameraMode, // <-- 'as coreCameraMode' kaldırıldı
    setCameraMode, // <-- YENİ IMPORT
    setActiveControls, // <-- YENİ IMPORT
    floorMaterial, // <-- YENİ IMPORT
} from "./scene3d-core.js";
import { state, WALL_HEIGHT } from "../general-files/main.js"; // <-- CAMERA_HEIGHT buradan kaldırıldı

// --- Değişkenler (scene3d-core.js'den taşındı) ---
// export let cameraMode = coreCameraMode; // <-- BU SATIR SİLİNDİ
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let rotateLeft = false, rotateRight = false;
let moveUp = false, moveDown = false;
let pitchUp = false, pitchDown = false;
let manualHeightMode = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// Kamera ikonu görünürlük kontrolü (klavye kullanılınca görünür olur)
export let showCameraIcon = false;

// --- Sabitler (scene3d-core.js'den taşındı) ---
const CAMERA_HEIGHT = 180; // <-- BU SABİT EKLENDİ
const MOVE_SPEED = 150;
const ROTATION_SPEED = Math.PI / 4;
const PITCH_SPEED = Math.PI / 4;
const VERTICAL_SPEED = 150;

// --- Fonksiyonlar ---

// Çarpışma tespiti - Duvarlarla çarpışma kontrolü
function checkWallCollision(newPosition) {
    const playerRadius = 30;
    const doorTolerance = 50; // Kapıdan geçiş için 50cm tolerans (sağ ve soldan)
    const cameraHeight = camera.position.y;
    const effectiveWallHeight = WALL_HEIGHT;

    for (const wall of state.walls) {
        if (!wall.p1 || !wall.p2) continue;
        const wallThickness = wall.thickness || state.wallThickness || 20;
        let wallHeight = effectiveWallHeight;
        if (wall.type === 'balconyRailing') wallHeight = 100;
        else if (wall.type === 'halfWall') wallHeight = 100;

        if (cameraHeight > wallHeight + 20) continue;

        const wallDx = wall.p2.x - wall.p1.x;
        const wallDz = wall.p2.y - wall.p1.y;
        const wallLength = Math.hypot(wallDx, wallDz);
        if (wallLength < 0.1) continue;

        const wallNormX = wallDx / wallLength;
        const wallNormZ = wallDz / wallLength;
        const perpX = -wallNormZ;
        const perpZ = wallNormX;
        const toPlayerX = newPosition.x - wall.p1.x;
        const toPlayerZ = newPosition.z - wall.p1.y;
        const perpDist = Math.abs(toPlayerX * perpX + toPlayerZ * perpZ);
        const alongWall = toPlayerX * wallNormX + toPlayerZ * wallNormZ;

        if (alongWall >= -playerRadius && alongWall <= wallLength + playerRadius) {
            if (perpDist < playerRadius + wallThickness / 2) {
                const doors = state.doors.filter(d => d.wall === wall);
                let canPass = false;
                for (const door of doors) {
                    // Kapı toleransını 50cm olarak ayarla (her iki yandan)
                    const doorStart = door.pos - door.width / 2 - doorTolerance;
                    const doorEnd = door.pos + door.width / 2 + doorTolerance;
                    if (alongWall >= doorStart && alongWall <= doorEnd) {
                        canPass = true;
                        break;
                    }
                }
                if (!canPass) return false; // Çarpışma var
            }
        }
    }
    return true; // Çarpışma yok
}

// Merdiven tespiti ve yükseklik ayarlama
function checkStairElevation(position) {
    let elevation = 0;
    for (const stair of state.stairs || []) {
        if (!stair.center) continue;
        const minX = stair.center.x - stair.width / 2;
        const maxX = stair.center.x + stair.width / 2;
        const minZ = stair.center.y - stair.length / 2;
        const maxZ = stair.center.y + stair.length / 2;

        if (position.x >= minX && position.x <= maxX && position.z >= minZ && position.z <= maxZ) {
            if (stair.type === 'landing') {
                elevation = Math.max(elevation, stair.bottomElevation || 0);
            } else {
                const totalRise = (stair.topElevation || 0) - (stair.bottomElevation || 0);
                const progress = (position.z - minZ) / stair.length;
                const currentElevation = (stair.bottomElevation || 0) + totalRise * progress;
                elevation = Math.max(elevation, currentElevation);
            }
        }
    }
    return elevation;
}

// Yakındaki kapıları otomatik aç (50cm kala)
function autoOpenNearbyDoors() {
    if (cameraMode !== 'firstPerson' || !state.doors || state.doors.length === 0) return;

    const AUTO_OPEN_DISTANCE = 50;
    const cameraPos = camera.position;

    for (const door of state.doors) {
        if (!door.wall || !door.wall.p1 || !door.wall.p2) continue;
        const wall = door.wall;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;

        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dz = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenterX = wall.p1.x + dx * door.pos;
        const doorCenterZ = wall.p1.y + dz * door.pos;
        const distanceToDoor = Math.hypot(cameraPos.x - doorCenterX, cameraPos.z - doorCenterZ);

        const doorGroup = sceneObjects.children.find(child =>
            child.userData?.type === 'door' && child.userData?.doorObject === door
        );
        if (!doorGroup || !doorGroup.userData.doorPanel) continue;
        
        const doorPanel = doorGroup.userData.doorPanel;

        if (distanceToDoor < AUTO_OPEN_DISTANCE) {
            if (doorPanel.userData.isOpen || doorPanel.userData.isOpening) continue;

            const perpX = -dz; const perpZ = dx;
            const cameraOffset = (cameraPos.x - doorCenterX) * perpX + (cameraPos.z - doorCenterZ) * perpZ;
            const openDirection = cameraOffset > 0 ? 1 : -1;
            const targetRotation = doorPanel.userData.originalRotation + (Math.PI / 2 * 0.95 * openDirection);

            new TWEEN.Tween(doorPanel.rotation)
                .to({ y: targetRotation }, 800)
                .easing(TWEEN.Easing.Cubic.Out)
                .onStart(() => { doorPanel.userData.isOpening = true; })
                .onComplete(() => { doorPanel.userData.isOpening = false; doorPanel.userData.isOpen = true; })
                .start();
        } else if (distanceToDoor > AUTO_OPEN_DISTANCE + 100) {
            if (doorPanel.userData.isOpen && !doorPanel.userData.isOpening) {
                new TWEEN.Tween(doorPanel.rotation)
                    .to({ y: doorPanel.userData.originalRotation }, 800)
                    .easing(TWEEN.Easing.Cubic.In)
                    .onStart(() => { doorPanel.userData.isOpening = true; })
                    .onComplete(() => { doorPanel.userData.isOpening = false; doorPanel.userData.isOpen = false; })
                    .start();
            }
        }
    }
}

// SPACE tuşu ile önündeki kapıyı açma
function openDoorInFront() {
    // Raycast (input.js'deki on3DPointerDown'a benzer, ancak yönü kamera kullanır)
    // Bu fonksiyon şu anda input.js tarafından çağrılmıyor, ancak gelecekte kullanılabilir.
}

// Klavye Kamera Kontrolleri - 3D Göster modunda da çalışır
function setupFirstPersonKeyControls() {
    const onKeyDown = (event) => {
        // Artık mod kontrolü yok - her zaman çalışır
        if (event.code === 'Space') { event.preventDefault(); return; }

        // Klavye kullanıldığında kamera ikonunu göster
        showCameraIcon = true;

        if (event.ctrlKey) {
            switch (event.code) {
                case 'ArrowLeft': moveLeft = true; event.preventDefault(); break;
                case 'ArrowRight': moveRight = true; event.preventDefault(); break;
                case 'ArrowUp': pitchUp = true; event.preventDefault(); break;
                case 'ArrowDown': pitchDown = true; event.preventDefault(); break;
            }
            return;
        }
        if (event.shiftKey) {
            switch (event.code) {
                case 'ArrowUp': moveUp = true; event.preventDefault(); break;
                case 'ArrowDown': moveDown = true; event.preventDefault(); break;
            }
            return;
        }
        switch (event.code) {
            case 'ArrowUp': case 'KeyW': moveForward = true; break;
            case 'ArrowDown': case 'KeyS': moveBackward = true; break;
            case 'ArrowLeft': rotateLeft = true; break;
            case 'ArrowRight': rotateRight = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyD': moveRight = true; break;
            case 'KeyR': manualHeightMode = false; break;
        }
    };
    const onKeyUp = (event) => {
        if (event.key === 'Control') { pitchUp = false; pitchDown = false; moveLeft = false; moveRight = false; return; }
        if (event.key === 'Shift') { moveUp = false; moveDown = false; return; }
        switch (event.code) {
            case 'ArrowUp': if (event.ctrlKey) pitchUp = false; else if (event.shiftKey) moveUp = false; else moveForward = false; break;
            case 'ArrowDown': if (event.ctrlKey) pitchDown = false; else if (event.shiftKey) moveDown = false; else moveBackward = false; break;
            case 'ArrowLeft': if (event.ctrlKey) moveLeft = false; else rotateLeft = false; break;
            case 'ArrowRight': if (event.ctrlKey) moveRight = false; else rotateRight = false; break;
            case 'KeyW': moveForward = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyD': moveRight = false; break;
        }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

// Kamera klavye kontrollerini güncelle (ana döngüden çağrılır)
export function updateFirstPersonCamera(delta) {
    // Artık mod kontrolü yok - her zaman çalışır (3D göster modunda da)

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    let rotationChanged = false;

    if (rotateLeft) { euler.y += ROTATION_SPEED * delta; rotationChanged = true; }
    if (rotateRight) { euler.y -= ROTATION_SPEED * delta; rotationChanged = true; }
    if (pitchUp) { euler.x += PITCH_SPEED * delta; rotationChanged = true; }
    if (pitchDown) { euler.x -= PITCH_SPEED * delta; rotationChanged = true; }
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    if (rotationChanged) camera.quaternion.setFromEuler(euler);

    if (moveUp) { manualHeightMode = true; camera.position.y += VERTICAL_SPEED * delta; }
    if (moveDown) { manualHeightMode = true; camera.position.y -= VERTICAL_SPEED * delta; }
    camera.position.y = Math.max(10, camera.position.y);

    if (!moveForward && !moveBackward && !moveLeft && !moveRight) return;

    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(); right.crossVectors(forward, new THREE.Vector3(0, 1, 0)); right.normalize();
    const movement = new THREE.Vector3();

    if (moveForward) movement.add(forward.clone().multiplyScalar(MOVE_SPEED * delta));
    if (moveBackward) movement.add(forward.clone().multiplyScalar(-MOVE_SPEED * delta));

    // Geri giderken sağ-sol ok tuşları tersine çalışsın
    if (moveBackward && !moveForward) {
        // Geriye gidiyoruz, sağ-sol'u tersine çevir
        if (moveLeft) movement.add(right.clone().multiplyScalar(MOVE_SPEED * delta)); // Sol tuş → Sağa git
        if (moveRight) movement.add(right.clone().multiplyScalar(-MOVE_SPEED * delta)); // Sağ tuş → Sola git
    } else {
        // Normal hareket
        if (moveLeft) movement.add(right.clone().multiplyScalar(-MOVE_SPEED * delta));
        if (moveRight) movement.add(right.clone().multiplyScalar(MOVE_SPEED * delta));
    }

    const newPosition = new THREE.Vector3(camera.position.x + movement.x, camera.position.y, camera.position.z + movement.z);

    if (checkWallCollision(newPosition)) {
        camera.position.x = newPosition.x;
        camera.position.z = newPosition.z;
        if (!manualHeightMode) {
            const elevation = checkStairElevation(camera.position);
            camera.position.y = CAMERA_HEIGHT + elevation;
        }
    }
    autoOpenNearbyDoors();
}

// Kamera modunu değiştir
export function toggleCameraMode() {
    // 'cameraMode' (core'dan gelen) değişkenini oku
    if (cameraMode === 'orbit') {
        // First-person moda geç
        setCameraMode('firstPerson'); // <-- YENİ (Setter'ı kullan)
        orbitControls.enabled = false;
        setActiveControls(null); // <-- YENİ (Setter'ı kullan)
        
        let cameraPosition = new THREE.Vector3();
        let cameraRotation = 0;
        let exteriorDoor = null;
        if (state.doors && state.doors.length > 0) exteriorDoor = state.doors[0];

        if (exteriorDoor && exteriorDoor.wall) {
            const wall = exteriorDoor.wall;
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen > 0.1) {
                const wallDx = (wall.p2.x - wall.p1.x) / wallLen; const wallDz = (wall.p2.y - wall.p1.y) / wallLen;
                const perpX = -wallDz; const perpZ = wallDx;
                const doorPos = exteriorDoor.position || 0.5;
                const doorCenterX = wall.p1.x + wallDx * wallLen * doorPos;
                const doorCenterZ = wall.p1.y + wallDz * wallLen * doorPos;
                const DOOR_OFFSET = 300;
                cameraPosition.set(doorCenterX + perpX * DOOR_OFFSET, CAMERA_HEIGHT, doorCenterZ + perpZ * DOOR_OFFSET);
                cameraRotation = Math.atan2(-perpX, -perpZ);
            } else { exteriorDoor = null; }
        }
        if (!exteriorDoor) {
            const center = new THREE.Vector3();
            if (sceneObjects.children.length > 0) {
                const boundingBox = new THREE.Box3();
                sceneObjects.children.forEach(obj => { 
                    // floorMaterial KULLANILIYOR
                    if (obj.material !== floorMaterial) boundingBox.expandByObject(obj); 
                });
                if (!boundingBox.isEmpty()) boundingBox.getCenter(center);
            }
            cameraPosition.set(center.x, CAMERA_HEIGHT, center.z + 300);
            cameraRotation = 0;
        }
        camera.position.copy(cameraPosition);
        camera.rotation.set(0, cameraRotation, 0);

    } else {
        // Orbit moda geç
        setCameraMode('orbit'); // <-- YENİ
        orbitControls.enabled = true;
        setActiveControls(orbitControls); // <-- YENİ
        
        camera.position.set(1500, 1800, 1500);
        orbitControls.update();
    }
}

// FPS modunda mıyız kontrol fonksiyonu
export function isFPSMode() {
    return cameraMode === 'firstPerson';
}

// Kamera pozisyonu ve yönü bilgisini döndür (2D gösterge için)
export function getCameraViewInfo() {
    if (!camera) return null;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const yaw = Math.atan2(direction.x, -direction.z);
    return {
        position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
        direction: { x: direction.x, y: direction.y, z: direction.z },
        yaw: yaw,
        isFPS: true, // Her zaman true - 3D göster modunda da çalışır
        showIcon: showCameraIcon // Klavye kullanımında görünür
    };
}

// Kamera pozisyonunu ayarla (2D'den sürüklendiğinde)
export function setCameraPosition(x, z) {
    if (!camera) return;
    camera.position.x = x;
    camera.position.z = z;
    if (!manualHeightMode) {
        const elevation = checkStairElevation(camera.position);
        camera.position.y = CAMERA_HEIGHT + elevation;
    }
}

// Kamera rotasyonunu ayarla (2D'den sürüklendiğinde)
export function setCameraRotation(yaw) {
    if (!camera) return;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    euler.y = yaw;
    camera.quaternion.setFromEuler(euler);
}

// İlk kurulumu yap
setupFirstPersonKeyControls();