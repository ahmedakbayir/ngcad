import { state, dom, BG, getObjectOpacity } from '../general-files/main.js';

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


// --- ARC DUVAR ÇİZİM FONKSİYONU ---

// Arc duvarlar için bezier eğrisi çizer
const drawArcSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / state.zoom;
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";

    segmentList.forEach(seg => {
        const wall = seg.wall;
        if (!wall.arcControl1 || !wall.arcControl2) return;

        const thickness = wall.thickness || wallPx;
        const halfThickness = thickness / 2;

        // Ana bezier eğrisini çiz
        const p1 = wall.p1;
        const p2 = wall.p2;
        const c1 = wall.arcControl1;
        const c2 = wall.arcControl2;

        // Eğri boyunca normal vektörleri hesaplayarak paralel eğriler oluştur
        // Basit yaklaşım: Eğriyi örnekle ve her noktada normal hesapla
        const numSamples = 50;
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            // Cubic Bezier formülü: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y;

            // Türev (接線 vektörü)
            const dx = -3 * mt2 * p1.x + 3 * mt2 * c1.x - 6 * mt * t * c1.x - 3 * t2 * c2.x + 6 * mt * t * c2.x + 3 * t2 * p2.x;
            const dy = -3 * mt2 * p1.y + 3 * mt2 * c1.y - 6 * mt * t * c1.y - 3 * t2 * c2.y + 6 * mt * t * c2.y + 3 * t2 * p2.y;

            const len = Math.hypot(dx, dy);
            if (len > 0.001) {
                // Normal vektörü (接線の垂直)
                const nx = -dy / len;
                const ny = dx / len;

                leftPoints.push({ x: x + nx * halfThickness, y: y + ny * halfThickness });
                rightPoints.push({ x: x - nx * halfThickness, y: y - ny * halfThickness });
            }
        }

        // Sol eğriyi çiz (stroke)
        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length; i++) {
            ctx2d.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
        ctx2d.stroke();

        // Sağ eğriyi çiz (stroke)
        ctx2d.beginPath();
        ctx2d.moveTo(rightPoints[0].x, rightPoints[0].y);
        for (let i = 1; i < rightPoints.length; i++) {
            ctx2d.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx2d.stroke();

        // Uç noktaları birleştir
        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[0].x, leftPoints[0].y);
        ctx2d.lineTo(rightPoints[0].x, rightPoints[0].y);
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[leftPoints.length - 1].x, leftPoints[leftPoints.length - 1].y);
        ctx2d.lineTo(rightPoints[rightPoints.length - 1].x, rightPoints[rightPoints.length - 1].y);
        ctx2d.stroke();

        // İçini doldur (BG rengi ile)
        ctx2d.fillStyle = BG;
        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length; i++) {
            ctx2d.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
        for (let i = rightPoints.length - 1; i >= 0; i--) {
            ctx2d.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx2d.closePath();
        ctx2d.fill();
    });
};

// Arc balkon duvarlar için - sadece merkez çizgisi
const drawArcBalconySegments = (ctx2d, segmentList, color) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1.5 / state.zoom;
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";

    segmentList.forEach(seg => {
        const wall = seg.wall;
        if (!wall.arcControl1 || !wall.arcControl2) return;

        const p1 = wall.p1;
        const p2 = wall.p2;
        const c1 = wall.arcControl1;
        const c2 = wall.arcControl2;

        // Bezier eğrisini çiz
        const numSamples = 50;
        ctx2d.beginPath();
        ctx2d.moveTo(p1.x, p1.y);

        for (let i = 1; i <= numSamples; i++) {
            const t = i / numSamples;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y;

            ctx2d.lineTo(x, y);
        }
        ctx2d.stroke();
    });
};

// Arc camekan (glass) duvarlar için - iki paralel ince çizgi ve bağlantılar
const drawArcGlassSegments = (ctx2d, segmentList, color) => {
    if (segmentList.length === 0) return;

    const spacing = 3; // Çizgiler arası boşluk
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 3 / state.zoom;
    ctx2d.lineCap = "round";
    ctx2d.lineJoin = "round";

    segmentList.forEach(seg => {
        const wall = seg.wall;
        if (!wall.arcControl1 || !wall.arcControl2) return;

        const p1 = wall.p1;
        const p2 = wall.p2;
        const c1 = wall.arcControl1;
        const c2 = wall.arcControl2;

        // Eğri boyunca noktaları örnekle
        const numSamples = 50;
        const leftPoints = [];
        const rightPoints = [];
        const centerPoints = [];

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y;

            // Türev (tangent vektörü)
            const dx = -3 * mt2 * p1.x + 3 * mt2 * c1.x - 6 * mt * t * c1.x - 3 * t2 * c2.x + 6 * mt * t * c2.x + 3 * t2 * p2.x;
            const dy = -3 * mt2 * p1.y + 3 * mt2 * c1.y - 6 * mt * t * c1.y - 3 * t2 * c2.y + 6 * mt * t * c2.y + 3 * t2 * p2.y;

            const len = Math.hypot(dx, dy);
            if (len > 0.001) {
                // Normal vektörü
                const nx = -dy / len;
                const ny = dx / len;
                const offset = spacing / 2;

                leftPoints.push({ x: x + nx * offset, y: y + ny * offset });
                rightPoints.push({ x: x - nx * offset, y: y - ny * offset });
                centerPoints.push({ x, y });
            }
        }

        // Sol paralel çizgiyi çiz
        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length; i++) {
            ctx2d.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
        ctx2d.stroke();

        // Sağ paralel çizgiyi çiz
        ctx2d.beginPath();
        ctx2d.moveTo(rightPoints[0].x, rightPoints[0].y);
        for (let i = 1; i < rightPoints.length; i++) {
            ctx2d.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx2d.stroke();

        // Bağlantı çizgileri - her 30cm'de bir
        const connectionSpacing = 30;
        let totalLength = 0;
        const lengths = [0];
        for (let i = 1; i < centerPoints.length; i++) {
            const segLen = Math.hypot(
                centerPoints[i].x - centerPoints[i - 1].x,
                centerPoints[i].y - centerPoints[i - 1].y
            );
            totalLength += segLen;
            lengths.push(totalLength);
        }

        const numConnections = Math.floor(totalLength / connectionSpacing);
        ctx2d.beginPath();
        for (let i = 0; i <= numConnections; i++) {
            const targetDist = (i * connectionSpacing) + (connectionSpacing / 2);
            if (i === 0 || targetDist > totalLength) continue;

            // targetDist'e karşılık gelen sample noktasını bul
            let idx = lengths.findIndex(l => l >= targetDist);
            if (idx > 0 && idx < leftPoints.length) {
                ctx2d.moveTo(leftPoints[idx].x, leftPoints[idx].y);
                ctx2d.lineTo(rightPoints[idx].x, rightPoints[idx].y);
            }
        }
        ctx2d.stroke();
    });
};

// Arc yarım duvarlar için
const drawArcHalfSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG) => {
    if (segmentList.length === 0) return;

    // Önce normal arc duvar gibi çiz
    drawArcSegments(ctx2d, segmentList, color, lineThickness, wallPx, BG);

    // Sonra yarım duvar dolgusunu ekle (yarı saydam gri)
    ctx2d.fillStyle = "rgba(128, 128, 128, 0.3)";

    segmentList.forEach(seg => {
        const wall = seg.wall;
        if (!wall.arcControl1 || !wall.arcControl2) return;

        const thickness = wall.thickness || wallPx;
        const halfThickness = thickness / 2;

        const p1 = wall.p1;
        const p2 = wall.p2;
        const c1 = wall.arcControl1;
        const c2 = wall.arcControl2;

        const numSamples = 50;
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i <= numSamples; i++) {
            const t = i / numSamples;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x;
            const y = mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y;

            // Türev
            const dx = -3 * mt2 * p1.x + 3 * mt2 * c1.x - 6 * mt * t * c1.x - 3 * t2 * c2.x + 6 * mt * t * c2.x + 3 * t2 * p2.x;
            const dy = -3 * mt2 * p1.y + 3 * mt2 * c1.y - 6 * mt * t * c1.y - 3 * t2 * c2.y + 6 * mt * t * c2.y + 3 * t2 * p2.y;

            const len = Math.hypot(dx, dy);
            if (len > 0.001) {
                const nx = -dy / len;
                const ny = dx / len;

                leftPoints.push({ x: x + nx * halfThickness, y: y + ny * halfThickness });
                rightPoints.push({ x: x - nx * halfThickness, y: y - ny * halfThickness });
            }
        }

        // Yarım duvar dolgusunu çiz
        ctx2d.beginPath();
        ctx2d.moveTo(leftPoints[0].x, leftPoints[0].y);
        for (let i = 1; i < leftPoints.length; i++) {
            ctx2d.lineTo(leftPoints[i].x, leftPoints[i].y);
        }
        for (let i = rightPoints.length - 1; i >= 0; i--) {
            ctx2d.lineTo(rightPoints[i].x, rightPoints[i].y);
        }
        ctx2d.closePath();
        ctx2d.fill();
    });
};

// --- DUVAR ÇİZİM FONKSİYONLARI ---

// Kesişimleri hesaplar ve iki paralel çizgi çizer (Yön Bağımlı Sağ/Sol v7)
// GÜNCELLENDİ: Önce kenarlık (stroke), SONRA dolgu (BG) çizer
const drawNormalSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners) => {
    if (segmentList.length === 0) return;

    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = lineThickness / state.zoom;
    ctx2d.lineCap = "butt";
    ctx2d.lineJoin = "miter";

    // --- GÜNCELLEME: Çizim sırası değişti ---
    // Her segment için iki işlem yapacağız:
    // 1. Kenarlıkları (stroke) çiz
    // 2. Dolguyu (fill) çiz
    // Bu, dolgunun kenarlıkları "ezmesini" sağlar.

    // Köşe verilerini önceden hesapla/sakla
    const segmentCornerData = segmentList.map(seg => {
        const wall = seg.wall;
        const node1 = wall.p1; const node2 = wall.p2;
        const thickness = wall.thickness || wallPx; const halfThickness = thickness / 2;
        const seg_p1 = seg.p1; const seg_p2 = seg.p2;

        const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) return null; // Geçersiz segment

        // p1->p2 yönüne göre normaller
        const nxLeft = -dy / len; const nyLeft = dx / len; // Sol normal
        const nxRight = dy / len; const nyRight = -dx / len; // Sağ normal

        const corner1 = precalculatedCorners.get(node1);
        const corner2 = precalculatedCorners.get(node2);

        const simpleStartLeft = { x: seg_p1.x + nxLeft * halfThickness, y: seg_p1.y + nyLeft * halfThickness };
        const simpleStartRight = { x: seg_p1.x + nxRight * halfThickness, y: seg_p1.y + nyRight * halfThickness };
        const simpleEndLeft   = { x: seg_p2.x + nxLeft * halfThickness, y: seg_p2.y + nyLeft * halfThickness };
        const simpleEndRight   = { x: seg_p2.x + nxRight * halfThickness, y: seg_p2.y + nyRight * halfThickness };

        let startLeft = simpleStartLeft, startRight = simpleStartRight;
        let endLeft = simpleEndLeft,     endRight = simpleEndRight;

        if (corner1 && Math.hypot(seg_p1.x - node1.x, seg_p1.y - node1.y) < 0.1) {
             const dist_A_vs_Left = Math.hypot(corner1.pointA.x - simpleStartLeft.x, corner1.pointA.y - simpleStartLeft.y);
             const dist_B_vs_Left = Math.hypot(corner1.pointB.x - simpleStartLeft.x, corner1.pointB.y - simpleStartLeft.y);
             startLeft = (dist_A_vs_Left < dist_B_vs_Left) ? corner1.pointA : corner1.pointB;
             startRight = (startLeft === corner1.pointA) ? corner1.pointB : corner1.pointA;
        }

        if (corner2 && Math.hypot(seg_p2.x - node2.x, seg_p2.y - node2.y) < 0.1) {
             const dist_A_vs_Left = Math.hypot(corner2.pointA.x - simpleEndLeft.x, corner2.pointA.y - simpleEndLeft.y);
             const dist_B_vs_Left = Math.hypot(corner2.pointB.x - simpleEndLeft.x, corner2.pointB.y - simpleEndLeft.y);
             endLeft = (dist_A_vs_Left < dist_B_vs_Left) ? corner2.pointA : corner2.pointB;
             endRight = (endLeft === corner2.pointA) ? corner2.pointB : corner2.pointA;
        }

        return { seg, wall, node1, node2, startLeft, startRight, endLeft, endRight, simpleStartLeft, simpleStartRight, simpleEndLeft, simpleEndRight, corner1, corner2 };
    }).filter(data => data !== null);


    // --- 1. AŞAMA: Tüm Kenarlıkları Çiz ---
    segmentCornerData.forEach(data => {
        const { seg, wall, node1, node2, startLeft, startRight, endLeft, endRight, simpleStartLeft, simpleStartRight, simpleEndLeft, simpleEndRight, corner1, corner2 } = data;
        const seg_p1 = seg.p1; const seg_p2 = seg.p2;

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
    });


    // --- 2. AŞAMA: Tüm Dolguları Çiz ---
    ctx2d.fillStyle = BG;
    segmentCornerData.forEach(data => {
        const { startLeft, startRight, endLeft, endRight } = data;

        // Arka plan rengiyle (BG) duvarın içini doldur
        // Bu, alttaki mahal rengini VE alttaki diğer duvarların çizgilerini "siler"
        ctx2d.beginPath();
        ctx2d.moveTo(startLeft.x, startLeft.y);
        ctx2d.lineTo(endLeft.x, endLeft.y);
        ctx2d.lineTo(endRight.x, endRight.y); // Yolu birleştir
        ctx2d.lineTo(startRight.x, startRight.y);
        ctx2d.closePath();
        ctx2d.fill();
    });
    // --- GÜNCELLEME SONU ---
};


// --- (Diğer çizim fonksiyonları: drawGlassSegments, drawBalconySegments - değişiklik yok) ---
const drawGlassSegments = (ctx2d, segmentList, color, wallPx) => {
    if (segmentList.length === 0) return;
    const thickness = segmentList[0]?.wall?.thickness || wallPx; // Kalınlığı al
    const spacing = 3; // Çizgiler arası boşluk (önceden tanımlı varsayalım)
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 3 / state.zoom; // Zoom'a göre ayarlı kalınlık
    ctx2d.lineCap = "butt";
    ctx2d.lineJoin = "miter";
    segmentList.forEach((seg)=>{
        if(Math.hypot(seg.p1.x-seg.p2.x, seg.p1.y-seg.p2.y)<1) return; // Çok kısa segmentleri atla
        const dx=seg.p2.x-seg.p1.x;
        const dy=seg.p2.y-seg.p1.y;
        const length=Math.hypot(dx,dy);
        const dirX=dx/length;
        const dirY=dy/length;
        const normalX=-dirY; // Normal vektör
        const normalY=dirX;
        const offset=spacing/2; // Yarı boşluk

        // İki paralel çizgi
        ctx2d.beginPath();
        ctx2d.moveTo(seg.p1.x+normalX*offset, seg.p1.y+normalY*offset);
        ctx2d.lineTo(seg.p2.x+normalX*offset, seg.p2.y+normalY*offset);
        ctx2d.stroke();

        ctx2d.beginPath();
        ctx2d.moveTo(seg.p1.x-normalX*offset, seg.p1.y-normalY*offset);
        ctx2d.lineTo(seg.p2.x-normalX*offset, seg.p2.y-normalY*offset);
        ctx2d.stroke();

        // Aradaki bağlantı çizgileri
        const connectionSpacing=30; // Bağlantı aralığı (cm)
        const numConnections=Math.floor(length/connectionSpacing);
        ctx2d.beginPath();
        for(let i=0; i<=numConnections; i++){
            // Bağlantı noktasının duvar üzerindeki mesafesini hesapla
            let dist = Math.min(length, (i * connectionSpacing) + (connectionSpacing / 2));
            if (i === 0) dist = Math.min(length, connectionSpacing / 2); // İlk bağlantı
            if (dist > length) continue; // Duvar sonunu geçmesin

            const midX=seg.p1.x+dirX*dist;
            const midY=seg.p1.y+dirY*dist;
            ctx2d.moveTo(midX+normalX*offset, midY+normalY*offset);
            ctx2d.lineTo(midX-normalX*offset, midY-normalY*offset);
        }
        ctx2d.stroke();
    });
};
const drawBalconySegments = (ctx2d, segmentList, color) => { /* ... önceki kod ... */ if (segmentList.length === 0) return; ctx2d.strokeStyle = color; ctx2d.lineWidth = 1.5 / state.zoom; ctx2d.lineCap = "butt"; ctx2d.lineJoin = "miter"; ctx2d.beginPath(); segmentList.forEach((seg)=>{ if(Math.hypot(seg.p1.x-seg.p2.x, seg.p1.y-seg.p2.y)>=1){ ctx2d.moveTo(seg.p1.x, seg.p1.y); ctx2d.lineTo(seg.p2.x, seg.p2.y); } }); ctx2d.stroke(); };

// Yarım duvarları da 'drawNormalSegments' ile çizip sonra içini dolduralım
// GÜNCELLENDİ: Sıralama (stroke -> bg_fill -> half_fill)
const drawHalfSegments = (ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners) => {
     if (segmentList.length === 0) return;

    // 1. Önce normal segment gibi çiz (Bu artık ÖNCE STROKE, SONRA BG_FILL yapıyor)
    drawNormalSegments(ctx2d, segmentList, color, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);

    // 2. Sonra yarım duvarın kendi (üzerine gelen) dolgusunu çiz
    ctx2d.fillStyle = "rgba(150, 150, 150, 0.3)"; // Yarı saydam dolgu

    segmentList.forEach((seg) => {
        const wall = seg.wall; const node1 = wall.p1; const node2 = wall.p2;
        const thickness = wall.thickness || wallPx; const halfThickness = thickness / 2;
        const seg_p1 = seg.p1; const seg_p2 = seg.p2;
        const dx = wall.p2.x - wall.p1.x; const dy = wall.p2.y - wall.p1.y;
        const len = Math.hypot(dx, dy); if (len < 0.1) return;
        const nxLeft = -dy / len; const nyLeft = dx / len; // Sol normal
        const nxRight = dy / len; const nyRight = -dx / len; // Sağ normal
        const corner1 = precalculatedCorners.get(node1); const corner2 = precalculatedCorners.get(node2);

        // Dolgu için köşeleri tekrar hesapla/al (drawNormalSegments'in içinden kopyalandı)
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
        ctx2d.fill(); // Yarı saydam dolguyu BG dolgusunun üzerine çiz
    });
};

// --- ANA EXPORT FONKSİYONU ---
export function drawWallGeometry(ctx2d, state, BG) {
    const { walls, doors, selectedObject, selectedGroup, wallBorderColor, lineThickness, nodes } = state;
    const wallPx = state.wallThickness;

    // Çizim moduna göre opacity ayarla
    const opacity = getObjectOpacity('wall');
    ctx2d.save();
    ctx2d.globalAlpha = opacity;

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

    // Segment ayırma (arc duvarlar için de)
    const normalSegments = { ortho: [], nonOrtho: [], selected: [] };
    const balconySegments = { ortho: [], nonOrtho: [], selected: [] };
    const glassSegments = { ortho: [], nonOrtho: [], selected: [] };
    const halfSegments = { ortho: [], nonOrtho: [], selected: [] };
    const arcNormalSegments = { ortho: [], nonOrtho: [], selected: [] }; // Arc normal duvarlar için
    const arcBalconySegments = { ortho: [], nonOrtho: [], selected: [] }; // Arc balkon duvarlar için
    const arcGlassSegments = { ortho: [], nonOrtho: [], selected: [] }; // Arc camekan duvarlar için
    const arcHalfSegments = { ortho: [], nonOrtho: [], selected: [] }; // Arc yarım duvarlar için
    walls.forEach((w) => {
        // Arc duvarları ayrı işle
        if (w.isArc && w.arcControl1 && w.arcControl2) {
            const isSelected = (selectedObject?.type === "wall" && selectedObject.object === w) || selectedGroup.includes(w);
            const segmentData = { p1: w.p1, p2: w.p2, wall: w };
            const wallType = w.wallType || 'normal';

            let targetList;
            if (wallType === 'balcony') targetList = arcBalconySegments;
            else if (wallType === 'glass') targetList = arcGlassSegments;
            else if (wallType === 'half') targetList = arcHalfSegments;
            else targetList = arcNormalSegments;

            if (isSelected) {
                targetList.selected.push(segmentData);
            } else {
                targetList.ortho.push(segmentData);
            }
            return; // Arc duvarlar için normal segment ayırma yapma
        }
        /* ... segment ayırma kodu ... */
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
    // (Artık hepsi önce stroke, sonra bg_fill çizecek)
    drawNormalSegments(ctx2d, normalSegments.ortho, wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawNormalSegments(ctx2d, normalSegments.nonOrtho, wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawNormalSegments(ctx2d, normalSegments.selected, "#8ab4f8", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);

    drawBalconySegments(ctx2d, balconySegments.ortho, wallBorderColor);
    drawBalconySegments(ctx2d, balconySegments.nonOrtho, wallBorderColor);
    drawBalconySegments(ctx2d, balconySegments.selected, "#8ab4f8");

    drawGlassSegments(ctx2d, glassSegments.ortho, wallBorderColor, wallPx);
    drawGlassSegments(ctx2d, glassSegments.nonOrtho, wallBorderColor, wallPx);
    drawGlassSegments(ctx2d, glassSegments.selected, "#8ab4f8", wallPx);

    // Yarım duvarlar (stroke -> bg_fill -> half_fill)
    drawHalfSegments(ctx2d, halfSegments.ortho, wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawHalfSegments(ctx2d, halfSegments.nonOrtho,wallBorderColor, lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);
    drawHalfSegments(ctx2d, halfSegments.selected, "#8ab4f8", lineThickness, wallPx, BG, nodeWallConnections, precalculatedCorners);

    // Arc normal duvarlar
    drawArcSegments(ctx2d, arcNormalSegments.ortho, wallBorderColor, lineThickness, wallPx, BG);
    drawArcSegments(ctx2d, arcNormalSegments.nonOrtho, wallBorderColor, lineThickness, wallPx, BG);
    drawArcSegments(ctx2d, arcNormalSegments.selected, "#8ab4f8", lineThickness, wallPx, BG);

    // Arc balkon duvarlar
    drawArcBalconySegments(ctx2d, arcBalconySegments.ortho, wallBorderColor);
    drawArcBalconySegments(ctx2d, arcBalconySegments.nonOrtho, wallBorderColor);
    drawArcBalconySegments(ctx2d, arcBalconySegments.selected, "#8ab4f8");

    // Arc camekan duvarlar
    drawArcGlassSegments(ctx2d, arcGlassSegments.ortho, wallBorderColor);
    drawArcGlassSegments(ctx2d, arcGlassSegments.nonOrtho, wallBorderColor);
    drawArcGlassSegments(ctx2d, arcGlassSegments.selected, "#8ab4f8");

    // Arc yarım duvarlar
    drawArcHalfSegments(ctx2d, arcHalfSegments.ortho, wallBorderColor, lineThickness, wallPx, BG);
    drawArcHalfSegments(ctx2d, arcHalfSegments.nonOrtho, wallBorderColor, lineThickness, wallPx, BG);
    drawArcHalfSegments(ctx2d, arcHalfSegments.selected, "#8ab4f8", lineThickness, wallPx, BG);

    // Varsayılan ayarlara dön
    ctx2d.lineCap = "butt";
    ctx2d.lineJoin = "miter";

    ctx2d.restore(); // Opacity'yi geri al
}