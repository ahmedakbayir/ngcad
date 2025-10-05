import * as state from './state.js';
import { updateModeClasses } from './ui.js';

export function setMode(mode) {
    if (mode !== "select") {
        state.set({ lastUsedMode: mode });
    }
    
    const newMode = state.currentMode === mode && mode !== "select" ? "select" : mode;
    state.set({
        currentMode: newMode,
        startPoint: null,
        selectedObject: null,
        selectedGroup: [],
        isDragging: false
    });

    updateModeClasses(newMode);
}

export function getCurrentMode() {
    return state.currentMode;
}

export function getLastUsedMode() {
    return state.lastUsedMode;
}