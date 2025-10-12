import { state, setState } from './main.js';

export function saveState() {
    const snapshot = {
        nodes: state.nodes.map(n => ({ 
            x: n.x, 
            y: n.y, 
            isColumn: n.isColumn,
            columnSize: n.columnSize 
        })),
        walls: state.walls.map(w => ({
            type: w.type,
            p1Index: state.nodes.indexOf(w.p1),
            p2Index: state.nodes.indexOf(w.p2),
            thickness: w.thickness || 20,
            wallType: w.wallType || 'normal',
            windows: w.windows ? [...w.windows] : [],
            vents: w.vents ? [...w.vents] : []
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name
        }))
    };

    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;

    if (state.history.length > 50) {
        state.history.shift();
        state.historyIndex--;
    }
}

export function restoreState(snapshot) {
    if (!snapshot) return;

    const restoredNodes = snapshot.nodes.map(n => ({ 
        x: n.x, 
        y: n.y,
        isColumn: n.isColumn,
        columnSize: n.columnSize
    }));

    const restoredWalls = snapshot.walls.map(w => ({
        type: w.type,
        p1: restoredNodes[w.p1Index],
        p2: restoredNodes[w.p2Index],
        thickness: w.thickness || 20,
        wallType: w.wallType || 'normal',
        windows: w.windows ? [...w.windows] : [],
        vents: w.vents ? [...w.vents] : []
    }));

    const restoredDoors = snapshot.doors.map(d => ({
        wall: restoredWalls[d.wallIndex],
        pos: d.pos,
        width: d.width,
        type: d.type
    }));

    setState({
        nodes: restoredNodes,
        walls: restoredWalls,
        doors: restoredDoors,
        rooms: snapshot.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name
        }))
    });
}

export function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreState(state.history[state.historyIndex]);
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreState(state.history[state.historyIndex]);
    }
}