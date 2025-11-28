// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/renderer2d.js

import { screenToWorld, distToSegmentSquared, getLineIntersectionPoint } from './geometry.js';
import { getColumnCorners, isPointInColumn } from '../architectural-objects/columns.js';
import { getBeamCorners } from '../architectural-objects/beams.js';
import { getStairCorners } from '../architectural-objects/stairs.js';
import { state, dom, BG, WINDOW_BOTTOM_HEIGHT, WINDOW_TOP_HEIGHT, getAdjustedColor } from '../general-files/main.js'; // Sabitleri ve renk ayarlama fonksiyonunu import et

// Node'a bağlı duvar sayısını çizer (Şu an içeriği boş veya yorumlanmış)
export function drawNodeWallCount(node) {
    const { ctx2d } = dom;
    const { walls, zoom } = state;
    const connectedWalls = walls.filter(w => w.p1 === node || w.p2 === node);
    const wallCount = connectedWalls.length;
    // if (wallCount <= 1) return;
    // ... (Çizim kodu eklenebilir)
}

// Kapı sembolünü çizer
export function drawDoorSymbol(door, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { wallBorderColor, lineThickness } = state;

    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) {
        return; // Geçersiz kapı/duvar ise çık
    }
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return; // Çok kısa duvar ise çık
    // Duvar yön vektörleri
    const dx = (wall.p2.x - wall.p1.x) / wallLen, dy = (wall.p2.y - wall.p1.y) / wallLen; // Yön
    const nx = -dy, ny = dx; // Normal
    // Kapı başlangıç ve bitiş pozisyonları (duvar üzerinde)
    const startPos = door.pos - door.width / 2, endPos = door.pos + door.width / 2;
    // Kapı köşe noktaları (dünya koordinatları)
    const doorP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const doorP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = wall.thickness || state.wallThickness; // Duvar kalınlığı
    const halfWall = wallPx / 2; // Yarı kalınlık

    // Çizim moduna göre renk ayarla
    const adjustedWallBorderColor = getAdjustedColor(wallBorderColor, 'door');

    // Renk belirleme
    let color;
    if (isPreview) {
        color = "#8ab4f8"; // Önizleme rengi
    } else if (isSelected) {
        color = "#8ab4f8"; // Seçili rengi
    } else {
        // Normal renk (duvar rengi %80 opaklıkta)
        const hex = adjustedWallBorderColor.startsWith('#') ? adjustedWallBorderColor.slice(1) : adjustedWallBorderColor;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        color = `rgba(${r}, ${g}, ${b}, 0.6`;
    }
    // Çizim ayarları
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 1.5; // Biraz daha ince çizgi
    const inset = lineThickness / 4; // İçeri çekme miktarı

    // Kapı kasası yan çizgileri için hesaplamalar
    const insetRatio = 1 / 3; // Kasa çizgilerinin duvara oranı
    const jamb_vec_x = nx * halfWall * 2; // Kasa vektörü X
    const jamb_vec_y = ny * halfWall * 2; // Kasa vektörü Y
    // Kasa çizgilerinin başlangıç/bitiş noktaları
    const p_line1_start = { x: doorP1.x - nx * halfWall + jamb_vec_x * insetRatio, y: doorP1.y - ny * halfWall + jamb_vec_y * insetRatio };
    const p_line1_end = { x: doorP2.x - nx * halfWall + jamb_vec_x * insetRatio, y: doorP2.y - ny * halfWall + jamb_vec_y * insetRatio };
    const p_line2_start = { x: doorP1.x - nx * halfWall + jamb_vec_x * (1 - insetRatio), y: doorP1.y - ny * halfWall + jamb_vec_y * (1 - insetRatio) };
    const p_line2_end = { x: doorP2.x - nx * halfWall + jamb_vec_x * (1 - insetRatio), y: doorP2.y - ny * halfWall + jamb_vec_y * (1 - insetRatio) };

    // Kapı başlık/eşik çizgileri için hesaplamalar (inset uygulanmış)
    const doorP1_inset = { x: doorP1.x + dx * inset, y: doorP1.y + dy * inset };
    const doorP2_inset = { x: doorP2.x - dx * inset, y: doorP2.y - dy * inset };
    // Başlık/eşik çizgilerinin başlangıç/bitiş noktaları
    const jamb1_start = { x: doorP1_inset.x - nx * halfWall, y: doorP1_inset.y - ny * halfWall };
    const jamb1_end = { x: doorP1_inset.x + nx * halfWall, y: doorP1_inset.y + ny * halfWall };
    const jamb2_start = { x: doorP2_inset.x - nx * halfWall, y: doorP2_inset.y - ny * halfWall };
    const jamb2_end = { x: doorP2_inset.x + nx * halfWall, y: doorP2_inset.y + ny * halfWall };

    // --- YENİ EKLENEN DOLGU KODU ---
    // Kapının "ortasındaki" (iç pervazlar arasındaki) bölgeyi doldur
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.moveTo(p_line1_start.x, p_line1_start.y);
    ctx2d.lineTo(p_line1_end.x, p_line1_end.y);
    ctx2d.lineTo(p_line2_end.x, p_line2_end.y);
    ctx2d.lineTo(p_line2_start.x, p_line2_start.y);
    ctx2d.closePath();
    ctx2d.fill();
    // --- YENİ KOD SONU ---

    // Çizim işlemi
    ctx2d.beginPath();
    // Kasa yan çizgileri
    ctx2d.moveTo(p_line1_start.x, p_line1_start.y); ctx2d.lineTo(p_line1_end.x, p_line1_end.y);
    ctx2d.moveTo(p_line2_start.x, p_line2_start.y); ctx2d.lineTo(p_line2_end.x, p_line2_end.y);
    // Başlık/eşik çizgileri
    ctx2d.moveTo(jamb1_start.x, jamb1_start.y);
    ctx2d.lineTo(jamb1_end.x, jamb1_end.y);
    ctx2d.moveTo(jamb2_start.x, jamb2_start.y);
    ctx2d.lineTo(jamb2_end.x, jamb2_end.y);
    ctx2d.stroke(); // Çizgileri çiz

}

// --- GÜNCELLENMİŞ Pencere Sembolü Çizimi ---
export function drawWindowSymbol(wall, window, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { selectedObject, wallBorderColor, lineThickness, zoom } = state; // zoom eklendi

    if (!wall || !wall.p1 || !wall.p2) {
        return;
    }
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; const nx = -dy, ny = dx;
    const startPos = window.pos - window.width / 2; const endPos = window.pos + window.width / 2;
    const windowP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos }; const windowP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = wall.thickness || state.wallThickness; const halfWall = wallPx / 2;
    const isSelectedCalc = isSelected || (selectedObject?.type === "window" && selectedObject.object === window);

    // Çizim moduna göre renk ayarla
    const baseWindowColor = "rgba(230, 234, 255, 0.26)";
    const adjustedWindowColor = getAdjustedColor(baseWindowColor, 'window');

    let color;
    if (isPreview) { color = "#8ab4f8"; } else if (isSelectedCalc) { color = "#8ab4f8"; } else {
        color = adjustedWindowColor;
    }
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 2 / zoom; // zoom'a böl
    const inset = lineThickness / 4 / zoom; // zoom'a böl

    // --- YENİ BÖLME MANTIĞI ---
    const windowWidthCm = window.width;
    const targetPaneWidth = 45; // 40-50 cm arası hedef
    const mullionWidthCm = 5; // Kayıt kalınlığı (cm) - sabit veya ayarlanabilir

    // Alt bölme sayısı
    let numBottomPanes = Math.max(1, Math.round(windowWidthCm / targetPaneWidth));
    // Alt bölme genişliği (kayıtları çıkararak)
    let bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidthCm) / numBottomPanes;

    // Eğer bölme genişliği çok küçük veya çok büyükse, bölme sayısını ayarla
    const minPaneWidth = 40;
    const maxPaneWidth = 50;
    if (bottomPaneWidth < minPaneWidth && numBottomPanes > 1) {
        numBottomPanes--;
        bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidthCm) / numBottomPanes;
    } else if (bottomPaneWidth > maxPaneWidth) {
        numBottomPanes++;
        bottomPaneWidth = (windowWidthCm - (numBottomPanes + 1) * mullionWidthCm) / numBottomPanes;
    }
     // Eğer hala minimumun altındaysa (tek bölme durumu), genişliği pencere genişliği yap
     if (numBottomPanes === 1 && bottomPaneWidth < minPaneWidth){
         bottomPaneWidth = windowWidthCm - 2*mullionWidthCm; // İki kenar kaydı
     }


    // Üst bölme sayısı (alt ile aynı)
    const numTopPanes = numBottomPanes;
    // Üst bölme genişliği (alt ile aynı) - ama kayıt pozisyonları farklı olacak
    let topPaneWidth = bottomPaneWidth; // Genişlik aynı

    // Dikey kayıtların X pozisyonları (pencerenin local X ekseninde, başlangıçtan itibaren)
    const bottomMullionPositions = [];
    let currentX = mullionWidthCm; // İlk kayıt
    for (let i = 0; i < numBottomPanes -1; i++) { // n bölme için n-1 kayıt
        currentX += bottomPaneWidth;
        bottomMullionPositions.push(currentX);
        currentX += mullionWidthCm;
    }

    // --- ÇİZİM KODU (YENİ BÖLMELERLE) ---

    // Dıştaki iki paralel çizgi (değişiklik yok)
    const line1_start = { x: windowP1.x - nx * (halfWall - inset), y: windowP1.y - ny * (halfWall - inset) };
    const line1_end = { x: windowP2.x - nx * (halfWall - inset), y: windowP2.y - ny * (halfWall - inset) };
    const line4_start = { x: windowP1.x + nx * (halfWall - inset), y: windowP1.y + ny * (halfWall - inset) };
    const line4_end = { x: windowP2.x + nx * (halfWall - inset), y: windowP2.y + ny * (halfWall - inset) };

    // İçteki iki paralel çizgi (ortadaki camı temsil eder gibi)
    const offsetInner = halfWall * 0.8; // Cam çizgileri için daha küçük offset
    const line2_start = { x: windowP1.x - nx * offsetInner, y: windowP1.y - ny * offsetInner };
    const line2_end = { x: windowP2.x - nx * offsetInner, y: windowP2.y - ny * offsetInner };
    const line3_start = { x: windowP1.x + nx * offsetInner, y: windowP1.y + ny * offsetInner };
    const line3_end = { x: windowP2.x + nx * offsetInner, y: windowP2.y + ny * offsetInner };


    // Pencere kenarlarını birleştiren kısa çizgiler (değişiklik yok)
    const windowP1_inset = { x: windowP1.x + dx * inset, y: windowP1.y + dy * inset };
    const windowP2_inset = { x: windowP2.x - dx * inset, y: windowP2.y - dy * inset };
    const left1 = { x: windowP1_inset.x - nx * (halfWall - inset), y: windowP1_inset.y - ny * (halfWall - inset) };
    const left2 = { x: windowP1_inset.x + nx * (halfWall - inset), y: windowP1_inset.y + ny * (halfWall - inset) };
    const right1 = { x: windowP2_inset.x - nx * (halfWall - inset), y: windowP2_inset.y - ny * (halfWall - inset) };
    const right2 = { x: windowP2_inset.x + nx * (halfWall - inset), y: windowP2_inset.y + ny * (halfWall - inset) };

    // Dolgu (sadece iç bölge)
    ctx2d.fillStyle = color;
    ctx2d.beginPath();
    ctx2d.moveTo(line2_start.x, line2_start.y);
    ctx2d.lineTo(line2_end.x, line2_end.y);
    ctx2d.lineTo(line3_end.x, line3_end.y);
    ctx2d.lineTo(line3_start.x, line3_start.y);
    ctx2d.closePath();
    ctx2d.fill();

    // Dış çizgiler ve kenar birleştirmeler
    ctx2d.beginPath();
    ctx2d.moveTo(line1_start.x, line1_start.y); ctx2d.lineTo(line1_end.x, line1_end.y); // Dış üst
    ctx2d.moveTo(line4_start.x, line4_start.y); ctx2d.lineTo(line4_end.x, line4_end.y); // Dış alt
    ctx2d.moveTo(left1.x, left1.y); ctx2d.lineTo(left2.x, left2.y); // Sol kenar birleştirme
    ctx2d.moveTo(right1.x, right1.y); ctx2d.lineTo(right2.x, right2.y); // Sağ kenar birleştirme
    // İç çizgiler (cam)
    ctx2d.moveTo(line2_start.x, line2_start.y); ctx2d.lineTo(line2_end.x, line2_end.y); // İç üst
    ctx2d.moveTo(line3_start.x, line3_start.y); ctx2d.lineTo(line3_end.x, line3_end.y); // İç alt
    ctx2d.stroke(); // Ana çizgileri çiz

    // --- YENİ: Dikey Kayıtları Çiz ---
    ctx2d.beginPath();
    ctx2d.lineWidth = lineThickness / 3 / zoom; // Kayıtlar için daha ince çizgi

    // Alt dikey kayıtlar (ve üst dikey kayıtlar aynı pozisyonda)
    bottomMullionPositions.forEach(mullionX_local => {
        // Local X pozisyonunu dünya koordinatına çevir
        const mullionWorldX = windowP1.x + dx * mullionX_local;
        const mullionWorldY = windowP1.y + dy * mullionX_local;

        // Kayıtın başlangıç ve bitiş noktaları (iç cam çizgileri arasında)
        const mullionTop = { x: mullionWorldX - nx * offsetInner, y: mullionWorldY - ny * offsetInner };
        const mullionBottom = { x: mullionWorldX + nx * offsetInner, y: mullionWorldY + ny * offsetInner };

        ctx2d.moveTo(mullionTop.x, mullionTop.y);
        ctx2d.lineTo(mullionBottom.x, mullionBottom.y);
    });

    ctx2d.stroke(); // Kayıt çizgilerini çiz
    // --- YENİ KAYIT ÇİZİMİ SONU ---

}
// --- GÜNCELLENMİŞ Pencere Sembolü Çizimi SONU ---


// Grid'i çizer
export function drawGrid() {
    const { ctx2d, c2d } = dom; const { zoom, gridOptions } = state; if (!gridOptions.visible) return;
    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0); const { x: worldRight, y: worldBottom } = screenToWorld(c2d.width, c2d.height);
    const baseSpacing = gridOptions.spacing; const MIN_PIXEL_SPACING = 20; const multipliers = [1, 5, 10, 50, 100]; const visibleMultipliers = [];
    for (const mult of multipliers) { const spacing = baseSpacing * mult; const pixelSpacing = spacing * zoom; if (pixelSpacing >= MIN_PIXEL_SPACING) { visibleMultipliers.push({ multiplier: mult, spacing: spacing }); } }
    if (visibleMultipliers.length === 0) { visibleMultipliers.push({ multiplier: multipliers[multipliers.length -1], spacing: baseSpacing * multipliers[multipliers.length -1] }); if(multipliers.length > 1) { visibleMultipliers.push({ multiplier: multipliers[multipliers.length - 2], spacing: baseSpacing * multipliers[multipliers.length - 2] }); } } else if (visibleMultipliers.length === 1 && multipliers.indexOf(visibleMultipliers[0].multiplier) < multipliers.length - 1) { const currentMultIndex = multipliers.indexOf(visibleMultipliers[0].multiplier); const nextMult = multipliers[currentMultIndex + 1]; visibleMultipliers.push({ multiplier: nextMult, spacing: baseSpacing * nextMult }); }
    const drawLines = (spacing, alpha, weight) => { if (spacing <= 0) return; const hexToRgba = (hex, a) => { const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16); return `rgba(${r}, ${g}, ${b}, ${a})`; }; ctx2d.strokeStyle = hexToRgba(gridOptions.color, alpha); ctx2d.lineWidth = weight / zoom; ctx2d.beginPath(); const startX = Math.floor(worldLeft / spacing) * spacing; const startY = Math.floor(worldTop / spacing) * spacing; const buffer = spacing; for (let x = startX; x <= worldRight + buffer; x += spacing) { ctx2d.moveTo(x, worldTop - buffer); ctx2d.lineTo(x, worldBottom + buffer); } for (let y = startY; y <= worldBottom + buffer; y += spacing) { ctx2d.moveTo(worldLeft - buffer, y); ctx2d.lineTo(worldRight + buffer, y); } ctx2d.stroke(); };
    visibleMultipliers.reverse().forEach((item, index) => { const numVisible = visibleMultipliers.length; let alpha = 0.15; let weight = gridOptions.weight * 0.5; if (numVisible > 1 && index === numVisible - 2) { alpha = 0.3; weight = gridOptions.weight * 0.7; } else if (index === numVisible - 1) { alpha = 0.5; weight = gridOptions.weight; } drawLines(item.spacing, alpha, weight); });
}

// Farenin bir duvar üzerinde olup olmadığını kontrol eder
export function isMouseOverWall() {
    for (const w of state.walls) { if (!w.p1 || !w.p2) continue; const wallPx = w.thickness || state.wallThickness; const bodyHitToleranceSq = (wallPx / 2)**2; if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitToleranceSq) { return true; } } return false;
}

// Menfez sembolünü çizer
export function drawVentSymbol(wall, vent, isSelected = false) { // isSelected parametresi eklendi
    const { ctx2d } = dom; const { selectedObject } = state; if (!wall || !wall.p1 || !wall.p2) return; const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 1) return; const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; const nx = -dy, ny = dx; const startPos = vent.pos - vent.width / 2; const endPos = vent.pos + vent.width / 2; const ventP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos }; const ventP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos }; const wallPx = wall.thickness || state.wallThickness; const halfWall = wallPx / 2;
    // const isSelected = selectedObject?.type === "vent" && selectedObject.object === vent; // isSelected parametre olarak geldi
    ctx2d.strokeStyle = isSelected ? "#8ab4f8" : "#e57373";
    ctx2d.fillStyle = isSelected ? "rgba(138, 180, 248, 0.2)" : "rgba(229, 115, 115, 0.2)"; // Seçiliyse fill rengini de değiştir
    ctx2d.lineWidth = 1.5 / state.zoom; // Zoom'a göre ayarla
    const box1_start = { x: ventP1.x - nx * halfWall, y: ventP1.y - ny * halfWall }; const box1_end = { x: ventP1.x + nx * halfWall, y: ventP1.y + ny * halfWall }; const box2_start = { x: ventP2.x - nx * halfWall, y: ventP2.y - ny * halfWall }; const box2_end = { x: ventP2.x + nx * halfWall, y: ventP2.y + ny * halfWall };
    ctx2d.beginPath(); ctx2d.moveTo(box1_start.x, box1_start.y); ctx2d.lineTo(box1_end.x, box1_end.y); ctx2d.lineTo(box2_end.x, box2_end.y); ctx2d.lineTo(box2_start.x, box2_start.y); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
    const numLines = 3;
    ctx2d.beginPath(); // Çizgiler için yeni path
    for (let i = 1; i <= numLines; i++) {
        const t = i / (numLines + 1); const lineX = ventP1.x + (ventP2.x - ventP1.x) * t; const lineY = ventP1.y + (ventP2.y - ventP1.y) * t;
        ctx2d.moveTo(lineX - nx * halfWall * 0.8, lineY - ny * halfWall * 0.8); ctx2d.lineTo(lineX + nx * halfWall * 0.8, lineY + ny * halfWall * 0.8);
    }
    ctx2d.stroke(); // Çizgileri çiz
}

// Eski tip kolon sembolünü çizer (node tabanlı) - KULLANILMIYOR
export function drawColumnSymbol(node) {
     /* const { ctx2d } = dom; const size = node.columnSize || 30; ctx2d.fillStyle = "#8ab4f8"; ctx2d.strokeStyle = "#ffffff"; ctx2d.lineWidth = 2; ctx2d.beginPath(); ctx2d.rect(node.x - size / 2, node.y - size / 2, size, size); ctx2d.fill(); ctx2d.stroke(); ctx2d.strokeStyle = "#ffffff"; ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.moveTo(node.x - size / 2, node.y - size / 2); ctx2d.lineTo(node.x + size / 2, node.y + size / 2); ctx2d.moveTo(node.x + size / 2, node.y - size / 2); ctx2d.lineTo(node.x - size / 2, node.y + size / 2); ctx2d.stroke(); */
}

// --- GÜNCELLENMİŞ ve DÜZELTİLMİŞ drawColumn Fonksiyonu ---
export function drawColumn(column, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor, lineThickness, currentFloor } = state;

    // FLOOR ISOLATION: Sadece aktif kattaki duvarlar ve kolonlarla kesişim kontrolü yap
    const currentFloorId = currentFloor?.id;
    const walls = currentFloorId ? (state.walls || []).filter(w => w.floorId === currentFloorId) : (state.walls || []);
    const columns = currentFloorId ? (state.columns || []).filter(c => c.floorId === currentFloorId) : (state.columns || []);

    const corners = getColumnCorners(column); // Kolonun köşe noktaları

    // Çizim stilleri
    ctx2d.fillStyle = BG; // İçini arka plan rengiyle doldur
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor; // Kenarlık rengi (seçiliyse mavi)
    ctx2d.lineWidth = lineThickness / zoom; // Çizgi kalınlığı (zoom'a göre ayarlı)

    // Dış kareyi çiz (Önce dolgu, sonra kenarlık)
    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        ctx2d.lineTo(corners[i].x, corners[i].y);
    }
    ctx2d.closePath();
    ctx2d.fill(); // Dolguyu yap

    // Kenarları çiz
    if (isSelected) {
        // Seçiliyse, tüm kenarları kesişime bakmadan çiz
        ctx2d.stroke(); // Yukarıdaki path'i kullanarak kenarlığı çiz

    } else {
        // Seçili değilse, kesişimleri kontrol ederek kenarları çiz
        for (let i = 0; i < corners.length; i++) {
            const p1 = corners[i]; // Kenarın başlangıç noktası
            const p2 = corners[(i + 1) % corners.length]; // Kenarın bitiş noktası
            const segmentVector = { x: p2.x - p1.x, y: p2.y - p1.y };
            const segmentLength = Math.hypot(segmentVector.x, segmentVector.y);
            if (segmentLength < 0.1) continue; // Çok kısa segmentleri atla
            const segmentDir = { x: segmentVector.x / segmentLength, y: segmentVector.y / segmentLength };

            let visibleSegments = [{ start: 0, end: segmentLength }]; // Başlangıçta tüm segment görünür [{başlangıç mesafesi, bitiş mesafesi}]

            // 1. Duvarlarla Kesişim Kontrolü (Hassas Kırpma)
            walls.forEach(wall => {
                if (!wall || !wall.p1 || !wall.p2) return; // Geçersiz duvarı atla
                const wallThickness = wall.thickness || state.wallThickness;
                const halfWallThickness = wallThickness / 2;
                const hideToleranceSq = (halfWallThickness - 0.5)**2;

                let nextVisibleSegments = []; // Bu duvar kontrolünden sonra görünür kalacak segmentler
                visibleSegments.forEach(visSeg => {
                    const currentP1 = { x: p1.x + segmentDir.x * visSeg.start, y: p1.y + segmentDir.y * visSeg.start };
                    const currentP2 = { x: p1.x + segmentDir.x * visSeg.end, y: p1.y + segmentDir.y * visSeg.end };
                    const currentLength = visSeg.end - visSeg.start;
                    if (currentLength < 0.1) return; // Çok kısa segmentleri atla

                    const distSqP1 = distToSegmentSquared(currentP1, wall.p1, wall.p2);
                    const distSqP2 = distToSegmentSquared(currentP2, wall.p1, wall.p2);
                    const p1_inside = distSqP1 < hideToleranceSq;
                    const p2_inside = distSqP2 < hideToleranceSq;

                    if (p1_inside && p2_inside) {
                        // Tamamen içindeyse gösterme
                    } else {
                        const wallDx = wall.p2.x - wall.p1.x;
                        const wallDy = wall.p2.y - wall.p1.y;
                        const wallLen = Math.hypot(wallDx, wallDy);

                        if (wallLen < 0.1) {
                             nextVisibleSegments.push(visSeg);
                             return;
                        }

                        const wallNx = -wallDy / wallLen;
                        const wallNy = wallDx / wallLen;
                        const edge1_p1 = { x: wall.p1.x + wallNx * halfWallThickness, y: wall.p1.y + wallNy * halfWallThickness };
                        const edge1_p2 = { x: wall.p2.x + wallNx * halfWallThickness, y: wall.p2.y + wallNy * halfWallThickness };
                        const edge2_p1 = { x: wall.p1.x - wallNx * halfWallThickness, y: wall.p1.y - wallNy * halfWallThickness };
                        const edge2_p2 = { x: wall.p2.x - wallNx * halfWallThickness, y: wall.p2.y - wallNy * halfWallThickness };

                        const intersection1 = getLineIntersectionPoint(currentP1, currentP2, edge1_p1, edge1_p2);
                        const intersection2 = getLineIntersectionPoint(currentP1, currentP2, edge2_p1, edge2_p2);

                        const dists = [];
                        if (intersection1) dists.push(visSeg.start + Math.hypot(intersection1.x - currentP1.x, intersection1.y - currentP1.y));
                        if (intersection2) dists.push(visSeg.start + Math.hypot(intersection2.x - currentP1.x, intersection2.y - currentP1.y));
                        dists.push(visSeg.start);
                        dists.push(visSeg.end);
                        dists.sort((a, b) => a - b);
                        const uniqueDists = [];
                         if (dists.length > 0) {
                             uniqueDists.push(dists[0]);
                             for (let k = 1; k < dists.length; k++) {
                                 if (dists[k] - uniqueDists[uniqueDists.length - 1] > 0.1) {
                                     uniqueDists.push(dists[k]);
                                 }
                             }
                         }
                         const finalDists = uniqueDists.filter(d => d >= visSeg.start - 0.1 && d <= visSeg.end + 0.1);

                        for(let k = 0; k < finalDists.length - 1; k++){
                            const subStart = finalDists[k];
                            const subEnd = finalDists[k+1];
                            if(subEnd - subStart < 0.1) continue;

                            const subMidT = (subStart + subEnd) / 2;
                            const subMidPoint = { x: p1.x + segmentDir.x * subMidT, y: p1.y + segmentDir.y * subMidT };
                            const distSqToWallCenter = distToSegmentSquared(subMidPoint, wall.p1, wall.p2);

                             if (distSqToWallCenter >= hideToleranceSq) {
                                 nextVisibleSegments.push({start: subStart, end: subEnd});
                             }
                        }
                    }
                });
                visibleSegments = nextVisibleSegments;
            }); // Duvar döngüsü sonu


            // 2. Diğer Kolonlarla Kesişim Kontrolü (Segment Kırpma)
             columns.forEach(otherColumn => {
                 if (otherColumn === column) return;
                 if (!otherColumn || !otherColumn.center) return;

                const otherCorners = getColumnCorners(otherColumn);
                const otherEdges = [
                    { p1: otherCorners[0], p2: otherCorners[1] }, { p1: otherCorners[1], p2: otherCorners[2] },
                    { p1: otherCorners[2], p2: otherCorners[3] }, { p1: otherCorners[3], p2: otherCorners[0] }
                ];

                let nextVisibleSegments = [];
                visibleSegments.forEach(visSeg => {
                    const currentP1 = { x: p1.x + segmentDir.x * visSeg.start, y: p1.y + segmentDir.y * visSeg.start };
                    const currentP2 = { x: p1.x + segmentDir.x * visSeg.end, y: p1.y + segmentDir.y * visSeg.end };
                    const dists = [visSeg.start, visSeg.end];

                    otherEdges.forEach(edge => {
                        const intersection = getLineIntersectionPoint(currentP1, currentP2, edge.p1, edge.p2);
                        if (intersection) {
                            const distToIntersection = Math.hypot(intersection.x - currentP1.x, intersection.y - currentP1.y);
                            const intersectionDistOnColSeg = visSeg.start + distToIntersection;
                            if (intersectionDistOnColSeg > visSeg.start + 0.1 && intersectionDistOnColSeg < visSeg.end - 0.1) {
                                dists.push(intersectionDistOnColSeg);
                            }
                        }
                    });

                    dists.sort((a, b) => a - b);
                    const uniqueDists = [];
                    if (dists.length > 0) {
                        uniqueDists.push(dists[0]);
                        for (let k = 1; k < dists.length; k++) {
                            if (dists[k] - uniqueDists[uniqueDists.length - 1] > 0.1) {
                                uniqueDists.push(dists[k]);
                            }
                        }
                    }

                    for (let k = 0; k < uniqueDists.length - 1; k++) {
                        const subStart = uniqueDists[k];
                        const subEnd = uniqueDists[k + 1];
                        if (subEnd - subStart < 0.1) continue;

                        const subMidT = (subStart + subEnd) / 2;
                        const subMidPoint = { x: p1.x + segmentDir.x * subMidT, y: p1.y + segmentDir.y * subMidT };

                        if (!isPointInColumn(subMidPoint, otherColumn)) {
                            nextVisibleSegments.push({ start: subStart, end: subEnd });
                        }
                    }
                });
                visibleSegments = nextVisibleSegments;
             }); // Kolon döngüsü sonu


            // Sonuçta görünür kalan segmentleri çiz
            visibleSegments.forEach(visSeg => {
                 if (visSeg.end - visSeg.start > 0.5) {
                    const finalP1 = { x: p1.x + segmentDir.x * visSeg.start, y: p1.y + segmentDir.y * visSeg.start };
                    const finalP2 = { x: p1.x + segmentDir.x * visSeg.end, y: p1.y + segmentDir.y * visSeg.end };
                    ctx2d.beginPath();
                    ctx2d.moveTo(finalP1.x, finalP1.y);
                    ctx2d.lineTo(finalP2.x, finalP2.y);
                    ctx2d.stroke();
                 }
            });

        } // Kenar döngüsü sonu (i)
    } // Seçili değilse bloğu sonu

    // İçi boş kısmı çiz (Eğer varsa)
    if (column.hollowWidth && column.hollowHeight) {
        const halfHollowW = column.hollowWidth / 2; const halfHollowH = column.hollowHeight / 2; const cx = column.center.x; const cy = column.center.y; const rot = (column.rotation || 0) * Math.PI / 180; const offsetX = column.hollowOffsetX || 0; const offsetY = column.hollowOffsetY || 0;
        const hollowCorners = [ { x: offsetX - halfHollowW, y: offsetY - halfHollowH }, { x: offsetX + halfHollowW, y: offsetY - halfHollowH }, { x: offsetX + halfHollowW, y: offsetY + halfHollowH }, { x: offsetX - halfHollowW, y: offsetY + halfHollowH } ].map(corner => { const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot); const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot); return { x: cx + rotatedX, y: cy + rotatedY }; });
        ctx2d.fillStyle = state.roomFillColor; ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor; ctx2d.lineWidth = lineThickness / zoom;
        ctx2d.beginPath(); ctx2d.moveTo(hollowCorners[0].x, hollowCorners[0].y); for (let i = 1; i < hollowCorners.length; i++) { ctx2d.lineTo(hollowCorners[i].x, hollowCorners[i].y); } ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke();
    }

}
// --- drawColumn Sonu ---

// Kiriş çizimi
export function drawBeam(beam, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, lineThickness } = state;

    // Çizim moduna göre opacity ayarla
    ctx2d.save();

    const corners = getBeamCorners(beam); // Kiriş köşe noktaları
    const beamColor = isSelected ? '#8ab4f8' : state.wallBorderColor;
    let fillColor;
    if (beamColor.startsWith('#')) {
        const hex = beamColor.slice(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        fillColor = `rgba(${r}, ${g}, ${b}, 0.06)`;
    } else {
        fillColor = beamColor;
    }

    ctx2d.fillStyle = fillColor;
    ctx2d.strokeStyle = beamColor;
    ctx2d.lineWidth = lineThickness / zoom;

    ctx2d.save();
    ctx2d.setLineDash([8 / zoom, 4 / zoom]);

    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        ctx2d.lineTo(corners[i].x, corners[i].y);
    }
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    ctx2d.restore();

    // "Kiriş" Yazısı
    const center = beam.center;
    const rotationRad = (beam.rotation || 0) * Math.PI / 180;
    ctx2d.save();
    ctx2d.translate(center.x, center.y);
    ctx2d.rotate(rotationRad);
    const ZOOM_EXPONENT = -0.65;
    const baseFontSize = 16;
    let fontSize = baseFontSize * Math.pow(zoom, ZOOM_EXPONENT);
    const minWorldFontSize = 5;
    ctx2d.font = `400 ${Math.max(minWorldFontSize, fontSize)}px "Segoe UI", "Roboto", "Helvetica Neue", sans-serif`;
    ctx2d.fillStyle = beamColor;
    ctx2d.textAlign = "center";
    ctx2d.textBaseline = "middle";
    ctx2d.fillText("Kiriş", 0, 0);
    ctx2d.restore();

    ctx2d.restore(); // İlk save() için restore() eklendi
}

// GÜNCELLENMİŞ Merdiven Çizimi (Tek çizgi, ok mantığı düzeltilmiş)
export function drawStairs(stair, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, lineThickness, wallBorderColor, roomFillColor } = state;

    // Çizim moduna göre opacity ayarla
    ctx2d.save();

    const corners = getStairCorners(stair); // Köşe noktalarını al
    const stairColor = isSelected ? '#8ab4f8' : wallBorderColor;
    const backgroundColor = roomFillColor || '#1e1f20';
    const rotRad = (stair.rotation || 0) * Math.PI / 180;
    const dirX = Math.cos(rotRad); // Ok için yön vektörleri
    const dirY = Math.sin(rotRad);
    const perpX = -dirY; // Kenara dik vektör
    const perpY = dirX;

    // --- ARKA PLAN VE KENARLIK ÇİZİMİ ---
    ctx2d.fillStyle = backgroundColor;
    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    ctx2d.lineTo(corners[1].x, corners[1].y);
    ctx2d.lineTo(corners[2].x, corners[2].y);
    ctx2d.lineTo(corners[3].x, corners[3].y);
    ctx2d.closePath();
    ctx2d.fill();

    ctx2d.strokeStyle = stairColor;
    ctx2d.lineWidth = lineThickness / zoom;
    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    ctx2d.lineTo(corners[1].x, corners[1].y);
    ctx2d.lineTo(corners[2].x, corners[2].y);
    ctx2d.lineTo(corners[3].x, corners[3].y);
    ctx2d.closePath();
    ctx2d.stroke();
    // --- KENAR ÇİZİMİ SONU ---


    // --- SAHANLIK DEĞİLSE (NORMAL MERDİVEN) ---
    if (!stair.isLanding) {
        // Basamakları Çiz
        const stepCount = stair.stepCount || 1;
        if (stepCount > 1) {
            const halfHeight = stair.height / 2; // Artık offset yok, tam yarı genişlik
            const startEdgeCenter = {
                x: (corners[0].x + corners[3].x) / 2, // (sol üst + sol alt) / 2
                y: (corners[0].y + corners[3].y) / 2
            };

            ctx2d.beginPath();
            for (let i = 1; i < stepCount; i++) {
                const stepOffset = (stair.width / stepCount) * i; // width = merdiven uzunluğu
                const lineCenterX = startEdgeCenter.x + dirX * stepOffset;
                const lineCenterY = startEdgeCenter.y + dirY * stepOffset;
                const p1 = { x: lineCenterX + perpX * halfHeight, y: lineCenterY + perpY * halfHeight };
                const p2 = { x: lineCenterX - perpX * halfHeight, y: lineCenterY - perpY * halfHeight };
                ctx2d.moveTo(p1.x, p1.y);
                ctx2d.lineTo(p2.x, p2.y);
            }
            ctx2d.lineWidth = (lineThickness / 2) / zoom;
            ctx2d.strokeStyle = stairColor; // Renk zaten ayarlı ama garanti olsun
            ctx2d.stroke();
        }

        // --- NORMAL MERDİVEN İÇİN OK ÇİZİMİ ---
        const arrowLength = stair.width * 0.8;
        const arrowStart = {
            x: stair.center.x - dirX * (arrowLength / 2),
            y: stair.center.y - dirY * (arrowLength / 2)
        };
        const arrowEnd = {
            x: stair.center.x + dirX * (arrowLength / 2),
            y: stair.center.y + dirY * (arrowLength / 2)
        };

        ctx2d.beginPath();
        ctx2d.moveTo(arrowStart.x, arrowStart.y);
        ctx2d.lineTo(arrowEnd.x, arrowEnd.y);
        ctx2d.lineWidth = (lineThickness / 1.5) / zoom;
        ctx2d.strokeStyle = stairColor;
        ctx2d.stroke();

        // DOLU OK BAŞI
        const arrowHeadSize = Math.min(stair.height * 0.3, 15 / zoom);
        const perpXArrow = -dirY; // Ok başına dik vektör
        const perpYArrow = dirX;
        const headBase = {
            x: arrowEnd.x - dirX * arrowHeadSize,
            y: arrowEnd.y - dirY * arrowHeadSize
        };
        const headP1 = {
            x: headBase.x + perpXArrow * arrowHeadSize * 0.3, // Ok başı genişliği ayarı
            y: headBase.y + perpYArrow * arrowHeadSize * 0.5  // Ok başı yüksekliği ayarı
        };
        const headP2 = {
            x: headBase.x - perpXArrow * arrowHeadSize * 0.3,
            y: headBase.y - perpYArrow * arrowHeadSize * 0.5
        };
        ctx2d.fillStyle = stairColor;
        ctx2d.beginPath();
        ctx2d.moveTo(arrowEnd.x, arrowEnd.y);
        ctx2d.lineTo(headP1.x, headP1.y);
        ctx2d.lineTo(headP2.x, headP2.y);
        ctx2d.closePath();
        ctx2d.fill();
        // --- OK ÇİZİMİ SONU ---
    }
    // SAHANLIK İSE, BURADA OK ÇİZİLMEZ (sadece kenarlık/dolgu çizildi)

    ctx2d.restore(); // save() için restore() eklendi
}
export function drawGuides(ctx2d, state) {
    const { guides, zoom, selectedObject } = state;
    if (!guides || guides.length === 0) return;

    // Görünür alanı dünya koordinatlarında al
    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
    const { x: worldRight, y: worldBottom } = screenToWorld(dom.c2d.width, dom.c2d.height);
    
    // İsteğiniz üzerine stil tanımlamaları
    const guideColor = "rgba(255, 100, 100, 0.5)"; // Soluk kırmızı
    const selectedGuideColor = "rgba(255, 0, 0, 1.0)"; // Parlak kırmızı (seçiliyken)
    const dashPattern = [4 / zoom, 4 / zoom]; // Kısa kesikli çizgi

    guides.forEach(guide => {
        if (!guide.subType) return; // Geçersiz rehberi atla

        const isSelected = (selectedObject?.type === 'guide' && selectedObject.object === guide);
        
        // Stili seçime göre ayarla
        const color = isSelected ? selectedGuideColor : guideColor;
        const lineWidth = (isSelected ? 1.5 : 1) / zoom;
        const pointRadius = (isSelected ? 4 : 3) / zoom;
        const pointOuterRadius = (isSelected ? 8 : 6) / zoom;

        ctx2d.strokeStyle = color;
        ctx2d.fillStyle = color;
        ctx2d.lineWidth = lineWidth;

        // Çizgi tipleri için kesikli çizgiyi ayarla
        if (guide.subType !== 'point') {
            ctx2d.setLineDash(dashPattern);
        }

        switch (guide.subType) {
            case 'point':
                // Dış çember (stroke)
                ctx2d.beginPath();
                ctx2d.arc(guide.x, guide.y, pointOuterRadius, 0, Math.PI * 2);
                ctx2d.stroke();
                // İç nokta (fill)
                ctx2d.beginPath();
                ctx2d.arc(guide.x, guide.y, pointRadius, 0, Math.PI * 2);
                ctx2d.fill();
                break;
            
            case 'horizontal':
                ctx2d.beginPath();
                ctx2d.moveTo(worldLeft - 100, guide.y); // Ekran dışına taşır
                ctx2d.lineTo(worldRight + 100, guide.y);
                ctx2d.stroke();
                break;
            
            case 'vertical':
                ctx2d.beginPath();
                ctx2d.moveTo(guide.x, worldTop - 100);
                ctx2d.lineTo(guide.x, worldBottom + 100);
                ctx2d.stroke();
                break;
            
            case 'free':
                if (guide.p1 && guide.p2) {
                    ctx2d.beginPath();
                    ctx2d.moveTo(guide.p1.x, guide.p1.y);
                    ctx2d.lineTo(guide.p2.x, guide.p2.y);
                    ctx2d.stroke();
                    
                    // Seçiliyse uç noktaları göster
                    if (isSelected) {
                        ctx2d.beginPath();
                        ctx2d.arc(guide.p1.x, guide.p1.y, pointRadius, 0, Math.PI * 2);
                        ctx2d.fill();
                        ctx2d.beginPath();
                        ctx2d.arc(guide.p2.x, guide.p2.y, pointRadius, 0, Math.PI * 2);
                        ctx2d.fill();
                    }
                }
                break;
            
            case 'angular':
                if (guide.p1 && guide.p2) {
                    const dx = guide.p2.x - guide.p1.x;
                    const dy = guide.p2.y - guide.p1.y;
                    const len = Math.hypot(dx, dy);
                    if (len < 0.1) break;
                    
                    // Ekranın köşegeninden daha büyük bir mesafe
                    const extend = Math.max(worldRight - worldLeft, worldBottom - worldTop) * 2; 
                    const p0 = { x: guide.p1.x - (dx/len) * extend, y: guide.p1.y - (dy/len) * extend };
                    const p3 = { x: guide.p2.x + (dx/len) * extend, y: guide.p2.y + (dy/len) * extend };
                    
                    ctx2d.beginPath();
                    ctx2d.moveTo(p0.x, p0.y);
                    ctx2d.lineTo(p3.x, p3.y);
                    ctx2d.stroke();
                    
                    // Seçiliyse p1 ve p2 noktalarını göster
                    if (isSelected) {
                        ctx2d.beginPath();
                        ctx2d.arc(guide.p1.x, guide.p1.y, pointRadius, 0, Math.PI * 2);
                        ctx2d.fill();
                        ctx2d.beginPath();
                        ctx2d.arc(guide.p2.x, guide.p2.y, pointRadius, 0, Math.PI * 2);
                        ctx2d.fill();
                    }
                }
                break;
        }
        
        // Kesikli çizgiyi sıfırla
        ctx2d.setLineDash([]);
    });
}