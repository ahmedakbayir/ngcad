// scene3d-camera.js
// FPS kamera kontrollerini, çarpışma tespitini ve kamera geçişlerini yönetir.

import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import {
    scene, camera, orbitControls, pointerLockControls, sceneObjects,
    renderer, // <-- BURAYA EKLENDİ
    cameraMode,
    setCameraMode, 
    setActiveControls, 
    floorMaterial, 
} from "./scene3d-core.js";
import { state, WALL_HEIGHT } from "../general-files/main.js"; 

// --- Değişkenler (scene3d-core.js'den taşındı) ---
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let rotateLeft = false, rotateRight = false;
let moveUp = false, moveDown = false;
let pitchUp = false, pitchDown = false;
let manualHeightMode = false;
let sprintMode = false; // Ctrl+Shift+Arrow ile hızlı hareket modu
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

// --- Sabitler (scene3d-core.js'den taşındı) ---
const CAMERA_HEIGHT = 180; 
const MOVE_SPEED = 150;
const ROTATION_SPEED = Math.PI / 4;
const PITCH_SPEED = Math.PI / 4;
const VERTICAL_SPEED = 150;

// --- Fonksiyonlar ---

// Çarpışma tespiti - Duvarlarla çarpışma kontrolü (ŞU ANDA DEVREdışı - kamera duvarlardan geçebilir)
function checkWallCollision(newPosition) {
    // Duvar çarpışması devre dışı - her zaman geçişe izin ver
    return true;
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

        // Ctrl+Shift+Arrow kombinasyonu - Sprint (hızlı hareket) modu
        if (event.ctrlKey && event.shiftKey) {
            switch (event.code) {
                case 'ArrowUp': case 'KeyW': sprintMode = true; moveForward = true; event.preventDefault(); break;
                case 'ArrowDown': case 'KeyS': sprintMode = true; moveBackward = true; event.preventDefault(); break;
                case 'ArrowLeft': sprintMode = true; moveLeft = true; event.preventDefault(); break;
                case 'ArrowRight': sprintMode = true; moveRight = true; event.preventDefault(); break;
            }
            return;
        }

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
    
    // --- GÜNCELLEME: SPRINT (TAKILMA) HATASI DÜZELTİLDİ ---
    const onKeyUp = (event) => {
        // Sprint modunu kapat (Ctrl veya Shift bırakıldığında)
        if (event.key === 'Control' || event.key === 'Shift') {
            sprintMode = false;
        }

        // Modifier tuşları bırakıldığında ilgili hareketleri durdur
        if (event.key === 'Control') { 
            pitchUp = false; 
            pitchDown = false; 
            // Sprint modunda değilse (sadece Ctrl basılıysa) A/D (moveLeft/Right) durdur
            if (!event.shiftKey) {
                moveLeft = false; 
                moveRight = false;
            }
            return; 
        }
        if (event.key === 'Shift') { 
            moveUp = false; 
            moveDown = false; 
            // Sprint modunda değilse (sadece Shift basılıysa) A/D (moveLeft/Right) durdur
            if (!event.ctrlKey) {
                moveLeft = false; 
                moveRight = false;
            }
            return; 
        }
        
        // Yön tuşları bırakıldığında, modifier'lar basılı olsa bile hareketi durdur
        switch (event.code) {
            case 'ArrowUp': 
            case 'KeyW':
                moveForward = false; 
                break;
            case 'ArrowDown': 
            case 'KeyS':
                moveBackward = false; 
                break;
            case 'ArrowLeft': 
                rotateLeft = false; // Normal döndürme
                moveLeft = false;   // Ctrl veya Ctrl+Shift ile hareket
                break;
            case 'ArrowRight': 
                rotateRight = false; // Normal döndürme
                moveRight = false;   // Ctrl veya Ctrl+Shift ile hareket
                break;
            case 'KeyA': 
                moveLeft = false; // A tuşu her zaman moveLeft'tir
                break;
            case 'KeyD': 
                moveRight = false; // D tuşu her zaman moveRight'tır
                break;
        }
    };
    // --- GÜNCELLEME SONU ---
    
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

// First-person kamerayı güncelle (ana döngüden çağrılır)
export function updateFirstPersonCamera(delta) {
    // 'cameraMode' artık doğrudan core'dan import edilen global değişkeni okuyor
    if (cameraMode !== 'firstPerson') {
         // FPS modunda değilsek, tüm hareket bayraklarını sıfırla (önemli!)
         moveForward = false; moveBackward = false; moveLeft = false; moveRight = false;
         rotateLeft = false; rotateRight = false; moveUp = false; moveDown = false;
         pitchUp = false; pitchDown = false;
         return;
    }

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

    // Hareket hızı - Sprint modunda 2 katına çık
    const currentSpeed = sprintMode ? (MOVE_SPEED * 2) : MOVE_SPEED;

    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(); right.crossVectors(forward, new THREE.Vector3(0, 1, 0)); right.normalize();
    const movement = new THREE.Vector3();

    // Geri giderken yön kontrolü tersine çevir (araç simülasyonu)
    let effectiveLeft = moveLeft;
    let effectiveRight = moveRight;
    if (moveBackward && (moveLeft || moveRight)) {
        // Geri basılıyken sola basarsak -> geriye ve SAĞA git
        // Geri basılıyken sağa basarsak -> geriye ve SOLA git
        effectiveLeft = moveRight;
        effectiveRight = moveLeft;
    }

    if (moveForward) movement.add(forward.clone().multiplyScalar(currentSpeed * delta));
    if (moveBackward) movement.add(forward.clone().multiplyScalar(-currentSpeed * delta));
    if (effectiveLeft) movement.add(right.clone().multiplyScalar(-currentSpeed * delta));
    if (effectiveRight) movement.add(right.clone().multiplyScalar(currentSpeed * delta));

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
                
                // --- HATA DÜZELTMESİ BURADA ---
                const perpX = -wallDz; const perpZ = wallDx;
                // --- HATA DÜZELTMESİ SONU ---

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
        isFPS: cameraMode === 'firstPerson'
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

// --- YENİ EKLENDİ: FPS Modu için Orta Tuş (MMB) ile Döndürme ---
// --- DEĞİŞİKLİK: Fonksiyon 'export' edildi ---
export function setupFirstPersonMouseControls() {
    let isMmbDown = false; // Orta tuş (MMB) basılı mı?

    // 3D canvas (renderer.domElement 'scene3d-core.js'den import edildi)
    // Hata kontrolü: renderer veya domElement tanımsızsa fonksiyonu çalıştırma
    if (!renderer || !renderer.domElement) {
        console.error("FPS Mouse Kontrolü: Renderer veya Canvas (domElement) bulunamadı.");
        return;
    }
    const canvas = renderer.domElement; 

    canvas.addEventListener('mousedown', (e) => {
        // Sadece FPS modunda ve Orta Tuş (button 1) ise
        if (cameraMode === 'firstPerson' && e.button === 1) { 
            isMmbDown = true;
            e.preventDefault();
            // Mouse'u kilitlemek (pointer lock) daha akıcı bir deneyim sağlar
            try {
                canvas.requestPointerLock();
            } catch (err) {
                console.warn("Pointer lock istenemedi:", err);
            }
        }
    });

    document.addEventListener('mousemove', (e) => {
        // Sadece MMB basılıysa ve pointer kilitliyse (veya kilitlenemediyse ama MMB basılıysa)
        if (isMmbDown && (document.pointerLockElement === canvas || !document.pointerLockElement)) {
            
            // Pointer lock varsa 'movementX' kullan, yoksa 'e.movementX' (fallback)
            const deltaX = e.movementX || 0;
            
            if (deltaX === 0) return; // Gerçek bir hareket yoksa çık

            const rotateSpeedFactor = 0.002; // Klavye hızından (delta) bağımsız, daha düşük bir faktör

            // 'updateFirstPersonCamera' içindeki Euler hesaplamasının aynısı
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(camera.quaternion);
            
            // Sadece Y ekseninde (Yaw) döndür
            // Mouse sağa (+deltaX) -> euler.y azalmalı (-)
            euler.y -= deltaX * rotateSpeedFactor; 

            camera.quaternion.setFromEuler(euler);
        }
    });

    document.addEventListener('mouseup', (e) => {
        // Orta tuş (button 1) bırakıldıysa
        if (e.button === 1) {
            isMmbDown = false;
            // Mouse kilidini aç
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock();
            }
        }
    });

    // Pointer lock değiştiğinde (örn. Esc ile çıkıldığında) MMB durumunu sıfırla
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== canvas) {
            isMmbDown = false;
        }
    }, false);
}

/**
 * Kamerayı izometrik görünüm açısına ayarlar
 * İzometrik projeksiyon: 45° yatay dönüş, 30° yukarıdan bakış
 */
export function setIsometricCamera() {
    if (!camera || !orbitControls) return;

    // Sahne merkezini hesapla
    const center = new THREE.Vector3();
    if (sceneObjects && sceneObjects.children.length > 0) {
        const boundingBox = new THREE.Box3();
        sceneObjects.children.forEach(obj => {
            if (obj.material !== floorMaterial) {
                boundingBox.expandByObject(obj);
            }
        });
        if (!boundingBox.isEmpty()) {
            boundingBox.getCenter(center);
        }
    }

    // İzometrik açılar: 45° yatay (azimuth), 30° yukarıdan (elevation)
    const azimuthAngle = Math.PI / 4; // 45 derece
    const elevationAngle = Math.PI / 6; // 30 derece

    // Kamera mesafesi (sahne boyutuna göre)
    const distance = 2000;

    // Kamera pozisyonunu hesapla
    const x = center.x + distance * Math.cos(elevationAngle) * Math.sin(azimuthAngle);
    const y = center.y + distance * Math.sin(elevationAngle);
    const z = center.z + distance * Math.cos(elevationAngle) * Math.cos(azimuthAngle);

    camera.position.set(x, y, z);
    orbitControls.target.copy(center);
    orbitControls.update();
}

/**
 * Kamerayı varsayılan orbit pozisyonuna geri döndürür
 */
export function resetToOrbitCamera() {
    if (!camera || !orbitControls) return;

    camera.position.set(1500, 1800, 1500);
    orbitControls.target.set(0, WALL_HEIGHT / 2, 0);
    orbitControls.update();
}

/**
 * Orbit kamerayı aktif katın içeriğine (duvar + tesisat) sığdırır.
 * Mevcut bakış yönü korunur — sadece hedef ve mesafe güncellenir.
 * 2D fit-to-screen ile birlikte çağrılarak iki sahne aynı içeriği gösterir.
 *
 * Koordinat eşlemesi: 2D x → 3D x, 2D y → 3D z, kot (z) → 3D y.
 */
export function fit3DToCurrentFloor() {
    if (!camera || !orbitControls) return;

    const currentFloorId = state.currentFloor?.id || null;
    const isOnFloor = (obj) => {
        if (!currentFloorId) return true;
        if (!obj || obj.floorId === undefined || obj.floorId === null) return true;
        return obj.floorId === currentFloorId;
    };

    let minX = Infinity, minY2D = Infinity, minElev = Infinity;
    let maxX = -Infinity, maxY2D = -Infinity, maxElev = -Infinity;
    let hasContent = false;

    const includePoint = (x, y, z) => {
        if (x == null || y == null) return;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY2D) minY2D = y; if (y > maxY2D) maxY2D = y;
        const e = z || 0;
        if (e < minElev) minElev = e; if (e > maxElev) maxElev = e;
        hasContent = true;
    };

    // Tesisat boruları
    (state.plumbingPipes || []).filter(isOnFloor).forEach(p => {
        if (p.p1) includePoint(p.p1.x, p.p1.y, p.p1.z);
        if (p.p2) includePoint(p.p2.x, p.p2.y, p.p2.z);
    });
    // Tesisat bileşenleri
    (state.plumbingBlocks || []).filter(isOnFloor).forEach(c => {
        if (c.x === undefined || c.y === undefined) return;
        includePoint(c.x - 20, c.y - 20, c.z);
        includePoint(c.x + 20, c.y + 20, c.z);
    });
    // Duvar uçları — tesisat yoksa veya tek noktaysa çerçeveleme için fayda
    (state.walls || []).filter(isOnFloor).forEach(w => {
        if (w.p1) includePoint(w.p1.x, w.p1.y, 0);
        if (w.p2) includePoint(w.p2.x, w.p2.y, 0);
    });

    if (!hasContent) return;

    // Katın kot tabanını ekle: tesisat z'si genelde göreceli; mutlak konum
    // için aktif katın bottomElevation'ı tabanı belirler.
    const floor = (state.floors || []).find(f => f.id === currentFloorId && !f.isPlaceholder);
    const floorBase = floor ? (floor.bottomElevation || 0) : 0;
    const floorTop  = floor ? (floor.topElevation || (floorBase + WALL_HEIGHT)) : (floorBase + WALL_HEIGHT);

    // 3D koordinatlar
    const centerX = (minX + maxX) / 2;
    const center2DY = (minY2D + maxY2D) / 2;
    // Y (yükseklik): kotun ortası + katın orta noktası (içerik düz katsa floorBase+halfWall'a düşer)
    const yLo = Math.min(minElev, floorBase);
    const yHi = Math.max(maxElev, floorTop);
    const centerY = (yLo + yHi) / 2;

    const target = new THREE.Vector3(centerX, centerY, center2DY);

    const sizeX = maxX - minX;
    const sizeY = yHi - yLo;
    const sizeZ = maxY2D - minY2D;
    const radius = Math.max(Math.hypot(sizeX, sizeY, sizeZ) / 2, 150) * 1.25;

    // Kameranın yatay FOV'unu hesaba kat (geniş içerikte daha uzaklaşmalı)
    const fovY = (camera.fov || 75) * Math.PI / 180;
    const aspect = camera.aspect || 1;
    const fitDistV = radius / Math.sin(fovY / 2);
    const fitDistH = aspect >= 1 ? fitDistV / aspect : fitDistV;
    let distance = Math.max(fitDistV, fitDistH, 300);

    // Mevcut bakış yönünü koru: yön = (cam - target).normalize
    const dir = new THREE.Vector3().subVectors(camera.position, orbitControls.target);
    if (dir.lengthSq() < 1e-6) {
        // Yön belirsiz → izometrik fallback
        dir.set(Math.cos(Math.PI / 6) * Math.sin(Math.PI / 4),
                Math.sin(Math.PI / 6),
                Math.cos(Math.PI / 6) * Math.cos(Math.PI / 4));
    } else {
        dir.normalize();
    }

    camera.position.copy(target).addScaledVector(dir, distance);
    orbitControls.target.copy(target);
    orbitControls.update();
}