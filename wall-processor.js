import { state, setState, WALL_THICKNESS } from './main.js';
import { distToSegmentSquared, getOrCreateNode, getLineIntersection, areCollinear, detectRooms } from './geometry.js';
import { update3DScene } from './scene3d.js';
import { saveState } from './history.js';

export function mergeNode(node) {
    const md = 14 / state.zoom;
    for (const t of state.nodes) {
        if (t === node) continue;
        if (Math.hypot(node.x - t.x, node.y - t.y) < md) {
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
                    if (Math.hypot(w1.p1.x - n.x, w1.p1.y - n.y) > 1) state.walls.push({ type: "wall", p1: w1.p1, p2: n });
                    if (Math.hypot(w1.p2.x - n.x, w1.p2.y - n.y) > 1) state.walls.push({ type: "wall", p1: n, p2: w1.p2 });
                    if (Math.hypot(w2.p1.x - n.x, w2.p1.y - n.y) > 1) state.walls.push({ type: "wall", p1: w2.p1, p2: n });
                    if (Math.hypot(w2.p2.x - n.x, w2.p2.y - n.y) > 1) state.walls.push({ type: "wall", p1: n, p2: w2.p2 });
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
                    const newWall1 = { type: "wall", p1: originalP1, p2: node };
                    const newWall2 = { type: "wall", p1: node, p2: originalP2 };
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
    setState({ walls: uniq });
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
                if (a.other !== b.other) state.walls.push({ type: "wall", p1: a.other, p2: b.other });
                changed = true;
                break;
            }
        }
    }
}

export function processWalls() {
    unifyNearbyNodes(1.0);
    const filteredWalls = state.walls.filter(w => w && w.p1 && w.p2 && Math.hypot(w.p1.x - w.p2.x, w.p1.y - w.p2.y) > 0.1);
    const filteredDoors = state.doors.filter((d) => d.wall && filteredWalls.includes(d.wall));
    setState({ walls: filteredWalls, doors: filteredDoors });

    splitWallsAtCrossings();
    splitWallsAtTjunctions();
    mergeDuplicateWalls();
    mergeCollinearChains();
    detectRooms();
    update3DScene();
}

export function splitWallAtMousePosition() {
    const { walls, mousePos } = state;
    if (state.currentMode !== 'select') return;

    let wallToSplit = null;
    let minDistSq = Infinity;
    const hitToleranceSq = (WALL_THICKNESS) ** 2;

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

function cleanMiterJoints() {
    const nodeWallMap = new Map();
    state.nodes.forEach(n => nodeWallMap.set(n, []));
    state.walls.forEach(w => {
        nodeWallMap.get(w.p1).push(w);
        nodeWallMap.get(w.p2).push(w);
    });

    for (const [node, connectedWalls] of nodeWallMap.entries()) {
        if (connectedWalls.length !== 2) continue;

        const wall1 = connectedWalls[0];
        const wall2 = connectedWalls[1];

        const v1 = (wall1.p1 === node) ? { x: wall1.p2.x - node.x, y: wall1.p2.y - node.y } : { x: wall1.p1.x - node.x, y: wall1.p1.y - node.y };
        const v2 = (wall2.p1 === node) ? { x: wall2.p2.x - node.x, y: wall2.p2.y - node.y } : { x: wall2.p1.x - node.x, y: wall2.p1.y - node.y };

        const len1 = Math.hypot(v1.x, v1.y);
        const len2 = Math.hypot(v2.x, v2.y);
        if (len1 < 1 || len2 < 1) continue;
        v1.x /= len1; v1.y /= len1;
        v2.x /= len2; v2.y /= len2;

        const dot = v1.x * v2.x + v1.y * v2.y;
        if (Math.abs(dot) > 0.999) continue;
        
        const angle = Math.acos(dot);
        const sinHalfAngle = Math.sin(angle / 2);

        if (Math.abs(sinHalfAngle) < 0.1) continue;

        const offset = (WALL_THICKNESS / 2) / sinHalfAngle;
        
        let bisector = { x: v1.x + v2.x, y: v1.y + v2.y };
        const lenB = Math.hypot(bisector.x, bisector.y);
        if (lenB < 0.1) continue;
        bisector.x /= lenB; bisector.y /= lenB;

        const newPoint = {
            x: node.x + bisector.x * offset,
            y: node.y + bisector.y * offset
        };
        
        node.x = newPoint.x;
        node.y = newPoint.y;
    }
}