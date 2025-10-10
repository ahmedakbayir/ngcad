import { state, setState, setMode } from './main.js';
import { splitWallAtMousePosition, processWalls } from './wall-processor.js';
import { undo, redo, saveState, restoreState } from './history.js';
import { startLengthEdit, cancelLengthEdit } from './ui.js';

export function onKeyDown(e) {
    if (document.activeElement.closest("#settings-popup") || document.activeElement.closest("#room-name-popup")) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); splitWallAtMousePosition(); return; }
    if (state.selectedObject?.type === "wall" && !state.isEditingLength && /^[0-9.]$/.test(e.key)) { e.preventDefault(); startLengthEdit(e.key); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "z") { undo(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === "y") { redo(); return; }
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
        if (state.selectedObject && state.selectedObject.type === "door") {
            const newDoors = state.doors.filter((d) => d !== state.selectedObject.object);
            setState({ doors: newDoors });
        } else {
            const wallsToDelete = state.selectedGroup.length > 0 ? state.selectedGroup : state.selectedObject ? [state.selectedObject.object] : [];
            const newWalls = state.walls.filter((w) => !wallsToDelete.includes(w));
            const newDoors = state.doors.filter((d) => !wallsToDelete.includes(d.wall));
            setState({ walls: newWalls, doors: newDoors });
        }
        setState({ selectedObject: null, selectedGroup: [] });
        processWalls();
        saveState();
    }

    if (e.key.toLowerCase() === "d") setState({ showDimensions: !state.showDimensions });
    if (e.key.toLowerCase() === "w") setMode("drawWall");
    if (e.key.toLowerCase() === "r") setMode("drawRoom");
    if (e.key.toLowerCase() === "k") setMode("drawDoor");
    if (e.code === "Space" && state.currentMode === "select") { e.preventDefault(); setMode(state.lastUsedMode); }
}