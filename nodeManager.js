import * as state from './state.js';

export function getOrCreateNode(x, y) {
    const SNAP = 6 / state.zoom;
    for (const n of state.nodes) {
        if (Math.hypot(n.x - x, n.y - y) < SNAP) return n;
    }
    const nn = { x, y };
    state.nodes.push(nn);
    return nn;
}

export function findNodeAt(x, y) {
    const r = state.DRAG_HANDLE_RADIUS / state.zoom;
    for (const n of state.nodes) {
        if (Math.hypot(n.x - x, n.y - y) < r) return n;
    }
    return null;
}

export function mergeNode(node) {
    const md = state.SNAP_DISTANCE_VERTEX / state.zoom;
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

export function unifyNearbyNodes(tolerance) {
    let changed = true;
    while (changed) {
        changed = false;
        for (let i = 0; i < state.nodes.length; i++) {
            for (let j = i + 1; j < state.nodes.length; j++) {
                const n1 = state.nodes[i];
                const n2 = state.nodes[j];
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