
import { state, setState, setMode, dom, EXTEND_RANGE, WALL_THICKNESS } from './main.js';
import { screenToWorld, getOrCreateNode } from './geometry.js';
import { splitWallAtMousePosition, processWalls } from './wall-processor.js';
import { undo, redo, saveState, restoreState } from './history.js';
import { startLengthEdit, cancelLengthEdit, showRoomNamePopup, positionLengthInput } from './ui.js';
import { onPointerDown } from './pointer-down.js';
import { onPointerMove } from './pointer-move.js';
import { onPointerUp } from './pointer-up.js';
import { getObjectAtPoint } from './actions.js';
import { showWallPanel } from './wall-panel.js';

// Modifier tuşları için global state
export let currentModifierKeys = {
    ctrl: false,
    alt: false,
    shift: false
};

function wallExists(p1, p2) {
    return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
}

function extendWallOnTabPress() {
    if (!state.startPoint || !state.mousePos) return;
    let dir = { x: state.mousePos.x - state.startPoint.x, y: state.mousePos.y - state.startPoint.y };
    const L = Math.hypot(dir.x, dir.y);
    if (L < 1) return;
    dir.x /= L; dir.y /= L;
    const rayEnd = { x: state.startPoint.x + dir.x * EXTEND_RANGE, y: state.startPoint.y + dir.y * EXTEND_RANGE };
    let bestIntersection = null;
    let minDistanceSq = EXTEND_RANGE * EXTEND_RANGE;
    for (const wall of state.walls) {
        const p1 = state.startPoint, p2 = rayEnd, p3 = wall.p1, p4 = wall.p2;
        const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
        if (d === 0) continue;
        const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
        const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
        if (t >= 0.0001 && t <= 1 && u >= 0 && u <= 1) {
            const intersectPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
            const distSq = (intersectPoint.x - state.startPoint.x) ** 2 + (intersectPoint.y - state.startPoint.y) ** 2;
            if (distSq < minDistanceSq) { minDistanceSq = distSq; bestIntersection = intersectPoint; }
        }
    }
    const finalEndPoint = bestIntersection ? bestIntersection : rayEnd;
    const endNode = getOrCreateNode(finalEndPoint.x, finalEndPoint.y);
    if (endNode !== state.startPoint && !wallExists(state.startPoint, endNode)) {
        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode, thickness: WALL_THICKNESS, wallType: 'normal' });
        setState({ startPoint: endNode });
        processWalls();
        saveState();
    }
}

function onKeyDown(e) {
    // Modifier tuşlarını kaydet
    if (e.key === 'Control') currentModifierKeys.ctrl = true;
    if (e.key === 'Alt') currentModifierKeys.alt = true;
    if (e.key === 'Shift') currentModifierKeys.shift = true;
    
    if (document.activeElement.closest("#settings-popup") || document.activeElement.closest("#room-name-popup")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.key === "Tab" && state.currentMode === "drawWall" && state.startPoint) {
        e.preventDefault();
        extendWallOnTabPress();
        return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); splitWallAtMousePosition(); return; }
    if (state.selectedObject?.type === "wall" && !state.isEditingLength && /^[0-9.]$/.test(e.key)) { e.preventDefault(); startLengthEdit(e.key); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    
    if (e.key === "Escape") {
        if (state.isEditingLength) cancelLengthEdit();
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map() });
            restoreState(state.history[state.historyIndex]);
        } else {
            setState({ selectedObject: null, selectedGroup: [] });
        }
        setState({ startPoint: null });
        setMode("select");
    }
    
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
        e.preventDefault();
        
        // Kolon silme
        if (state.selectedObject?.type === 'column') {
            const columnToDelete = state.selectedObject.object;
            state.columns = state.columns.filter(c => c !== columnToDelete);
            setState({ selectedObject: null });
            saveState();
            return;
        }
        
        // Diğer nesneleri silme
        if (state.selectedObject) {
            if (state.selectedObject.type === "door") {
                const newDoors = state.doors.filter((d) => d !== state.selectedObject.object);
                setState({ doors: newDoors });
            } else if (state.selectedObject.type === "window") {
                const wall = state.selectedObject.wall;
                if (wall.windows) {
                    wall.windows = wall.windows.filter(w => w !== state.selectedObject.object);
                }
            } else if (state.selectedObject.type === "vent") {
                const wall = state.selectedObject.wall;
                if (wall.vents) {
                    wall.vents = wall.vents.filter(v => v !== state.selectedObject.object);
                }
            } else {
                const wallsToDelete = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
                const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w));
                const newDoors = state.doors.filter((d) => !wallsToDelete.includes(d.wall));
                setState({ walls: newWalls, doors: newDoors });
            }
        } else {
            const wallsToDelete = state.selectedGroup;
            const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w));
            const newDoors = state.doors.filter((d) => !wallsToDelete.includes(d.wall));
            setState({ walls: newWalls, doors: newDoors });
        }
        setState({ selectedObject: null, selectedGroup: [] });
        processWalls();
        saveState();
    }
    
    if (e.key.toLowerCase() === "d") {
        const newMode = (state.dimensionMode + 1) % 3;
        setState({ dimensionMode: newMode });
        state.dimensionOptions.defaultView = newMode;
        dom.dimensionDefaultViewSelect.value = newMode;
    }
    if (e.key.toLowerCase() === "w") setMode("drawWall");
    if (e.key.toLowerCase() === "r") setMode("drawRoom");
    if (e.key.toLowerCase() === "k") setMode("drawDoor");
    if (e.key.toLowerCase() === "p") setMode("drawWindow");
    if (e.key.toLowerCase() === "c") setMode("drawColumn");
    if (e.code === "Space" && state.currentMode === "select") { e.preventDefault(); setMode(state.lastUsedMode); }
}

function onKeyUp(e) {
    // Modifier tuşlarını temizle
    if (e.key === 'Control') currentModifierKeys.ctrl = false;
    if (e.key === 'Alt') currentModifierKeys.alt = false;
    if (e.key === 'Shift') currentModifierKeys.shift = false;
}

function onWheel(e) {
    e.preventDefault();
    const rect = dom.c2d.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const before = screenToWorld(mouseX, mouseY);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = state.zoom * factor;
    const after = { x: (mouseX - state.panOffset.x) / newZoom, y: (mouseY - state.panOffset.y) / newZoom };
    const newPanOffset = { x: state.panOffset.x + (after.x - before.x) * newZoom, y: state.panOffset.y + (after.y - before.y) * newZoom };

    setState({ zoom: newZoom, panOffset: newPanOffset });

    if (state.isEditingLength) positionLengthInput();
}

export function setupInputListeners() {
    const { p2d, c2d } = dom;

    c2d.addEventListener("pointerdown", onPointerDown);
    p2d.addEventListener("pointermove", onPointerMove);
    p2d.addEventListener("pointerup", onPointerUp);

    c2d.addEventListener("dblclick", (e) => {
        e.preventDefault();
        const rect = dom.c2d.getBoundingClientRect();
        const clickPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const object = getObjectAtPoint(clickPos);

        if (object && (object.type === 'room' || object.type === 'roomName' || object.type === 'roomArea')) {
            showRoomNamePopup(object.object, e);
        }
    });

    c2d.addEventListener("wheel", onWheel, { passive: false });
    
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const clickPos = screenToWorld(e.clientX - c2d.getBoundingClientRect().left, e.clientY - c2d.getBoundingClientRect().top);
        const object = getObjectAtPoint(clickPos);

        if (object && (object.type === 'room' || object.type === 'roomName')) {
            showRoomNamePopup(object.object, e);
        } else if (object && object.type === 'wall') {
            showWallPanel(object.object, e.clientX, e.clientY);
        } else {
            setState({ startPoint: null, isSnapLocked: false, lockedSnapPoint: null, selectedObject: null });
            setMode("select");
        }
    });

    p2d.addEventListener("pointerleave", (e) => {
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map() });
            if (state.history[state.historyIndex]) restoreState(state.history[state.historyIndex]);
        }
        if (state.isPanning) setState({ isPanning: false });
    });

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
}