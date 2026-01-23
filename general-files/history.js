// general-files/history.js
import { state, setState } from './main.js';
import { PLUMBING_PIPE_TYPES } from '../plumbing_v2/plumbing-types.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

export function saveState() {
    const snapshot = {
        // --- YENİ: Mimari çizim başlangıç noktasını kaydet ---
        startPointIndex: state.startPoint ? state.nodes.indexOf(state.startPoint) : -1,

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
            thickness: w.thickness || state.wallThickness,
            wallType: w.wallType || 'normal',
            floorId: w.floorId,
            windows: w.windows ? JSON.parse(JSON.stringify(w.windows)) : [],
            vents: w.vents ? JSON.parse(JSON.stringify(w.vents)) : [],
            isArc: w.isArc,
            arcControl1: w.arcControl1 ? { ...w.arcControl1 } : null,
            arcControl2: w.arcControl2 ? { ...w.arcControl2 } : null
        })),
        doors: state.doors.map(d => ({
            wallIndex: state.walls.indexOf(d.wall),
            pos: d.pos,
            width: d.width,
            type: d.type,
            floorId: d.floorId,
            isWidthManuallySet: d.isWidthManuallySet || false
        })),
        rooms: state.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            floorId: r.floorId,
            centerOffset: r.centerOffset
        })),
        columns: JSON.parse(JSON.stringify(state.columns)),
        beams: JSON.parse(JSON.stringify(state.beams)),
        stairs: JSON.parse(JSON.stringify(state.stairs.map(s => ({
            type: s.type,
            id: s.id,
            name: s.name,
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation,
            topElevation: s.topElevation,
            connectedStairId: s.connectedStairId,
            isLanding: s.isLanding,
            showRailing: s.showRailing,
            floorId: s.floorId
        })))),
        
        plumbingBlocks: JSON.parse(JSON.stringify(state.plumbingBlocks || [])),
        plumbingPipes: (state.plumbingPipes || []).map(p => {
            if (!p.connections) {
                return JSON.parse(JSON.stringify(p));
            }
            return {
                pipeType: p.pipeType,
                p1: { ...p.p1 },
                p2: { ...p.p2 },
                floorId: p.floorId,
                isConnectedToValve: p.isConnectedToValve,
                connections: {
                    start: (p.connections.start && p.connections.start.blockId) ? {
                        blockId: typeof p.connections.start.blockId === 'string'
                            ? p.connections.start.blockId
                            : (p.connections.start.blockId.id || null),
                        blockIndex: typeof p.connections.start.blockId === 'object'
                            ? state.plumbingBlocks.indexOf(p.connections.start.blockId)
                            : -1,
                        connectionIndex: p.connections.start.connectionIndex,
                        blockType: p.connections.start.blockType
                    } : null,
                    end: (p.connections.end && p.connections.end.blockId) ? {
                        blockId: typeof p.connections.end.blockId === 'string'
                            ? p.connections.end.blockId
                            : (p.connections.end.blockId.id || null),
                        blockIndex: typeof p.connections.end.blockId === 'object'
                            ? state.plumbingBlocks.indexOf(p.connections.end.blockId)
                            : -1,
                        connectionIndex: p.connections.end.connectionIndex,
                        blockType: p.connections.end.blockType
                    } : null
                }
            };
        }),

        // --- YENİ: Tesisat etkileşim durumunu kaydet (Hangi uçtan devam edilecek) ---
        plumbingInteraction: (plumbingManager && plumbingManager.interactionManager) ? {
            boruCizimAktif: plumbingManager.interactionManager.boruCizimAktif,
            boruBaslangic: plumbingManager.interactionManager.boruBaslangic 
                ? JSON.parse(JSON.stringify(plumbingManager.interactionManager.boruBaslangic)) 
                : null
        } : null,

        guides: JSON.parse(JSON.stringify(state.guides || [])),
        floors: JSON.parse(JSON.stringify(state.floors || [])),
        currentFloor: state.currentFloor ? { id: state.currentFloor.id } : null
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
        thickness: w.thickness || state.wallThickness,
        wallType: w.wallType || 'normal',
        floorId: w.floorId,
        windows: w.windows ? [...w.windows] : [],
        vents: w.vents ? [...w.vents] : [],
        isArc: w.isArc,
        arcControl1: w.arcControl1 ? { ...w.arcControl1 } : null,
        arcControl2: w.arcControl2 ? { ...w.arcControl2 } : null
    }));

    const restoredDoors = snapshot.doors.map(d => ({
        wall: restoredWalls[d.wallIndex],
        pos: d.pos,
        width: d.width,
        type: d.type,
        floorId: d.floorId,
        isWidthManuallySet: d.isWidthManuallySet || false
    }));

    const restoredPlumbingBlocks = snapshot.plumbingBlocks ? JSON.parse(JSON.stringify(snapshot.plumbingBlocks)) : [];

    const restoredPlumbingPipes = (snapshot.plumbingPipes || []).map(p => {
        if (!p.connections) {
            return JSON.parse(JSON.stringify(p));
        }

        const pipeConfig = PLUMBING_PIPE_TYPES[p.pipeType] || PLUMBING_PIPE_TYPES['STANDARD'];

        let startBlockId = null;
        if (p.connections.start) {
            if (p.connections.start.blockId) {
                startBlockId = restoredPlumbingBlocks.find(b => b.id === p.connections.start.blockId);
            }
            if (!startBlockId && p.connections.start.blockIndex !== -1) {
                startBlockId = restoredPlumbingBlocks[p.connections.start.blockIndex];
            }
        }

        let endBlockId = null;
        if (p.connections.end) {
            if (p.connections.end.blockId) {
                endBlockId = restoredPlumbingBlocks.find(b => b.id === p.connections.end.blockId);
            }
            if (!endBlockId && p.connections.end.blockIndex !== -1) {
                endBlockId = restoredPlumbingBlocks[p.connections.end.blockIndex];
            }
        }

        return {
            type: 'plumbingPipe',
            pipeType: p.pipeType,
            p1: { ...p.p1 },
            p2: { ...p.p2 },
            floorId: p.floorId,
            typeConfig: pipeConfig,
            isConnectedToValve: p.isConnectedToValve,
            connections: {
                start: (startBlockId) ? {
                    blockId: startBlockId.id || startBlockId,
                    connectionIndex: p.connections.start.connectionIndex,
                    blockType: p.connections.start.blockType
                } : null,
                end: (endBlockId) ? {
                    blockId: endBlockId.id || endBlockId,
                    connectionIndex: p.connections.end.connectionIndex,
                    blockType: p.connections.end.blockType
                } : null
            }
        };
    });

    const restoredFloors = snapshot.floors || [];
    const restoredCurrentFloor = snapshot.currentFloor
        ? restoredFloors.find(f => f.id === snapshot.currentFloor.id)
        : null;

    // --- YENİ: Mimari çizim başlangıç noktasını (startPoint) geri yükle ---
    const restoredStartPoint = (snapshot.startPointIndex !== undefined && snapshot.startPointIndex !== -1 && restoredNodes[snapshot.startPointIndex])
        ? restoredNodes[snapshot.startPointIndex]
        : null;

    // --- Tesisat etkileşim durumunu undo/redo sırasında geri yükleme ---
    // NOT: Undo/redo yapıldığında devam eden boru çizim etkileşimini geri yüklememeliyiz.
    // Sadece objeleri (borular, bloklar) geri yükleriz, yarım kalmış çizim durumunu değil.
    // Bu sayede kullanıcı undo yaptığında istenmeyen şekilde hat çizim moduna geçmez.
    if (plumbingManager && plumbingManager.interactionManager) {
        // Her undo/redo sonrası etkileşim durumunu temizle
        plumbingManager.interactionManager.boruCizimAktif = false;
        plumbingManager.interactionManager.boruBaslangic = null;
        plumbingManager.interactionManager.snapSystem.clearStartPoint();
        plumbingManager.interactionManager.manager.activeTool = null;
    }

    setState({
        nodes: restoredNodes,
        walls: restoredWalls,
        doors: restoredDoors,
        rooms: snapshot.rooms.map(r => ({
            polygon: r.polygon,
            area: r.area,
            center: r.center,
            name: r.name,
            floorId: r.floorId,
            centerOffset: r.centerOffset
        })),
        columns: snapshot.columns || [],
        beams: snapshot.beams || [],
        stairs: (snapshot.stairs || []).map(s => ({
            type: s.type,
            id: s.id,
            name: s.name,
            center: s.center,
            width: s.width,
            height: s.height,
            rotation: s.rotation,
            stepCount: s.stepCount,
            bottomElevation: s.bottomElevation,
            topElevation: s.topElevation,
            connectedStairId: s.connectedStairId,
            isLanding: s.isLanding,
            showRailing: s.showRailing || false,
            floorId: s.floorId
        })),

        plumbingBlocks: restoredPlumbingBlocks,
        plumbingPipes: restoredPlumbingPipes,

        guides: snapshot.guides || [],
        floors: restoredFloors,
        currentFloor: restoredCurrentFloor,
        
        // Geri yüklenen startPoint'i state'e ata
        startPoint: restoredStartPoint 
    });
}

export function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreState(state.history[state.historyIndex]);
        if (plumbingManager) {
            plumbingManager.loadFromState();
        }
    }
}

export function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreState(state.history[state.historyIndex]);
        if (plumbingManager) {
            plumbingManager.loadFromState();
        }
    }
}