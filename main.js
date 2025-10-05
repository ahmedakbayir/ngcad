import { initUI, c2d } from './ui.js';
import { initInteractions } from './interactionManager.js';
import { initKeyboardManager } from './keyboardManager.js';
import { initLengthInputManager } from './lengthInputManager.js';
import { init3D, render3D, resize3D } from './_renderer3d.js';
import { draw } from './renderer.js';
import { saveState } from './history.js';
import { setMode } from './_modeManager.js';

function resize() {
    const p2d = document.getElementById("p2d");
    if (!p2d) return;
    const r2d = p2d.getBoundingClientRect();
    c2d.width = r2d.width;
    c2d.height = r2d.height;
    resize3D();
}

function animate() {
    requestAnimationFrame(animate);
    draw();
    // render3D(); // 3D çizimi aktif etmek için bu satırın yorumunu kaldırın
}

// ====== UYGULAMAYI BAŞLAT ======
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    initInteractions();
    initKeyboardManager();
    initLengthInputManager();
    init3D();
    
    window.addEventListener("resize", resize);
    
    setMode('select'); // Başlangıç modunu ayarla
    resize();
    animate();
    saveState(); // İlk boş durumu kaydet
});