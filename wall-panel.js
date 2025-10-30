// wall-panel.js
import { state, setState, dom } from './main.js'; // dom eklendi
import { saveState } from './history.js';
import { processWalls } from './wall-processor.js';
import { update3DScene } from './scene3d.js';      // Doğru yerden import
import { screenToWorld } from './geometry.js';
import { isSpaceForWindow } from './window-handler.js';
import { createColumn } from './columns.js';
import { findAvailableSegmentAt } from './wall-item-utils.js'; // Bu import gerekli olabilir

let wallPanel = null;
let wallPanelWall = null;

// createWallPanel fonksiyonu aynı...
export function createWallPanel() {
    if (wallPanel) return;

    wallPanel = document.createElement('div');
    wallPanel.id = 'wall-panel';
    wallPanel.style.cssText = `
        position: fixed; background: #2a2b2c; border: 1px solid #8ab4f8; border-radius: 8px;
        padding: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; display: none;
        min-width: 220px; font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif; color: #e7e6d0;
    `;
    wallPanel.innerHTML = `
        <div style="margin-bottom: 16px; font-size: 14px; font-weight: 500; color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 8px;">Duvar Ayarları</div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0;">Kalınlık (cm):</label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input type="range" id="wall-thickness-slider" min="5" max="50" step="1" value="20" style="flex: 1; height: 4px; border-radius: 2px; outline: none; background: #4a4b4c;" />
                <input type="number" id="wall-thickness-number" min="5" max="50" step="1" value="20" style="width: 50px; padding: 4px 6px; background: #3a3b3c; color: #e7e6d0; border: 1px solid #4a4b4c; border-radius: 4px; font-size: 12px; text-align: center;" />
            </div>
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0; font-weight: 500;">DUVAR TİPİ:</label>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;"><input type="radio" name="wall-type" value="normal" checked style="cursor: pointer;"><span style="font-size: 12px;">Normal Duvar</span></label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;"><input type="radio" name="wall-type" value="balcony" style="cursor: pointer;"><span style="font-size: 12px;">Balkon Duvarı</span></label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;"><input type="radio" name="wall-type" value="glass" style="cursor: pointer;"><span style="font-size: 12px;">Camekan</span></label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;"><input type="radio" name="wall-type" value="half" style="cursor: pointer;"><span style="font-size: 12px;">Yarım Duvar</span></label>
            </div>
        </div>
        <div style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;">
                <input type="checkbox" id="arc-wall-checkbox" style="cursor: pointer;">
                <span style="font-size: 12px; color: #8ab4f8; font-weight: 500;">YAY DUVAR</span>
            </label>
        </div>
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0; font-weight: 500;">EKLE:</label>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <button id="add-door-btn" class="wall-panel-btn">Kapı Ekle</button>
                <button id="add-window-btn" class="wall-panel-btn">Pencere Ekle</button>
                <button id="add-vent-btn" class="wall-panel-btn">Menfez Ekle</button>
                <button id="add-column-btn" class="wall-panel-btn">Kolon Ekle</button>
            </div>
        </div>
    `;
    const style = document.createElement('style');
    style.textContent = `
        #wall-panel label:has(input[type="radio"]):hover { background: #3a3b3c; }
        .wall-panel-btn { width: 100%; padding: 8px 12px; background: #3a3b3c; color: #e7e6d0; border: 1px solid #4a4b4c; border-radius: 4px; cursor: pointer; font-size: 12px; text-align: left; transition: all 0.2s; }
        .wall-panel-btn:hover { background: #4a4b4c; border-color: #8ab4f8; color: #8ab4f8; }
        #wall-thickness-slider::-webkit-slider-thumb { appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #8ab4f8; cursor: pointer; }
        #wall-thickness-slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #8ab4f8; cursor: pointer; border: none; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(wallPanel);
    setupWallPanelListeners();
}

// setupWallPanelListeners fonksiyonu aynı...
function setupWallPanelListeners() {
    const thicknessSlider = document.getElementById('wall-thickness-slider');
    const thicknessNumber = document.getElementById('wall-thickness-number');
    const wallTypeRadios = document.querySelectorAll('input[name="wall-type"]');
    const arcWallCheckbox = document.getElementById('arc-wall-checkbox');

    thicknessSlider.addEventListener('change', (e) => {
        if (wallPanelWall) {
            wallPanelWall.thickness = parseFloat(e.target.value);
            saveState();
            // Gecikmeli çağrı ve 3D panel kontrolü
            if (dom.mainContainer.classList.contains('show-3d')) { setTimeout(update3DScene, 0); }
        }
    });
    thicknessSlider.addEventListener('input', (e) => { thicknessNumber.value = e.target.value; });
    thicknessNumber.addEventListener('change', (e) => {
        thicknessSlider.value = e.target.value;
        if (wallPanelWall) {
            wallPanelWall.thickness = parseFloat(e.target.value);
            saveState();
            if (dom.mainContainer.classList.contains('show-3d')) { setTimeout(update3DScene, 0); }
        }
    });
    wallTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (wallPanelWall) {
                wallPanelWall.wallType = e.target.value;
                saveState();
                if (dom.mainContainer.classList.contains('show-3d')) { setTimeout(update3DScene, 0); }
            }
        });
    });
    arcWallCheckbox.addEventListener('change', (e) => {
        if (wallPanelWall) {
            wallPanelWall.isArc = e.target.checked;
            // İlk kez arc aktif edildiğinde kontrol noktalarını oluştur
            if (wallPanelWall.isArc && !wallPanelWall.arcControl1) {
                const dx = wallPanelWall.p2.x - wallPanelWall.p1.x;
                const dy = wallPanelWall.p2.y - wallPanelWall.p1.y;
                const wallLength = Math.hypot(dx, dy);
                // Duvarın normalini bul
                const nx = -dy / wallLength;
                const ny = dx / wallLength;
                // Duvarın ortasında, duvarın 1/4 uzunluğu kadar dışarıya doğru iki kontrol noktası
                const midX = (wallPanelWall.p1.x + wallPanelWall.p2.x) / 2;
                const midY = (wallPanelWall.p1.y + wallPanelWall.p2.y) / 2;
                const offset = wallLength / 4;
                wallPanelWall.arcControl1 = { x: midX + nx * offset * 0.7, y: midY + ny * offset * 0.7 };
                wallPanelWall.arcControl2 = { x: midX + nx * offset * 1.3, y: midY + ny * offset * 1.3 };
            }
            saveState();
            if (dom.mainContainer.classList.contains('show-3d')) { setTimeout(update3DScene, 0); }
        }
    });
    document.getElementById('add-door-btn').addEventListener('click', () => { if (wallPanelWall) addDoorToWall(wallPanelWall); hideWallPanel(); });
    document.getElementById('add-window-btn').addEventListener('click', () => { if (wallPanelWall) addWindowToWall(wallPanelWall); hideWallPanel(); });
    document.getElementById('add-vent-btn').addEventListener('click', () => { if (wallPanelWall) addVentToWall(wallPanelWall); hideWallPanel(); });
    document.getElementById('add-column-btn').addEventListener('click', () => { if (wallPanelWall) addColumnToWall(wallPanelWall); hideWallPanel(); });
    document.addEventListener('mousedown', (e) => {
        if (wallPanel && wallPanel.style.display === 'block' && !wallPanel.contains(e.target)) { hideWallPanel(); }
    });
}

// showWallPanel ve hideWallPanel fonksiyonları aynı...
export function showWallPanel(wall, x, y) {
    if (!wallPanel) createWallPanel(); // Panel yoksa oluştur

    wallPanelWall = wall; // Panelin hangi duvarla ilişkili olduğunu sakla

    // Duvarın mevcut kalınlığını al (yoksa varsayılanı kullan)
    const thickness = wall.thickness || state.wallThickness;
    // Duvarın mevcut tipini al (yoksa 'normal' kullan)
    const wallType = wall.wallType || 'normal';

    // Paneldeki slider ve number input'un değerlerini duvarın kalınlığına ayarla
    document.getElementById('wall-thickness-slider').value = thickness;
    document.getElementById('wall-thickness-number').value = thickness;

    // Paneldeki doğru duvar tipi radio butonunu seçili hale getir
    const typeRadio = document.querySelector(`input[name="wall-type"][value="${wallType}"]`);
    if (typeRadio) typeRadio.checked = true;

    // Arc wall checkbox durumunu ayarla
    const arcCheckbox = document.getElementById('arc-wall-checkbox');
    if (arcCheckbox) arcCheckbox.checked = wall.isArc || false;

    // Panelin pozisyonunu ayarla (fare tıklama noktasına göre)
    wallPanel.style.left = `${x + 10}px`;
    wallPanel.style.top = `${y + 10}px`;
    // Paneli görünür yap
    wallPanel.style.display = 'block';

    // Panelin ekran dışına taşıp taşmadığını kontrol et ve gerekirse pozisyonunu düzelt
    setTimeout(() => {
        const rect = wallPanel.getBoundingClientRect();
        if (rect.right > window.innerWidth) { // Sağ kenar taştıysa
            wallPanel.style.left = `${window.innerWidth - rect.width - 10}px`; // Sola kaydır
        }
        if (rect.bottom > window.innerHeight) { // Alt kenar taştıysa
            wallPanel.style.top = `${window.innerHeight - rect.height - 10}px`; // Yukarı kaydır
        }
    }, 0); // DOM güncellendikten sonra çalışması için setTimeout
}
export function hideWallPanel() {
    if (wallPanel) {
        wallPanel.style.display = 'none'; // Paneli gizle
        wallPanelWall = null; // İlişkili duvar referansını temizle
    }
}


// --- GÜNCELLENDİ: update3DScene çağrılarına gecikme ve kontrol eklendi ---
function addDoorToWall(wall) {
    // ... (kapı ekleme mantığı aynı) ...
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const doorWidth = 70; const doorPos = length / 2;
    const wallThickness = wall.thickness || state.wallThickness;
    const margin = (wallThickness / 2) + 5;
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    let overlapsWithDoor = false; const doorStart = doorPos - doorWidth / 2; const doorEnd = doorPos + doorWidth / 2;
    for (const existingDoor of doorsOnWall) { /* ... check overlap ... */ if (!(doorEnd + margin <= existingStart || doorStart >= existingEnd + margin)) { overlapsWithDoor = true; break; } }
    const windowsOnWall = wall.windows || []; let overlapsWithWindow = false;
    for (const existingWindow of windowsOnWall) { /* ... check overlap ... */ if (!(doorEnd + margin <= windowStart || doorStart >= windowEnd + margin)) { overlapsWithWindow = true; break; } }

    if (!overlapsWithDoor && !overlapsWithWindow && doorPos - doorWidth / 2 > margin && doorPos + doorWidth / 2 < length - margin) {
        state.doors.push({ wall: wall, pos: doorPos, width: doorWidth, type: 'door' });
        saveState();
        if (dom.mainContainer.classList.contains('show-3d')) {
            setTimeout(update3DScene, 0); // <-- Gecikme eklendi
        }
    }
}

function addWindowToWall(wall) {
    // ... (pencere ekleme mantığı aynı) ...
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || state.wallThickness;
    const margin = (wallThickness / 2) + 5; const defaultWidth = 150; const minWidth = 20;
    let windowWidth = defaultWidth;
    if (length < 300) { /* ... calculate smaller width ... */ } else { /* ... */ }
    if(windowWidth < minWidth) return;
    const windowPos = length / 2;
    const tempWindowData = { wall: wall, pos: windowPos, width: windowWidth };

    if (isSpaceForWindow(tempWindowData)) {
        if (!wall.windows) wall.windows = [];
        wall.windows.push({ pos: windowPos, width: windowWidth, type: 'window' });
        saveState();
        if (dom.mainContainer.classList.contains('show-3d')) {
            setTimeout(update3DScene, 0); // <-- Gecikme eklendi
        }
    }
}

function addVentToWall(wall) {
    // ... (menfez ekleme mantığı aynı) ...
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const ventWidth = 40; const ventPos = length / 2; const margin = 15;
    if (length < ventWidth + 2 * margin) return;
    const ventStart = ventPos - ventWidth / 2; const ventEnd = ventPos + ventWidth / 2;
    // ... (overlap checks) ...
    if (wall.vents && wall.vents.length > 0) return;

    if (!wall.vents) wall.vents = [];
    wall.vents.push({ pos: ventPos, width: ventWidth, type: 'vent' });
    saveState();
    // Menfezler 3D'de gösterilmiyor
}

function addColumnToWall(wall) {
    // ... (kolon ekleme mantığı aynı) ...
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const columnPos = length / 2; const columnSize = 30; const halfColumnSize = columnSize / 2;
    if (length < columnSize + 10) return;
    const columnStart = columnPos - columnSize / 2; const columnEnd = columnPos + columnSize / 2; const margin = 5;
    // ... (overlap checks) ...
    const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
    const wallMidX = wall.p1.x + dx / 2; const wallMidY = wall.p1.y + dy / 2;
    let columnX = wallMidX; let columnY = wallMidY;
    if (length > 0.1) { /* ... find inside and calculate offset ... */ }
    const angle = Math.atan2(dy, dx) * 180 / Math.PI; const roundedAngle = Math.round(angle / 15) * 15;
    const newColumn = createColumn(columnX, columnY, columnSize);
    newColumn.rotation = roundedAngle;

    state.columns.push(newColumn);
    saveState();
    if (dom.mainContainer.classList.contains('show-3d')) {
        setTimeout(update3DScene, 0); // <-- Gecikme eklendi
    }
}
// --- GÜNCELLEME SONU ---

// Long press fonksiyonları aynı...
let longPressTimer = null;
let longPressStartPos = null;
export function cancelLongPress(e) { /* ... */ }
export function clearLongPress() { /* ... */ }