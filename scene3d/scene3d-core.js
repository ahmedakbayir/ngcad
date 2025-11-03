// scene3d-core.js
// Sahne, kamera, renderer, kontroller ve 3D malzemelerin kurulumunu yapar.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { state, WALL_HEIGHT, dom } from "../general-files/main.js";

// --- Global Değişkenler ---
export let scene, camera, renderer, controls; // 'controls' MEVCUT aktif kontrol olacak
export let orbitControls, pointerLockControls;
export let cameraMode = 'orbit'; // 'orbit' veya 'firstPerson'
export let sceneObjects;
export let textureLoader; // <-- Resim çerçeveleri için eklendi

// --- Malzemeler (Materials) ---
export let wallMaterial, doorMaterial, windowMaterial, columnMaterial, beamMaterial,
    mullionMaterial, sillMaterial, handleMaterial, floorMaterial,
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
// YENİ SETTER FONKSİYONLARI SONU

// Sağ tık ile kamera sabit rotasyon için değişkenler
let isRightMouseDown = false;
let previousMousePosition = { x: 0, y: 0 };

/**
 * Çizim sınırlarından merkez noktası hesaplar ve OrbitControls target'ını günceller
 */
export function updateDrawingCenter() {
    if (!sceneObjects || !orbitControls) return;

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
                console.error("Drawing center hesaplama hatası:", obj, error);
            }
        }
    });

    if (hasContent && !boundingBox.isEmpty()) {
        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        orbitControls.target.copy(center);
        orbitControls.update();
    }
}

/**
 * Sağ tık ile kamera pozisyonu sabit kalarak projeyi döndürme
 */
function setupRightClickRotation() {
    const canvas = renderer.domElement;

    canvas.addEventListener('mousedown', (event) => {
        if (event.button === 2) { // Sağ tık
            isRightMouseDown = true;
            previousMousePosition = { x: event.clientX, y: event.clientY };
            orbitControls.enabled = false; // OrbitControls'u devre dışı bırak
            event.preventDefault();
        }
    });

    canvas.addEventListener('mousemove', (event) => {
        if (!isRightMouseDown) return;

        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;
        previousMousePosition = { x: event.clientX, y: event.clientY };

        // Kamera pozisyonunu merkez olarak kullan
        const rotationSpeed = 0.005;

        // Yatay (Y ekseni) rotasyon
        if (deltaX !== 0) {
            const angle = deltaX * rotationSpeed;
            sceneObjects.position.sub(camera.position);
            sceneObjects.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -angle);
            sceneObjects.position.add(camera.position);
        }

        // Dikey rotasyon (şimdilik devre dışı, gerekirse eklenebilir)

        event.preventDefault();
    });

    canvas.addEventListener('mouseup', (event) => {
        if (event.button === 2) {
            isRightMouseDown = false;
            orbitControls.enabled = true; // OrbitControls'u tekrar aktif et
            event.preventDefault();
        }
    });

    // Sağ tık menüsünü engelle
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
    });
}

/**
 * 3D Sahneyi, kamerayı, ışıkları, kontrolleri ve malzemeleri başlatır.
 */
export function init3D(canvasElement) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1f20);

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
    orbitControls.zoomSpeed = 1;

    // Mouse button ayarları
    orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,    // Sol tık: Rotate (çizim merkezi etrafında)
        MIDDLE: THREE.MOUSE.PAN,      // Orta tekerlek basıp sürükle: Pan
        RIGHT: THREE.MOUSE.ROTATE     // Sağ tık: Şimdilik rotate (sonra özelleştireceğiz)
    };

    orbitControls.update();

    // Sağ tık için custom kontrol
    setupRightClickRotation();

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

    columnMaterial = wallMaterial;
    beamMaterial = wallMaterial;

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

    floorMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(116, 116, 116, 1)',
        roughness: 0.5, transparent: true, opacity: 0.8, side: THREE.DoubleSide
    });
    
    stairMaterial = new THREE.MeshStandardMaterial({
        color: 'rgba(151, 151, 147, 1)',
        roughness: 0.8, transparent: true, opacity: solidOpacity, side: THREE.DoubleSide
    });
    
    stairMaterialTop = wallMaterial; // stairMaterial ile aynı
       
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