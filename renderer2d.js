import { state, dom, BG, WALL_THICKNESS } from './main.js';
import { screenToWorld, distToSegmentSquared } from './geometry.js';
import { getColumnCorners } from './columns.js';

export function drawNodeWallCount(node) {
    const { ctx2d } = dom;
    const { walls, zoom } = state;

    const connectedWalls = walls.filter(w => w.p1 === node || w.p2 === node);
    const wallCount = connectedWalls.length;

    // Bu fonksiyonun içeriği önceki versiyonlarda da boştu, şimdilik kaldırıldı.
    // Gerekirse tekrar eklenebilir.
    // if (wallCount <= 1) return;
    // ...
}

export function drawDoorSymbol(door, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { wallBorderColor, lineThickness } = state;

    const wall = door.wall;
    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;

    const dx = (wall.p2.x - wall.p1.x) / wallLen, dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;
    const startPos = door.pos - door.width / 2, endPos = door.pos + door.width / 2;
    const doorP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const doorP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };
    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;
    
    // Renk hesaplama - %80 transparent
    let color;
    if (isPreview) {
        color = "#8ab4f8";
    } else if (isSelected) {
        color = "#8ab4f8";
    } else {
        // wallBorderColor'dan RGB değerlerini al ve %80 opacity ekle
        const hex = wallBorderColor.startsWith('#') ? wallBorderColor.slice(1) : wallBorderColor;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        color = `rgba(${r}, ${g}, ${b}, 0.8)`;
    }
    
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 1.5;

    // İnset değeri
    const inset = lineThickness / 4;

    // İki paralel çizgi (duvarın iki yanında)
    const insetRatio = 1 / 3;
    const jamb_vec_x = nx * halfWall * 2;
    const jamb_vec_y = ny * halfWall * 2;
    
    const p_line1_start = { x: doorP1.x - nx * halfWall + jamb_vec_x * insetRatio, y: doorP1.y - ny * halfWall + jamb_vec_y * insetRatio };
    const p_line1_end = { x: doorP2.x - nx * halfWall + jamb_vec_x * insetRatio, y: doorP2.y - ny * halfWall + jamb_vec_y * insetRatio };
    const p_line2_start = { x: doorP1.x - nx * halfWall + jamb_vec_x * (1 - insetRatio), y: doorP1.y - ny * halfWall + jamb_vec_y * (1 - insetRatio) };
    const p_line2_end = { x: doorP2.x - nx * halfWall + jamb_vec_x * (1 - insetRatio), y: doorP2.y - ny * halfWall + jamb_vec_y * (1 - insetRatio) };

    // Yan çizgiler için inset
    const doorP1_inset = { x: doorP1.x + dx * inset, y: doorP1.y + dy * inset };
    const doorP2_inset = { x: doorP2.x - dx * inset, y: doorP2.y - dy * inset };
    
    const jamb1_start = { x: doorP1_inset.x - nx * halfWall, y: doorP1_inset.y - ny * halfWall };
    const jamb1_end = { x: doorP1_inset.x + nx * halfWall, y: doorP1_inset.y + ny * halfWall };
    const jamb2_start = { x: doorP2_inset.x - nx * halfWall, y: doorP2_inset.y - ny * halfWall };
    const jamb2_end = { x: doorP2_inset.x + nx * halfWall, y: doorP2_inset.y + ny * halfWall };

    ctx2d.beginPath();
    // Paralel çizgiler
    ctx2d.moveTo(p_line1_start.x, p_line1_start.y); ctx2d.lineTo(p_line1_end.x, p_line1_end.y);
    ctx2d.moveTo(p_line2_start.x, p_line2_start.y); ctx2d.lineTo(p_line2_end.x, p_line2_end.y);
    // Yan çizgiler
    ctx2d.moveTo(jamb1_start.x, jamb1_start.y); ctx2d.lineTo(jamb1_end.x, jamb1_end.y);
    ctx2d.moveTo(jamb2_start.x, jamb2_start.y); ctx2d.lineTo(jamb2_end.x, jamb2_end.y);
    ctx2d.stroke();
}

export function drawWindowSymbol(wall, window, isPreview = false, isSelected = false) {
    const { ctx2d } = dom;
    const { selectedObject, wallBorderColor, lineThickness } = state;

    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 0.1) return;

    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;

    const startPos = window.pos - window.width / 2;
    const endPos = window.pos + window.width / 2;
    const windowP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const windowP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };

    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;

    const isSelectedCalc = isSelected || (selectedObject?.type === "window" && selectedObject.object === window);
    
    // Renk hesaplama - %80 transparent
    let color;
    if (isPreview) {
        color = "#8ab4f8";
    } else if (isSelectedCalc) {
        color = "#8ab4f8";
    } else {
        const hex = wallBorderColor.startsWith('#') ? wallBorderColor.slice(1) : wallBorderColor;
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        color = `rgba(${r}, ${g}, ${b}, 0.8)`;
    }
    
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / 2;

    // İnset değeri - çizgilerin duvar içinde kalması için
    const inset = lineThickness / 4;

    // 4 paralel çizgi (yatay) - iç çizgiler için de inset kullan
    const offset25 = halfWall * 0.5;
    const offset75 = halfWall * 0.5;
    
    // İç çizgiler için de inset ekle
    const windowP1_inset_inner = { x: windowP1.x + dx * inset, y: windowP1.y + dy * inset };
    const windowP2_inset_inner = { x: windowP2.x - dx * inset, y: windowP2.y - dy * inset };
    
    // Dış çizgiler
    const line1_start = { x: windowP1.x - nx * (halfWall - inset), y: windowP1.y - ny * (halfWall - inset) };
    const line1_end = { x: windowP2.x - nx * (halfWall - inset), y: windowP2.y - ny * (halfWall - inset) };
    
    const line4_start = { x: windowP1.x + nx * (halfWall - inset), y: windowP1.y + ny * (halfWall - inset) };
    const line4_end = { x: windowP2.x + nx * (halfWall - inset), y: windowP2.y + ny * (halfWall - inset) };
    
    // İç çizgiler - inset ile
    const line2_start = { x: windowP1_inset_inner.x - nx * offset25, y: windowP1_inset_inner.y - ny * offset25 };
    const line2_end = { x: windowP2_inset_inner.x - nx * offset25, y: windowP2_inset_inner.y - ny * offset25 };
    
    const line3_start = { x: windowP1_inset_inner.x + nx * offset75, y: windowP1_inset_inner.y + ny * offset75 };
    const line3_end = { x: windowP2_inset_inner.x + nx * offset75, y: windowP2_inset_inner.y + ny * offset75 };

    // Yan çizgiler için inset
    const windowP1_inset = { x: windowP1.x + dx * inset, y: windowP1.y + dy * inset };
    const windowP2_inset = { x: windowP2.x - dx * inset, y: windowP2.y - dy * inset };
    
    // Sol kenar
    const left1 = { x: windowP1_inset.x - nx * (halfWall - inset), y: windowP1_inset.y - ny * (halfWall - inset) };
    const left2 = { x: windowP1_inset.x + nx * (halfWall - inset), y: windowP1_inset.y + ny * (halfWall - inset) };
    
    // Sağ kenar
    const right1 = { x: windowP2_inset.x - nx * (halfWall - inset), y: windowP2_inset.y - ny * (halfWall - inset) };
    const right2 = { x: windowP2_inset.x + nx * (halfWall - inset), y: windowP2_inset.y + ny * (halfWall - inset) };

    ctx2d.beginPath();
    // Yatay çizgiler
    ctx2d.moveTo(line1_start.x, line1_start.y); ctx2d.lineTo(line1_end.x, line1_end.y);
    ctx2d.moveTo(line2_start.x, line2_start.y); ctx2d.lineTo(line2_end.x, line2_end.y);
    ctx2d.moveTo(line3_start.x, line3_start.y); ctx2d.lineTo(line3_end.x, line3_end.y);
    ctx2d.moveTo(line4_start.x, line4_start.y); ctx2d.lineTo(line4_end.x, line4_end.y);
    // Yan çizgiler
    ctx2d.moveTo(left1.x, left1.y); ctx2d.lineTo(left2.x, left2.y);
    ctx2d.moveTo(right1.x, right1.y); ctx2d.lineTo(right2.x, right2.y);
    ctx2d.stroke();

    // MERMER RAFI ÇİZ (DIŞ TARAFTA)
    const marbleDepth = 1; // Mermer rafın derinliği
    const marbleOverhang = 5; // Pencerenin yanlarından taşma miktarı
    
    // Mermer başlangıç ve bitiş noktaları (pencereden biraz daha uzun)
    const marbleP1 = { 
        x: windowP1.x - dx * marbleOverhang, 
        y: windowP1.y - dy * marbleOverhang 
    };
    const marbleP2 = { 
        x: windowP2.x + dx * marbleOverhang, 
        y: windowP2.y + dy * marbleOverhang 
    };
    
    // Mermer dış kenarı (duvarın dış yüzeyinden mermar derinliği kadar dışarıda)
    const marbleOuter1 = { 
        x: marbleP1.x - nx * (halfWall + marbleDepth), 
        y: marbleP1.y - ny * (halfWall + marbleDepth) 
    };
    const marbleOuter2 = { 
        x: marbleP2.x - nx * (halfWall + marbleDepth), 
        y: marbleP2.y - ny * (halfWall + marbleDepth) 
    };
    
    // Mermer iç kenarı (duvarın dış yüzeyi)
    const marbleInner1 = { 
        x: marbleP1.x - nx * halfWall, 
        y: marbleP1.y - ny * halfWall 
    };
    const marbleInner2 = { 
        x: marbleP2.x - nx * halfWall, 
        y: marbleP2.y - ny * halfWall 
    };
    
    // Mermer rafı çiz
    ctx2d.fillStyle = isSelectedCalc ? 'rgba(138, 180, 248, 0.3)' : 'rgba(231, 230, 208, 0.4)';
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness ;
    
    ctx2d.beginPath();
    ctx2d.moveTo(marbleInner1.x, marbleInner1.y);
    ctx2d.lineTo(marbleOuter1.x, marbleOuter1.y);
    ctx2d.lineTo(marbleOuter2.x, marbleOuter2.y);
    ctx2d.lineTo(marbleInner2.x, marbleInner2.y);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
}

export function drawGrid() {
    const { ctx2d, c2d } = dom;
    const { zoom, gridOptions } = state;

    if (!gridOptions.visible) return;

    const { x: worldLeft, y: worldTop } = screenToWorld(0, 0);
    const { x: worldRight, y: worldBottom } = screenToWorld(c2d.width, c2d.height);

    const baseSpacing = gridOptions.spacing;
    const MIN_PIXEL_SPACING = 20;

    const multipliers = [1, 5, 10, 50, 100];
    const visibleMultipliers = [];

    for (const mult of multipliers) {
        const spacing = baseSpacing * mult;
        const pixelSpacing = spacing * zoom;

        if (pixelSpacing >= MIN_PIXEL_SPACING) {
            visibleMultipliers.push({ multiplier: mult, spacing: spacing });
        }
    }

    if (visibleMultipliers.length === 0) {
        // En azından bir grid seviyesi göster
        visibleMultipliers.push({ multiplier: multipliers[multipliers.length -1], spacing: baseSpacing * multipliers[multipliers.length -1] });
         if(multipliers.length > 1) {
              visibleMultipliers.push({ multiplier: multipliers[multipliers.length - 2], spacing: baseSpacing * multipliers[multipliers.length - 2] });
         }
    } else if (visibleMultipliers.length === 1 && multipliers.indexOf(visibleMultipliers[0].multiplier) < multipliers.length - 1) {
        // Sadece bir seviye görünüyorsa bir üst seviyeyi de ekle (varsa)
        const currentMultIndex = multipliers.indexOf(visibleMultipliers[0].multiplier);
        const nextMult = multipliers[currentMultIndex + 1];
        visibleMultipliers.push({ multiplier: nextMult, spacing: baseSpacing * nextMult });
    }

    const drawLines = (spacing, alpha, weight) => {
        if (spacing <= 0) return;

        const hexToRgba = (hex, a) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
        };

        ctx2d.strokeStyle = hexToRgba(gridOptions.color, alpha);
        ctx2d.lineWidth = weight / zoom; // Grid kalınlığını zoom'a göre ayarla
        ctx2d.beginPath();

        const startX = Math.floor(worldLeft / spacing) * spacing;
        const startY = Math.floor(worldTop / spacing) * spacing;

        // Çizgileri ekranın biraz dışına taşırarak kenarlarda kaybolmayı önle
        const buffer = spacing;
        for (let x = startX; x <= worldRight + buffer; x += spacing) {
            ctx2d.moveTo(x, worldTop - buffer);
            ctx2d.lineTo(x, worldBottom + buffer);
        }

        for (let y = startY; y <= worldBottom + buffer; y += spacing) {
            ctx2d.moveTo(worldLeft - buffer, y);
            ctx2d.lineTo(worldRight + buffer, y);
        }

        ctx2d.stroke();
    };

    // Grid seviyelerini çiz (en kalın en altta)
    visibleMultipliers.reverse().forEach((item, index) => {
         const numVisible = visibleMultipliers.length;
         // Alfa ve kalınlık ayarları
         let alpha = 0.15; // En ince
         let weight = gridOptions.weight * 0.5;
         if (numVisible > 1 && index === numVisible - 2) { // Ortanca
             alpha = 0.3;
             weight = gridOptions.weight * 0.7;
         } else if (index === numVisible - 1) { // En kalın
             alpha = 0.5;
             weight = gridOptions.weight;
         }

        drawLines(item.spacing, alpha, weight);
    });
}

export function isMouseOverWall() {
    // Duvar kalınlığına göre kontrol et
    for (const w of state.walls) {
         const wallPx = w.thickness || WALL_THICKNESS;
         const bodyHitToleranceSq = (wallPx / 2)**2;
        if (distToSegmentSquared(state.mousePos, w.p1, w.p2) < bodyHitToleranceSq) {
            return true;
        }
    }
    return false;
}


export function drawVentSymbol(wall, vent) {
    const { ctx2d } = dom;
    const { selectedObject } = state;

    if (!wall || !wall.p1 || !wall.p2) return;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (wallLen < 1) return;

    const dx = (wall.p2.x - wall.p1.x) / wallLen;
    const dy = (wall.p2.y - wall.p1.y) / wallLen;
    const nx = -dy, ny = dx;

    const startPos = vent.pos - vent.width / 2;
    const endPos = vent.pos + vent.width / 2;
    const ventP1 = { x: wall.p1.x + dx * startPos, y: wall.p1.y + dy * startPos };
    const ventP2 = { x: wall.p1.x + dx * endPos, y: wall.p1.y + dy * endPos };

    const wallPx = wall.thickness || WALL_THICKNESS;
    const halfWall = wallPx / 2;

    const isSelected = selectedObject?.type === "vent" && selectedObject.object === vent;
    ctx2d.strokeStyle = color; //ctx2d.strokeStyle = isSelected ? "#8ab4f8" : "#e57373";
    ctx2d.fillStyle = "rgba(229, 115, 115, 0.2)";
    ctx2d.lineWidth = 1.5;

    const box1_start = { x: ventP1.x - nx * halfWall, y: ventP1.y - ny * halfWall };
    const box1_end = { x: ventP1.x + nx * halfWall, y: ventP1.y + ny * halfWall };
    const box2_start = { x: ventP2.x - nx * halfWall, y: ventP2.y - ny * halfWall };
    const box2_end = { x: ventP2.x + nx * halfWall, y: ventP2.y + ny * halfWall };

    ctx2d.beginPath();
    ctx2d.moveTo(box1_start.x, box1_start.y);
    ctx2d.lineTo(box1_end.x, box1_end.y);
    ctx2d.lineTo(box2_end.x, box2_end.y);
    ctx2d.lineTo(box2_start.x, box2_start.y);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();

    const numLines = 3;
    for (let i = 1; i <= numLines; i++) {
        const t = i / (numLines + 1);
        const lineX = ventP1.x + (ventP2.x - ventP1.x) * t;
        const lineY = ventP1.y + (ventP2.y - ventP1.y) * t;

        ctx2d.beginPath();
        ctx2d.moveTo(lineX - nx * halfWall * 0.8, lineY - ny * halfWall * 0.8);
        ctx2d.lineTo(lineX + nx * halfWall * 0.8, lineY + ny * halfWall * 0.8);
        ctx2d.stroke();
    }
}

export function drawColumnSymbol(node) {
    const { ctx2d } = dom;

    const size = node.columnSize || 30;

    ctx2d.fillStyle = "#8ab4f8";
    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 2;

    ctx2d.beginPath();
    ctx2d.rect(node.x - size / 2, node.y - size / 2, size, size);
    ctx2d.fill();
    ctx2d.stroke();

    ctx2d.strokeStyle = "#ffffff";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(node.x - size / 2, node.y - size / 2);
    ctx2d.lineTo(node.x + size / 2, node.y + size / 2);
    ctx2d.moveTo(node.x + size / 2, node.y - size / 2);
    ctx2d.lineTo(node.x - size / 2, node.y + size / 2);
    ctx2d.stroke();
}

export function drawColumn(column, isSelected = false) {
    const { ctx2d } = dom;
    const { zoom, wallBorderColor, lineThickness, walls } = state;
    
    const corners = getColumnCorners(column);
    
    // İç renk = Duvar iç rengi (BG)
    ctx2d.fillStyle = BG;
    ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
    ctx2d.lineWidth = lineThickness / zoom;
    
    // Dış kare - ÖNCE DOLGU
    ctx2d.beginPath();
    ctx2d.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) {
        ctx2d.lineTo(corners[i].x, corners[i].y);
    }
    ctx2d.closePath();
    ctx2d.fill();
    
    // KENARLAR - Her kenarı ayrı kontrol et
    // KENARLAR - Sadece kesişen kısımları gizle
for (let i = 0; i < corners.length; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % corners.length];
    
    // Kenarı parçalara böl
    const segments = [];
    const numSegments = 20; // Her kenarı 20 parçaya böl
    
    for (let j = 0; j < numSegments; j++) {
        const t1 = j / numSegments;
        const t2 = (j + 1) / numSegments;
        
        const seg1 = {
            x: p1.x + (p2.x - p1.x) * t1,
            y: p1.y + (p2.y - p1.y) * t1
        };
        const seg2 = {
            x: p1.x + (p2.x - p1.x) * t2,
            y: p1.y + (p2.y - p1.y) * t2
        };
        
        // Bu segment duvarla çakışıyor mu?
        const midX = (seg1.x + seg2.x) / 2;
        const midY = (seg1.y + seg2.y) / 2;
        
        let overlapWithWall = false;
        const OVERLAP_TOLERANCE = 8;
        
        for (const wall of walls) {
            if (!wall || !wall.p1 || !wall.p2) continue;
            
            const distToWall = Math.sqrt(distToSegmentSquared(
                { x: midX, y: midY },
                wall.p1,
                wall.p2
            ));
            
            const wallThickness = wall.thickness || WALL_THICKNESS;
            
            if (distToWall < wallThickness / 2 + OVERLAP_TOLERANCE) {
                overlapWithWall = true;
                break;
            }
        }
        
        // Duvarla çakışmıyorsa bu segmenti çiz
        if (!overlapWithWall) {
            segments.push({ p1: seg1, p2: seg2 });
        }
    }
    
    // Çizilecek segmentleri çiz
    segments.forEach(seg => {
        ctx2d.beginPath();
        ctx2d.moveTo(seg.p1.x, seg.p1.y);
        ctx2d.lineTo(seg.p2.x, seg.p2.y);
        ctx2d.stroke();
    });
}
    // İçi boş kısmı çiz (L şekli)
    if (column.hollowWidth && column.hollowHeight) {
        const halfHollowW = column.hollowWidth / 2;
        const halfHollowH = column.hollowHeight / 2;
        const cx = column.center.x;
        const cy = column.center.y;
        const rot = (column.rotation || 0) * Math.PI / 180;
        
        const offsetX = column.hollowOffsetX || 0;
        const offsetY = column.hollowOffsetY || 0;
        
        const hollowCorners = [
            { x: offsetX - halfHollowW, y: offsetY - halfHollowH },
            { x: offsetX + halfHollowW, y: offsetY - halfHollowH },
            { x: offsetX + halfHollowW, y: offsetY + halfHollowH },
            { x: offsetX - halfHollowW, y: offsetY + halfHollowH }
        ].map(corner => {
            const rotatedX = corner.x * Math.cos(rot) - corner.y * Math.sin(rot);
            const rotatedY = corner.x * Math.sin(rot) + corner.y * Math.cos(rot);
            return { x: cx + rotatedX, y: cy + rotatedY };
        });
        
        // İç boşluk rengi = Oda rengi
        ctx2d.fillStyle = state.roomFillColor;
        ctx2d.strokeStyle = isSelected ? '#8ab4f8' : wallBorderColor;
        ctx2d.lineWidth = lineThickness / zoom;
        
        ctx2d.beginPath();
        ctx2d.moveTo(hollowCorners[0].x, hollowCorners[0].y);
        for (let i = 1; i < hollowCorners.length; i++) {
            ctx2d.lineTo(hollowCorners[i].x, hollowCorners[i].y);
        }
        ctx2d.closePath();
        ctx2d.fill();
        ctx2d.stroke();
    }
    
    // Handle'ları göster (seçiliyse)
    if (isSelected) {
        const handleRadius = 6 / zoom;
        
        // Merkez handle (yeşil)
        ctx2d.fillStyle = '#4ade80';
        ctx2d.beginPath();
        ctx2d.arc(column.center.x, column.center.y, handleRadius, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.stroke();
        
        // Köşe handle (sağ üst - mavi)
        const cornerHandle = corners[1];
        ctx2d.fillStyle = '#3b82f6';
        ctx2d.beginPath();
        ctx2d.arc(cornerHandle.x, cornerHandle.y, handleRadius * 1.2, 0, Math.PI * 2);
        ctx2d.fill();
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth = 2 / zoom;
        ctx2d.stroke();
    }
}