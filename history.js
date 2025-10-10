import { state, setState } from './main.js';
import { initializeSettings } from './ui.js';
import { processWalls } from './wall-processor.js';
import { update3DScene } from './scene3d.js';

export function saveState() {
    const { nodes, walls, doors, rooms, wallBorderColor, roomFillColor, lineThickness, history, historyIndex } = state;
    const nodesCopy = nodes.map((n) => ({ x: n.x, y: n.y }));
    const wallsCopy = walls.map((w) => ({ type: w.type, p1: nodes.indexOf(w.p1), p2: nodes.indexOf(w.p2) }));
    const doorsCopy = doors.map((d) => ({ wall: walls.indexOf(d.wall), pos: d.pos, width: d.width, type: "door" }));
    const roomsCopy = rooms.map(r => ({ name: r.name, center: r.center, area: r.area }));
    
    const stateString = JSON.stringify({ 
        nodes: nodesCopy, walls: wallsCopy, doors: doorsCopy, rooms: roomsCopy, 
        borderColor: wallBorderColor, roomColor: roomFillColor, lineThickness: lineThickness 
    });

    if (history.length > 0 && history[historyIndex] === stateString) return;
    
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(stateString);
    setState({ history: newHistory, historyIndex: historyIndex + 1 });

    update3DScene();
}

export function restoreState(serialized) {
    if (!serialized) return;
    const st = JSON.parse(serialized);
    
    const newNodes = st.nodes.map((p) => ({ x: p.x, y: p.y }));
    const newWalls = st.walls.map((w) => ({ type: w.type, p1: newNodes[w.p1], p2: newNodes[w.p2] }));
    const newDoors = st.doors ? st.doors.map((d) => ({ wall: newWalls[d.wall], pos: d.pos, width: d.width, type: "door" })) : [];
    
    setState({
        nodes: newNodes,
        walls: newWalls,
        doors: newDoors,
        wallBorderColor: st.borderColor || "#e7e6d0",
        roomFillColor: st.roomColor || "#1e1f20",
        lineThickness: st.lineThickness || 1,
        selectedObject: null,
        selectedGroup: []
    });

    initializeSettings();
    processWalls();

    if (st.rooms && state.rooms.length > 0) {
        st.rooms.forEach(savedRoom => {
            let closestRoom = null;
            let minDistance = Infinity;
            state.rooms.forEach(detectedRoom => {
                const dist = Math.hypot(savedRoom.center[0] - detectedRoom.center[0], savedRoom.center[1] - detectedRoom.center[1]);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestRoom = detectedRoom;
                }
            });
            if (closestRoom && minDistance < 50) {
                closestRoom.name = savedRoom.name;
            }
        });
    }

    update3DScene();
}

export function undo() {
    if (state.historyIndex > 0) {
        const newIndex = state.historyIndex - 1;
        setState({ historyIndex: newIndex });
        restoreState(state.history[newIndex]);
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        const newIndex = state.historyIndex + 1;
        setState({ historyIndex: newIndex });
        restoreState(state.history[newIndex]);
    }
}