import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let scene, camera, renderer, controls;

export function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1f20);
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(15, 18, 15);
    const canvas3d = document.getElementById("c3d");
    renderer = new THREE.WebGLRenderer({ antialias: true, canvas: canvas3d });
    controls = new OrbitControls(camera, renderer.domElement);
    const amb = new THREE.AmbientLight(0xffffff, 1.5);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(20, 30, 15);
    scene.add(amb, dir);
    const sceneObjects = new THREE.Group();
    scene.add(sceneObjects);
}

export function update3DScene() {
    if (!scene) return;
    // 2D verilerden 3D nesneleri oluşturma/güncelleme mantığı buraya gelecek
}

export function render3D() {
    if (!renderer) return;
    controls.update();
    renderer.render(scene, camera);
}

export function resize3D() {
    const p3d = document.getElementById("p3d");
    if (!p3d || !camera || !renderer) return;
    const r3d = p3d.getBoundingClientRect();
    if (r3d.width > 0 && r3d.height > 0) {
        camera.aspect = r3d.width / r3d.height;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(r3d.width, r3d.height);
    }
}