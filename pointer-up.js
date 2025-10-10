import { state, setState } from './main.js';
import { getOrCreateNode, wallExists } from './geometry.js';
import { processWalls, mergeNode } from './wall-processor.js';
import { saveState } from './history.js';

export function onPointerUp(e) {
    setState({ isSnapLocked: false, lockedSnapPoint: null });

    if (state.isStretchDragging) {
        const { stretchWallOrigin, dragStartPoint, stretchMode, mousePos } = state;
        let { walls, doors, nodes } = state;

        const displacementVec = { x: mousePos.x - dragStartPoint.x, y: mousePos.y - dragStartPoint.y };
        const wallVec = { x: stretchWallOrigin.p2.x - stretchWallOrigin.p1.x, y: stretchWallOrigin.p2.y - stretchWallOrigin.p1.y };
        const normalVec = { x: -wallVec.y, y: wallVec.x };
        const len = Math.hypot(normalVec.x, normalVec.y);
        if (len > 0.1) {
            normalVec.x /= len;
            normalVec.y /= len;
        }
        const distance = displacementVec.x * normalVec.x + displacementVec.y * normalVec.y;
        const dx = distance * normalVec.x, dy = distance * normalVec.y;

        if (Math.hypot(dx, dy) > 0.1) {
            const p1_orig = stretchWallOrigin.p1;
            const p2_orig = stretchWallOrigin.p2;
            
            let newWallsToAdd = [];
            
            const t1_node = getOrCreateNode(p1_orig.x + dx, p1_orig.y + dy);
            const t2_node = getOrCreateNode(p2_orig.x + dx, p2_orig.y + dy);

            if (!wallExists(p1_orig, t1_node)) newWallsToAdd.push({ type: "wall", p1: p1_orig, p2: t1_node });
            if (!wallExists(p2_orig, t2_node)) newWallsToAdd.push({ type: "wall", p1: p2_orig, p2: t2_node });
            if (!wallExists(t1_node, t2_node)) newWallsToAdd.push({ type: "wall", p1: t1_node, p2: t2_node });
            
            if (stretchMode === "shift") {
                const wallToDelete = state.selectedObject.object;
                const p1ToDelete = wallToDelete.p1, p2ToDelete = wallToDelete.p2;

                let finalDoors = doors.filter((d) => d.wall !== wallToDelete);
                let finalWalls = walls.filter((w) => w !== wallToDelete).concat(newWallsToAdd);
                
                let finalNodes = [...nodes];
                const p1IsUsed = finalWalls.some((w) => w.p1 === p1ToDelete || w.p2 === p1ToDelete);
                if (!p1IsUsed) finalNodes = finalNodes.filter((n) => n !== p1ToDelete);
                
                const p2IsUsed = finalWalls.some((w) => w.p1 === p2ToDelete || w.p2 === p2ToDelete);
                if (!p2IsUsed) finalNodes = finalNodes.filter((n) => n !== p2ToDelete);
                
                setState({ doors: finalDoors, walls: finalWalls, nodes: finalNodes });
            } else {
                 setState({ walls: walls.concat(newWallsToAdd) });
            }
        }
    }
    
    if (state.aDragOccurred) {
        if (state.selectedObject?.type === "wall") {
            const wallsToProcess = state.selectedGroup.length > 0 ? state.selectedGroup : [state.selectedObject.object];
            const nodesToMerge = new Set();
            
            if (state.selectedObject.handle !== 'body' && state.affectedWalls) {
                // Sadece sürüklenen noktayı birleştirmeyi dene
                const nodeToMerge = state.selectedObject.object[state.selectedObject.handle];
                mergeNode(nodeToMerge);
            } else { 
                // Gövde sürüklemesi için eski mantık
                wallsToProcess.forEach((w) => { nodesToMerge.add(w.p1); nodesToMerge.add(w.p2); });
                nodesToMerge.forEach((node) => mergeNode(node));
            }
        }
        processWalls();
        saveState();
    }
    
    const didClick = Math.hypot(e.clientX - state.dragStartScreen.x, e.clientY - state.dragStartScreen.y) < 5;

    setState({
        isPanning: false,
        isDragging: false,
        isStretchDragging: false,
        aDragOccurred: false,
        stretchMode: null,
        initialDragPoint: null,
        selectedGroup: [],
        affectedWalls: [],
        preDragWallStates: new Map(),
        preDragNodeStates: new Map(),
        dragWallInitialVector: null,
        selectedObject: didClick ? state.selectedObject : null,
        dragOriginalNodes: null,
    });
}