// ahmedakbayir/ngcad/ngcad-ad56530de4465cbe8a9f9e5e0a4ec4205c63557c/renderer2d.js

import { state, dom, BG, WALL_THICKNESS } from './main.js';
// getLineIntersectionPoint import edildiğinden emin ol
import { screenToWorld, distToSegmentSquared, getLineIntersectionPoint } from './geometry.js';
import { getColumnCorners, isPointInColumn } from './columns.js';

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
    if (!wall || !wall.p1 || !wall.p2) return; // Geçersiz kapı/duvar ise çık
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
    const wallPx = wall.thickness || WALL_THICKNESS; // Duvar kalınlığı
    const halfWall = wallPx / 2; // Yarı kalınlık
    // Renk belirleme
    let color;
    if (isPreview) {
        color = "#8ab4f8"; // Önizleme rengi
    } else if (isSelected) {
        color = "#8ab4f8"; // Seçili rengi
    } else {
        // Normal renk (duvar rengi %80 opaklıkta)
        const hex = wallBorderColor.startsWith('#') ? wallBorderColor.slice(1) : wallBorderColor;
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
    const { selectedObject, wallBorderColor, lineThickness } = state;
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return;
    const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; const nx = -dy, ny = dx;
    const startPos = window.pos - window.width / 2; const endPos = window.pos + window.width / 2;
    const windowP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos }; const windowP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = wall.thickness || WALL_THICKNESS; const halfWall = wallPx / 2;
    const isSelectedCalc = isSelected || (selectedObject?.type === "window" && selectedObject.object === window);
    let color;
    if (isPreview) { color = "#8ab4f8"; } else if (isSelectedCalc) { color = "#8ab4f8"; } else {
        const hex = wallBorderColor.startsWith('#') ? wallBorderColor.slice(1) : wallBorderColor;
        const r = parseInt(hex.substring(0, 2), 16); const g = parseInt(hex.substring(2, 4), 16); const b = parseInt(hex.substring(4, 6), 16);
        color = `rgba(${r}, ${g}, ${b}, 1)`;
        //color= "rgba(101, 101, 101, 0.54)"
        color= "rgba(234, 246, 247, 0.22)"

    }
    ctx2d.strokeStyle = color; ctx2d.lineWidth = lineThickness / 2; const inset = lineThickness / 4;
    const offset25 = halfWall * 0.5; // İçteki çizgilerin konumu için yarı kalınlığın %50'si
    // const offset75 = halfWall * 0.5; // Bu artık kullanılmıyor, yerine offset25 yeterli

    // İç çizgiler için başlangıç ve bitiş noktaları (kenarlardan biraz içeride)
    const windowP1_inset_inner = { x: windowP1.x + dx * inset, y: windowP1.y + dy * inset };
    const windowP2_inset_inner = { x: windowP2.x - dx * inset, y: windowP2.y - dy * inset };

    // Dıştaki iki paralel çizgi
    const line1_start = { x: windowP1.x - nx * (halfWall - inset), y: windowP1.y - ny * (halfWall - inset) };
    const line1_end = { x: windowP2.x - nx * (halfWall - inset), y: windowP2.y - ny * (halfWall - inset) };
    const line4_start = { x: windowP1.x + nx * (halfWall - inset), y: windowP1.y + ny * (halfWall - inset) };
    const line4_end = { x: windowP2.x + nx * (halfWall - inset), y: windowP2.y + ny * (halfWall - inset) };

    // İçteki iki paralel çizgi (birbirine daha yakın)
    const line2_start = { x: windowP1_inset_inner.x - nx * offset25, y: windowP1_inset_inner.y - ny * offset25 };
    const line2_end = { x: windowP2_inset_inner.x - nx * offset25, y: windowP2_inset_inner.y - ny * offset25 };
    const line3_start = { x: windowP1_inset_inner.x + nx * offset25, y: windowP1_inset_inner.y + ny * offset25 };
    const line3_end = { x: windowP2_inset_inner.x + nx * offset25, y: windowP2_inset_inner.y + ny * offset25 };

    // Pencere kenarlarını birleştiren kısa çizgiler
    const windowP1_inset = { x: windowP1.x + dx * inset, y: windowP1.y + dy * inset };
    const windowP2_inset = { x: windowP2.x - dx * inset, y: windowP2.y - dy * inset };
    const left1 = { x: windowP1_inset.x - nx * (halfWall - inset), y: windowP1_inset.y - ny * (halfWall - inset) }; // Dış sol
    const left2 = { x: windowP1_inset.x + nx * (halfWall - inset), y: windowP1_inset.y + ny * (halfWall - inset) }; // İç sol
    const right1 = { x: windowP2_inset.x - nx * (halfWall - inset), y: windowP2_inset.y - ny * (halfWall - inset) }; // Dış sağ
    const right2 = { x: windowP2_inset.x + nx * (halfWall - inset), y: windowP2_inset.y + ny * (halfWall - inset) }; // İç sağ

    // --- DÜZELTİLMİŞ DOLGU KODU ---
    // Sadece pencerenin "iç" (cam) bölgesini doldur
    ctx2d.fillStyle = color;

    // Orta bölge (Cam) - "Pencerenin ortası"
    ctx2d.beginPath();
    ctx2d.moveTo(line2_start.x, line2_start.y);
    ctx2d.lineTo(line2_end.x, line2_end.y);
    ctx2d.lineTo(line3_end.x, line3_end.y);
    ctx2d.lineTo(line3_start.x, line3_start.y);
    ctx2d.closePath();
    ctx2d.fill(); // Sadece burası doldurulacak
    // --- DÜZELTME SONU ---

    // Tüm çizgileri çiz
    ctx2d.beginPath();
    ctx2d.moveTo(line1_start.x, line1_start.y); ctx2d.lineTo(line1_end.x, line1_end.y); // Dış üst
    ctx2d.moveTo(line2_start.x, line2_start.y); ctx2d.lineTo(line2_end.x, line2_end.y); // İç üst
    ctx2d.moveTo(line3_start.x, line3_start.y); ctx2d.lineTo(line3_end.x, line3_end.y); // İç alt
    ctx2d.moveTo(line4_start.x, line4_start.y); ctx2d.lineTo(line4_end.x, line4_end.y); // Dış alt
    ctx2d.moveTo(left1.x, left1.y); ctx2d.lineTo(left2.x, left2.y); // Sol kenar birleştirme
    ctx2d.moveTo(right1.x, right1.y); ctx2d.lineTo(right2.x, right2.y); // Sağ kenar birleştirme
    ctx2d.stroke();
/*
    // Mermer raf (İnceltildi ve içe de eklendi)
    const marbleDepth = 0.2; // GÜNCELLEME: Kalınlık azaltıldı (1 -> 0.5)
    const marbleOverhang = 0; // GÜNCELLEME: Taşma miktarı azaltıldı (5 -> 3)

    // Dış raf hesaplamaları
    const marbleP1_out = { x: windowP1.x - dx * marbleOverhang, y: windowP1.y - dy * marbleOverhang };
    const marbleP2_out = { x: windowP2.x + dx * marbleOverhang, y: windowP2.y + dy * marbleOverhang };
    const marbleOuter1 = { x: marbleP1_out.x - nx * (halfWall + marbleDepth), y: marbleP1_out.y - ny * (halfWall + marbleDepth) };
    const marbleOuter2 = { x: marbleP2_out.x - nx * (halfWall + marbleDepth), y: marbleP2_out.y - ny * (halfWall + marbleDepth) };
    const marbleInner1_out = { x: marbleP1_out.x - nx * halfWall, y: marbleP1_out.y - ny * halfWall };
    const marbleInner2_out = { x: marbleP2_out.x - nx * halfWall, y: marbleP2_out.y - ny * halfWall };

    // İç raf hesaplamaları (normal vektör ters çevrildi)
    const marbleP1_in = { x: windowP1.x - dx * marbleOverhang, y: windowP1.y - dy * marbleOverhang };
    const marbleP2_in = { x: windowP2.x + dx * marbleOverhang, y: windowP2.y + dy * marbleOverhang };
    const marbleInner1 = { x: marbleP1_in.x + nx * (halfWall + marbleDepth), y: marbleP1_in.y + ny * (halfWall + marbleDepth) };
    const marbleInner2 = { x: marbleP2_in.x + nx * (halfWall + marbleDepth), y: marbleP2_in.y + ny * (halfWall + marbleDepth) };
    const marbleOuter1_in = { x: marbleP1_in.x + nx * halfWall, y: marbleP1_in.y + ny * halfWall };
    const marbleOuter2_in = { x: marbleP2_in.x + nx * halfWall, y: marbleP2_in.y + ny * halfWall };

    // Rafları çiz
    ctx2d.fillStyle = isSelectedCalc ? 'rgba(138, 180, 248, 0.3)' : 'rgba(231, 230, 208, 0.4)';
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 2; // GÜNCELLEME: Raf çizgi kalınlığı inceltildi

    // Dış raf
    ctx2d.beginPath();
    ctx2d.moveTo(marbleInner1_out.x, marbleInner1_out.y);
    ctx2d.lineTo(marbleOuter1.x, marbleOuter1.y);
    ctx2d.lineTo(marbleOuter2.x, marbleOuter2.y);
    ctx2d.lineTo(marbleInner2_out.x, marbleInner2_out.y);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    // İç raf
    ctx2d.beginPath();
    ctx2d.moveTo(marbleOuter1_in.x, marbleOuter1_in.y); // Başlangıç noktası duvar çizgisi
    ctx2d.lineTo(marbleInner1.x, marbleInner1.y); // İç köşe
    ctx2d.lineTo(marbleInner2.x, marbleInner2.y); // İç köşe
    ctx2d.lineTo(marbleOuter2_in.x, marbleOuter2_in.y); // Bitiş noktası duvar çizgisi
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
    */
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
    for (const w of state.walls) { if (!w.p1 || !w.p2) continue; const wallPx = w.thickness || WALL_THICKNESS; const bodyHitToleranceSq = (wallPx / 2)**2; if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitToleranceSq) { return true; } } return false;
}

// Menfez sembolünü çizer
export function drawVentSymbol(wall, vent) {
    const { ctx2d } = dom; const { selectedObject } = state; if (!wall || !wall.p1 || !wall.p2) return; const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y); if (wallLen < 1) return; const dx = (wall.p2.x - wall.p1.x) / wallLen; const dy = (wall.p2.y - wall.p1.y) / wallLen; const nx = -dy, ny = dx; const startPos = vent.pos - vent.width / 2; const endPos = vent.pos + vent.width / 2; const ventP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos }; const ventP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos }; const wallPx = wall.thickness || WALL_THICKNESS; const halfWall = wallPx / 2; const isSelected = selectedObject?.type === "vent" && selectedObject.object === vent; ctx2d.strokeStyle = isSelected ? "#8ab4f8" : "#e57373"; ctx2d.fillStyle = "rgba(229, 115, 115, 0.2)"; ctx2d.lineWidth = 1.5; const box1_start = { x: ventP1.x - nx * halfWall, y: ventP1.y - ny * halfWall }; const box1_end = { x: ventP1.x + nx * halfWall, y: ventP1.y + ny * halfWall }; const box2_start = { x: ventP2.x - nx * halfWall, y: ventP2.y - ny * halfWall }; const box2_end = { x: ventP2.x + nx * halfWall, y: ventP2.y + ny * halfWall }; ctx2d.beginPath(); ctx2d.moveTo(box1_start.x, box1_start.y); ctx2d.lineTo(box1_end.x, box1_end.y); ctx2d.lineTo(box2_end.x, box2_end.y); ctx2d.lineTo(box2_start.x, box2_start.y); ctx2d.closePath(); ctx2d.fill(); ctx2d.stroke(); const numLines = 3; for (let i = 1; i <= numLines; i++) { const t = i / (numLines + 1); const lineX = ventP1.x + (ventP2.x - ventP1.x) * t; const lineY = ventP1.y + (ventP2.y - ventP1.y) * t; ctx2d.beginPath(); ctx2d.moveTo(lineX - nx * halfWall * 0.8, lineY - ny * halfWall * 0.8); ctx2d.lineTo(lineX + nx * halfWall * 0.8, lineY + ny * halfWall * 0.8); ctx2d.stroke(); }
}

// Eski tip kolon sembolünü çizer (node tabanlı)
export function drawColumnSymbol(node) {
     const { ctx2d } = dom; const size = node.columnSize || 30; ctx2d.fillStyle = "#8ab4f8"; ctx2d.strokeStyle = "#ffffff"; ctx2d.lineWidth = 2; ctx2d.beginPath(); ctx2d.rect(node.x - size / 2, node.y - size / 2, size, size); ctx2d.fill(); ctx2d.stroke(); ctx2d.strokeStyle = "#ffffff"; ctx2d.lineWidth = 1; ctx2d.beginPath(); ctx2d.moveTo(node.x - size / 2, node.y - size / 2); ctx2d.lineTo(node.x + size / 2, node.y + size / 2); ctx2d.moveTo(node.x + size / 2, node.y - size / 2); ctx2d.lineTo(node.x - size / 2, node.y + size / 2); ctx2d.stroke();
}

// --- GÜNCELLENMİŞ ve DÜZELTİLMİŞ drawColumn Fonksiyonu ---
export function drawColumn(column, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor, lineThickness, walls, columns } = state;

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
                const wallThickness = wall.thickness || WALL_THICKNESS;
                const halfWallThickness = wallThickness / 2;
                // Gizleme için kullanılacak mesafe karesi (merkez çizgisine göre)
                // Neredeyse tam içindeyse gizle (0.5cm tolerans)
                const hideToleranceSq = (halfWallThickness - 0.5)**2;

                let nextVisibleSegments = []; // Bu duvar kontrolünden sonra görünür kalacak segmentler
                visibleSegments.forEach(visSeg => {
                    const currentP1 = { x: p1.x + segmentDir.x * visSeg.start, y: p1.y + segmentDir.y * visSeg.start };
                    const currentP2 = { x: p1.x + segmentDir.x * visSeg.end, y: p1.y + segmentDir.y * visSeg.end };
                    const currentLength = visSeg.end - visSeg.start;
                    if (currentLength < 0.1) return; // Çok kısa segmentleri atla

                    // Segmentin başlangıç ve bitiş noktalarının duvar merkez çizgisine olan mesafelerinin karesini hesapla
                    const distSqP1 = distToSegmentSquared(currentP1, wall.p1, wall.p2);
                    const distSqP2 = distToSegmentSquared(currentP2, wall.p1, wall.p2);

                    // Başlangıç ve bitiş noktaları duvar kalınlığının içinde mi?
                    const p1_inside = distSqP1 < hideToleranceSq;
                    const p2_inside = distSqP2 < hideToleranceSq;

                    if (p1_inside && p2_inside) {
                        // Tamamen içindeyse: Bu segmenti gösterme (nextVisibleSegments'e ekleme)

                    } else {
                        // Kesişim noktalarını DUVAR KENARLARI ile bul ve segmenti böl
                        const wallDx = wall.p2.x - wall.p1.x;
                        const wallDy = wall.p2.y - wall.p1.y;
                        const wallLen = Math.hypot(wallDx, wallDy);

                        if (wallLen < 0.1) {
                             // Duvar çok kısa, kesişim hesaplanamaz.
                             nextVisibleSegments.push(visSeg);
                             return; // visibleSegments.forEach'in bir sonraki iterasyonuna geç
                        }

                        const wallNx = -wallDy / wallLen; // Normal vektör
                        const wallNy = wallDx / wallLen;

                        // Duvarın iki kenarı için segmentler
                        const edge1_p1 = { x: wall.p1.x + wallNx * halfWallThickness, y: wall.p1.y + wallNy * halfWallThickness };
                        const edge1_p2 = { x: wall.p2.x + wallNx * halfWallThickness, y: wall.p2.y + wallNy * halfWallThickness };
                        const edge2_p1 = { x: wall.p1.x - wallNx * halfWallThickness, y: wall.p1.y - wallNy * halfWallThickness };
                        const edge2_p2 = { x: wall.p2.x - wallNx * halfWallThickness, y: wall.p2.y - wallNy * halfWallThickness };

                        // Kolon kenarı ile duvarın iki kenarının kesişimlerini bul
                        const intersection1 = getLineIntersectionPoint(currentP1, currentP2, edge1_p1, edge1_p2);
                        const intersection2 = getLineIntersectionPoint(currentP1, currentP2, edge2_p1, edge2_p2);

                        // Kesişim mesafelerini kolon kenarı başlangıcına göre hesapla (varsa)
                        const dists = [];
                        if (intersection1) dists.push(visSeg.start + Math.hypot(intersection1.x - currentP1.x, intersection1.y - currentP1.y));
                        if (intersection2) dists.push(visSeg.start + Math.hypot(intersection2.x - currentP1.x, intersection2.y - currentP1.y));

                        // Başlangıç ve bitiş noktalarını da ekle
                        dists.push(visSeg.start);
                        dists.push(visSeg.end);
                        // Mesafeleri sırala ve tekilleştir (küçük toleransla birleştir)
                        dists.sort((a, b) => a - b);
                        const uniqueDists = [];
                         if (dists.length > 0) {
                             uniqueDists.push(dists[0]);
                             for (let k = 1; k < dists.length; k++) {
                                 // Birbirine çok yakın noktaları birleştir (0.1 cm tolerans)
                                 if (dists[k] - uniqueDists[uniqueDists.length - 1] > 0.1) {
                                     uniqueDists.push(dists[k]);
                                 }
                             }
                         }
                         // Geçerli aralıkta kalanları filtrele (segmentin başlangıç ve bitişi dahil)
                         const finalDists = uniqueDists.filter(d => d >= visSeg.start - 0.1 && d <= visSeg.end + 0.1);

                        // Kesişim noktaları arasındaki alt segmentleri kontrol et
                        for(let k = 0; k < finalDists.length - 1; k++){
                            const subStart = finalDists[k];
                            const subEnd = finalDists[k+1];
                            if(subEnd - subStart < 0.1) continue; // Çok kısa alt segmentleri atla

                            // Alt segmentin orta noktasını al
                            const subMidT = (subStart + subEnd) / 2;
                            const subMidPoint = { x: p1.x + segmentDir.x * subMidT, y: p1.y + segmentDir.y * subMidT };

                            // Orta nokta duvar merkez çizgisine duvar kalınlığının yarısından UZAKSA göster
                             const distSqToWallCenter = distToSegmentSquared(subMidPoint, wall.p1, wall.p2);

                             if (distSqToWallCenter >= hideToleranceSq) { // Merkez çizgisinin DIŞINDAYSA (toleransla)
                                 nextVisibleSegments.push({start: subStart, end: subEnd});
                             }
                        }
                    }
                });
                visibleSegments = nextVisibleSegments; // Görünür segmentleri bu duvar için güncelle
            }); // Duvar döngüsü sonu


            // 2. Diğer Kolonlarla Kesişim Kontrolü (Segment Kırpma)
             columns.forEach(otherColumn => {
                 if (otherColumn === column) return; // Kendisiyle kontrol etme
                 if (!otherColumn || !otherColumn.center) return;

                // Diğer kolonun 4 kenarını al
                const otherCorners = getColumnCorners(otherColumn);
                const otherEdges = [
                    { p1: otherCorners[0], p2: otherCorners[1] },
                    { p1: otherCorners[1], p2: otherCorners[2] },
                    { p1: otherCorners[2], p2: otherCorners[3] },
                    { p1: otherCorners[3], p2: otherCorners[0] }
                ];

                let nextVisibleSegments = []; // Bir sonraki görünür segmentler listesi

                visibleSegments.forEach(visSeg => {
                    const currentP1 = { x: p1.x + segmentDir.x * visSeg.start, y: p1.y + segmentDir.y * visSeg.start };
                    const currentP2 = { x: p1.x + segmentDir.x * visSeg.end, y: p1.y + segmentDir.y * visSeg.end };

                    // Kesişim mesafelerini topla
                    const dists = [visSeg.start, visSeg.end];

                    // Diğer kolonun 4 kenarı ile kesişimleri bul
                    otherEdges.forEach(edge => {
                        const intersection = getLineIntersectionPoint(currentP1, currentP2, edge.p1, edge.p2);
                        if (intersection) {
                            const distToIntersection = Math.hypot(intersection.x - currentP1.x, intersection.y - currentP1.y);
                            const intersectionDistOnColSeg = visSeg.start + distToIntersection;
                            // Sadece segment aralığındaysa ekle (uç noktalar hariç)
                            if (intersectionDistOnColSeg > visSeg.start + 0.1 && intersectionDistOnColSeg < visSeg.end - 0.1) {
                                dists.push(intersectionDistOnColSeg);
                            }
                        }
                    });

                    // Mesafeleri sırala ve tekilleştir
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

                    // Kesişim noktaları arasındaki alt segmentleri kontrol et
                    for (let k = 0; k < uniqueDists.length - 1; k++) {
                        const subStart = uniqueDists[k];
                        const subEnd = uniqueDists[k + 1];
                        if (subEnd - subStart < 0.1) continue; // Çok kısa alt segmentleri atla

                        // Alt segmentin orta noktasını al
                        const subMidT = (subStart + subEnd) / 2;
                        const subMidPoint = { x: p1.x + segmentDir.x * subMidT, y: p1.y + segmentDir.y * subMidT };

                        // Orta nokta diğer kolonun İÇİNDE DEĞİLSE göster
                        if (!isPointInColumn(subMidPoint, otherColumn)) {
                            nextVisibleSegments.push({ start: subStart, end: subEnd });
                        }
                    }
                });
                visibleSegments = nextVisibleSegments; // Görünür segmentleri bu kolon için güncelle
             }); // Kolon döngüsü sonu


            // Sonuçta görünür kalan segmentleri çiz
            visibleSegments.forEach(visSeg => {
                 // Sadece anlamlı uzunluktaki segmentleri çiz
                 if (visSeg.end - visSeg.start > 0.5) { // 0.5 cm'den uzunsa
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