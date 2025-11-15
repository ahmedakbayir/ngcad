// draw-plumbing-snap.js
// TESİSAT SNAP HATLARINI GÖRSELLEŞTİRME (Debug/Test için)

import { state, dom } from '../general-files/main.js';

/**
 * Duvar yüzey snap hatlarını çizer (Kırmızı kesikli çizgiler)
 * Tesisat modu aktifken görünür
 */
export function drawPlumbingSnapLines() {
    const { ctx2d } = dom;
    const { zoom, currentMode, isDragging, selectedObject } = state;
    
    // Sadece tesisat modlarında göster
    const isPlumbingMode = currentMode === 'drawPlumbingPipe' || 
                          currentMode === 'drawPlumbingBlock' ||
                          currentMode === 'drawValve' ||
                          (isDragging && selectedObject && 
                           (selectedObject.type === 'plumbingPipe' || 
                            selectedObject.type === 'plumbingBlock' ||
                            selectedObject.type === 'valve'));
    
    if (!isPlumbingMode) return; // Tesisat modu değilse çizme
    
    const currentFloorId = state.currentFloor?.id;
    const walls = currentFloorId
        ? (state.walls || []).filter(w => w.floorId === currentFloorId)
        : (state.walls || []);
    
    const PLUMBING_OFFSET = 3; // 3 cm offset
    const EXTENSION_LENGTH = 50; // Her iki uçtan 50 cm uzatma
    
    ctx2d.save();
    ctx2d.strokeStyle = 'rgba(255, 0, 0, 0.4)'; // Kırmızı, yarı saydam
    ctx2d.lineWidth = 1 / zoom;
    ctx2d.setLineDash([8 / zoom, 4 / zoom]); // Kesikli çizgi
    
    walls.forEach(wall => {
        if (!wall.p1 || !wall.p2) return;
        
        const wallThickness = wall.thickness || state.wallThickness;
        const halfThickness = wallThickness / 2;
        
        // Duvar yönü ve normal vektörü
        const dx = wall.p2.x - wall.p1.x;
        const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) return;
        
        // Normalize edilmiş yön vektörleri
        const dirX = dx / len;
        const dirY = dy / len;
        const nx = -dy / len;
        const ny = dx / len;
        
        // Offset = duvar kalınlığı/2 + 3 cm
        const offset = halfThickness + PLUMBING_OFFSET;
        
        // Snap hatlarını her iki uçtan uzat (kesişimleri göstermek için)
        const extendedP1 = {
            x: wall.p1.x - dirX * EXTENSION_LENGTH,
            y: wall.p1.y - dirY * EXTENSION_LENGTH
        };
        const extendedP2 = {
            x: wall.p2.x + dirX * EXTENSION_LENGTH,
            y: wall.p2.y + dirY * EXTENSION_LENGTH
        };
        
        // Snap hattı 1 - UZATILMIŞ
        const line1_p1 = { x: extendedP1.x + nx * offset, y: extendedP1.y + ny * offset };
        const line1_p2 = { x: extendedP2.x + nx * offset, y: extendedP2.y + ny * offset };
        
        ctx2d.beginPath();
        ctx2d.moveTo(line1_p1.x, line1_p1.y);
        ctx2d.lineTo(line1_p2.x, line1_p2.y);
        ctx2d.stroke();
        
        // Snap hattı 2 - UZATILMIŞ
        const line2_p1 = { x: extendedP1.x - nx * offset, y: extendedP1.y - ny * offset };
        const line2_p2 = { x: extendedP2.x - nx * offset, y: extendedP2.y - ny * offset };
        
        ctx2d.beginPath();
        ctx2d.moveTo(line2_p1.x, line2_p1.y);
        ctx2d.lineTo(line2_p2.x, line2_p2.y);
        ctx2d.stroke();
    });
    
    ctx2d.restore();
}