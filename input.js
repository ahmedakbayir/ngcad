import { state, dom, setState, setMode } from './main.js';
import { screenToWorld } from './geometry.js';
import { restoreState } from './history.js';
import { showRoomNamePopup, positionLengthInput } from './ui.js';
import { onKeyDown } from './keyboard.js';
import { onPointerDown } from './pointer-down.js';
import { onPointerMove } from './pointer-move.js';
import { onPointerUp } from './pointer-up.js';

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

    c2d.addEventListener("wheel", onWheel, { passive: false });
    c2d.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        setState({ startPoint: null, isSnapLocked: false, lockedSnapPoint: null });
        setMode("select");
    });
    p2d.addEventListener("pointerleave", (e) => {
        if (state.isDragging) {
            setState({ isDragging: false, isStretchDragging: false, selectedGroup: [], affectedWalls: [], preDragWallStates: new Map() });
            if (state.history[state.historyIndex]) restoreState(state.history[state.historyIndex]);
        }
        if (state.isPanning) setState({ isPanning: false });
    });
    c2d.addEventListener('dblclick', (e) => {
        if (e.target !== c2d) return;
        if (dom.roomNamePopup.style.display === 'block') return;
        const clickPos = screenToWorld(e.clientX - c2d.getBoundingClientRect().left, e.clientY - c2d.getBoundingClientRect().top);
        const point = turf.point([clickPos.x, clickPos.y]);
        for (const room of state.rooms) {
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                showRoomNamePopup(room, e);
                return;
            }
        }
    });
    
    window.addEventListener("keydown", onKeyDown);
}