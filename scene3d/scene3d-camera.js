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
    updateDrawingCenter, // <-- YENİ IMPORT
} from "./scene3d-core.js";
import { state, WALL_HEIGHT } from "../general-files/main.js"; // <-- CAMERA_HEIGHT buradan kaldırıldı

// --- Değişkenler (scene3d-core.js'den taşındı) ---
// export let cameraMode = coreCameraMode; // <-- BU SATIR SİLİNDİ
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let orbitUp = false, orbitDown = false, orbitLeft = false, orbitRight = false;
let rotateProjectUp = false, rotateProjectDown = false, rotateProjectLeft = false, rotateProjectRight = false;
let speedBoost = false;
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

        // CTRL + SHIFT + OKLAR: 2x hız boost
        if (event.ctrlKey && event.shiftKey) {
            speedBoost = true;
            switch (event.code) {
                case 'ArrowUp': moveForward = true; event.preventDefault(); break;
                case 'ArrowDown': moveBackward = true; event.preventDefault(); break;
                case 'ArrowLeft': moveLeft = true; event.preventDefault(); break;
                case 'ArrowRight': moveRight = true; event.preventDefault(); break;
            }
            return;
        }

        // CTRL + OKLAR: Projeyi kamera etrafında döndür (4 yön)
        if (event.ctrlKey) {
            switch (event.code) {
                case 'ArrowUp': rotateProjectUp = true; event.preventDefault(); break;
                case 'ArrowDown': rotateProjectDown = true; event.preventDefault(); break;
                case 'ArrowLeft': rotateProjectLeft = true; event.preventDefault(); break;
                case 'ArrowRight': rotateProjectRight = true; event.preventDefault(); break;
            }
            return;
        }

        // SHIFT + OKLAR: Çizim merkezi etrafında orbit
        if (event.shiftKey) {
            switch (event.code) {
                case 'ArrowUp': orbitUp = true; event.preventDefault(); break;
                case 'ArrowDown': orbitDown = true; event.preventDefault(); break;
                case 'ArrowLeft': orbitLeft = true; event.preventDefault(); break;
                case 'ArrowRight': orbitRight = true; event.preventDefault(); break;
            }
            return;
        }

        // OKLAR: Ok yönünde hareket (bakış yönü değişmeden)
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
        // Tuş bırakıldığında boost'u kaldır
        if (event.key === 'Control' || event.key === 'Shift') {
            speedBoost = false;
        }

        // Control tuşu bırakıldığında proje rotasyon bayraklarını temizle
        if (event.key === 'Control') {
            rotateProjectUp = false;
            rotateProjectDown = false;
            rotateProjectLeft = false;
            rotateProjectRight = false;
            return;
        }

        // Shift tuşu bırakıldığında orbit bayraklarını temizle
        if (event.key === 'Shift') {
            orbitUp = false;
            orbitDown = false;
            orbitLeft = false;
            orbitRight = false;
            return;
        }

        switch (event.code) {
            case 'ArrowUp':
                moveForward = false;
                orbitUp = false;
                rotateProjectUp = false;
                break;
            case 'ArrowDown':
                moveBackward = false;
                orbitDown = false;
                rotateProjectDown = false;
                break;
            case 'ArrowLeft':
                moveLeft = false;
                orbitLeft = false;
                rotateProjectLeft = false;
                break;
            case 'ArrowRight':
                moveRight = false;
                orbitRight = false;
                rotateProjectRight = false;
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

// Çizim merkezini hesapla (SHIFT+OKLAR için)
function getDrawingCenter() {
    if (!sceneObjects) return new THREE.Vector3(0, 180, 0);

    const boundingBox = new THREE.Box3();
    let hasContent = false;

    sceneObjects.children.forEach(obj => {
        if (obj.visible && obj.material !== floorMaterial) {
            try {
                obj.updateMatrixWorld(true);
                const box = new THREE.Box3().setFromObject(obj, true);
                if (!box.isEmpty()) {
                    boundingBox.union(box);
                    hasContent = true;
                }
            } catch (error) {
                // Hata durumunda devam et
            }
        }
    });

    if (hasContent && !boundingBox.isEmpty()) {
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        center.y = 180; // Z yüksekliği 180 olarak sabit
        return center;
    }

    return new THREE.Vector3(0, 180, 0);
}

// Kamera klavye kontrollerini güncelle (ana döngüden çağrılır)
export function updateFirstPersonCamera(delta) {
    // Artık mod kontrolü yok - her zaman çalışır (3D göster modunda da)

    // CTRL + OKLAR: Projeyi kamera etrafında döndür
    if (rotateProjectLeft || rotateProjectRight || rotateProjectUp || rotateProjectDown) {
        const rotationSpeed = Math.PI / 4 * delta; // 45 derece/saniye

        if (rotateProjectLeft) {
            sceneObjects.position.sub(camera.position);
            sceneObjects.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rotationSpeed);
            sceneObjects.position.add(camera.position);
        }
        if (rotateProjectRight) {
            sceneObjects.position.sub(camera.position);
            sceneObjects.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -rotationSpeed);
            sceneObjects.position.add(camera.position);
        }
        if (rotateProjectUp) {
            // X ekseni etrafında döndür (yukarı)
            const right = new THREE.Vector3();
            camera.getWorldDirection(right);
            right.y = 0;
            right.normalize();
            const perpRight = new THREE.Vector3(-right.z, 0, right.x);

            sceneObjects.position.sub(camera.position);
            sceneObjects.rotateOnWorldAxis(perpRight, rotationSpeed);
            sceneObjects.position.add(camera.position);
        }
        if (rotateProjectDown) {
            // X ekseni etrafında döndür (aşağı)
            const right = new THREE.Vector3();
            camera.getWorldDirection(right);
            right.y = 0;
            right.normalize();
            const perpRight = new THREE.Vector3(-right.z, 0, right.x);

            sceneObjects.position.sub(camera.position);
            sceneObjects.rotateOnWorldAxis(perpRight, -rotationSpeed);
            sceneObjects.position.add(camera.position);
        }
        return;
    }

    // SHIFT + OKLAR: Çizim merkezi etrafında orbit
    if (orbitLeft || orbitRight || orbitUp || orbitDown) {
        const center = getDrawingCenter();
        const orbitSpeed = Math.PI / 4 * delta; // 45 derece/saniye

        // Kamera pozisyonunu merkeze göre hesapla
        const offset = new THREE.Vector3().subVectors(camera.position, center);

        if (orbitLeft) {
            // Y ekseni etrafında sola orbit
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbitSpeed);
        }
        if (orbitRight) {
            // Y ekseni etrafında sağa orbit
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), -orbitSpeed);
        }
        if (orbitUp) {
            // Yatay düzlemde yukarı orbit (Z ekseni)
            const axis = new THREE.Vector3(-offset.z, 0, offset.x).normalize();
            offset.applyAxisAngle(axis, orbitSpeed);
        }
        if (orbitDown) {
            // Yatay düzlemde aşağı orbit (Z ekseni)
            const axis = new THREE.Vector3(-offset.z, 0, offset.x).normalize();
            offset.applyAxisAngle(axis, -orbitSpeed);
        }

        // Yeni kamera pozisyonunu ayarla
        camera.position.copy(center).add(offset);

        // Kamerayı merkeze baktır
        camera.lookAt(center);

        return;
    }

    // OKLAR (veya CTRL+SHIFT+OKLAR ile 2x hız): Ok yönünde hareket
    if (moveForward || moveBackward || moveLeft || moveRight) {
        const speed = speedBoost ? (MOVE_SPEED * 2) : MOVE_SPEED;

        // Mevcut bakış yönünü koru - DÜNYA KOORDINATLARINDA hareket et
        const forward = new THREE.Vector3(0, 0, -1); // Dünya Z ekseni
        const right = new THREE.Vector3(1, 0, 0);   // Dünya X ekseni
        const movement = new THREE.Vector3();

        if (moveForward) movement.add(forward.clone().multiplyScalar(speed * delta));
        if (moveBackward) movement.add(forward.clone().multiplyScalar(-speed * delta));

        // Geri giderken sağ-sol ok tuşları tersine çalışsın
        if (moveBackward && !moveForward) {
            // Geriye gidiyoruz, sağ-sol'u tersine çevir
            if (moveLeft) movement.add(right.clone().multiplyScalar(speed * delta)); // Sol tuş → Sağa git
            if (moveRight) movement.add(right.clone().multiplyScalar(-speed * delta)); // Sağ tuş → Sola git
        } else {
            // Normal hareket
            if (moveLeft) movement.add(right.clone().multiplyScalar(-speed * delta));
            if (moveRight) movement.add(right.clone().multiplyScalar(speed * delta));
        }

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

        autoOpenNearbyDoors();
    }
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