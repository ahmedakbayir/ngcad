import { state } from './main.js';

export function createColumn(centerX, centerY, size = 40) {
    return {
        type: 'column',
        center: { x: centerX, y: centerY },
        size: size,
        width: size,  // EKLE
        height: size, // EKLE
        rotation: 0,
        hollowSize: 0
    };
}

export function getColumnCorners(column) {
    const halfWidth = (column.width || column.size) / 2;
    const halfHeight = (column.height || column.size) / 2;
    const cx = column.center.x;
    const cy = column.center.y;
    const rot = (column.rotation || 0) * Math.PI / 180;
    
    const corners = [
        { x: -halfWidth, y: -halfHeight },  // Sol üst
        { x: halfWidth, y: -halfHeight },   // Sağ üst
        { x: halfWidth, y: halfHeight },    // Sağ alt
        { x: -halfWidth, y: halfHeight }    // Sol alt
    ];
    
    // Döndürme uygula
    return corners.map(corner => {
        const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot);
        const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot);
        return {
            x: cx + rotatedX,
            y: cy + rotatedY
        };
    });
}
export function getColumnAtPoint(point) {
    const { columns, zoom, selectedObject } = state;
    const tolerance = 12 / zoom; // Toleransı artırdık
    
    // Seçili kolonun handle'larını kontrol et
    if (selectedObject?.type === 'column') {
        const column = selectedObject.object;
        
        // Köşe handle ÖNCE kontrol edilmeli (öncelikli)
        const corners = getColumnCorners(column);
        const cornerHandle = corners[1]; // Sağ üst köşe
        const distToCorner = Math.hypot(point.x - cornerHandle.x, point.y - cornerHandle.y);
        if (distToCorner < tolerance) {
            return { type: 'column', object: column, handle: 'corner' };
        }
        
        // Merkez handle
        const distToCenter = Math.hypot(point.x - column.center.x, point.y - column.center.y);
        if (distToCenter < tolerance) {
            return { type: 'column', object: column, handle: 'center' };
        }
    }
    
    // Kolon body'sine tıklama
    for (const column of [...columns].reverse()) {
        if (isPointInColumn(point, column)) {
            return { type: 'column', object: column, handle: 'body' };
        }
    }
    
    return null;
}

function isPointInColumn(point, column) {
    // Döndürülmüş kare içi kontrolü
    const cx = column.center.x;
    const cy = column.center.y;
    const rot = -(column.rotation || 0) * Math.PI / 180; // Ters döndür
    
    // Noktayı kolonun koordinat sistemine çevir
    const dx = point.x - cx;
    const dy = point.y - cy;
    const localX = dx * Math.cos(rot) - dy * Math.sin(rot);
    const localY = dx * Math.sin(rot) + dy * Math.cos(rot);
    
    const halfSize = column.size / 2;
    return Math.abs(localX) <= halfSize && Math.abs(localY) <= halfSize;
}