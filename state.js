// ====== SABİTLER ======
export const BG = "#1e1f20";
export const METER_SCALE = 100;
export const WALL_THICKNESS = 0.2;
export const SNAP_DISTANCE_VERTEX = 14;
export const SNAP_DISTANCE_EXTENSION = 9;
export const DRAG_HANDLE_RADIUS = 8;
export const EXTEND_RANGE = 5 * METER_SCALE;

// ====== DURUM ======
export let currentMode = "select";
export let lastUsedMode = "drawWall";
export let startPoint = null;
export let nodes = [];
export let walls = [];
export let doors = [];
export let rooms = [];
export let selectedObject = null;
export let showDimensions = false;
export let zoom = 1;
export let panOffset = { x: 0, y: 0 };
export let isPanning = false;
export let panStart = { x: 0, y: 0 };
export let isDragging = false;
export let dragStartPoint = null;
export let initialDragPoint = null;
export let dragOffset = { x: 0, y: 0 };
export let dragStartScreen = { x: 0, y: 0 };
export let aDragOccurred = false;
export let mousePos = { x: 0, y: 0, isSnapped: false, snapLines: { h: [], v: [] } };
export let isEditingLength = false;
export let isStretchDragging = false;
export let stretchMode = null;
export let stretchWallOrigin = null;
export let selectedGroup = [];
export let affectedWalls = [];
export let preDragWallStates = new Map();
export let gridOptions = { visible: true, spacing: 10, color: "#2d3134", weight: 0.5 };

export function set(newState) {
    Object.keys(newState).forEach(key => {
        switch (key) {
            case 'currentMode': currentMode = newState[key]; break;
            case 'lastUsedMode': lastUsedMode = newState[key]; break;
            case 'startPoint': startPoint = newState[key]; break;
            case 'nodes': nodes = newState[key]; break;
            case 'walls': walls = newState[key]; break;
            case 'doors': doors = newState[key]; break;
            case 'rooms': rooms = newState[key]; break;
            case 'selectedObject': selectedObject = newState[key]; break;
            case 'showDimensions': showDimensions = newState[key]; break;
            case 'zoom': zoom = newState[key]; break;
            case 'panOffset': panOffset = newState[key]; break;
            case 'isPanning': isPanning = newState[key]; break;
            case 'panStart': panStart = newState[key]; break;
            case 'isDragging': isDragging = newState[key]; break;
            case 'dragStartPoint': dragStartPoint = newState[key]; break;
            case 'initialDragPoint': initialDragPoint = newState[key]; break;
            case 'dragOffset': dragOffset = newState[key]; break;
            case 'dragStartScreen': dragStartScreen = newState[key]; break;
            case 'aDragOccurred': aDragOccurred = newState[key]; break;
            case 'mousePos': mousePos = newState[key]; break;
            case 'isEditingLength': isEditingLength = newState[key]; break;
            case 'isStretchDragging': isStretchDragging = newState[key]; break;
            case 'stretchMode': stretchMode = newState[key]; break;
            case 'stretchWallOrigin': stretchWallOrigin = newState[key]; break;
            case 'selectedGroup': selectedGroup = newState[key]; break;
            case 'affectedWalls': affectedWalls = newState[key]; break;
            case 'preDragWallStates': preDragWallStates = newState[key]; break;
        }
    });
}