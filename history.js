import * as state from './state.js';
import { processWalls } from './wallProcessor.js';
import { update3DScene } from './_renderer3d.js';
import { setWallBorderColor, getWallBorderColor } from './ui.js';

let history = [];
let historyIndex = -1;

export function saveState() {
    const nodesCopy = state.nodes.map(n => ({ x: n.x, y: n.y }));
    const wallsCopy = state.walls.map(w => ({ type: w.type, p1: state.nodes.indexOf(w.p1), p2: state.nodes.indexOf(w.p2) }));
    const doorsCopy = state.doors.map(d => ({ wall: state.walls.indexOf(d.wall), pos: d.pos, width: d.width, type: 'door' }));
    const stateString = JSON.stringify({
        nodes: nodesCopy, walls: wallsCopy, doors: doorsCopy, borderColor: getWallBorderColor(),
    });
    if (history.length > 0 && history[historyIndex] === stateString) return;
    history = history.slice(0, historyIndex + 1);
    history.push(stateString);
    historyIndex++;
    update3DScene();
}

function restoreState(serialized) {
    if (!serialized) return;
    const st = JSON.parse(serialized);
    restoreStateFromData(st);
}

export function restoreStateFromData(data) {
    const newNodes = data.nodes.map(p => ({ x: p.x, y: p.y }));
    const newWalls = data.walls.map(w => ({ type: w.type, p1: newNodes[w.p1], p2: newNodes[w.p2] }));
    const newDoors = data.doors ? data.doors.map(d => ({ wall: newWalls[d.wall], pos: d.pos, width: d.width, type: 'door' })) : [];
    state.set({
        nodes: newNodes, walls: newWalls, doors: newDoors,
        selectedObject: null, selectedGroup: []
    });
    if (data.borderColor) {
        setWallBorderColor(data.borderColor);
    }
    processWalls();
}

export function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        restoreState(history[historyIndex]);
    }
}

export function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        restoreState(history[historyIndex]);
    }
}

export function clearHistory() {
    history = [];
    historyIndex = -1;
}