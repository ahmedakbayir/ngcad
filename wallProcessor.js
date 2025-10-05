import * as state from './state.js';
import * as geo from './geometry.js';
import * as nodeManager from './nodeManager.js';
import { detectRooms } from './roomDetector.js';
import { update3DScene } from './_renderer3d.js';

function splitWallsAtCrossings() {
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < state.walls.length; i++) {
            for (let j = i + 1; j < state.walls.length; j++) {
                const w1 = state.walls[i], w2 = state.walls[j];
                if (!w1 || !w2 || !w1.p1 || !w1.p2 || !w2.p1 || !w2.p2) continue;
                const P = geo.getLineIntersection(w1.p1, w1.p2, w2.p1, w2.p2);
                if (P) {
                    const n = nodeManager.getOrCreateNode(P.x, P.y);
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
                if (geo.distToSegmentSquared(node, wall.p1, wall.p2) < 0.1) {
                    const originalP1 = wall.p1, originalP2 = wall.p2;
                    const nodeDist = Math.hypot(node.x - originalP1.x, node.y - originalP1.y);
                    const newWall1 = { type: "wall", p1: originalP1, p2: node };
                    const newWall2 = { type: "wall", p1: node, p2: originalP2 };
                    state.doors.forEach(d => {
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
    const uniqueWalls = [];
    for (const w of state.walls) {
        const a = state.nodes.indexOf(w.p1), b = state.nodes.indexOf(w.p2);
        if (a === -1 || b === -1) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueWalls.push(w);
        }
    }
    state.set({ walls: uniqueWalls });
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
            if (geo.areCollinear(a.other, node, b.other)) {
                const ia = state.walls.indexOf(a.wall); if (ia >= 0) state.walls.splice(ia, 1);
                const ib = state.walls.indexOf(b.wall); if (ib >= 0) state.walls.splice(ib, 1);
                if (!state.walls.some(w => w.p1 === node || w.p2 === node)) {
                    const i = state.nodes.indexOf(node);
                    if (i >= 0) state.nodes.splice(i, 1);
                }
                if (a.other !== b.other) state.walls.push({ type: "wall", p1: a.other, p2: b.other });
                changed = true;
                break;
            }
        }
    }
}

export function splitWallAtPoint(wallToSplit, splitPointCoords) {
    const splitNode = nodeManager.getOrCreateNode(splitPointCoords.x, splitPointCoords.y);
    const wallIndex = state.walls.indexOf(wallToSplit);
    if (wallIndex === -1) return;
    const p1 = wallToSplit.p1, p2 = wallToSplit.p2;
    state.walls.splice(wallIndex, 1);
    const distToSplitNode = Math.hypot(splitNode.x - p1.x, splitNode.y - p1.y);
    const newWall1 = { type: "wall", p1: p1, p2: splitNode };
    const newWall2 = { type: "wall", p1: splitNode, p2: p2 };
    state.doors.forEach((door) => {
        if (door.wall === wallToSplit) {
            if (door.pos < distToSplitNode) {
                door.wall = newWall1;
            } else {
                door.wall = newWall2;
                door.pos -= distToSplitNode;
            }
        }
    });
    state.walls.push(newWall1, newWall2);
}

export function processWalls() {
    nodeManager.unifyNearbyNodes(1.0);
    state.set({
        walls: state.walls.filter(w => w && w.p1 && w.p2 && Math.hypot(w.p1.x - w.p2.x, w.p1.y - w.p2.y) > 0.1),
        doors: state.doors.filter(d => d.wall && state.walls.includes(d.wall))
    });
    splitWallsAtCrossings();
    splitWallsAtTjunctions();
    mergeDuplicateWalls();
    mergeCollinearChains();
    detectRooms();
    update3DScene();
}