import * as state from './state.js';
import { setMode, getLastUsedMode } from './_modeManager.js';
import { undo, redo, saveState } from './history.js';
import * as lengthInput from './lengthInputManager.js';
import { processWalls, splitWallAtPoint } from './wallProcessor.js';
import * as geo from './geometry.js';

function deleteSelected() {
    if (state.selectedObject && state.selectedObject.type === "door") {
        state.set({ doors: state.doors.filter((d) => d !== state.selectedObject.object) });
    } else {
        const wallsToDelete = state.selectedGroup.length > 0 ? state.selectedGroup : (state.selectedObject ? [state.selectedObject.object] : []);
        state.set({
            walls: state.walls.filter((w) => !wallsToDelete.includes(w)),
            doors: state.doors.filter((d) => !wallsToDelete.includes(d.wall))
        });
    }
    state.set({ selectedObject: null, selectedGroup: [] });
    processWalls();
    saveState();
}

function splitWallAtMousePosition() {
    if (state.currentMode !== 'select') return;
    let wallToSplit = null;
    let minDistSq = Infinity;
    const hitToleranceSq = (state.WALL_THICKNESS * state.METER_SCALE * 2) ** 2;
    for (const wall of state.walls) {
        const distSq = geo.distToSegmentSquared(state.mousePos, wall.p1, wall.p2);
        if (distSq < minDistSq) {
            minDistSq = distSq;
            wallToSplit = wall;
        }
    }
    if (!wallToSplit || minDistSq > hitToleranceSq) return;
    const p1 = wallToSplit.p1, p2 = wallToSplit.p2;
    const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    let t = ((state.mousePos.x - p1.x) * (p2.x - p1.x) + (state.mousePos.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const splitPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    const MIN_SPLIT_DIST = 10;
    if (Math.hypot(splitPoint.x - p1.x, splitPoint.y - p1.y) < MIN_SPLIT_DIST || Math.hypot(splitPoint.x - p2.x, splitPoint.y - p2.y) < MIN_SPLIT_DIST) {
        return;
    }
    splitWallAtPoint(wallToSplit, splitPoint);
    state.set({ selectedObject: null });
    processWalls();
    saveState();
}

function handleKeyDown(e) {
    if (document.activeElement === lengthInput.lengthInput || document.activeElement.closest("#grid-popup")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (state.selectedObject && state.selectedObject.type === "wall" && !state.isEditingLength && /^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        lengthInput.startLengthEdit();
        lengthInput.lengthInput.value = e.key;
        return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        splitWallAtMousePosition();
        return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "z") { undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { redo(); return; }
    if (e.key === "Escape") {
        if (state.isEditingLength) lengthInput.cancelLengthEdit();
        if (state.isDragging) {
            state.set({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [] });
        } else {
            state.set({ selectedObject: null, selectedGroup: [] });
        }
        state.set({ startPoint: null });
        setMode("select");
    }
    if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
        deleteSelected();
    }
    if (e.key.toLowerCase() === "d") state.set({ showDimensions: !state.showDimensions });
    if (e.key.toLowerCase() === "w") setMode("drawWall");
    if (e.key.toLowerCase() === "r") setMode("drawRoom");
    if (e.key.toLowerCase() === "k") setMode("drawDoor");
    if (e.code === "Space" && state.currentMode === "select") {
        e.preventDefault();
        setMode(getLastUsedMode());
    }
}

export function initKeyboardManager() {
    window.addEventListener("keydown", handleKeyDown);
}