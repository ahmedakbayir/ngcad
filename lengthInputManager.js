import * as state from './state.js';
import { worldToScreen } from './geometry.js';
import { processWalls } from './wallProcessor.js';
import { saveState } from './history.js';

export const lengthInput = document.getElementById("length-input");

function applyStretchModification(movingNode, originalPos, stationaryNode) {
    const deltaX = movingNode.x - originalPos.x;
    const deltaY = movingNode.y - originalPos.y;
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;
    const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    const delta = axis === 'x' ? deltaX : deltaY;
    const threshold = originalPos[axis];
    const EPSILON = 0.01;
    const stationaryPos = stationaryNode[axis];
    const isMovingSidePositive = (threshold > stationaryPos);
    const nodesToTranslate = new Set();
    state.nodes.forEach(node => {
        if (node === movingNode) return;
        if ((isMovingSidePositive && node[axis] >= threshold - EPSILON) || (!isMovingSidePositive && node[axis] <= threshold + EPSILON)) {
            nodesToTranslate.add(node);
        }
    });
    nodesToTranslate.forEach(node => { node[axis] += delta; });
}

function resizeWall(wall, newLengthCm, stationaryPointHandle) {
    if (!wall || isNaN(newLengthCm) || newLengthCm <= 0) return;
    const stationaryPoint = wall[stationaryPointHandle];
    const movingPointHandle = stationaryPointHandle === "p1" ? "p2" : "p1";
    const movingPoint = wall[movingPointHandle];
    const dx = movingPoint.x - stationaryPoint.x;
    const dy = movingPoint.y - stationaryPoint.y;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength < 0.1) return;
    const scale = newLengthCm / currentLength;
    movingPoint.x = stationaryPoint.x + dx * scale;
    movingPoint.y = stationaryPoint.y + dy * scale;
}

export function positionLengthInput() {
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    const wall = state.selectedObject.object;
    const midX = (wall.p1.x + wall.p2.x) / 2;
    const midY = (wall.p1.y + wall.p2.y) / 2;
    const screenPos = worldToScreen(midX, midY);
    lengthInput.style.left = `${screenPos.x}px`;
    lengthInput.style.top = `${screenPos.y - 20 / state.zoom}px`;
}

export function startLengthEdit() {
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    state.set({ isEditingLength: true });
    positionLengthInput();
    lengthInput.style.display = "block";
    const wall = state.selectedObject.object;
    const currentLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    lengthInput.value = currentLength.toFixed(0);
    lengthInput.focus();
    lengthInput.select();
}

function confirmLengthEdit() {
    if (!state.selectedObject || state.selectedObject.type !== "wall") return;
    let rawValue = lengthInput.value.trim();
    let reverseDirection = rawValue.endsWith("-");
    if (reverseDirection) rawValue = rawValue.slice(0, -1);
    const newLengthCm = parseFloat(rawValue);
    if (!isNaN(newLengthCm) && newLengthCm > 0) {
        const wall = state.selectedObject.object;
        const stationaryHandle = reverseDirection ? "p2" : "p1";
        const movingPoint = wall[reverseDirection ? "p1" : "p2"];
        const stationaryPoint = wall[stationaryHandle];
        const originalPos = { x: movingPoint.x, y: movingPoint.y };
        resizeWall(wall, newLengthCm, stationaryHandle);
        applyStretchModification(movingPoint, originalPos, stationaryPoint);
        processWalls();
        saveState();
    }
    cancelLengthEdit();
}

export function cancelLengthEdit() {
    state.set({ isEditingLength: false });
    lengthInput.style.display = "none";
    lengthInput.blur();
}

export function initLengthInputManager() {
    lengthInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); confirmLengthEdit(); } 
        else if (e.key === "Escape") { cancelLengthEdit(); }
    });
    lengthInput.addEventListener("blur", cancelLengthEdit);
}