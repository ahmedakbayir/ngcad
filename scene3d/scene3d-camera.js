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

// Hareket kontrolleri
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let fastMove = false; // CTRL+SHIFT için hızlı hareket

// Rotasyon kontrolleri (CTRL + OKLAR - kamera sabit)
let rotateLeft = false, rotateRight = false;
let pitchUp = false, pitchDown = false;

// Orbit kontrolleri (SHIFT + OKLAR - merkez sabit, kamera döner)
let orbitLeft = false, orbitRight = false, orbitUp = false, orbitDown = false;

let manualHeightMode = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// Kamera görünürlük kontrolü (klavye kullanıldığında kamera ikonu görünür olur)
export let showCameraIcon = false;

// Mouse kontrolleri için değişkenler
let isMouseDragging = false;
let mouseButton = -1; // 0: sol, 1: orta, 2: sağ
let lastMouseX = 0, lastMouseY = 0;

// --- Sabitler (scene3d-core.js'den taşındı) ---
const CAMERA_HEIGHT = 180; // <-- BU SABİT EKLENDİ
const MOVE_SPEED = 150;
const ROTATION_SPEED = Math.PI / 4;
const PITCH_SPEED = Math.PI / 4;
const VERTICAL_SPEED = 150;
const MOUSE_PAN_SPEED = 2.0; // Mouse pan hızı
const MOUSE_ROTATE_SPEED = 0.003; // Mouse rotate hızı

// --- Fonksiyonlar ---

// Çarpışma tespiti - Duvarlarla çarpışma kontrolü
function checkWallCollision(newPosition) {
    const playerRadius = 30;
    const doorTolerance = 50; // Kapıdan geçiş için ekstra tolerans (sağ ve soldan 50cm)
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
                    // Kapı toleransını artırıyoruz: sağ ve soldan 50cm ekstra
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

// First-Person Kamera Kontrolü - Klavye event listener'ları
function setupFirstPersonKeyControls() {
    const onKeyDown = (event) => {
        if (cameraMode !== 'firstPerson') return;
        if (event.code === 'Space') { event.preventDefault(); return; }

        // Klavye kullanıldığında kamera ikonunu göster
        showCameraIcon = true;

        // CTRL + SHIFT + OKLAR: Hızlı hareket (2x)
        if (event.ctrlKey && event.shiftKey) {
            fastMove = true;
            switch (event.code) {
                case 'ArrowUp': moveForward = true; event.preventDefault(); break;
                case 'ArrowDown': moveBackward = true; event.preventDefault(); break;
                case 'ArrowLeft': moveLeft = true; event.preventDefault(); break;
                case 'ArrowRight': moveRight = true; event.preventDefault(); break;
            }
            return;
        }

        // CTRL + OKLAR: Kamera sabit, rotate (yaw ve pitch)
        if (event.ctrlKey && !event.shiftKey) {
            switch (event.code) {
                case 'ArrowLeft': rotateLeft = true; event.preventDefault(); break;
                case 'ArrowRight': rotateRight = true; event.preventDefault(); break;
                case 'ArrowUp': pitchUp = true; event.preventDefault(); break;
                case 'ArrowDown': pitchDown = true; event.preventDefault(); break;
            }
            return;
        }

        // SHIFT + OKLAR: Canvas ortası merkez, orbit around target
        if (event.shiftKey && !event.ctrlKey) {
            switch (event.code) {
                case 'ArrowLeft': orbitLeft = true; event.preventDefault(); break;
                case 'ArrowRight': orbitRight = true; event.preventDefault(); break;
                case 'ArrowUp': orbitUp = true; event.preventDefault(); break;
                case 'ArrowDown': orbitDown = true; event.preventDefault(); break;
            }
            return;
        }

        // OKLAR (modifier yok): Yön değiştirmeden hareket (strafe)
        switch (event.code) {
            case 'ArrowUp': moveForward = true; event.preventDefault(); break;
            case 'ArrowDown': moveBackward = true; event.preventDefault(); break;
            case 'ArrowLeft': moveLeft = true; event.preventDefault(); break;
            case 'ArrowRight': moveRight = true; event.preventDefault(); break;
            case 'KeyW': moveForward = true; break;
            case 'KeyS': moveBackward = true; break;
            case 'KeyA': moveLeft = true; break;
            case 'KeyD': moveRight = true; break;
            case 'KeyR': manualHeightMode = false; break;
        }
    };

    const onKeyUp = (event) => {
        // Modifier tuşları bırakıldığında ilgili kontrolleri sıfırla
        if (event.key === 'Control') {
            rotateLeft = false; rotateRight = false;
            pitchUp = false; pitchDown = false;
            fastMove = false;
            return;
        }
        if (event.key === 'Shift') {
            orbitLeft = false; orbitRight = false;
            orbitUp = false; orbitDown = false;
            fastMove = false;
            return;
        }

        switch (event.code) {
            case 'ArrowUp':
                moveForward = false;
                pitchUp = false;
                orbitUp = false;
                break;
            case 'ArrowDown':
                moveBackward = false;
                pitchDown = false;
                orbitDown = false;
                break;
            case 'ArrowLeft':
                moveLeft = false;
                rotateLeft = false;
                orbitLeft = false;
                break;
            case 'ArrowRight':
                moveRight = false;
                rotateRight = false;
                orbitRight = false;
                break;
            case 'KeyW': moveForward = false; break;
            case 'KeyS': moveBackward = false; break;
            case 'KeyA': moveLeft = false; break;
            case 'KeyD': moveRight = false; break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

// Mouse kontrolleri için event handler'lar
export function setupMouseControls(canvas) {
    if (!canvas) return;

    const onMouseDown = (event) => {
        if (cameraMode !== 'firstPerson') return;

        isMouseDragging = true;
        mouseButton = event.button;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        event.preventDefault();
    };

    const onMouseMove = (event) => {
        if (!isMouseDragging || cameraMode !== 'firstPerson') return;

        const deltaX = event.clientX - lastMouseX;
        const deltaY = event.clientY - lastMouseY;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;

        // Sol tık (button 0): Pan (kamera yatay ve dikey hareket)
        if (mouseButton === 0) {
            const forward = new THREE.Vector3();
            camera.getWorldDirection(forward);
            forward.y = 0;
            forward.normalize();

            const right = new THREE.Vector3();
            right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
            right.normalize();

            // Pan hareketi
            const panX = -deltaX * MOUSE_PAN_SPEED;
            const panY = -deltaY * MOUSE_PAN_SPEED;

            const newPosition = new THREE.Vector3(
                camera.position.x + right.x * panX + forward.x * panY,
                camera.position.y,
                camera.position.z + right.z * panX + forward.z * panY
            );

            if (checkWallCollision(newPosition)) {
                camera.position.x = newPosition.x;
                camera.position.z = newPosition.z;
            }
        }
        // Orta tık (button 1): Rotate (orbit around target)
        else if (mouseButton === 1) {
            // Canvas merkezini hedef al
            const center = new THREE.Vector3(0, CAMERA_HEIGHT, 0);
            const offset = new THREE.Vector3().subVectors(camera.position, center);
            const spherical = new THREE.Spherical().setFromVector3(offset);

            spherical.theta -= deltaX * MOUSE_ROTATE_SPEED;
            spherical.phi += deltaY * MOUSE_ROTATE_SPEED;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

            offset.setFromSpherical(spherical);
            camera.position.copy(center).add(offset);
            camera.lookAt(center);
        }
        // Sağ tık (button 2): Rotate in place (kamera sabit, sadece bakış yönü döner)
        else if (mouseButton === 2) {
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(camera.quaternion);

            euler.y -= deltaX * MOUSE_ROTATE_SPEED;
            euler.x -= deltaY * MOUSE_ROTATE_SPEED;
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

            camera.quaternion.setFromEuler(euler);
        }
    };

    const onMouseUp = (event) => {
        if (cameraMode !== 'firstPerson') return;
        isMouseDragging = false;
        mouseButton = -1;
    };

    const onContextMenu = (event) => {
        // Sağ tık menüsünü engelle (3D modunda)
        if (cameraMode === 'firstPerson') {
            event.preventDefault();
        }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
}

// First-person kamerayı güncelle (ana döngüden çağrılır)
export function updateFirstPersonCamera(delta) {
    // 'cameraMode' artık doğrudan core'dan import edilen global değişkeni okuyor
    if (cameraMode !== 'firstPerson') {
         // FPS modunda değilsek, tüm hareket bayraklarını sıfırla (önemli!)
         moveForward = false; moveBackward = false; moveLeft = false; moveRight = false;
         rotateLeft = false; rotateRight = false;
         pitchUp = false; pitchDown = false;
         orbitLeft = false; orbitRight = false; orbitUp = false; orbitDown = false;
         fastMove = false;
         return;
    }

    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    let rotationChanged = false;

    // CTRL + OKLAR: Kamera rotasyonu (kamera sabit)
    if (rotateLeft) { euler.y += ROTATION_SPEED * delta; rotationChanged = true; }
    if (rotateRight) { euler.y -= ROTATION_SPEED * delta; rotationChanged = true; }
    if (pitchUp) { euler.x += PITCH_SPEED * delta; rotationChanged = true; }
    if (pitchDown) { euler.x -= PITCH_SPEED * delta; rotationChanged = true; }
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    if (rotationChanged) camera.quaternion.setFromEuler(euler);

    // SHIFT + OKLAR: Orbit around canvas center
    if (orbitLeft || orbitRight || orbitUp || orbitDown) {
        // Canvas merkezini bul (orbitControls.target benzeri)
        const center = new THREE.Vector3(0, CAMERA_HEIGHT, 0);

        // Kameranın merkeze olan uzaklığını hesapla
        const radius = camera.position.distanceTo(center);

        // Mevcut pozisyonu spherical koordinatlara çevir
        const offset = new THREE.Vector3().subVectors(camera.position, center);
        const spherical = new THREE.Spherical().setFromVector3(offset);

        // Orbit hareketlerini uygula
        const orbitSpeed = ROTATION_SPEED * delta;
        if (orbitLeft) spherical.theta -= orbitSpeed;
        if (orbitRight) spherical.theta += orbitSpeed;
        if (orbitUp) spherical.phi -= orbitSpeed;
        if (orbitDown) spherical.phi += orbitSpeed;

        // Phi'yi sınırla (0 ile PI arası)
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));

        // Yeni pozisyonu hesapla
        offset.setFromSpherical(spherical);
        camera.position.copy(center).add(offset);

        // Kamerayı merkeze baktır
        camera.lookAt(center);

        // Klavye kullanıldığında kamera ikonunu göster
        showCameraIcon = true;
    }

    // OKLAR (veya W/A/S/D): Hareket (yön değiştirmeden strafe)
    if (moveForward || moveBackward || moveLeft || moveRight) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();

        const right = new THREE.Vector3();
        right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
        right.normalize();

        const movement = new THREE.Vector3();
        const speed = fastMove ? MOVE_SPEED * 2 : MOVE_SPEED; // Hızlı hareket için 2x

        if (moveForward) movement.add(forward.clone().multiplyScalar(speed * delta));
        if (moveBackward) movement.add(forward.clone().multiplyScalar(-speed * delta));
        if (moveLeft) movement.add(right.clone().multiplyScalar(-speed * delta));
        if (moveRight) movement.add(right.clone().multiplyScalar(speed * delta));

        const newPosition = new THREE.Vector3(
            camera.position.x + movement.x,
            camera.position.y,
            camera.position.z + movement.z
        );

        if (checkWallCollision(newPosition)) {
            camera.position.x = newPosition.x;
            camera.position.z = newPosition.z;
            if (!manualHeightMode) {
                const elevation = checkStairElevation(camera.position);
                camera.position.y = CAMERA_HEIGHT + elevation;
            }
        }
    }

    camera.position.y = Math.max(10, camera.position.y);
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
        isFPS: cameraMode === 'firstPerson',
        showIcon: showCameraIcon // Klavye kullanımında icon göster
    };
}

// Kamera pozisyonunu ayarla (2D'den sürüklendiğinde)
export function setCameraPosition(x, z) {
    if (!camera || cameraMode !== 'firstPerson') return;
    camera.position.x = x;
    camera.position.z = z;
    if (!manualHeightMode) {
        const elevation = checkStairElevation(camera.position);
        camera.position.y = CAMERA_HEIGHT + elevation;
    }
}

// Kamera rotasyonunu ayarla (2D'den sürüklendiğinde)
export function setCameraRotation(yaw) {
    if (!camera || cameraMode !== 'firstPerson') return;
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    euler.setFromQuaternion(camera.quaternion);
    euler.y = yaw;
    camera.quaternion.setFromEuler(euler);
}

// İlk kurulumu yap
setupFirstPersonKeyControls();