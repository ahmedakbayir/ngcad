// architectural-objects/arch-devices.js
// Mahal içine eklenen serbest mimari cihazlar:
//   - Gaz alarm cihazı
//   - CO alarm cihazı
//   - Deprem algılama cihazı
//   - Yangın tüpü

import { state, setState } from '../general-files/main.js';

export const ARCH_DEVICE_KINDS = {
    GAS_ALARM: 'gas_alarm',
    CO_ALARM: 'co_alarm',
    EARTHQUAKE: 'earthquake',
    FIRE_EXT: 'fire_ext',
};

// Cihazın 2D plan boyutu (genişlik × yükseklik, cm). Sabit boyutlu — kullanıcı
// kenardan boyutlandıramaz; sadece taşır + döndürür.
export const ARCH_DEVICE_SIZES = {
    [ARCH_DEVICE_KINDS.GAS_ALARM]: { width: 25, height: 20 },
    [ARCH_DEVICE_KINDS.CO_ALARM]: { width: 25, height: 20 },
    [ARCH_DEVICE_KINDS.EARTHQUAKE]: { width: 25, height: 20 },
    [ARCH_DEVICE_KINDS.FIRE_EXT]: { width: 25, height: 20 },
};

// Cihaz gövdesinin İÇİNE yazılan kısa kod
export const ARCH_DEVICE_LABELS = {
    [ARCH_DEVICE_KINDS.GAS_ALARM]: 'GAC',
    [ARCH_DEVICE_KINDS.CO_ALARM]: 'CO',
    [ARCH_DEVICE_KINDS.EARTHQUAKE]: 'SAC',
    [ARCH_DEVICE_KINDS.FIRE_EXT]: '',
};

// Cihazın dış etiket adı (gövdenin altında çizilir)
export const ARCH_DEVICE_NAMES = {
    [ARCH_DEVICE_KINDS.GAS_ALARM]: 'Gaz Alarm Cihazı',
    [ARCH_DEVICE_KINDS.CO_ALARM]: 'CO Algılama Cihazı',
    [ARCH_DEVICE_KINDS.EARTHQUAKE]: 'Sismik Alarm Cihazı',
    [ARCH_DEVICE_KINDS.FIRE_EXT]: 'Yangın Tüpü',
};

export function getArchDeviceSize(device) {
    return ARCH_DEVICE_SIZES[device.kind] || { width: 20, height: 10 };
}

export function createArchDevice(kind, centerX, centerY) {
    return {
        type: 'archDevice',
        kind,
        center: { x: centerX, y: centerY },
        rotation: 0,
        floorId: state.currentFloor?.id || null,
    };
}

export function getArchDeviceCorners(device) {
    const { width, height } = getArchDeviceSize(device);
    const halfW = width / 2;
    const halfH = height / 2;
    const cx = device.center.x;
    const cy = device.center.y;
    const rot = (device.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    const local = [
        { x: -halfW, y: -halfH },
        { x:  halfW, y: -halfH },
        { x:  halfW, y:  halfH },
        { x: -halfW, y:  halfH },
    ];
    return local.map(p => ({
        x: cx + p.x * cos - p.y * sin,
        y: cy + p.x * sin + p.y * cos,
    }));
}

export function isPointInArchDevice(point, device) {
    const { width, height } = getArchDeviceSize(device);
    const halfW = width / 2;
    const halfH = height / 2;
    const rot = -(device.rotation || 0) * Math.PI / 180;
    const dx = point.x - device.center.x;
    const dy = point.y - device.center.y;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    return Math.abs(localX) <= halfW && Math.abs(localY) <= halfH;
}

export function getArchDeviceHandleAtPoint(point, device, tolerance) {
    const corners = getArchDeviceCorners(device);
    const cornerTolerance = tolerance * 1.5;
    for (let i = 0; i < corners.length; i++) {
        const dist = Math.hypot(point.x - corners[i].x, point.y - corners[i].y);
        if (dist < cornerTolerance) return `corner_${i}`;
    }
    return null;
}

export function getArchDeviceAtPoint(point) {
    const { zoom } = state;
    const currentFloorId = state.currentFloor?.id;
    const devices = (state.archDevices || []).filter(d =>
        !currentFloorId || !d.floorId || d.floorId === currentFloorId
    );
    const handleTolerance = 8 / zoom;

    for (const device of [...devices].reverse()) {
        const handle = getArchDeviceHandleAtPoint(point, device, handleTolerance);
        if (handle) return { type: 'archDevice', object: device, handle };
    }
    for (const device of [...devices].reverse()) {
        if (isPointInArchDevice(point, device)) {
            return { type: 'archDevice', object: device, handle: 'body' };
        }
    }
    return null;
}

// Cihaz mahal (oda) içinde mi? — kırmızı uyarı için kullanılır.
export function isArchDeviceInsideRoom(device) {
    if (typeof turf === 'undefined' || !turf?.point || !turf?.booleanPointInPolygon) {
        return true; // turf yoksa kontrol etme
    }
    const currentFloorId = state.currentFloor?.id;
    const rooms = (state.rooms || []).filter(r =>
        !currentFloorId || !r.floorId || r.floorId === currentFloorId
    );
    if (rooms.length === 0) return true; // mahal tanımlanmamışsa uyarı verme

    try {
        const pt = turf.point([device.center.x, device.center.y]);
        for (const room of rooms) {
            if (!room.polygon?.geometry?.coordinates) continue;
            try {
                if (turf.booleanPointInPolygon(pt, room.polygon)) return true;
            } catch (e) { /* poligon geçersiz */ }
        }
    } catch (e) { /* nokta geçersiz */ }
    return false;
}

// ---- Drag handlers (column.js paterni ile aynı şekil) ----

export function onPointerDownArchDevice(selectedObject, pos, snappedPos, e) {
    const device = selectedObject.object;

    // CTRL+drag → kopyala
    const isCopying = e.ctrlKey && !e.altKey && !e.shiftKey && selectedObject.handle === 'body';
    let effective = device;
    if (isCopying) {
        const copy = JSON.parse(JSON.stringify(device));
        copy.floorId = state.currentFloor?.id || null;
        if (!state.archDevices) state.archDevices = [];
        state.archDevices.push(copy);
        effective = copy;
        setState({ selectedObject: { ...selectedObject, object: copy } });
    }

    state.preDragNodeStates.set('center_x', effective.center.x);
    state.preDragNodeStates.set('center_y', effective.center.y);
    state.preDragNodeStates.set('rotation', effective.rotation || 0);

    let startPointForDragging;
    let dragOffset = { x: 0, y: 0 };
    let additionalState = { columnRotationOffset: null };

    if (selectedObject.handle === 'body') {
        startPointForDragging = { x: pos.x, y: pos.y };
        dragOffset = {
            x: effective.center.x - pos.x,
            y: effective.center.y - pos.y,
        };
    } else if (selectedObject.handle.startsWith('corner_')) {
        startPointForDragging = { x: effective.center.x, y: effective.center.y };
        const initialAngle = Math.atan2(pos.y - effective.center.y, pos.x - effective.center.x);
        const initialRotationRad = (effective.rotation || 0) * Math.PI / 180;
        additionalState.columnRotationOffset = initialRotationRad - initialAngle;
    } else {
        startPointForDragging = { x: snappedPos.roundedX, y: snappedPos.roundedY };
    }

    return { startPointForDragging, dragOffset, additionalState };
}

export function onPointerMoveArchDevice(snappedPos, unsnappedPos) {
    const device = state.selectedObject.object;
    const handle = state.selectedObject.handle;

    if (handle && handle.startsWith('corner_')) {
        // Döndürme — kolon ile aynı yaklaşım
        const center = device.center;
        const mouseAngle = Math.atan2(unsnappedPos.y - center.y, unsnappedPos.x - center.x);
        let newRotationRad = mouseAngle + state.columnRotationOffset;

        const snap1deg = (1 * Math.PI / 180);
        newRotationRad = Math.round(newRotationRad / snap1deg) * snap1deg;
        let newRotationDeg = newRotationRad * 180 / Math.PI;
        const remainder = newRotationDeg % 90;
        const snapThreshold = 5;
        if (Math.abs(remainder) <= snapThreshold || Math.abs(remainder) >= (90 - snapThreshold)) {
            newRotationDeg = Math.round(newRotationDeg / 90) * 90;
        }
        device.rotation = newRotationDeg;
    } else if (handle === 'body') {
        device.center.x = unsnappedPos.x + state.dragOffset.x;
        device.center.y = unsnappedPos.y + state.dragOffset.y;
    }
}
