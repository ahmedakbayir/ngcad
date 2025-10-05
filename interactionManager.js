import * as state from './state.js';
import { c2d } from './ui.js';
import * as geo from './geometry.js';
import { processWalls } from './wallProcessor.js';
import { saveState } from './history.js';
import * as nodeManager from './nodeManager.js';
import { setMode } from './_modeManager.js';
import * as lengthInput from './lengthInputManager.js';

function handlePointerDown(e) {
    if (document.getElementById('grid-popup').contains(e.target) || document.getElementById('grid-settings-btn').contains(e.target)) return;
    if (e.button === 1) { state.set({ isPanning: true, panStart: { x: e.clientX, y: e.clientY } }); return; }
    if (e.button !== 0) return;
    const rect = c2d.getBoundingClientRect();
    const pos = geo.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const snappedPos = geo.getSmartSnapPoint(e);
    if (state.currentMode === "select") {
        if (state.isEditingLength) { lengthInput.cancelLengthEdit(); return; }
        const newSelectedObject = geo.getObjectAtPoint(pos);
        state.set({ selectedObject: newSelectedObject, selectedGroup: [], affectedWalls: [] });
        state.preDragWallStates.clear();
        if (newSelectedObject) {
            state.set({ isDragging: true, dragStartPoint: snappedPos, initialDragPoint: { x: snappedPos.x, y: snappedPos.y }, dragStartScreen: { x: e.clientX, y: e.clientY } });
        }
    } else if (state.currentMode === "drawDoor") {
        let closestWall = null, minDistSq = Infinity;
        for (const w of [...state.walls].reverse()) {
            const d = geo.distToSegmentSquared(pos, w.p1, w.p2);
            if (d < (state.WALL_THICKNESS * state.METER_SCALE) ** 2 && d < minDistSq) {
                minDistSq = d; closestWall = w;
            }
        }
        if (closestWall) {
            const newDoor = geo.getDoorPlacement(closestWall, pos);
            if (newDoor && geo.isSpaceForDoor(newDoor)) {
                state.doors.push(newDoor);
                saveState();
            }
        }
    } else {
        if (!state.startPoint) {
            state.set({ startPoint: nodeManager.getOrCreateNode(snappedPos.x, snappedPos.y) });
        } else {
            if (Math.hypot(state.startPoint.x - snappedPos.x, state.startPoint.y - snappedPos.y) > 0.1) {
                let geometryChanged = false;
                if (state.currentMode === "drawWall") {
                    const endNode = nodeManager.getOrCreateNode(snappedPos.x, snappedPos.y);
                    if (endNode !== state.startPoint) {
                        state.walls.push({ type: "wall", p1: state.startPoint, p2: endNode });
                        geometryChanged = true;
                    }
                    state.set({ startPoint: endNode });
                } else if (state.currentMode === "drawRoom") {
                    const v1 = state.startPoint;
                    const v2 = nodeManager.getOrCreateNode(snappedPos.x, v1.y);
                    const v3 = nodeManager.getOrCreateNode(snappedPos.x, snappedPos.y);
                    const v4 = nodeManager.getOrCreateNode(v1.x, snappedPos.y);
                    const potentialWalls = [{ p1: v1, p2: v2 }, { p1: v2, p2: v3 }, { p1: v3, p2: v4 }, { p1: v4, p2: v1 }];
                    potentialWalls.forEach(pw => state.walls.push({ type: "wall", ...pw }));
                    geometryChanged = true;
                    state.set({ startPoint: null });
                }
                if (geometryChanged) { processWalls(); saveState(); }
            }
        }
    }
}

function handlePointerMove(e) {
    if (state.isPanning) {
        const newPanOffset = { x: state.panOffset.x + e.clientX - state.panStart.x, y: state.panOffset.y + e.clientY - state.panStart.y };
        state.set({ panOffset: newPanOffset, panStart: { x: e.clientX, y: e.clientY } });
        if (state.isEditingLength) lengthInput.positionLengthInput();
        return;
    }
    if (state.isDragging && !state.aDragOccurred) {
        if ((e.clientX - state.dragStartScreen.x) ** 2 + (e.clientY - state.dragStartScreen.y) ** 2 > 25) {
            state.set({ aDragOccurred: true });
            saveState();
        }
    }
    state.set({ mousePos: geo.getSmartSnapPoint(e) });
    if (state.isDragging && state.selectedObject) {
        if (state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
            const nodeToMove = state.selectedObject.object[state.selectedObject.handle];
            nodeToMove.x = state.mousePos.x;
            nodeToMove.y = state.mousePos.y;
        }
        // Diğer sürükleme mantıkları (duvar gövdesi, kapı vs.) buraya eklenebilir.
        processWalls();
    }
}

function handlePointerUp(e) {
    if (state.aDragOccurred) {
        if (state.selectedObject && state.selectedObject.type === "wall") {
            const nodesToMerge = new Set();
            if (state.selectedGroup.length > 0) {
                state.selectedGroup.forEach(w => { nodesToMerge.add(w.p1); nodesToMerge.add(w.p2); });
            } else if (state.selectedObject) {
                nodesToMerge.add(state.selectedObject.object.p1);
                nodesToMerge.add(state.selectedObject.object.p2);
            }
            nodesToMerge.forEach(node => nodeManager.mergeNode(node));
        }
        processWalls();
        saveState();
    }
    if (state.aDragOccurred) state.set({ selectedObject: null });
    state.set({
        isPanning: false, isDragging: false, isStretchDragging: false, aDragOccurred: false,
        stretchMode: null, initialDragPoint: null, selectedGroup: [], affectedWalls: [],
    });
    state.preDragWallStates.clear();
}

function handleWheel(e) {
    e.preventDefault();
    const rect = c2d.getBoundingClientRect();
    const before = geo.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = state.zoom * factor;
    const after = geo.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const newPanOffset = {
        x: state.panOffset.x + (after.x - before.x) * state.zoom,
        y: state.panOffset.y + (after.y - before.y) * state.zoom
    };
    state.set({ zoom: newZoom, panOffset: newPanOffset });
    if (state.isEditingLength) lengthInput.positionLengthInput();
}

export function initInteractions() {
    c2d.addEventListener("pointerdown", handlePointerDown);
    c2d.addEventListener("pointermove", handlePointerMove);
    c2d.addEventListener("pointerup", handlePointerUp);
    c2d.addEventListener("wheel", handleWheel);
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        state.set({ startPoint: null });
        setMode("select");
    });
}