import { state, dom } from './main.js';
import { getObjectAtPoint } from './actions.js';

// Yazı boyutunun zoom ile nasıl değişeceğini belirleyen üs (-0.7 yaklaşık olarak 10x zoomda yarı boyutu verir)
const ZOOM_EXPONENT = -0.4; 

function darkenColor(hex, percent) {
    let color = hex.startsWith('#') ? hex.slice(1) : hex;
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);
    r = parseInt(r * (100 - percent) / 100);
    g = parseInt(g * (100 - percent) / 100);
    b = parseInt(b * (100 - percent) / 100);
    r = (r < 0) ? 0 : r;
    g = (g < 0) ? 0 : g;
    b = (b < 0) ? 0 : b;
    const rStr = (r.toString(16).length < 2) ? '0' + r.toString(16) : r.toString(16);
    const gStr = (g.toString(16).length < 2) ? '0' + g.toString(16) : g.toString(16);
    const bStr = (b.toString(16).length < 2) ? '0' + b.toString(16) : b.toString(16);
    return `#${rStr}${gStr}${bStr}`;
}

export function drawRoomPolygons(ctx2d, state) {
    const {
        isDragging, draggedRoomInfo, rooms, roomFillColor, selectedRoom, zoom
    } = state;

    // Sürüklenen geçici mahal poligonlarını çiz
    if (isDragging && draggedRoomInfo.length > 0) {
        draggedRoomInfo.forEach(info => {
            const { tempPolygon } = info;
            const coords = tempPolygon.geometry.coordinates[0];
            if (coords.length >= 3) {
                ctx2d.fillStyle = darkenColor(roomFillColor, 20);
                ctx2d.strokeStyle = "rgba(138, 180, 248, 0.5)";
                ctx2d.lineWidth = 2 / zoom;
                ctx2d.beginPath();
                ctx2d.moveTo(coords[0][0], coords[0][1]);
                for (let i = 1; i < coords.length; i++) {
                    ctx2d.lineTo(coords[i][0], coords[i][1]);
                }
                ctx2d.closePath();
                ctx2d.fill();
                ctx2d.stroke();
            }
        });
    }

    const draggedRooms = isDragging && draggedRoomInfo.length > 0 
        ? new Set(draggedRoomInfo.map(info => info.room)) 
        : new Set();

    if (rooms.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.3)";
        ctx2d.lineWidth = 1 / zoom;
        rooms.forEach((room) => {
            // Sürükleniyorsa orijinal mahali çizme
            if (draggedRooms.has(room)) {
                return;
            }

            const coords = room.polygon.geometry.coordinates[0];
            if (coords.length < 3) return;

            if (room === selectedRoom) {
                ctx2d.fillStyle = darkenColor(roomFillColor, 20);
            } else {
                ctx2d.fillStyle = roomFillColor;
            }

            ctx2d.beginPath();
            ctx2d.moveTo(coords[0][0], coords[0][1]);
            for (let i = 1; i < coords.length; i++) ctx2d.lineTo(coords[i][0], coords[i][1]);
            ctx2d.closePath();
            ctx2d.fill();
            ctx2d.stroke();
        });
    }
}

export function drawRoomNames(ctx2d, state, getObjectAtPoint) {
     const {
        currentMode, isDragging, mousePos, rooms, dimensionOptions, zoom, draggedRoomInfo, dimensionMode
    } = state;

    if (rooms.length > 0) {
        ctx2d.textAlign = "center";
        
        const hoveredObject = currentMode === 'select' && !isDragging ? getObjectAtPoint(mousePos) : null;
        const hoveredRoom = (hoveredObject?.type === 'roomName' || hoveredObject?.type === 'roomArea') ? hoveredObject.object : null;
        
        const draggedRooms = isDragging && draggedRoomInfo.length > 0 
            ? new Set(draggedRoomInfo.map(info => info.room)) 
            : new Set();

        rooms.forEach((room) => {
             // Sürükleniyorsa orijinal mahal ismini/alanını çizme
            if (draggedRooms.has(room)) {
                return;
            }

            if (!room.center || !Array.isArray(room.center) || room.center.length < 2) return;
            const baseNameFontSize = 18, baseAreaFontSize = 14;

            const showAreaOption = dimensionOptions.showArea;
            const showArea = (showAreaOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) || 
                             (showAreaOption === 2 && dimensionMode === 1) ||
                             (showAreaOption === 3 && dimensionMode === 2);

            // Mahal adı ve alanı için YENİ MANTIK: Yazı boyutunu zoom'un üssü ile ölçekle
            let nameFontSize = baseNameFontSize * Math.pow(zoom, ZOOM_EXPONENT);
            let areaFontSize = baseAreaFontSize * Math.pow(zoom, ZOOM_EXPONENT);
            const minWorldNameFontSize = 3;
            const minWorldAreaFontSize = 2;

            // Alan gösteriliyorsa ismin Y ofsetini ayarla (oranı koru, zoom'a bölme)
            const baseNameYOffset = showArea ? 10 * Math.pow(zoom, ZOOM_EXPONENT) : 0; 
            
            const isHovered = hoveredRoom === room;
            
            if (isHovered) {
                ctx2d.shadowColor = 'rgba(138, 180, 248, 0.6)';
                ctx2d.shadowBlur = 8;
            }

            ctx2d.fillStyle = room.name === 'MAHAL' ? '#e57373' : '#8ab4f8';

            ctx2d.font = `500 ${Math.max(minWorldNameFontSize, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            
            const nameParts = room.name.split(' ');
            
            ctx2d.textBaseline = "middle";

            if (nameParts.length === 2) {
                 const currentFontSize = Math.max(minWorldNameFontSize, nameFontSize); // Gerçekte kullanılan font size
                 const lineGap = currentFontSize * 1.2; // Satır aralığını kullanılan boyuta göre ayarla
                 ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - baseNameYOffset - lineGap / 2);
                 ctx2d.fillText(nameParts[1], room.center[0], room.center[1] - baseNameYOffset + lineGap / 2);
            } else {
                ctx2d.fillText(room.name, room.center[0], room.center[1] - baseNameYOffset);
            }

            if (showArea) {
                ctx2d.fillStyle = '#e57373';
                ctx2d.font = `400 ${Math.max(minWorldAreaFontSize, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
                ctx2d.textBaseline = "middle";
                const text = `${room.area.toFixed(2)} m²`;
                
                const currentNameFontSize = Math.max(minWorldNameFontSize, nameFontSize); // Gerçek isim font size'ı
                const areaYOffset = nameParts.length === 2 ? currentNameFontSize * 1.5 : currentNameFontSize * 1.1; // Alanın Y ofsetini ismin boyutuna göre ayarla
                ctx2d.fillText(text, room.center[0], room.center[1] - baseNameYOffset + areaYOffset);
            }

            if (isHovered) {
                ctx2d.shadowColor = 'transparent';
                ctx2d.shadowBlur = 0;
            }
        });
    }

    // Sürüklenen geçici mahallerin isimlerini çiz
    if (isDragging && draggedRoomInfo.length > 0) {
        draggedRoomInfo.forEach(info => {
            const { room } = info;
            if (room.center && Array.isArray(room.center) && room.center.length >= 2) {
                ctx2d.textAlign = "center";
                ctx2d.fillStyle = room.name === 'MAHAL' ? '#e57373' : '#8ab4f8';
                const baseNameFontSize = 18;
                // YENİ MANTIK: Yazı boyutunu zoom'un üssü ile ölçekle
                let nameFontSize = baseNameFontSize * Math.pow(zoom, ZOOM_EXPONENT);
                const minWorldNameFontSize = 3;

                ctx2d.font = `500 ${Math.max(minWorldNameFontSize, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

                const showAreaOption = dimensionOptions.showArea;
                const showArea = (showAreaOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) || 
                                 (showAreaOption === 2 && dimensionMode === 1) ||
                                 (showAreaOption === 3 && dimensionMode === 2);
                
                 const baseNameYOffset = showArea ? 10 * Math.pow(zoom, ZOOM_EXPONENT) : 0; 

                ctx2d.textBaseline = "middle";
                ctx2d.fillText(room.name, room.center[0], room.center[1] - baseNameYOffset);
            }
        });
    }
}