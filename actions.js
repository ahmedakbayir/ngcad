import { state, WALL_THICKNESS } from './main.js';
import { distToSegmentSquared, areCollinear } from './geometry.js';

export function getObjectAtPoint(pos) {
    const { zoom, doors, walls } = state;
    const hr = 8 / zoom;

    for (const door of doors) {
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

    for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        if (Math.hypot(pos.x - w.p1.x, pos.y - w.p1.y) < hr) return { object: w, type: "wall", handle: "p1" };
        if (Math.hypot(pos.x - w.p2.x, pos.y - w.p2.y) < hr) return { object: w, type: "wall", handle: "p2" };
    }

    const bodyHitTolerance = WALL_THICKNESS / 2;
    for (const w of walls) {
        if (distToSegmentSquared(pos, w.p1, w.p2) < bodyHitTolerance ** 2) {
            return { object: w, type: "wall", handle: "body" };
        }
    }
    return null;
}

export function getDoorPlacementAtNode(wall, node) {
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const PADDING = 15;
    const doorWidth = 70;

    if (wallLen < doorWidth + PADDING * 2) return null;

    let pos;
    if (wall.p1 === node) {
        pos = PADDING + doorWidth / 2;
    } else if (wall.p2 === node) {
        pos = wallLen - (PADDING + doorWidth / 2);
    } else {
        return null;
    }
    return { wall, pos, width: doorWidth, type: "door" };
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

export function isSpaceForDoor(door, node = null) {
    if (node) return true;
    const wallDoors = state.doors.filter(d => d.wall === door.wall && d !== door.object);
    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;
    for (const existingDoor of wallDoors) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (Math.max(doorStart, existingStart) < Math.min(doorEnd, existingEnd)) return false;
    }
    return true;
}

export function getMinWallLength(wall) {
    const wallDoors = state.doors.filter((d) => d.wall === wall);
    if (wallDoors.length === 0) return 10;
    let totalDoorWidth = wallDoors.reduce((sum, d) => sum + d.width, 0);
    const PADDING = 15;
    return totalDoorWidth + (wallDoors.length + 1) * PADDING;
}

export function findCollinearChain(startWall) {
    const chain = new Set([startWall]);
    const toProcess = [startWall];
    const incident = new Map();
    for (const w of state.walls) {
        if (!incident.has(w.p1)) incident.set(w.p1, []);
        if (!incident.has(w.p2)) incident.set(w.p2, []);
        incident.get(w.p1).push(w);
        incident.get(w.p2).push(w);
    }
    while (toProcess.length > 0) {
        const currentWall = toProcess.pop();
        const processNode = (node, otherNode) => {
            const connected = incident.get(node) || [];
            for (const neighbor of connected) {
                if (!chain.has(neighbor) && areCollinear(otherNode, node, neighbor.p1 === node ? neighbor.p2 : neighbor.p1)) {
                    chain.add(neighbor);
                    toProcess.push(neighbor);
                }
            }
        };
        processNode(currentWall.p1, currentWall.p2);
        processNode(currentWall.p2, currentWall.p1);
    }
    return Array.from(chain);
}