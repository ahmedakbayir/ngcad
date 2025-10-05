import * as state from './state.js';
import { c2d } from './ui.js';

export function screenToWorld(sx, sy) {
    return { x: (sx - state.panOffset.x) / state.zoom, y: (sy - state.panOffset.y) / state.zoom };
}

export function worldToScreen(wx, wy) {
    return { x: wx * state.zoom + state.panOffset.x, y: wy * state.zoom + state.panOffset.y };
}

export function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return ((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
}

export function getLineIntersection(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (d === 0) return null;
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
    if (t > 0.0001 && t < 0.9999 && u > 0.0001 && u < 0.9999)
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    return null;
}

export function almostZero(v, eps = 1e-6) { return Math.abs(v) < eps; }

export function areCollinear(a, b, c) {
    return almostZero((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

export function getSmartSnapPoint(e) {
    const rect = c2d.getBoundingClientRect();
    let wm = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    let x = wm.x, y = wm.y, isSnapped = false;
    let snapLines = { h: [], v: [] };
    const snapDistVertex = state.SNAP_DISTANCE_VERTEX / state.zoom;
    const snapDistExtension = state.SNAP_DISTANCE_EXTENSION / state.zoom;
    let draggedNode = null;
    if (state.isDragging && state.selectedObject && state.selectedObject.type === "wall" && state.selectedObject.handle !== "body") {
        draggedNode = state.selectedObject.object[state.selectedObject.handle];
    }
    const otherNodes = state.nodes.filter((n) => n !== draggedNode);
    for (const p of otherNodes) {
        if (Math.hypot(wm.x - p.x, wm.y - p.y) < snapDistVertex) {
            x = p.x; y = p.y; isSnapped = true;
            snapLines.h.push(y); snapLines.v.push(x);
            break;
        }
    }
    if (!isSnapped) {
        for (const wall of state.walls) {
            if (draggedNode === wall.p1 || draggedNode === wall.p2) continue;
            const mid = { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 };
            if (Math.hypot(wm.x - mid.x, wm.y - mid.y) < snapDistVertex) {
                x = mid.x; y = mid.y; isSnapped = true;
                snapLines.h.push(y); snapLines.v.push(x);
                break;
            }
        }
    }
    if (!isSnapped) {
        let bestVerticalSnap = { dist: snapDistExtension, x: 0 };
        let bestHorizontalSnap = { dist: snapDistExtension, y: 0 };
        for (const p of otherNodes) {
            const dx = Math.abs(wm.x - p.x);
            if (dx < bestVerticalSnap.dist) { bestVerticalSnap = { dist: dx, x: p.x }; }
            const dy = Math.abs(wm.y - p.y);
            if (dy < bestHorizontalSnap.dist) { bestHorizontalSnap = { dist: dy, y: p.y }; }
        }
        if (bestVerticalSnap.dist < snapDistExtension) {
            isSnapped = true; x = bestVerticalSnap.x;
            snapLines.v.push(x);
        }
        if (bestHorizontalSnap.dist < snapDistExtension) {
            isSnapped = true; y = bestHorizontalSnap.y;
            snapLines.h.push(y);
        }
    }
    if (!isSnapped) {
        if (state.currentMode === "drawWall" && state.startPoint) {
            if (Math.abs(x - state.startPoint.x) > Math.abs(y - state.startPoint.y)) { y = state.startPoint.y; } else { x = state.startPoint.x; }
        } else {
            x = Math.round(x / state.gridOptions.spacing) * state.gridOptions.spacing;
            y = Math.round(y / state.gridOptions.spacing) * state.gridOptions.spacing;
        }
    }
    return { x, y, isSnapped, snapLines };
}

export function getObjectAtPoint(pos) {
    const hr = state.DRAG_HANDLE_RADIUS / state.zoom;
    for (const door of state.doors) {
        const wall = door.wall;
        if (!wall) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenter = { x: wall.p1.x + dx * door.pos, y: wall.p1.y + dy * door.pos };
        if (Math.hypot(pos.x - doorCenter.x, pos.y - doorCenter.y) < door.width / 2) {
            return { object: door, type: "door", handle: "body" };
        }
    }
    for (let i = state.walls.length - 1; i >= 0; i--) {
        const w = state.walls[i];
        if (Math.hypot(pos.x - w.p1.x, pos.y - w.p1.y) < hr) return { object: w, type: "wall", handle: "p1" };
        if (Math.hypot(pos.x - w.p2.x, pos.y - w.p2.y) < hr) return { object: w, type: "wall", handle: "p2" };
    }
    const bodyHitTolerance = state.WALL_THICKNESS * state.METER_SCALE;
    for (const w of state.walls) {
        if (distToSegmentSquared(pos, w.p1, w.p2) < bodyHitTolerance ** 2)
            return { object: w, type: "wall", handle: "body" };
    }
    return null;
}

export function getDoorPlacement(wall, clickPos) {
    if (!wall) return null;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const PADDING = 15;
    if (wallLen < 2 * PADDING + 20) return null;
    let doorWidth = (wallLen >= 70 + 2 * PADDING) ? 70 : wallLen - 2 * PADDING;
    const l2 = (wall.p1.x - wall.p2.x) ** 2 + (wall.p1.y - wall.p2.y) ** 2;
    let t = ((clickPos.x - wall.p1.x) * (wall.p2.x - wall.p1.x) + (clickPos.y - wall.p1.y) * (wall.p2.y - wall.p1.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    let pos = t * wallLen;
    const minPos = PADDING + doorWidth / 2;
    const maxPos = wallLen - PADDING - doorWidth / 2;
    pos = Math.max(minPos, Math.min(maxPos, pos));
    return { wall, pos, width: doorWidth, type: "door" };
}

export function isSpaceForDoor(door) {
    const wallDoors = state.doors.filter(d => d.wall === door.wall && d !== door.object);
    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;
    for (const existingDoor of wallDoors) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (Math.max(doorStart, existingStart) < Math.min(doorEnd, existingEnd)) {
            return false;
        }
    }
    return true;
}

export function getMinWallLength(wall) {
    const wallDoors = state.doors.filter((d) => d.wall === wall);
    if (wallDoors.length === 0) return 10;
    let totalDoorWidth = 0;
    wallDoors.forEach((d) => { totalDoorWidth += d.width; });
    const PADDING = 15;
    return totalDoorWidth + (wallDoors.length + 1) * PADDING;
}