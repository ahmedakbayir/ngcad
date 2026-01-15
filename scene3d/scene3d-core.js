// scene3d-core.js
// Sahne, kamera, renderer, kontroller ve 3D malzemelerin kurulumunu yapar.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { CSS2DRenderer, CSS2DObject as CSS2DObjectClass } from "three/addons/renderers/CSS2DRenderer.js";
export { CSS2DObjectClass as CSS2DObject }; // Diğer dosyalarda kullanmak için export et
import { state, WALL_HEIGHT, dom, setState } from "../general-files/main.js"; // <-- setState eklendi

// --- Global Değişkenler ---
export let scene, camera, renderer, controls; // 'controls' MEVCUT aktif kontrol olacak
export let orbitControls, pointerLockControls;
export let cameraMode = 'orbit'; // 'orbit' veya 'firstPerson'
export let sceneObjects;
export let textureLoader; // <-- Resim çerçeveleri için eklendi
export let labelRenderer; // <-- Yükseklik etiketleri için CSS2DRenderer

// --- Malzemeler (Materials) ---
export let wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial,
    mullionMaterial, sillMaterial, handleMaterial, floorMaterial,
    evenFloorMaterial, oddFloorMaterial, // <-- Tek ve çift katlar için ayrı materyaller
    stairMaterial, stairMaterialTop, ventMaterial, trimMaterial,
    balconyRailingMaterial, glassMaterial, halfWallCapMaterial,
    handrailWoodMaterial, balusterMaterial, stepNosingMaterial,
    pictureFrameMaterial; // <-- Adı düzeltildi (pictureFrameBorderMaterial -> pictureFrameMaterial)

// YENİ SETTER FONKSİYONLARI
/**
 * Aktif kamera modunu ayarlar (dışarıdan çağrılmak için).
 * @param {string} mode 'orbit' veya 'firstPerson'
 */
export function setCameraMode(mode) {
    cameraMode = mode;
}

/**
 * Aktif Three.js kontrol nesnesini ayarlar (dışarıdan çağrılmak için).
 * @param {object | null} activeControls OrbitControls, PointerLockControls veya null
 */
export function setActiveControls(activeControls) {
    controls = activeControls;
}

/**
 * 3D sahne arkaplan rengini mevcut temaya göre günceller
 */
export function updateSceneBackground() {
    if (!scene) return;
    const isLightMode = document.body.classList.contains('light-mode');
    // Kullanıcının istediği renkler: Koyu #30302e, Açık #e6e7e7
    const bgColor = isLightMode ? 0xe6e7e7 : 0x30302e;
    scene.background = new THREE.Color(bgColor);
}
// YENİ SETTER FONKSİYONLARI SONU

/**
 * 3D Sahneyi, kamerayı, ışıkları, kontrolleri ve malzemeleri başlatır.
 */
export function init3D(canvasElement) {
    scene = new THREE.Scene();
    updateSceneBackground(); // Temaya göre arkaplan ayarla

    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
    camera.position.set(1500, 1800, 1500);

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: canvasElement,
    });

    textureLoader = new THREE.TextureLoader(); // <-- Texture Loader'ı başlat
    textureLoader.setCrossOrigin('anonymous'); // <-- DÜZELTME: CORS HATASI İÇİN EKLENDİ

    // OrbitControls'ü başlat
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.target.set(0, WALL_HEIGHT / 2, 0);
    orbitControls.minDistance = 1;
    orbitControls.zoomSpeed = 0.5; // Daha smooth zoom için düşürüldü
    orbitControls.update();

    // --- YENİ EKLENDİ: Mouse tuş atamaları (İsteğinize göre güncellendi) ---
    orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,   // Sol Tuş = Döndürme
        MIDDLE: THREE.MOUSE.PAN,    // Orta Tuş = Pan (Kaydırma)
        // Sağ Tuş (RIGHT) burada ayarlanmadı, aşağıdaki özel dinleyici tarafından ele alınacak
    };
    // --- YENİ KOD SONU ---

    // --- DEĞİŞİKLİK: SADECE SAĞ TUŞ (RMB) İÇİN FPS STİLİ DÖNDÜRME ---
    // --- VE is3DMouseDown KONTROLÜ ---
    let isRotating = false;

    renderer.domElement.addEventListener('mousedown', (e) => {
        // 2D kamera göstergesini gizlemek için state'i ayarla
        setState({ is3DMouseDown: true });

        // SADECE Sağ tık (RMB) FPS-style rotate (Yaw/Pitch) yapsın
        // VE SADECE Orbit modundayken çalışsın
        if (e.button === 2 && cameraMode === 'orbit') { 
            // OrbitControls'ün bu tuşu işlemesini engelle
            e.preventDefault(); 
            e.stopPropagation();
            
            isRotating = true;

            // Pointer lock'u etkinleştir
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener('mousemove', (e) => {
        if (isRotating && document.pointerLockElement === renderer.domElement) {
            // movementX/Y pointer lock'ta mouse hareketini verir
            const deltaX = e.movementX || 0;
            const deltaY = e.movementY || 0;

            // Hata veren 'orbitControls.rotateLeft' yerine manuel Euler rotasyonu
            const rotateSpeed = 0.003; // Döndürme hızı/hassasiyeti

            // 1. Kameranın mevcut Euler açılarını al (YXZ sırası FPS için önemlidir)
            const euler = new THREE.Euler(0, 0, 0, 'YXZ');
            euler.setFromQuaternion(camera.quaternion);

            // 2. Deltaları uygula (Yaw ve Pitch)
            euler.y -= deltaX * rotateSpeed; // Yaw (Y ekseni etrafında)
            euler.x -= deltaY * rotateSpeed; // Pitch (X ekseni etrafında)

            // 3. Pitch açısını sınırla (ters dönmeyi engelle)
            euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));

            // 4. Yeni rotasyonu kameraya uygula
            camera.quaternion.setFromEuler(euler);

            // 5. OrbitControls'ün hedefini (target) kameranın baktığı yere güncelle
            // (Bu, Sol Tuş'a (ROTATE) geçtiğinizde kameranın sıçramasını engeller)
            const distance = camera.position.distanceTo(orbitControls.target);
            const newDirection = new THREE.Vector3();
            camera.getWorldDirection(newDirection);
            const newTarget = new THREE.Vector3();
            newTarget.copy(camera.position).addScaledVector(newDirection, distance);
            
            orbitControls.target.copy(newTarget);

            // 6. OrbitControls'ü güncelle (kameranın yeni durumunu senkronize et)
            orbitControls.update();
        }
    });

    // GENEL mouseup (sadece document üzerinde değil, window'da)
    window.addEventListener('mouseup', (e) => {
        // 2D kamera göstergesini geri getirmek için state'i ayarla
        setState({ is3DMouseDown: false });

        // Sadece Sağ tuş bırakıldıysa rotasyonu durdur
        if (isRotating && e.button === 2) {
            isRotating = false;
            // Pointer lock'u kapat
            if (document.pointerLockElement === renderer.domElement) {
                document.exitPointerLock();
            }
        }
    });
    // --- DEĞİŞİKLİK SONU ---


    // PointerLockControls'ü başlat (sadece referans için, mouse kontrolü kullanmayacağız)
    pointerLockControls = new PointerLockControls(camera, renderer.domElement);
    pointerLockControls.disconnect(); // Mouse kontrolünü tamamen devre dışı bırak

    // Varsayılan olarak OrbitControls aktif
    setActiveControls(orbitControls); // <-- SETTER KULLANILDI

    const amb = new THREE.AmbientLight(0xffffff, 1.2);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2000, 3000, 1500);
    scene.add(amb, dir);

    sceneObjects = new THREE.Group();
    scene.add(sceneObjects);

    const solidOpacity = 0.75; 

    // --- Malzemeleri burada oluştur ---
    wallMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(217, 220, 223, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    doorMaterial = new THREE.MeshStandardMaterial({
        color: '#146E70',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    windowMaterial = new THREE.MeshStandardMaterial({
        color: "#ADD8E6",
        roughness: 0.1, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });

    // Kolon ve kiriş için ayrı materyaller (wallMaterial ile aynı özelliklerde)
    columnMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(217, 220, 223, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    beamMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(217, 220, 223, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    mullionMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    sillMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.5, transparent: true, opacity: solidOpacity + 0.1, side: THREE.DoubleSide
    });

    trimMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    handleMaterial = new THREE.MeshStandardMaterial({
        color: 0xB0B0B0,
        metalness: 0.8, roughness: 0.4, transparent: false, opacity: 1.0
    });

    // Eski tek materyal (geri uyumluluk için)
    floorMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(116, 116, 116, 1)',
        roughness: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });

    // Tek katlar için (normal renk)
    oddFloorMaterial = new THREE.MeshStandardMaterial({
        color: 'rgb(116, 116, 116)', // Normal renk
        roughness: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });

    // Çift katlar için (%20 koyu)
    evenFloorMaterial = new THREE.MeshStandardMaterial({
        color: 'rgb(93, 93, 93)', // %20 koyu (116 * 0.8 = 92.8)
        roughness: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });
    
    stairMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(151, 151, 147, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    // Merdiven üstü için ayrı materyal (stairMaterial ile aynı özelliklerde)
    stairMaterialTop = new THREE.MeshStandardMaterial({
        color: 'rgba(151, 151, 147, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });
       
    stepNosingMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(73, 72, 72, 1)',
        metalness: 0.3, roughness: 0.5, transparent: false, opacity: 0.5, side: THREE.DoubleSide
    });
    
    handrailWoodMaterial = new THREE.MeshStandardMaterial({
        color: 0XE1E1E1,
        metalness: 0.8, roughness: 0.4, transparent: false, opacity: 1.0, side: THREE.DoubleSide
    });

    balusterMaterial = new THREE.MeshStandardMaterial({
        color: 0XE1E1E1,
        metalness: 0.8, roughness: 0.4, transparent: false, opacity: 1.0, side: THREE.DoubleSide
    });

    ventMaterial = new THREE.MeshStandardMaterial({
        color: 0xDDDDDD,
        roughness: 0.4, metalness: 0.2, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    balconyRailingMaterial = new THREE.MeshStandardMaterial({
        color: "rgba(0, 247, 255, 1)",
        metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.85, side: THREE.DoubleSide
    });

    glassMaterial = new THREE.MeshStandardMaterial({
        color: 0xE0F7FA,
        roughness: 0.05, transparent: true, opacity: 0.4, side: THREE.DoubleSide, metalness: 0.1
    });

    halfWallCapMaterial = new THREE.MeshStandardMaterial({
        color: 0xBDBDBD,
        roughness: 0.7, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });

    // YENİ MALZEME (Adı düzeltildi: pictureFrameMaterial)
    pictureFrameMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111, // Koyu gri/siyah çerçeve
        roughness: 0.8,
        metalness: 0.1,
        transparent: true,
        opacity: solidOpacity, // solidOpacity'yi init3D içinden alır
        side: THREE.DoubleSide
    });

    // CSS2DRenderer'ı başlat (yükseklik etiketleri için)
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(1, 1); // Başlangıçta boyutlandırılacak
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Mouse olaylarını engelleme

    // Canvas'ın parent container'ına ekle
    const container = canvasElement.parentElement;
    if (container) {
        container.appendChild(labelRenderer.domElement);
        container.style.position = 'relative'; // Absolute pozisyonlama için gerekli
    }
}

/**
 * 3D görünümü sahnedeki nesnelere sığdırır.
 */
export function fit3DViewToScreen() {
    if (!sceneObjects || !camera || !controls || !renderer || !scene) {
        console.error("Fit 3D: Gerekli nesneler bulunamadı.");
        return;
    }

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
                console.error("Fit 3D: Bounding box hatası:", obj, error);
            }
        }
    });

    if (!hasContent || boundingBox.isEmpty()) {
        controls.target.set(0, WALL_HEIGHT / 2, 0);
        camera.position.set(1500, 1800, 1500);
        controls.update();
        return;
    }

    const center = new THREE.Vector3();
    const sphere = new THREE.Sphere();

    try {
        boundingBox.getCenter(center);
        boundingBox.getBoundingSphere(sphere);
    } catch (error) {
        console.error("Fit 3D: Bounding box merkez/küre hatası:", error);
        return;
    }

    if (!sphere.radius || sphere.radius <= 0) {
        controls.target.copy(center);
        camera.position.set(center.x + 1000, center.y + 1000, center.z + 1000);
        controls.update();
        return;
    }

    const radius = sphere.radius;
    const fov = camera.fov * (Math.PI / 180);
    let distance = radius / Math.sin(fov / 2);
    const aspect = camera.aspect;
    const halfFovHorizontal = Math.atan(Math.tan(fov / 2) * aspect);
    const distanceHorizontal = radius / Math.sin(halfFovHorizontal);
    distance = Math.max(distance, distanceHorizontal);

    const direction = new THREE.Vector3();
    if (camera.position.distanceTo(controls.target) < 0.1) {
        direction.set(0, 0.5, 1).normalize();
    } else {
        direction.subVectors(camera.position, controls.target).normalize();
    }

    const newPosition = new THREE.Vector3();
    newPosition.copy(center).addScaledVector(direction, distance * 1.1);

    controls.target.copy(center);
    camera.position.copy(newPosition);
    controls.update();
}