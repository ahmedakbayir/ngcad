import { state, dom, BG } from './main.js';

// --- YARDIMCI FONKSİYONLAR ---

function darkenColor(hex, percent) { /* ... (değişiklik yok) ... */ let color = hex.startsWith('#') ? hex.slice(1) : hex; let r = parseInt(color.substring(0,2), 16); let g = parseInt(color.substring(2,4), 16); let b = parseInt(color.substring(4,6), 16); r = parseInt(r * (100 - percent) / 100); g = parseInt(g * (100 - percent) / 100); b = parseInt(b * (100 - percent) / 100); r = (r<0)?0:r; g = (g<0)?0:g; b = (b<0)?0:b; const rStr = (r.toString(16).length<2)?'0'+r.toString(16):r.toString(16); const gStr = (g.toString(16).length<2)?'0'+g.toString(16):g.toString(16); const bStr = (b.toString(16).length<2)?'0'+b.toString(16):b.toString(16); return `#${rStr}${gStr}${bStr}`; }

// İki _sonsuz_ çizginin kesişim noktasını bulur
function getInfiniteLineIntersection(line1_p1, line1_p2, line2_p1, line2_p2) {
    const x1 = line1_p1.x, y1 = line1_p1.y, x2 = line1_p2.x, y2 = line1_p2.y;
    const x3 = line2_p1.x, y3 = line2_p1.y, x4 = line2_p2.x, y4 = line2_p2.y;
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denominator) < 1e-6) { return null; } // Paralel
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const intersectX = x1 + t * (x2 - x1);
    const intersectY = y1 + t * (y2 - y1);
    if (!isFinite(intersectX) || !isFinite(intersectY)){ return null; }
    return { x: intersectX, y: intersectY };
}

// Bir duvarın BELİRLİ BİR NODE'A GÖRE sol/sağ ofset çizgilerini (sonsuz) hesaplar
function getWallOffsetLinesRelativeToNode(wall, node, wallPx) {
    const thickness = wall.thickness || wallPx;
    const halfThickness = thickness / 2;

    // Duvarın node'dan çıkan yön vektörünü bul
    let dx, dy;
    if (wall.p1 === node) { // Node başlangıç noktasıysa, p1->p2 yönü
        dx = wall.p2.x - wall.p1.x;
        dy = wall.p2.y - wall.p1.y;
    } else if (wall.p2 === node) { // Node bitiş noktasıysa, p2->p1 yönü
        dx = wall.p1.x - wall.p2.x;
        dy = wall.p1.y - wall.p2.y;
    } else {
        return null; // Node duvara ait değilse
    }

    const len = Math.hypot(dx, dy);
    if (len < 0.1) return null;

    // Node'dan dışarı doğru bakarkenki SOL normal
    const nxLeft = -dy / len;
    const nyLeft = dx / len;
    // Node'dan dışarı doğru bakarkenki SAĞ normal
    const nxRight = dy / len;
    const nyRight = -dx / len;

    // Node'dan başlayıp diğer uca doğru giden çizgiler
    const otherNode = (wall.p1 === node) ? wall.p2 : wall.p1;

    const lineLeft = {
        p1: { x: node.x + nxLeft * halfThickness, y: node.y + nyLeft * halfThickness },
        p2: { x: otherNode.x + nxLeft * halfThickness, y: otherNode.y + nyLeft * halfThickness }
    };
    const lineRight = {
        p1: { x: node.x + nxRight * halfThickness, y: node.y + nyRight * halfThickness },
        p2: { x: otherNode.x + nxRight * halfThickness, y: otherNode.y + nyRight * halfThickness }
    };

    return { lineLeft, lineRight };
}


// --- DUVAR ÇİZİM FONKSİYONLARI ---

// Kesişimleri hesaplar ve iki paralel çizgi çizer (Yön Bağımlı Sağ/Sol v7)
const drawNormalSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / state.zoom;
    ctx2d.lineCap = "butt";
    ctx2d.lineJoin = "miter";

    segmentList.forEach((seg) => {
        const wall = seg.wall;
        const node1 = wall.p1; const node2 = wall.p2;
        const thickness = wall.thickness || wallPx; const halfThickness = thickness / 2;
        const seg_p1 = seg.p1; const seg_p2 = seg.p2;

        const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy); if (len < 0.1) return;
        // p1->p2 yönüne göre normaller
        const nxLeft = -dy / len; const nyLeft = dx / len; // Sol normal
        const nxRight = dy / len; const nyRight = -dx / len; // Sağ normal

        // Hesaplanan köşe noktalarını al (varsa) -> { pointA: Point, pointB: Point }
        const corner1 = precalculatedCorners.get(node1);
        const corner2 = precalculatedCorners.get(node2);

        // Segmentin basit ofset noktaları (Sağ/Sol) - p1->p2 yönüne göre
        const simpleStartLeft = { x: seg_p1.x + nxLeft * halfThickness, y: seg_p1.y + nyLeft * halfThickness };
        const simpleStartRight = { x: seg_p1.x + nxRight * halfThickness, y: seg_p1.y + nyRight * halfThickness };
        const simpleEndLeft   = { x: seg_p2.x + nxLeft * halfThickness, y: seg_p2.y + nyLeft * halfThickness };
        const simpleEndRight   = { x: seg_p2.x + nxRight * halfThickness, y: seg_p2.y + nyRight * halfThickness };

        // Başlangıç ve Bitiş noktalarını ayarla
        let startLeft = simpleStartLeft, startRight = simpleStartRight;
        let endLeft = simpleEndLeft,     endRight = simpleEndRight;

        // Başlangıç Noktası Ayarlama
        if (corner1 && Math.hypot(seg_p1.x - node1.x, seg_p1.y - node1.y) < 0.1) {
             // Basit 'Left' ofsetine (p1->p2 yönü) en yakın hesaplanmış köşe noktasını bul
             const dist_A_vs_Left = Math.hypot(corner1.pointA.x - simpleStartLeft.x, corner1.pointA.y - simpleStartLeft.y);
             const dist_B_vs_Left = Math.hypot(corner1.pointB.x - simpleStartLeft.x, corner1.pointB.y - simpleStartLeft.y);
             startLeft = (dist_A_vs_Left < dist_B_vs_Left) ? corner1.pointA : corner1.pointB;
             startRight = (startLeft === corner1.pointA) ? corner1.pointB : corner1.pointA;
        }

        // Bitiş Noktası Ayarlama
        if (corner2 && Math.hypot(seg_p2.x - node2.x, seg_p2.y - node2.y) < 0.1) {
             // Basit 'Left' ofsetine (p1->p2 yönü) en yakın hesaplanmış köşe noktasını bul
             const dist_A_vs_Left = Math.hypot(corner2.pointA.x - simpleEndLeft.x, corner2.pointA.y - simpleEndLeft.y);
             const dist_B_vs_Left = Math.hypot(corner2.pointB.x - simpleEndLeft.x, corner2.pointB.y - simpleEndLeft.y);
             endLeft = (dist_A_vs_Left < dist_B_vs_Left) ? corner2.pointA : corner2.pointB;
             endRight = (endLeft === corner2.pointA) ? corner2.pointB : corner2.pointA;
        }

        // Her segment için ayrı bir path başlat
        ctx2d.beginPath();

        // Ayarlanmış çizgileri çiz
        ctx2d.moveTo(startLeft.x, startLeft.y);
        ctx2d.lineTo(endLeft.x, endLeft.y);
        ctx2d.moveTo(startRight.x, startRight.y);
        ctx2d.lineTo(endRight.x, endRight.y);

        // Segment uçlarını kapat
        const connectsAtStart = nodeWallConnections.get(node1)?.length > 1;
        if (Math.hypot(seg_p1.x - wall.p1.x, seg_p1.y - wall.p1.y) > 0.1 || !connectsAtStart) {
             const capStartLeft = (!connectsAtStart || !corner1) ? simpleStartLeft : startLeft;
             const capStartRight = (!connectsAtStart || !corner1) ? simpleStartRight : startRight;
             ctx2d.moveTo(capStartLeft.x, capStartLeft.y);
             ctx2d.lineTo(capStartRight.x, capStartRight.y);
        }
        const connectsAtEnd = nodeWallConnections.get(node2)?.length > 1;
        if (Math.hypot(seg_p2.x - wall.p2.x, seg_p2.y - wall.p2.y) > 0.1 || !connectsAtEnd) {
             const capEndLeft = (!connectsAtEnd || !corner2) ? simpleEndLeft : endLeft;
             const capEndRight = (!connectsAtEnd || !corner2) ? simpleEndRight : endRight;
             ctx2d.moveTo(capEndLeft.x, capEndLeft.y);
             ctx2d.lineTo(capEndRight.x, capEndRight.y);
        }

        ctx2d.stroke(); // Bu segmentin çizgilerini çiz
    }); // Segment döngüsü sonu
};


// --- (Diğer çizim fonksiyonları: drawGlassSegments, drawBalconySegments - değişiklik yok) ---
const drawGlassSegments = (ctx2d, segmentList, color, wallPx) => { /* ... önceki kod ... */ if (segmentList.length === 0) return; const thickness = segmentList[0]?.wall?.thickness || wallPx; const spacing = 4; ctx2d.strokeStyle = color; ctx2d.lineWidth = 1.5; ctx2d.lineCap = "butt"; ctx2d.lineJoin = "miter"; segmentList.forEach((seg)=>{ if(Math.hypot(seg.p1.x-seg.p2.x, seg.p1.y-seg.p2.y)<1) return; const dx=seg.p2.x-seg.p1.x; const dy=seg.p2.y-seg.p1.y; const length=Math.hypot(dx,dy); const dirX=dx/length; const dirY=dy/length; const normalX=-dirY; const normalY=dirX; const offset=spacing/2; ctx2d.beginPath(); ctx2d.moveTo(seg.p1.x+normalX*offset, seg.p1.y+normalY*offset); ctx2d.lineTo(seg.p2.x+normalX*offset, seg.p2.y+normalY*offset); ctx2d.stroke(); ctx2d.beginPath(); ctx2d.moveTo(seg.p1.x-normalX*offset, seg.p1.y-normalY*offset); ctx2d.lineTo(seg.p2.x-normalX*offset, seg.p2.y-normalY*offset); ctx2d.stroke(); const connectionSpacing=30; const numConnections=Math.floor(length/connectionSpacing); ctx2d.beginPath(); for(let i=0; i<=numConnections; i++){ const t=i/numConnections; if(length*t > length+0.1) continue; const dist=Math.min(length, i*connectionSpacing+connectionSpacing/2); if(i===0) dist=Math.min(length, connectionSpacing/2); if(dist > length) continue; const midX=seg.p1.x+dirX*dist; const midY=seg.p1.y+dirY*dist; ctx2d.moveTo(midX+normalX*offset, midY+normalY*offset); ctx2d.lineTo(midX-normalX*offset, midY-normalY*offset); } ctx2d.stroke(); }); };
const drawBalconySegments = (ctx2d, segmentList, color) => { /* ... önceki kod ... */ if (segmentList.length === 0) return; ctx2d.strokeStyle = color; ctx2d.lineWidth = 1.5; ctx2d.lineCap = "butt"; ctx2d.lineJoin = "miter"; ctx2d.beginPath(); segmentList.forEach((seg)=>{ if(Math.hypot(seg.p1.x-seg.p2.x, seg.p1.y-seg.p2.y)>=1){ ctx2d.moveTo(seg.p1.x, seg.p1.y); ctx2d.lineTo(seg.p2.x, seg.p2.y); } }); ctx2d.stroke(); };
// Yarım duvarları da 'drawNormalSegments' ile çizip sonra içini dolduralım
const drawHalfSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners) => {
     if (segmentList.length === 0) return;

    // Önce normal segment gibi çizgilerini çiz (yeni köşe mantığıyla)
    drawNormalSegments(ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);

    // Sonra içini doldur
    ctx2d.fillStyle = "rgba(150, 150, 150, 0.3)";
    segmentList.forEach((seg) => {
        const wall = seg.wall; const node1 = wall.p1; const node2 = wall.p2;
        const thickness = wall.thickness || wallPx; const halfThickness = thickness / 2;
        const seg_p1 = seg.p1; const seg_p2 = seg.p2;
        const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy); if (len < 0.1) return;
        const nxLeft = -dy / len; const nyLeft = dx / len; // Sol normal
        const nxRight = dy / len; const nyRight = -dx / len; // Sağ normal
        const corner1 = precalculatedCorners.get(node1); const corner2 = precalculatedCorners.get(node2);

        // Dolgu için köşeleri tekrar hesapla/al
        let startLeft, startRight, endLeft, endRight;
        const simpleStartLeft = { x: seg_p1.x + nxLeft * halfThickness, y: seg_p1.y + nyLeft * halfThickness }; const simpleStartRight = { x: seg_p1.x + nxRight * halfThickness, y: seg_p1.y + nyRight * halfThickness };
        const simpleEndLeft   = { x: seg_p2.x + nxLeft * halfThickness, y: seg_p2.y + nyLeft * halfThickness }; const simpleEndRight   = { x: seg_p2.x + nxRight * halfThickness, y: seg_p2.y + nyRight * halfThickness };
        if (corner1 && Math.hypot(seg_p1.x-node1.x, seg_p1.y-node1.y)<0.1) { const dist_A_vs_Left=Math.hypot(corner1.pointA.x-simpleStartLeft.x, corner1.pointA.y-simpleStartLeft.y); const dist_B_vs_Left=Math.hypot(corner1.pointB.x-simpleStartLeft.x, corner1.pointB.y-simpleStartLeft.y); startLeft=(dist_A_vs_Left<dist_B_vs_Left)?corner1.pointA:corner1.pointB; startRight=(startLeft===corner1.pointA)?corner1.pointB:corner1.pointA;} else { startLeft=simpleStartLeft; startRight=simpleStartRight; }
        if (corner2 && Math.hypot(seg_p2.x-node2.x, seg_p2.y-node2.y)<0.1) { const dist_A_vs_Left=Math.hypot(corner2.pointA.x-simpleEndLeft.x, corner2.pointA.y-simpleEndLeft.y); const dist_B_vs_Left=Math.hypot(corner2.pointB.x-simpleEndLeft.x, corner2.pointB.y-simpleEndLeft.y); endLeft=(dist_A_vs_Left<dist_B_vs_Left)?corner2.pointA:corner2.pointB; endRight=(endLeft===corner2.pointA)?corner2.pointB:corner2.pointA;} else { endLeft=simpleEndLeft; endRight=simpleEndRight; }

        ctx2d.beginPath();
        ctx2d.moveTo(startLeft.x, startLeft.y);
        ctx2d.lineTo(endLeft.x, endLeft.y);
        ctx2d.lineTo(endRight.x, endRight.y); // Doğru sıra: Sol ucu, Sağ ucu
        ctx2d.lineTo(startRight.x, startRight.y);
        ctx2d.closePath();
        ctx2d.fill();
    });
};

// --- ANA EXPORT FONKSİYONU ---
export function drawWallGeometry(ctx2d, state, BG) {
    const { walls, doors, selectedObject, selectedGroup, wallBorderColor, lineThickness, nodes } = state;
    const wallPx = state.wallThickness;

    // --- KÖŞE HESAPLAMALARI (Çizimden Önce) ---
    const nodeWallConnections = new Map();
    nodes.forEach(node => nodeWallConnections.set(node, []));
    walls.forEach(wall => {
        if (!wall || !wall.p1 || !wall.p2) return;
        if (nodeWallConnections.has(wall.p1)) nodeWallConnections.get(wall.p1).push(wall);
        if (nodeWallConnections.has(wall.p2)) nodeWallConnections.get(wall.p2).push(wall);
    });

    const precalculatedCorners = new Map(); // Map<Node, { pointA: Point, pointB: Point } | null>
    nodeWallConnections.forEach((connectedWalls, node) => {
        // Sadece tam olarak 2 duvarın birleştiği VE AYNI TİPTE ('normal' veya 'half') olduğu köşeleri hesapla
        if ( connectedWalls.length === 2 &&
            (connectedWalls[0].wallType || 'normal') === (connectedWalls[1].wallType || 'normal') &&
            ['normal', 'half'].includes(connectedWalls[0].wallType || 'normal')
           )
        {
            const wall1 = connectedWalls[0];
            const wall2 = connectedWalls[1];
            // Kendi kalınlıklarını veya varsayılanı kullanarak offset çizgilerini al (Node'a GÖRE)
            const offsetLines1 = getWallOffsetLinesRelativeToNode(wall1, node, wallPx);
            const offsetLines2 = getWallOffsetLinesRelativeToNode(wall2, node, wallPx);

            if (offsetLines1 && offsetLines2) {
                // Kesişim 1: wall1.Right(node) ile wall2.Left(node)
                const intersection1R2L = getInfiniteLineIntersection(
                    offsetLines1.lineRight.p1, offsetLines1.lineRight.p2, // p1=node varsayımı
                    offsetLines2.lineLeft.p1,  offsetLines2.lineLeft.p2
                );
                // Kesişim 2: wall1.Left(node) ile wall2.Right(node)
                const intersection1L2R = getInfiniteLineIntersection(
                    offsetLines1.lineLeft.p1,  offsetLines1.lineLeft.p2,
                    offsetLines2.lineRight.p1, offsetLines2.lineRight.p2
                );

                if (intersection1R2L && intersection1L2R) {
                     const distSqA = Math.hypot(intersection1R2L.x - node.x, intersection1R2L.y - node.y)**2;
                     const distSqB = Math.hypot(intersection1L2R.x - node.x, intersection1L2R.y - node.y)**2;
                     const maxDistSq = ( (wall1.thickness||wallPx) + (wall2.thickness||wallPx) )**2 * 4;

                     if(distSqA < maxDistSq && distSqB < maxDistSq){
                        precalculatedCorners.set(node, { pointA: intersection1R2L, pointB: intersection1L2R });
                     } else {
                         precalculatedCorners.set(node, null);
                     }
                } else {
                     precalculatedCorners.set(node, null);
                }
            } else {
                precalculatedCorners.set(node, null);
            }
        } else {
            precalculatedCorners.set(node, null);
        }
    });
    // --- KÖŞE HESAPLAMALARI SONU ---

    // Segment ayırma (değişiklik yok)
    const normalSegments = { ortho: [], nonOrtho: [], selected: [] };
    const balconySegments = { ortho: [], nonOrtho: [], selected: [] };
    const glassSegments = { ortho: [], nonOrtho: [], selected: [] };
    const halfSegments = { ortho: [], nonOrtho: [], selected: [] };
    walls.forEach((w) => { /* ... segment ayırma kodu ... */
        if (!w.p1 || !w.p2) return;
        const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w);
        const isOrthogonal = Math.abs(w.p1.x - w.p2.x) < 0.1 || Math.abs(w.p1.y - w.p2.y) < 0.1;
        const wallLen = Math.hypot(w.p2.x - w.p1.x, w.p2.y - w.p1.y); if (wallLen < 0.1) return;
        const wallDoors = doors.filter((d) => d.wall === w).sort((a, b) => a.pos - b.pos);
        let currentSegments = []; let lastPos = 0;
        wallDoors.forEach((door) => { const doorStart = door.pos - door.width / 2; if (doorStart > lastPos + 0.1) { currentSegments.push({ start: lastPos, end: doorStart }); } lastPos = door.pos + door.width / 2; });
        if (wallLen - lastPos > 0.1) { currentSegments.push({ start: lastPos, end: wallLen }); }
        const dx = (w.p2.x - w.p1.x) / wallLen; const dy = (w.p2.y - w.p1.y) / wallLen;
        const wallType = w.wallType || 'normal'; let targetList;
        if (wallType === 'balcony') targetList = balconySegments; else if (wallType === 'glass') targetList = glassSegments; else if (wallType === 'half') targetList = halfSegments; else targetList = normalSegments;
        currentSegments.forEach((seg) => { let p1 = { x: w.p1.x + dx * seg.start, y: w.p1.y + dy * seg.start }; let p2 = { x: w.p1.x + dx * seg.end, y: w.p1.y + dy * seg.end }; const segmentData = { p1: {...p1}, p2: {...p2}, wall: w }; if (isSelected) { targetList.selected.push(segmentData); } else if (isOrthogonal) { targetList.ortho.push(segmentData); } else { targetList.nonOrtho.push(segmentData); } });
     });

    // Gruplanmış segmentleri ilgili çizim fonksiyonlarıyla çiz
    drawNormalSegments(ctx2d, normalSegments.ortho, wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawNormalSegments(ctx2d, normalSegments.nonOrtho, "#e57373", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawNormalSegments(ctx2d, normalSegments.selected, "#8ab4f8", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);

    drawBalconySegments(ctx2d, balconySegments.ortho, wallBorderColor);
    drawBalconySegments(ctx2d, balconySegments.nonOrtho, "#e57373");
    drawBalconySegments(ctx2d, balconySegments.selected, "#8ab4f8");

    drawGlassSegments(ctx2d, glassSegments.ortho, wallBorderColor, wallPx);
    drawGlassSegments(ctx2d, glassSegments.nonOrtho, "#e57373", wallPx);
    drawGlassSegments(ctx2d, glassSegments.selected, "#8ab4f8", wallPx);

    // Yarım duvarlar (köşe kırpma + dolgu)
    drawHalfSegments(ctx2d, halfSegments.ortho, wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawHalfSegments(ctx2d, halfSegments.nonOrtho, "#e57373", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawHalfSegments(ctx2d, halfSegments.selected, "#8ab4f8", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);


    // Varsayılan ayarlara dön
    ctx2d.lineCap = "butt";
    ctx2d.lineJoin = "miter";
}