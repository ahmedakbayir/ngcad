import { getRoomSelectedColor, getRoomFillColor, getAdjustedColor, isObjectInteractable, isLightMode} from '../general-files/main.js';
import { getObjectAtPoint } from '../general-files/actions.js';

// --- EKSİK SABİTİ EKLEYİN ---
// Yazı boyutunun zoom ile nasıl değişeceğini belirleyen üs (-0.4 yaklaşık olarak...)
const ZOOM_EXPONENT = -0.4;
// --- SABİT EKLENDİ ---

function darkenColor(hex, percent) {
    // ... (Bu fonksiyon aynı kalabilir) ...
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

// --- drawRoomPolygons FONKSİYONU ---
export function drawRoomPolygons(ctx2d, state) {
    const {
        isDragging, draggedRoomInfo, rooms, roomFillColor, selectedRoom, zoom,
        currentMode, mousePos,
        isDraggingRoomName // Sürüklenen mahal adı state'i
    } = state;

    // Çizim moduna göre renk ayarla (opacity yerine)
    const adjustedRoomColor = getAdjustedColor(roomFillColor, 'room');

    // Fare sürüklenmiyorsa ve seçim modundaysa, üzerine gelinen nesneyi bul
    const hoveredObject = (!isDragging && currentMode === 'select') ? getObjectAtPoint(mousePos) : null;
    // Sadece interaktif nesneler için hover göster (roomName modda interaktif olmalı)
    const hoveredRoom = (hoveredObject?.type === 'roomName' || hoveredObject?.type === 'roomArea')
        && isObjectInteractable('roomName')
        ? hoveredObject.object
        : null;

    // Sürüklenen geçici mahal poligonlarını çiz (duvar sürükleme için)
    if (isDragging && draggedRoomInfo && draggedRoomInfo.length > 0) {
        draggedRoomInfo.forEach(info => {
            const { tempPolygon } = info;
            if (tempPolygon?.geometry?.coordinates && tempPolygon.geometry.coordinates[0]) {
                const coords = tempPolygon.geometry.coordinates[0];
                if (coords.length >= 3) {
                    ctx2d.fillStyle = darkenColor(adjustedRoomColor, 20);
                    ctx2d.strokeStyle = "rgba(138, 180, 248, 0.5)";
                    ctx2d.lineWidth = 2 / zoom;
                    ctx2d.beginPath();
                    if (Array.isArray(coords[0]) && coords[0].length >= 2) {
                        ctx2d.moveTo(coords[0][0], coords[0][1]);
                        for (let i = 1; i < coords.length; i++) {
                            if (Array.isArray(coords[i]) && coords[i].length >= 2) {
                                ctx2d.lineTo(coords[i][0], coords[i][1]);
                            }
                        }
                        ctx2d.closePath();
                        ctx2d.fill();
                        ctx2d.stroke();
                    }
                }
            }
        });
    }

    // Sürüklenen odaların kümesini oluştur (duvar sürükleme için)
    const draggedRooms = (isDragging && draggedRoomInfo && draggedRoomInfo.length > 0)
        ? new Set(draggedRoomInfo.map(info => info.room))
        : new Set();

    // Mevcut mahalleleri çiz
    if (rooms && rooms.length > 0) {
        ctx2d.strokeStyle = "rgba(138, 180, 248, 0.3)";
        ctx2d.lineWidth = 1 / zoom;
        rooms.forEach((room) => {
            // Duvar sürükleniyorsa orijinal mahali çizme
            if (draggedRooms.has(room)) {
                return;
            }

            // Poligon ve koordinatların varlığını kontrol et
            if (!room.polygon?.geometry?.coordinates || !room.polygon.geometry.coordinates[0]) return;

            const coords = room.polygon.geometry.coordinates[0];
            if (coords.length < 3) return;

            // DOLGU RENGİNİ AYARLAMA
            // Eğer bu oda, adı sürüklenen oda ise VEYA fare bu odanın adının üzerindeyse VEYA bu oda seçili ise vurgu rengini kullan
            if (room === isDraggingRoomName || room === hoveredRoom || room === selectedRoom) {
                ctx2d.fillStyle = getRoomSelectedColor(); // Vurgu rengi
            } else {
                ctx2d.fillStyle = adjustedRoomColor; // Normal renk (mod'a göre ayarlanmış)
            }

            ctx2d.beginPath();
            if (Array.isArray(coords[0]) && coords[0].length >= 2) {
                ctx2d.moveTo(coords[0][0], coords[0][1]);
                for (let i = 1; i < coords.length; i++) {
                    if (Array.isArray(coords[i]) && coords[i].length >= 2) {
                        ctx2d.lineTo(coords[i][0], coords[i][1]);
                    }
                }
                ctx2d.closePath();
                ctx2d.fill();
                ctx2d.stroke();
            }
        });
    }
}
// --- drawRoomPolygons FONKSİYONU SONU ---


// --- drawRoomNames FONKSİYONU ---
export function drawRoomNames(ctx2d, state, getObjectAtPoint) {
     const {
        currentMode, isDragging, mousePos, rooms, dimensionOptions, zoom, draggedRoomInfo, dimensionMode, isDraggingRoomName
    } = state;

    // rooms null veya boşsa çık
    if (!rooms || rooms.length === 0) return;

    ctx2d.textAlign = "center";

    // Fare sürüklenmiyorsa ve seçim modundaysa üzerine gelinen nesneyi bul
    const hoveredObject = (!isDragging && currentMode === 'select' && mousePos) ? getObjectAtPoint(mousePos) : null;
    // Sadece interaktif nesneler için hover göster (roomName modda interaktif olmalı)
    const hoveredRoom = (hoveredObject?.type === 'roomName' || hoveredObject?.type === 'roomArea')
        && isObjectInteractable('roomName')
        ? hoveredObject.object
        : null;

    // Sürüklenen odaların kümesini oluştur (duvar sürükleme için)
    const draggedRooms = (isDragging && draggedRoomInfo && draggedRoomInfo.length > 0)
        ? new Set(draggedRoomInfo.map(info => info.room))
        : new Set();

    rooms.forEach((room) => {
         // Duvar sürükleniyorsa orijinal mahal ismini/alanını çizme
        if (draggedRooms.has(room)) {
            return;
        }

        // room.center geçerli mi kontrol et
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2 || typeof room.center[0] !== 'number' || typeof room.center[1] !== 'number') return;

        const baseNameFontSize = 15, baseAreaFontSize = 12;

        const showAreaOption = dimensionOptions.showArea;
        const showArea = (showAreaOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) ||
                         (showAreaOption === 2 && dimensionMode === 1) ||
                         (showAreaOption === 3 && dimensionMode === 2);

        // Mahal adı ve alanı için Yazı boyutunu zoom'un üssü ile ölçekle
        let nameFontSize = baseNameFontSize * Math.pow(zoom, ZOOM_EXPONENT); // ZOOM_EXPONENT burada tanımlı olmalı
        let areaFontSize = baseAreaFontSize * Math.pow(zoom, ZOOM_EXPONENT); // ZOOM_EXPONENT burada tanımlı olmalı
        const minWorldNameFontSize = 3;
        const minWorldAreaFontSize = 2;

        // Alan gösteriliyorsa ismin Y ofsetini ayarla
        const baseNameYOffset = showArea ? 10 * Math.pow(zoom, ZOOM_EXPONENT) : 0; // ZOOM_EXPONENT burada tanımlı olmalı

        // Gölge efekti
        const isHoveredOrDraggingName = hoveredRoom === room || room === isDraggingRoomName;
        if (isHoveredOrDraggingName) {
            ctx2d.shadowColor = isLightMode() ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
            ctx2d.shadowBlur = 8 / zoom; // Gölgeyi zoom'a göre ayarla
        }

        // Çizim moduna göre renk ayarla
        const baseNameColor = room.name === 'MAHAL' ? '#e57373' : '#84868aff';
        const adjustedNameColor = getAdjustedColor(baseNameColor, 'roomName');
        ctx2d.fillStyle = adjustedNameColor;

        ctx2d.font = `500 ${Math.max(minWorldNameFontSize, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

        const nameParts = room.name ? room.name.split(' ') : ['MAHAL']; // room.name null/undefined ise varsayılan ata

        ctx2d.textBaseline = "middle";

        if (nameParts.length === 2) {
             const currentFontSize = Math.max(minWorldNameFontSize, nameFontSize);
             const lineGap = currentFontSize * 1.2;
             ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - baseNameYOffset - lineGap / 2);
             ctx2d.fillText(nameParts[1], room.center[0], room.center[1] - baseNameYOffset + lineGap / 2);
        } else {
            ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - baseNameYOffset);
        }

        if (showArea) {
            // Çizim moduna göre alan metni rengi ayarla
            const adjustedAreaColor = getAdjustedColor('#e57373', 'roomName');
            ctx2d.fillStyle = adjustedAreaColor;
            ctx2d.font = `400 ${Math.max(minWorldAreaFontSize, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
            ctx2d.textBaseline = "middle";
            const text = (typeof room.area === 'number') ? `${room.area.toFixed(2)} m²` : '? m²';

            const currentNameFontSize = Math.max(minWorldNameFontSize, nameFontSize);
            const areaYOffset = nameParts.length === 2 ? currentNameFontSize * 1.5 : currentNameFontSize * 1.1;
            ctx2d.fillText(text, room.center[0], room.center[1] - baseNameYOffset + areaYOffset);
        }

        // Gölgeyi temizle
        if (isHoveredOrDraggingName) {
            ctx2d.shadowColor = 'transparent';
            ctx2d.shadowBlur = 0;
        }
    });


    // --- SÜRÜKLENEN ODA ADI İÇİN ÇİZİM ---
    // SADECE mahal adı sürükleniyorsa çiz (duvar sürükleme değil)
    if (isDraggingRoomName && !draggedRoomInfo) {
        const room = isDraggingRoomName;
         // room.center geçerli mi kontrol et
        if (room.center && Array.isArray(room.center) && room.center.length >= 2 && typeof room.center[0] === 'number') {
            ctx2d.textAlign = "center";
            // Çizim moduna göre renk ayarla
            const baseNameColor = room.name === 'MAHAL' ? '#e57373' : '#8ab4f8';
            const adjustedNameColor = getAdjustedColor(baseNameColor, 'roomName');
            ctx2d.fillStyle = adjustedNameColor;
            const baseNameFontSize = 18;
            let nameFontSize = baseNameFontSize * Math.pow(zoom, ZOOM_EXPONENT); // ZOOM_EXPONENT burada tanımlı olmalı
            const minWorldNameFontSize = 3;

            // Gölge ekle (sürüklenirken)
            ctx2d.shadowColor = isLightMode() ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.6)';
            ctx2d.shadowBlur = 8 / zoom;

            ctx2d.font = `500 ${Math.max(minWorldNameFontSize, nameFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;

            const showAreaOption = dimensionOptions.showArea;
            const showArea = (showAreaOption === 1 && (dimensionMode === 1 || dimensionMode === 2)) ||
                             (showAreaOption === 2 && dimensionMode === 1) ||
                             (showAreaOption === 3 && dimensionMode === 2);

             const baseNameYOffset = showArea ? 10 * Math.pow(zoom, ZOOM_EXPONENT) : 0; // ZOOM_EXPONENT burada tanımlı olmalı

            ctx2d.textBaseline = "middle";

             const nameParts = room.name ? room.name.split(' ') : ['MAHAL'];
             if (nameParts.length === 2) {
                 const currentFontSize = Math.max(minWorldNameFontSize, nameFontSize);
                 const lineGap = currentFontSize * 1.2;
                 ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - baseNameYOffset - lineGap / 2);
                 ctx2d.fillText(nameParts[1], room.center[0], room.center[1] - baseNameYOffset + lineGap / 2);
             } else {
                 ctx2d.fillText(nameParts[0], room.center[0], room.center[1] - baseNameYOffset);
             }


             // Alanı da çiz
             if (showArea && typeof room.area === 'number') {
                 // Çizim moduna göre alan metni rengi ayarla
                 const adjustedAreaColor = getAdjustedColor('#e57373', 'roomName');
                 ctx2d.fillStyle = adjustedAreaColor;
                 const baseAreaFontSize = 14;
                 let areaFontSize = baseAreaFontSize * Math.pow(zoom, ZOOM_EXPONENT); // ZOOM_EXPONENT burada tanımlı olmalı
                 const minWorldAreaFontSize = 2;
                 ctx2d.font = `400 ${Math.max(minWorldAreaFontSize, areaFontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
                 const text = `${room.area.toFixed(2)} m²`;
                 const currentNameFontSize = Math.max(minWorldNameFontSize, nameFontSize);
                 const areaYOffset = (nameParts.length === 2 ? currentNameFontSize * 1.5 : currentNameFontSize * 1.1);
                 ctx2d.fillText(text, room.center[0], room.center[1] - baseNameYOffset + areaYOffset);
             }

             // Gölgeyi temizle
            ctx2d.shadowColor = 'transparent';
            ctx2d.shadowBlur = 0;
        }
    }
    // --- SÜRÜKLENEN ODA ADI SONU ---
}
// --- drawRoomNames FONKSİYONU SONU ---