import { state, dom, setState, setMode } from './main.js';
import { processWalls } from './wall-processor.js';
import { saveState, undo, redo } from './history.js';
import { onPointerDown } from './pointer-down.js';
import { onPointerMove } from './pointer-move.js';
import { onPointerUp } from './pointer-up.js';
import { onWheel } from './zoom.js';

export function setupInputListeners() {
    dom.c2d.addEventListener("pointerdown", onPointerDown);
    dom.c2d.addEventListener("pointermove", onPointerMove);
    dom.c2d.addEventListener("pointerup", onPointerUp);
    dom.c2d.addEventListener("pointercancel", onPointerUp);
    dom.c2d.addEventListener("wheel", onWheel, { passive: false });
    dom.c2d.addEventListener("contextmenu", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
        const isTyping = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable;

        if (e.key === "Escape") {
            if (state.isEditingLength) {
                import('./ui.js').then(module => module.cancelLengthEdit());
            } else {
                setMode("select");
                setState({ startPoint: null, selectedObject: null, selectedGroup: [] });
            }
        }

        if ((e.key === "Delete" || e.key === "Backspace") && (state.selectedObject || state.selectedGroup.length > 0)) {
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
                } else if (state.selectedObject.type === "room") {
                    const newRooms = state.rooms.filter((r) => r !== state.selectedObject.object);
                    setState({ rooms: newRooms });
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

        if (e.key.toLowerCase() === "w" && !isTyping) {
            e.preventDefault();
            setMode("drawWall");
        }
        
        if (e.key.toLowerCase() === "a" && !isTyping) {
            e.preventDefault();
            setMode("drawArcWall");
        }

        if (e.key.toLowerCase() === "r" && !isTyping) {
            e.preventDefault();
            setMode("drawRoom");
        }

        if (e.key.toLowerCase() === "k" && !isTyping) {
            e.preventDefault();
            setMode("drawDoor");
        }

        if (e.key.toLowerCase() === "p" && !isTyping) {
            e.preventDefault();
            setMode("drawWindow");
        }

        if (e.key.toLowerCase() === "m" && !isTyping) {
            e.preventDefault();
            setMode("drawVent");
        }

        if (e.ctrlKey && e.key.toLowerCase() === "z" && !isTyping) {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        }

        if (e.ctrlKey && e.key.toLowerCase() === "y" && !isTyping) {
            e.preventDefault();
            redo();
        }

        if (e.key === "d" && !isTyping) {
            e.preventDefault();
            setState({ showDimensions: !state.showDimensions });
        }
    });
}