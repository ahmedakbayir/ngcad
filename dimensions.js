import { state, dom } from './main.js';
import { screenToWorld } from './geometry.js';

// Yazı boyutunun zoom ile nasıl değişeceğini belirleyen üs (-0.7 yaklaşık olarak 10x zoomda yarı boyutu verir)
const ZOOM_EXPONENT = -0.65; 

export function drawDimension(p1, p2, isPreview = false, mode = 'single') {
    const { ctx2d } = dom;
    const { zoom, gridOptions, dimensionOptions, walls } = state;

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthCm = Math.hypot(dx, dy);
    if (lengthCm < 1) return;

    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    const roundedLength = Math.round(lengthCm / gridSpacing) * gridSpacing;
    const displayText = `${Math.round(roundedLength)}`;

    // Duvarı bul (p1 ve p2'ye sahip duvar)
    const wall = walls.find(w => 
        (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1)
    );
    const wallThickness = wall?.thickness || 20;

    // Normal vektör hesapla
    const nx = -dy / lengthCm;
    const ny = dx / lengthCm;

    // Özet görünümle aynı mantık: Sol ve üst için yakın, sağ ve alt için uzak
    let actualOffset;
    if (nx < 0 || ny < 0) {
        // Sol veya üst - yakın
        actualOffset = wallThickness / 2 + 5; 
    } else {
        // Sağ veya alt - uzak
        actualOffset = wallThickness / 2 + 18;
    }

    // Metin pozisyonu
    const midX = (p1.x + p2.x) / 2 + nx * actualOffset;
    const midY = (p1.y + p2.y) / 2 + ny * actualOffset;
    
    let ang = Math.atan2(dy, dx);
    const epsilon = 0.001;

    if (Math.abs(dx) < epsilon) {
        ang = -Math.PI / 2;
    } else if (Math.abs(ang) > Math.PI / 2) {
        ang += Math.PI;
    }

    ctx2d.save();
    ctx2d.translate(midX, midY);
    ctx2d.rotate(ang);

    const baseFontSize = dimensionOptions.fontSize;
    
    // YENİ MANTIK: Yazı boyutunu zoom'un üssü ile ölçekle
    let fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);

    // Minimum *dünya* boyutunu ayarla (ekran boyutu değil)
    const minWorldFontSize = 5; // En küçük yazı boyutu (dünya biriminde)
    
    ctx2d.font = `400 ${Math.max(minWorldFontSize, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    
    ctx2d.fillStyle = isPreview ? "#8ab4f8" : dimensionOptions.color;
    
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText(displayText, 0, 0);
    ctx2d.restore();
}


export function drawTotalDimensions() {
    const { ctx2d } = dom;
    const { zoom, rooms, walls, gridOptions, dimensionOptions } = state;

    if (rooms.length === 0) return;

    const baseFontSize = dimensionOptions.fontSize;
    // YENİ MANTIK: Yazı boyutunu zoom'un üssü ile ölçekle
    const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
    const minWorldFontSize = 10; // Özet görünüm için biraz daha büyük minimum

    ctx2d.font = `400 ${Math.max(minWorldFontSize, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.fillStyle = dimensionOptions.color;

    const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;
    const TOLERANCE = 1;

    // Duvarların kaç odaya ait olduğunu saymak için bir harita
    const wallAdjacency = new Map();
    walls.forEach(wall => wallAdjacency.set(wall, 0));

    rooms.forEach(room => {
        if (!room.polygon || !room.polygon.geometry) return;
        const coords = room.polygon.geometry.coordinates[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const p1Coord = coords[i];
            const p2Coord = coords[i + 1];
            const wall = walls.find(w => {
                const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                return Math.min(d1, d2) < TOLERANCE;
            });
            if (wall) {
                wallAdjacency.set(wall, wallAdjacency.get(wall) + 1);
            }
        }
    });

    // Sadece 1 odaya bitişik olan (yani dış) duvarları ölç
    walls.forEach(wall => {
        if (wallAdjacency.get(wall) === 1) {
            const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (length < 1) return;

            const roundedLength = Math.round(length / gridSpacing) * gridSpacing;
            const midX = (wall.p1.x + wall.p2.x) / 2;
            const midY = (wall.p1.y + wall.p2.y) / 2;

            const isHorizontal = Math.abs(wall.p1.y - wall.p2.y) < TOLERANCE;

            // Duvarın "dış" tarafını bulmak için normal vektörü kullan
            const dx = wall.p2.x - wall.p1.x;
            const dy = wall.p2.y - wall.p1.y;
            const nx = -dy / length; // Normal vektör x
            const ny = dx / length;  // Normal vektör y

            // --- YENİ MANTIK ---
            
            // 1. Dışa doğru yönü bul
            const testDistance = 1.0;
            const testX = midX + nx * testDistance;
            const testY = midY + ny * testDistance;
            
            let isOutside = true;
            for(const room of rooms) {
                if (turf.booleanPointInPolygon([testX, testY], room.polygon)) {
                    isOutside = false;
                    break;
                }
            }
            
            // 2. Normal vektörün yönüne göre offset'i ayarla
            let offset;
            if (isHorizontal) {
                // Yatay duvar. Normal Y yönündedir (ny).
                if (ny < 0) { // ny < 0 -> Normal UP -> ÜST DUVAR
                    offset = 30;
                } else { // ny > 0 -> Normal DOWN -> ALT DUVAR
                    offset = 10;
                }
            } else { // Dikey Duvar
                // Dikey duvar. Normal X yönündedir (nx).
                if (nx > 0) { // nx > 0 -> Normal RIGHT -> SOL DUVAR
                    offset = 10;
                } else { // nx < 0 -> Normal LEFT -> SAĞ DUVAR
                    offset = 30;
                }
            }
            
            // 3. Yönü ve yeni atanan offset'i birleştir
            const finalOffset = isOutside ? offset : -offset;

            // --- YENİ MANTIK SONU ---

            if (isHorizontal) {
                ctx2d.textAlign = "center";
                // Düzeltilmiş Hizalama:
                ctx2d.textBaseline = isOutside ? "top" : "bottom";
                ctx2d.fillText(roundedLength.toString(), midX, midY + finalOffset * (ny > 0 ? 1 : -1));

            } else { // Dikey
                ctx2d.save();
                ctx2d.translate(midX + finalOffset * (nx > 0 ? 1 : -1), midY);
                ctx2d.rotate(-Math.PI / 2);
                ctx2d.textAlign = "center";
                
                // Düzeltilmiş Hizalama:
                if (isOutside) { // Sol Duvar
                    ctx2d.textBaseline = "top";
                } else { // Sağ Duvar
                    ctx2d.textBaseline = "bottom";
                }
                
                ctx2d.fillText(roundedLength.toString(), 0, 0);
                ctx2d.restore();
            }
        }
    });
}


export function drawOuterDimensions() {
    const { ctx2d } = dom;
    const { zoom, walls, gridOptions, dimensionOptions, dimensionMode } = state;

    const showOuterOption = dimensionOptions.showOuter;
    const showOuter = (showOuterOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) || 
                      (showOuterOption === 2 && dimensionMode === 1) ||
                      (showOuterOption === 3 && dimensionMode === 2);

    if (showOuter && walls.length > 0) {
        const allX = walls.flatMap(w => [w.p1.x, w.p2.x]);
        const allY = walls.flatMap(w => [w.p1.y, w.p2.y]);
        
        const minX = Math.min(...allX);
        const maxX = Math.max(...allX);
        const minY = Math.min(...allY);
        const maxY = Math.max(...allY);
        
        const totalWidth = maxX - minX;
        const totalHeight = maxY - minY;
        
        const dimLineOffset = 60;
        const extensionOvershoot = 8;
        const extensionLineLength = dimLineOffset + extensionOvershoot;
        
        ctx2d.strokeStyle = dimensionOptions.color;
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.lineWidth = 1 / zoom;
        
        const baseFontSize = dimensionOptions.fontSize;
        // YENİ MANTIK: Yazı boyutunu zoom'un üssü ile ölçekle
        const fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
        const minWorldFontSize = 5; 
        
        const gridSpacing = gridOptions.visible ? gridOptions.spacing : 1;

        const topDimY = minY - dimLineOffset;
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, minY);
        ctx2d.lineTo(minX, minY - extensionLineLength);
        ctx2d.moveTo(maxX, minY);
        ctx2d.lineTo(maxX, minY - extensionLineLength);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, topDimY);
        ctx2d.lineTo(maxX, topDimY);
        ctx2d.stroke();
        
        const arrowSize = 4;
        ctx2d.beginPath();
        ctx2d.moveTo(minX, topDimY);
        ctx2d.lineTo(minX + arrowSize, topDimY - arrowSize/2);
        ctx2d.lineTo(minX + arrowSize, topDimY + arrowSize/2);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.beginPath();
        ctx2d.moveTo(maxX, topDimY);
        ctx2d.lineTo(maxX - arrowSize, topDimY - arrowSize/2);
        ctx2d.lineTo(maxX - arrowSize, topDimY + arrowSize/2);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.font = `400 ${Math.max(minWorldFontSize, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        
        const roundedWidth = Math.round(totalWidth / gridSpacing) * gridSpacing;
        ctx2d.fillText(Math.round(roundedWidth).toString(), (minX + maxX) / 2, topDimY - 5);
        
        const leftDimX = minX - dimLineOffset;
        
        ctx2d.strokeStyle = dimensionOptions.color;
        ctx2d.fillStyle = dimensionOptions.color;
        ctx2d.lineWidth = 1 / zoom;
        
        ctx2d.beginPath();
        ctx2d.moveTo(minX, minY);
        ctx2d.lineTo(minX - extensionLineLength, minY);
        ctx2d.moveTo(minX, maxY);
        ctx2d.lineTo(minX - extensionLineLength, maxY);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, minY);
        ctx2d.lineTo(leftDimX, maxY);
        ctx2d.stroke();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, minY);
        ctx2d.lineTo(leftDimX - arrowSize/2, minY + arrowSize);
        ctx2d.lineTo(leftDimX + arrowSize/2, minY + arrowSize);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.beginPath();
        ctx2d.moveTo(leftDimX, maxY);
        ctx2d.lineTo(leftDimX - arrowSize/2, maxY - arrowSize);
        ctx2d.lineTo(leftDimX + arrowSize/2, maxY - arrowSize);
        ctx2d.closePath();
        ctx2d.fill();
        
        ctx2d.fillStyle = dimensionOptions.color;
        const roundedHeight = Math.round(totalHeight / gridSpacing) * gridSpacing;
        ctx2d.save();
        ctx2d.translate(leftDimX - 5, (minY + maxY) / 2);
        ctx2d.rotate(-Math.PI / 2);
        ctx2d.textAlign = "center";
        ctx2d.textBaseline = "bottom";
        ctx2d.fillText(Math.round(roundedHeight).toString(), 0, 0);
        ctx2d.restore();
    }
}