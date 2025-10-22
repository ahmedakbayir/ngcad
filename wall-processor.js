import { state, setState } from './main.js';
import { distToSegmentSquared, getOrCreateNode, getLineIntersection, areCollinear, detectRooms } from './geometry.js';
import { update3DScene } from './scene3d.js';
import { saveState } from './history.js';

export function mergeNode(node) {
    const md = 14 / state.zoom;
    for (const t of state.nodes) {
        if (t === node) continue;
        if (Math.hypot(node.x - t.x, node.y - t.y) < md) {
            state.doors.forEach((door) => {
                const wall = door.wall;
                if (!wall) return;
                
                const oldWallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                
                if (wall.p1 === node) wall.p1 = t;
                if (wall.p2 === node) wall.p2 = t;
                
                const newWallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                
                if (oldWallLength > 0.1 && newWallLength > 0.1) {
                    const ratio = newWallLength / oldWallLength;
                    door.pos = door.pos * ratio;
                    
                    const minPos = door.width / 2 + 15;
                    const maxPos = newWallLength - door.width / 2 - 15;
                    door.pos = Math.max(minPos, Math.min(maxPos, door.pos));
                }
            });
            
            state.walls.forEach((w) => {
                if (w.p1 === node) w.p1 = t;
                if (w.p2 === node) w.p2 = t;
            });
            
            const idx = state.nodes.indexOf(node);
            if (idx !== -1) state.nodes.splice(idx, 1);
            return t;
        }
    }
    return null;
}

function unifyNearbyNodes(tolerance) {
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < state.nodes.length; i++) {
            for (let j = i + 1; j < state.nodes.length; j++) {
                const n1 = state.nodes[i], n2 = state.nodes[j];
                if (n1 && n2 && Math.hypot(n1.x - n2.x, n1.y - n2.y) < tolerance) {
                    state.doors.forEach((door) => {
                        const wall = door.wall;
                        if (!wall) return;
                        
                        const oldWallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        
                        if (wall.p1 === n2) wall.p1 = n1;
                        if (wall.p2 === n2) wall.p2 = n1;
                        
                        const newWallLength = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                        
                        if (oldWallLength > 0.1 && newWallLength > 0.1) {
                            const ratio = newWallLength / oldWallLength;
                            door.pos = door.pos * ratio;
                            
                            const minPos = door.width / 2 + 15;
                            const maxPos = newWallLength - door.width / 2 - 15;
                            door.pos = Math.max(minPos, Math.min(maxPos, door.pos));
                        }
                    });
                    
                    state.walls.forEach((w) => {
                        if (w.p1 === n2) w.p1 = n1;
                        if (w.p2 === n2) w.p2 = n1;
                    });
                    state.nodes.splice(j, 1);
                    changed = true;
                    break;
                }
            }
            if (changed) break;
        }
    }
}

function splitWallsAtCrossings() {
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < state.walls.length; i++) {
            for (let j = i + 1; j < state.walls.length; j++) {
                const w1 = state.walls[i], w2 = state.walls[j];
                if (!w1 || !w2 || !w1.p1 || !w1.p2 || !w2.p1 || !w2.p2) continue;
                const P = getLineIntersection(w1.p1, w1.p2, w2.p1, w2.p2);
                if (P) {
                    const n = getOrCreateNode(P.x, P.y);
                    state.walls.splice(j, 1);
                    state.walls.splice(i, 1);
                    
                    // Orijinal duvar özelliklerini al
                    const w1_props = { thickness: w1.thickness || state.wallThickness, wallType: w1.wallType || 'normal' };
                    const w2_props = { thickness: w2.thickness || state.wallThickness, wallType: w2.wallType || 'normal' };

                    if (Math.hypot(w1.p1.x - n.x, w1.p1.y - n.y) > 1) state.walls.push({ type: "wall", p1: w1.p1, p2: n, ...w1_props });
                    if (Math.hypot(w1.p2.x - n.x, w1.p2.y - n.y) > 1) state.walls.push({ type: "wall", p1: n, p2: w1.p2, ...w1_props });
                    if (Math.hypot(w2.p1.x - n.x, w2.p1.y - n.y) > 1) state.walls.push({ type: "wall", p1: w2.p1, p2: n, ...w2_props });
                    if (Math.hypot(w2.p2.x - n.x, w2.p2.y - n.y) > 1) state.walls.push({ type: "wall", p1: n, p2: w2.p2, ...w2_props });
                    changed = true;
                    break;
                }
            }
            if (changed) break;
        }
    }
}

function splitWallsAtTjunctions() {
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of state.nodes) {
            for (let i = state.walls.length - 1; i >= 0; i--) {
                const wall = state.walls[i];
                if (wall.p1 === node || wall.p2 === node) continue;
                if (distToSegmentSquared(node, wall.p1, wall.p2) < 0.1) {
                    const originalP1 = wall.p1, originalP2 = wall.p2;
                    const nodeDist = Math.hypot(node.x - originalP1.x, node.y - originalP1.y);
                    
                    // Orijinal duvar özelliklerini al
                    const wall_props = { thickness: wall.thickness || state.wallThickness, wallType: wall.wallType || 'normal' };
                    
                    const newWall1 = { type: "wall", p1: originalP1, p2: node, ...wall_props };
                    const newWall2 = { type: "wall", p1: node, p2: originalP2, ...wall_props };
                    state.doors.forEach((d) => {
                        if (d.wall === wall) {
                            if (d.pos < nodeDist) d.wall = newWall1;
                            else { d.wall = newWall2; d.pos -= nodeDist; }
                        }
                    });
                    state.walls.splice(i, 1);
                    state.walls.push(newWall1, newWall2);
                    changed = true;
                    break;
                }
            }
            if (changed) break;
        }
    }
}

function mergeDuplicateWalls() {
    const seen = new Set();
    const uniq = [];
    for (const w of state.walls) {
        const a = state.nodes.indexOf(w.p1), b = state.nodes.indexOf(w.p2);
        if (a === -1 || b === -1) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniq.push(w);
        }
    }
    setState({ walls: uniq, beams: state.beams }); // <-- beams EKLEYİN
}

function mergeCollinearChains() {
    let changed = true;
    while (changed) {
        changed = false;
        const incident = new Map();
        for (const w of state.walls) {
            if (!incident.has(w.p1)) incident.set(w.p1, []);
            if (!incident.has(w.p2)) incident.set(w.p2, []);
            incident.get(w.p1).push({ wall: w, other: w.p2 });
            incident.get(w.p2).push({ wall: w, other: w.p1 });
        }
        for (const [node, list] of incident.entries()) {
            if (list.length !== 2) continue;
            const a = list[0], b = list[1];
            if (areCollinear(a.other, node, b.other)) {
                const ia = state.walls.indexOf(a.wall); if (ia >= 0) state.walls.splice(ia, 1);
                const ib = state.walls.indexOf(b.wall); if (ib >= 0) state.walls.splice(ib, 1);
                const still = state.walls.some((w) => w.p1 === node || w.p2 === node);
                if (!still) { const i = state.nodes.indexOf(node); if (i >= 0) state.nodes.splice(i, 1); }
                if (a.other !== b.other) {
                    // Özellikleri birleşen duvarlardan birinden devral (a.wall)
                    const wall_props = { thickness: a.wall.thickness || state.wallThickness, wallType: a.wall.wallType || 'normal' };
                    state.walls.push({ type: "wall", p1: a.other, p2: b.other, ...wall_props });
                }                
                changed = true;
                break;
            }
        }
    }
}

function straightenNearlyHorizontalOrVerticalWalls() {
    state.walls.forEach(wall => {
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const length = Math.hypot(dx, dy);
        
        if (length < 0.1) return;
        
        let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
        
        if (angle < 5) {
            const p1Connections = state.walls.filter(w => w !== wall && (w.p1 === wall.p1 || w.p2 === wall.p1)).length;
            const p2Connections = state.walls.filter(w => w !== wall && (w.p1 === wall.p2 || w.p2 === wall.p2)).length;
            
            if (p1Connections === 0 && p2Connections > 0) {
                wall.p1.y = wall.p2.y;
            } else if (p2Connections === 0 && p1Connections > 0) {
                wall.p2.y = wall.p1.y;
            } else if (p1Connections > 0 && p2Connections > 0) {
                const p2ConnectedWalls = state.walls.filter(w => w !== wall && (w.p1 === wall.p2 || w.p2 === wall.p2));
                let hasVerticalConnection = false;
                
                for (const connWall of p2ConnectedWalls) {
                    const connDx = connWall.p2.x - connWall.p1.x;
                    const connDy = connWall.p2.y - connWall.p1.y;
                    const connAngle = Math.atan2(Math.abs(connDy), Math.abs(connDx)) * 180 / Math.PI;
                    if (connAngle > 85) {
                        hasVerticalConnection = true;
                        break;
                    }
                }
                
                if (hasVerticalConnection) {
                    wall.p2.y = wall.p1.y;
                } else {
                    wall.p1.y = wall.p2.y;
                }
            } else {
                wall.p2.y = wall.p1.y;
            }
        }
        else if (angle > 85) {
            const p1Connections = state.walls.filter(w => w !== wall && (w.p1 === wall.p1 || w.p2 === wall.p1)).length;
            const p2Connections = state.walls.filter(w => w !== wall && (w.p1 === wall.p2 || w.p2 === wall.p2)).length;
            
            if (p1Connections === 0 && p2Connections > 0) {
                wall.p1.x = wall.p2.x;
            } else if (p2Connections === 0 && p1Connections > 0) {
                wall.p2.x = wall.p1.x;
            } else if (p1Connections > 0 && p2Connections > 0) {
                const p2ConnectedWalls = state.walls.filter(w => w !== wall && (w.p1 === wall.p2 || w.p2 === wall.p2));
                let hasHorizontalConnection = false;
                
                for (const connWall of p2ConnectedWalls) {
                    const connDx = connWall.p2.x - connWall.p1.x;
                    const connDy = connWall.p2.y - connWall.p1.y;
                    const connAngle = Math.atan2(Math.abs(connDy), Math.abs(connDx)) * 180 / Math.PI;
                    if (connAngle < 5) {
                        hasHorizontalConnection = true;
                        break;
                    }
                }
                
                if (hasHorizontalConnection) {
                    wall.p2.x = wall.p1.x;
                } else {
                    wall.p1.x = wall.p2.x;
                }
            } else {
                wall.p2.x = wall.p1.x;
            }
        }
    });
}

function mergeColumnsWithWalls() {
    const MERGE_TOLERANCE = 5;
    
    if (!state.columns || state.columns.length === 0) return;
    
    state.columns.forEach(column => {
        if (!column || !column.center) return;
        
        let closestWallNode = null;
        let minDist = MERGE_TOLERANCE;
        
        state.walls.forEach(wall => {
            if (!wall || !wall.p1 || !wall.p2) return;
            
            [wall.p1, wall.p2].forEach(wallNode => {
                if (!wallNode || wallNode.isColumnNode) return;
                
                const dist = Math.hypot(column.center.x - wallNode.x, column.center.y - wallNode.y);
                if (dist < minDist) {
                    minDist = dist;
                    closestWallNode = wallNode;
                }
            });
        });
        
        if (closestWallNode) {
            column.center.x = closestWallNode.x;
            column.center.y = closestWallNode.y;
        }
    });
}

export function processWalls(skipMerge = false) {
    // Kolon node'larını duvar sisteminden ayır
    state.nodes = state.nodes.filter(n => !n.isColumnNode);
    
    // LOKAL KALINLIK İÇİN: skipMerge true ise birleştirme yapma
    if (!skipMerge) {
        unifyNearbyNodes(1.0);
    }
    
    const filteredWalls = state.walls.filter(w => {
        if (!w || !w.p1 || !w.p2) return false;
        const length = Math.hypot(w.p1.x - w.p2.x, w.p1.y - w.p2.y);
        return length > 0.1;
    });
    
    const filteredDoors = state.doors.filter((d) => {
        if (!d.wall || !filteredWalls.includes(d.wall)) return false;
        const wallLength = Math.hypot(d.wall.p2.x - d.wall.p1.x, d.wall.p2.y - d.wall.p1.y);
        return d.pos >= 0 && d.pos <= wallLength;
    });
    
    setState({ walls: filteredWalls, doors: filteredDoors, beams: state.beams }); // <-- beams EKLEYİN

    splitWallsAtCrossings();
    splitWallsAtTjunctions();
    mergeDuplicateWalls();
    
    // LOKAL KALINLIK İÇİN: skipMerge true ise birleştirme yapma
    if (!skipMerge) {
        mergeCollinearChains();
        straightenNearlyHorizontalOrVerticalWalls();
    }
    
    const validWalls = state.walls.filter(w => {
        if (!w || !w.p1 || !w.p2) return false;
        const length = Math.hypot(w.p1.x - w.p2.x, w.p1.y - w.p2.y);
        return length > 0.1 && isFinite(w.p1.x) && isFinite(w.p1.y) && isFinite(w.p2.x) && isFinite(w.p2.y);
    });
    setState({ walls: validWalls, beams: state.beams }); // <-- beams EKLEYİN
    
    mergeColumnsWithWalls();
    
    try {
        detectRooms();
    } catch (error) {
        console.error("Oda tespiti sırasında hata:", error);
        setState({ rooms: [] });
    }

    const wallAdjacency = new Map();
    state.walls.forEach(wall => wallAdjacency.set(wall, 0));
    const TOLERANCE = 1; 

    state.rooms.forEach(room => {
        if (!room.polygon || !room.polygon.geometry) return;
        const coords = room.polygon.geometry.coordinates[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i];
            const p2Coord = coords[i + 1];
            const wall = state.walls.find(w => {
                const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                return Math.min(d1, d2) < TOLERANCE;
            });
            if (wall) {
                wallAdjacency.set(wall, (wallAdjacency.get(wall) || 0) + 1);
            }
        }
    });
    setState({ wallAdjacency, beams: state.beams }); // <-- beams EKLEYİN
    
    update3DScene();
}

export function splitWallAtMousePosition() {
    const { walls, mousePos } = state;
    if (state.currentMode !== 'select') return;

    let wallToSplit = null;
    let minDistSq = Infinity;
    const hitToleranceSq = (state.wallThickness) ** 2;

    for (const wall of walls) {
        const distSq = distToSegmentSquared(mousePos, wall.p1, wall.p2);
        if (distSq < minDistSq) {
            minDistSq = distSq;
            wallToSplit = wall;
        }
    }
    if (!wallToSplit || minDistSq > hitToleranceSq) return;

    const p1 = wallToSplit.p1, p2 = wallToSplit.p2;
    const l2 = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2;
    let t = ((mousePos.x - p1.x) * (p2.x - p1.x) + (mousePos.y - p1.y) * (p2.y - p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const splitPoint = { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };

    const MIN_SPLIT_DIST = 10;
    if (Math.hypot(splitPoint.x - p1.x, splitPoint.y - p1.y) < MIN_SPLIT_DIST || Math.hypot(splitPoint.x - p2.x, splitPoint.y - p2.y) < MIN_SPLIT_DIST) return;
    
    const splitNode = getOrCreateNode(splitPoint.x, splitPoint.y);
    const wallIndex = walls.indexOf(wallToSplit);
    if (wallIndex > -1) walls.splice(wallIndex, 1);

    const distToSplitNode = Math.hypot(splitNode.x - p1.x, splitNode.y - p1.y);
    const newWall1 = { type: "wall", p1: p1, p2: splitNode };
    const newWall2 = { type: "wall", p1: splitNode, p2: p2 };

    state.doors.forEach((door) => {
        if (door.wall === wallToSplit) {
            if (door.pos < distToSplitNode) door.wall = newWall1;
            else { door.wall = newWall2; door.pos = door.pos - distToSplitNode; }
        }
    });

    walls.push(newWall1, newWall2);
    setState({ selectedObject: null });
    processWalls();
    saveState();
}