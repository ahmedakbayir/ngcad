import { state, setState, WALL_THICKNESS } from './main.js';
import { saveState } from './history.js';
import { processWalls } from './wall-processor.js';
import { screenToWorld } from './geometry.js';

let wallPanel = null;
let wallPanelWall = null;

export function createWallPanel() {
    if (wallPanel) return;
    
    wallPanel = document.createElement('div');
    wallPanel.id = 'wall-panel';
    wallPanel.style.cssText = `
        position: fixed;
        background: #2a2b2c;
        border: 1px solid #8ab4f8;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: none;
        min-width: 220px;
        font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif;
        color: #e7e6d0;
    `;
    
    wallPanel.innerHTML = `
        <div style="margin-bottom: 16px; font-size: 14px; font-weight: 500; color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 8px;">
            Duvar Ayarları
        </div>
        
        <button id="wall-extrude-btn" style="
            width: 100%;
            padding: 8px 12px;
            margin-bottom: 16px;
            background: #3a3b3c;
            color: #8ab4f8;
            border: 1px solid #4a4b4c;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        ">
            Duvara Çıkıntı Ver
        </button>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0;">
                Kalınlık (cm):
            </label>
            <div style="display: flex; align-items: center; gap: 8px;">
                <input 
                    type="range" 
                    id="wall-thickness-slider" 
                    min="5" 
                    max="50" 
                    step="1"
                    value="20"
                    style="flex: 1; height: 4px; border-radius: 2px; outline: none; background: #4a4b4c;"
                />
                <input 
                    type="number" 
                    id="wall-thickness-number" 
                    min="5" 
                    max="50" 
                    step="1"
                    value="20"
                    style="
                        width: 50px;
                        padding: 4px 6px;
                        background: #3a3b3c;
                        color: #e7e6d0;
                        border: 1px solid #4a4b4c;
                        border-radius: 4px;
                        font-size: 12px;
                        text-align: center;
                    "
                />
            </div>
        </div>
        
        <div style="margin-bottom: 16px;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0; font-weight: 500;">
                DUVAR TİPİ:
            </label>
            <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;">
                    <input type="radio" name="wall-type" value="normal" checked style="cursor: pointer;">
                    <span style="font-size: 12px;">Normal Duvar</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;">
                    <input type="radio" name="wall-type" value="balcony" style="cursor: pointer;">
                    <span style="font-size: 12px;">Balkon Duvarı (ince çizgi)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;">
                    <input type="radio" name="wall-type" value="glass" style="cursor: pointer;">
                    <span style="font-size: 12px;">Camekan Duvar (ince-kalın)</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 6px; border-radius: 4px; transition: background 0.2s;">
                    <input type="radio" name="wall-type" value="half" style="cursor: pointer;">
                    <span style="font-size: 12px;">Yarım Duvar (tuğla)</span>
                </label>
            </div>
        </div>
        
        <div style="margin-bottom: 0;">
            <label style="display: block; margin-bottom: 6px; font-size: 12px; color: #b0b0b0; font-weight: 500;">
                EKLE:
            </label>
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
        #wall-panel label:has(input[type="radio"]):hover {
            background: #3a3b3c;
        }
        
        .wall-panel-btn {
            width: 100%;
            padding: 8px 12px;
            background: #3a3b3c;
            color: #e7e6d0;
            border: 1px solid #4a4b4c;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            text-align: left;
            transition: all 0.2s;
        }
        
        .wall-panel-btn:hover {
            background: #4a4b4c;
            border-color: #8ab4f8;
            color: #8ab4f8;
        }
        
        #wall-extrude-btn:hover {
            background: #4a4b4c;
            border-color: #8ab4f8;
        }
        
        #wall-thickness-slider::-webkit-slider-thumb {
            appearance: none;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #8ab4f8;
            cursor: pointer;
        }
        
        #wall-thickness-slider::-moz-range-thumb {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: #8ab4f8;
            cursor: pointer;
            border: none;
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(wallPanel);
    setupWallPanelListeners();
}

function setupWallPanelListeners() {
    const thicknessSlider = document.getElementById('wall-thickness-slider');
    const thicknessNumber = document.getElementById('wall-thickness-number');
    const extrudeBtn = document.getElementById('wall-extrude-btn');
    const wallTypeRadios = document.querySelectorAll('input[name="wall-type"]');
    
    thicknessSlider.addEventListener('change', (e) => {
        if (wallPanelWall) {
            wallPanelWall.thickness = parseFloat(e.target.value);
            saveState();
        }
    });
    
    thicknessSlider.addEventListener('input', (e) => {
        thicknessNumber.value = e.target.value;
    });
    
    thicknessNumber.addEventListener('change', (e) => {
        thicknessSlider.value = e.target.value;
        if (wallPanelWall) {
            wallPanelWall.thickness = parseFloat(e.target.value);
            saveState();
        }
    });
    
    extrudeBtn.addEventListener('click', () => {
        if (wallPanelWall) {
            extrudeWall(wallPanelWall);
            hideWallPanel();
        }
    });
    
    wallTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (wallPanelWall) {
                wallPanelWall.wallType = e.target.value;
                saveState();
            }
        });
    });
    
    document.getElementById('add-door-btn').addEventListener('click', () => {
        if (wallPanelWall) {
            addDoorToWall(wallPanelWall);
            hideWallPanel();
        }
    });
    
    document.getElementById('add-window-btn').addEventListener('click', () => {
        if (wallPanelWall) {
            addWindowToWall(wallPanelWall);
            hideWallPanel();
        }
    });
    
    document.getElementById('add-vent-btn').addEventListener('click', () => {
        if (wallPanelWall) {
            addVentToWall(wallPanelWall);
            hideWallPanel();
        }
    });
    
    document.getElementById('add-column-btn').addEventListener('click', () => {
        if (wallPanelWall) {
            addColumnToWall(wallPanelWall);
            hideWallPanel();
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (wallPanel && wallPanel.style.display === 'block' && !wallPanel.contains(e.target)) {
            hideWallPanel();
        }
    });
}

export function showWallPanel(wall, x, y) {
    if (!wallPanel) createWallPanel();
    
    wallPanelWall = wall;
    
    const thickness = wall.thickness || WALL_THICKNESS;
    const wallType = wall.wallType || 'normal';
    
    document.getElementById('wall-thickness-slider').value = thickness;
    document.getElementById('wall-thickness-number').value = thickness;
    
    const typeRadio = document.querySelector(`input[name="wall-type"][value="${wallType}"]`);
    if (typeRadio) typeRadio.checked = true;
    
    wallPanel.style.left = `${x + 10}px`;
    wallPanel.style.top = `${y + 10}px`;
    wallPanel.style.display = 'block';
    
    setTimeout(() => {
        const rect = wallPanel.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            wallPanel.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            wallPanel.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
    }, 0);
}

export function hideWallPanel() {
    if (wallPanel) {
        wallPanel.style.display = 'none';
        if (wallPanelWall) {
            saveState();
        }
        wallPanelWall = null;
    }
}

function extrudeWall(wall) {
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const length = Math.hypot(dx, dy);
    
    if (length < 0.1) return;
    
    const dirX = dx / length;
    const dirY = dy / length;
    
    const normalX = -dirY;
    const normalY = dirX;
    
    const midX = (wall.p1.x + wall.p2.x) / 2;
    const midY = (wall.p1.y + wall.p2.y) / 2;
    
    const extrudeLength = 100;
    
    const newNode = {
        x: midX + normalX * extrudeLength,
        y: midY + normalY * extrudeLength
    };
    
    state.nodes.push(newNode);
    
    const midNode = {
        x: midX,
        y: midY
    };
    state.nodes.push(midNode);
    
    const wallIndex = state.walls.indexOf(wall);
    if (wallIndex > -1) {
        state.walls.splice(wallIndex, 1);
        
        state.walls.push({ type: "wall", p1: wall.p1, p2: midNode, thickness: wall.thickness, wallType: wall.wallType });
        state.walls.push({ type: "wall", p1: midNode, p2: wall.p2, thickness: wall.thickness, wallType: wall.wallType });
        state.walls.push({ type: "wall", p1: midNode, p2: newNode, thickness: wall.thickness, wallType: wall.wallType });
    }
    
    processWalls();
    saveState();
}

function addDoorToWall(wall) {
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const doorWidth = 90;
    const doorPos = length / 2;
    
    if (doorPos - doorWidth / 2 > 15 && doorPos + doorWidth / 2 < length - 15) {
        state.doors.push({
            wall: wall,
            pos: doorPos,
            width: doorWidth,
            type: 'door'
        });
        saveState();
    }
}

function addWindowToWall(wall) {
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const windowWidth = 120;
    const windowPos = length / 2;
    
    if (windowPos - windowWidth / 2 > 15 && windowPos + windowWidth / 2 < length - 15) {
        if (!wall.windows) wall.windows = [];
        wall.windows.push({
            pos: windowPos,
            width: windowWidth,
            type: 'window'
        });
        saveState();
    }
}

function addVentToWall(wall) {
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const ventWidth = 40;
    const ventPos = length / 2;
    
    if (ventPos - ventWidth / 2 > 15 && ventPos + ventWidth / 2 < length - 15) {
        if (!wall.vents) wall.vents = [];
        wall.vents.push({
            pos: ventPos,
            width: ventWidth,
            type: 'vent'
        });
        saveState();
    }
}
export function cancelLongPress(e) {
    if (longPressTimer) {
        if (longPressStartPos) {
            const moved = Math.hypot(e.clientX - longPressStartPos.x, e.clientY - longPressStartPos.y);
            if (moved > 10) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }
    }
}

export function clearLongPress() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    longPressStartPos = null;
}
function addColumnToWall(wall) {
    const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const columnPos = length / 2;
    
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const dirX = dx / length;
    const dirY = dy / length;
    
    const columnX = wall.p1.x + dirX * columnPos;
    const columnY = wall.p1.y + dirY * columnPos;
    
    const columnNode = {
        x: columnX,
        y: columnY,
        isColumn: true,
        columnSize: 30
    };
    
    state.nodes.push(columnNode);
    
    const wallIndex = state.walls.indexOf(wall);
    if (wallIndex > -1) {
        state.walls.splice(wallIndex, 1);
        state.walls.push({ type: "wall", p1: wall.p1, p2: columnNode, thickness: wall.thickness, wallType: wall.wallType });
        state.walls.push({ type: "wall", p1: columnNode, p2: wall.p2, thickness: wall.thickness, wallType: wall.wallType });
    }
    
    processWalls();
    saveState();
}