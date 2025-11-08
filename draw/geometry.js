// ahmedakbayir/ngcad/ngcad-b3712dab038a327c261e2256cbd1d4d58a069f34/geometry.js

import { state, setState, DRAG_HANDLE_RADIUS, EXTEND_RANGE } from '../general-files/main.js';
import { wallExists } from '../wall/wall-handler.js'; // <-- YENİ

// Arc duvarı segmentlere ayırır (bezier eğrisini örnekler)
// Returns: Array of points [{x, y}, {x, y}, ...]
export function getArcWallPoints(wall, numSamples = 20) {
    if (!wall.isArc || !wall.arcControl1 || !wall.arcControl2) {
        // Arc değilse sadece başlangıç ve bitiş noktalarını döndür
        return [
            { x: wall.p1.x, y: wall.p1.y },
            { x: wall.p2.x, y: wall.p2.y }
        ];
    }

    const points = [];
    const p1 = wall.p1;
    const p2 = wall.p2;
    const c1 = wall.arcControl1;
    const c2 = wall.arcControl2;

    for (let i = 0; i <= numSamples; i++) {
        const t = i / numSamples;
        // Cubic Bezier formülü
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = mt3 * p1.x + 3 * mt2 * t * c1.x + 3 * mt * t2 * c2.x + t3 * p2.x;
        const y = mt3 * p1.y + 3 * mt2 * t * c1.y + 3 * mt * t2 * c2.y + t3 * p2.y;

        points.push({ x, y });
    }

    return points;
}

// Arc duvarının bir noktaya olan en yakın mesafesini hesaplar
export function distToArcWallSquared(point, wall, tolerance = 1.0) {
    if (!wall.isArc || !wall.arcControl1 || !wall.arcControl2) {
        // Arc değilse normal segment mesafesini hesapla
        return distToSegmentSquared(point, wall.p1, wall.p2);
    }

    // Arc için: Eğriyi örnekle ve her segmente olan en yakın mesafeyi bul
    const arcPoints = getArcWallPoints(wall, 50);
    let minDistSq = Infinity;

    for (let i = 0; i < arcPoints.length - 1; i++) {
        const distSq = distToSegmentSquared(point, arcPoints[i], arcPoints[i + 1]);
        minDistSq = Math.min(minDistSq, distSq);
    }

    return minDistSq;
}

export function screenToWorld(sx, sy) {
    const { zoom, panOffset } = state;
    return {
        x: (sx - panOffset.x) / zoom,
        y: (sy - panOffset.y) / zoom
    };
}

export function worldToScreen(wx, wy) {
    const { zoom, panOffset } = state;
    return {
        x: wx * zoom + panOffset.x,
        y: wy * zoom + panOffset.y
    };
}

// Noktanın çizgi segmentine olan en yakın mesafesinin karesini hesaplar
export function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2; // Segmentin uzunluğunun karesi
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2; // Segment nokta ise direkt mesafenin karesi
    // Noktanın segment üzerindeki izdüşümünün parametresi (t)
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t)); // t'yi 0-1 arasına sıkıştır (segment içinde kalmasını sağla)
    // En yakın noktanın koordinatları
    const closestX = v.x + t * (w.x - v.x);
    const closestY = v.y + t * (w.y - v.y);
    // Nokta ile en yakın nokta arasındaki mesafenin karesi
    return ((p.x - closestX) ** 2 + (p.y - closestY) ** 2);
}

// İki çizgi segmentinin kesişip kesişmediğini kontrol eder ve kesişim noktasını verir
export function getLineIntersection(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (d === 0) return null; // Paralel
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;
    // Eğer kesişim noktası her iki segmentin de üzerindeyse (0 ve 1 arasında, uçlara çok yakın değil)
    if (t > 0.0001 && t < 0.9999 && u > 0.0001 && u < 0.9999) {
        // Kesişim noktasını döndür
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }
    return null; // Segmentler üzerinde kesişmiyor
}

// --- DEĞİŞİKLİK: 'export' eklendi ---
// İki çizgi segmentinin kesişim noktasını bulur (segment üzerinde olup olmadığını kontrol eder)
// p1-p2 birinci segment, p3-p4 ikinci segment
export function getLineIntersectionPoint(p1, p2, p3, p4) {
    const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    if (Math.abs(d) < 1e-9) return null; // Paralel veya çakışık (çok küçük değere bölmeyi önle)

    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / d;

    // Kesişim noktası her iki segmentin de üzerindeyse (0 ve 1 dahil, küçük toleransla)
    const epsilon = 1e-6;
    if (t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon) {
        // Kesişim noktasının koordinatlarını hesapla
        return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
    }

    return null; // Kesişim segmentler üzerinde değil
}
// --- DEĞİŞİKLİK SONU ---


export function findNodeAt(x, y) {
    const { nodes, zoom } = state;
    const r = DRAG_HANDLE_RADIUS / zoom; // Ekransal yarıçapı dünya birimine çevir
    for (const n of nodes) {
        if (Math.hypot(n.x - x, n.y - y) < r) return n; // Mesafe yarıçaptan küçükse node bulundu
    }
    return null; // Bulunamadı
}

// Verilen koordinata yakın bir node varsa onu döndürür, yoksa yeni bir node oluşturur ve döndürür
export function getOrCreateNode(x, y) {
    const { nodes, zoom } = state;
    const SNAP_RADIUS = 6 / zoom; // Snap yarıçapı (dünya birimi)
    // Mevcut nodeları kontrol et
    for (const n of nodes) {
        if (Math.hypot(n.x - x, n.y - y) < SNAP_RADIUS) return n; // Yakın node varsa onu döndür
    }
    // Yoksa yeni node oluştur
    const nn = { x, y };
    nodes.push(nn); // Yeni node'u listeye ekle
    return nn; // Yeni node'u döndür
}

// Bir poligonun (koordinat dizisi) alanını hesaplar
export function calculatePlanarArea(coords) {
    let area = 0;
    const points = coords[0]; // Dış halka koordinatları
    if (!points || points.length < 3) return 0; // Geçersiz poligon
    // Shoelace formülü
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length]; // Son noktadan ilk noktaya dönüş için mod
        area += p1[0] * p2[1] - p2[0] * p1[1];
    }
    return Math.abs(area) / 2; // Mutlak değerin yarısı
}

// Duvarlardan kapalı alanları (odaları) tespit eder
export function detectRooms() {
    const { walls } = state;
    const oldRooms = [...state.rooms]; // Önceki odaları (isim/merkez korumak için) kopyala
    // Yeterli duvar yoksa oda oluşmaz
    if (walls.length < 3) {
        setState({ rooms: [] });
        return;
    }

    // Geçerli (tanımlı ve uzunluğu > 0.1 olan) duvarları filtrele
    const validWalls = walls.filter(wall => {
        if (!wall || !wall.p1 || !wall.p2) return false;
        const length = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        return length > 0.1 &&
            isFinite(wall.p1.x) && isFinite(wall.p1.y) &&
            isFinite(wall.p2.x) && isFinite(wall.p2.y);
    });

    if (validWalls.length < 3) {
        setState({ rooms: [] }); // Geçerli duvar sayısı yetersizse
        return;
    }

    // Geçerli duvarları Turf.js'in anlayacağı lineString formatına çevir
    // Arc duvarlar için segmentlere ayır
    const lines = [];
    validWalls.forEach((wall) => {
        try {
            if (wall.isArc && wall.arcControl1 && wall.arcControl2) {
                // Arc duvarı segmentlere ayır
                const arcPoints = getArcWallPoints(wall, 20);
                // Her segment için bir lineString oluştur
                for (let i = 0; i < arcPoints.length - 1; i++) {
                    const line = turf.lineString([
                        [arcPoints[i].x, arcPoints[i].y],
                        [arcPoints[i + 1].x, arcPoints[i + 1].y]
                    ]);
                    lines.push(line);
                }
            } else {
                // Normal duvar
                const line = turf.lineString([
                    [wall.p1.x, wall.p1.y],
                    [wall.p2.x, wall.p2.y]
                ]);
                lines.push(line);
            }
        } catch (e) {
            console.error("LineString oluşturma hatası:", e, wall);
        }
    });

    if (lines.length < 3) {
        setState({ rooms: [] }); // Yeterli lineString yoksa
        return;
    }

    const featureCollection = turf.featureCollection(lines); // Çizgileri bir koleksiyona topla

    try {
        const polygons = turf.polygonize(featureCollection); // Poligonları oluştur
        const newRooms = []; // Yeni oda listesi
        if (polygons.features.length > 0) { // Poligon bulunduysa
            polygons.features.forEach((polygon) => {
                try {
                    // Alanı hesapla (cm²)
                    const areaInCm2 = calculatePlanarArea(polygon.geometry.coordinates);
                    if (areaInCm2 < 1) return; // Çok küçük alanları atla
                    const areaInM2 = areaInCm2 / 10000; // Metrekareye çevir

                    let existingRoomName = 'MAHAL'; // Varsayılan isim
                    // Orantısal merkez için varsayılan değer (%50 x, %50 y)
                    let existingRoomCenterOffset = { x: 0.5, y: 0.5 };

                    // Eğer önceden odalar varsa, isim ve merkezi devralmaya çalış
                    if (oldRooms.length > 0) {
                        // Yeni oluşan poligonun içinde kalan eski oda merkezlerini bul
                        const containedOldRooms = oldRooms.filter(r => {
                            try {
                                return r.center && turf.booleanPointInPolygon(r.center, polygon);
                            } catch (e) { return false; } // Hata olursa içermiyor kabul et
                        });
                        if (containedOldRooms.length > 0) {
                            // Birden fazla eşleşme varsa en büyüğünü referans al (alanına göre)
                            containedOldRooms.sort((a, b) => b.area - a.area);
                            const bestOldRoom = containedOldRooms[0];
                            existingRoomName = bestOldRoom.name; // İsmi devral
                            // Eski odanın orantısal merkez bilgisini devral (varsa)
                            if (bestOldRoom.centerOffset) {
                                existingRoomCenterOffset = bestOldRoom.centerOffset;
                            }
                        }
                    }

                    // Poligonun sınırlayıcı kutusunu (bounding box) al
                    const bbox = turf.bbox(polygon);
                    const bboxWidth = bbox[2] - bbox[0];
                    const bboxHeight = bbox[3] - bbox[1];

                    // Yeni mutlak merkezi, orantısal bilgiye göre hesapla
                    let newCenterX = bbox[0] + bboxWidth * existingRoomCenterOffset.x;
                    let newCenterY = bbox[1] + bboxHeight * existingRoomCenterOffset.y;

                    // Hesaplanan merkez poligon dışında kalırsa (örn: L şeklindeki odalar)
                    const calculatedCenterPoint = turf.point([newCenterX, newCenterY]);
                    if (!turf.booleanPointInPolygon(calculatedCenterPoint, polygon)) {
                        // Turf'un güvenli merkez bulma fonksiyonunu (pointOnFeature) kullan
                        const centerOnFeature = turf.pointOnFeature(polygon);
                        newCenterX = centerOnFeature.geometry.coordinates[0];
                        newCenterY = centerOnFeature.geometry.coordinates[1];
                        // Yeni merkeze göre orantıyı yeniden hesapla ve kaydet
                        if (bboxWidth > 0 && bboxHeight > 0) {
                            existingRoomCenterOffset = {
                                x: (newCenterX - bbox[0]) / bboxWidth,
                                y: (newCenterY - bbox[1]) / bboxHeight
                            };
                        }
                    }

                    // Alan 40m²'den büyükse adı "DAİRE" yap (Özel kural)
                    let finalRoomName = existingRoomName;

                    // Odanın hangi kata ait olduğunu bul (poligonu oluşturan duvarlardan birinin floorId'si)
                    let roomFloorId = null;
                    const coords = polygon.geometry.coordinates[0];
                    for (let i = 0; i < coords.length - 1 && !roomFloorId; i++) {
                        const p1Coord = coords[i];
                        const p2Coord = coords[i + 1];
                        const wall = validWalls.find(w => {
                            if (!w || !w.p1 || !w.p2) return false;
                            const d1 = Math.hypot(w.p1.x - p1Coord[0], w.p1.y - p1Coord[1]) + Math.hypot(w.p2.x - p2Coord[0], w.p2.y - p2Coord[1]);
                            const d2 = Math.hypot(w.p1.x - p2Coord[0], w.p1.y - p2Coord[1]) + Math.hypot(w.p2.x - p1Coord[0], w.p2.y - p1Coord[1]);
                            return Math.min(d1, d2) < 1;
                        });
                        if (wall && wall.floorId) roomFloorId = wall.floorId;
                    }

                    // Yeni odayı listeye ekle
                    newRooms.push({
                        polygon: polygon, // Geometri
                        area: areaInM2, // Alan (m²)
                        center: [newCenterX, newCenterY], // Hesaplanan merkez [x, y]
                        name: finalRoomName, // İsim
                        centerOffset: existingRoomCenterOffset, // Orantısal merkez bilgisi
                        floorId: roomFloorId // Odanın ait olduğu kat
                    });
                } catch (e) {
                    console.error("Poligon işleme hatası:", e); // Hata olursa konsola yaz
                }
            });
        }
        setState({ rooms: newRooms }); // Yeni oda listesini state'e ata
    } catch (e) {
        console.error("Mahal analizi sırasında hata oluştu (Geometri geçersiz olabilir):", e);
        setState({ rooms: [] }); // Hata olursa odaları temizle
    }
}

// Bir değerin sıfıra çok yakın olup olmadığını kontrol eder
export function almostZero(v, eps = 1e-9) { // Toleransı biraz artırdım
    return Math.abs(v) < eps;
}

// Üç noktanın aynı doğru üzerinde olup olmadığını kontrol eder (collinear)
export function areCollinear(a, b, c) {
    // (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) ifadesi, a,b,c noktalarının oluşturduğu üçgenin alanının 2 katıdır.
    // Alan sıfıra çok yakınsa noktalar doğrusaldır.
    return almostZero((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

// Duvar esnetme (stretch) işlemini uygular (Bu fonksiyon tam olarak kullanılmıyor olabilir)
export function applyStretchModification(movingNode, originalPos, stationaryNode) {
    // Hareket miktarını hesapla
    const deltaX = movingNode.x - originalPos.x;
    const deltaY = movingNode.y - originalPos.y;
    // Anlamlı bir hareket yoksa çık
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;

    // Hareketin ana eksenini belirle (X veya Y)
    const axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
    // Hareket miktarını al (delta)
    const delta = axis === 'x' ? deltaX : deltaY;
    // Hareket eden node'un orijinal pozisyonunu eşik olarak al
    const threshold = originalPos[axis];
    const EPSILON = 0.01; // Küçük bir tolerans
    // Sabit node'un pozisyonunu al
    const stationaryPos = stationaryNode[axis];

    // Hareket yönü pozitif mi negatif mi? (Sabit noktaya göre)
    const isMovingSidePositive = (threshold > stationaryPos);

    // Taşınacak diğer nodeları bul
    const nodesToTranslate = new Set();
    state.nodes.forEach(node => {
        if (node === movingNode) return; // Kendisini atla
        // Eğer hareket pozitif yönde ise, eşikten büyük veya eşit olanları seç
        if (isMovingSidePositive) {
            if (node[axis] >= threshold - EPSILON) nodesToTranslate.add(node);
        } else { // Hareket negatif yönde ise, eşikten küçük veya eşit olanları seç
            if (node[axis] <= threshold + EPSILON) nodesToTranslate.add(node);
        }
    });

    // Seçilen nodeları hareket miktarı (delta) kadar taşı
    nodesToTranslate.forEach(node => {
        node[axis] += delta;
    });
}

// Verilen noktanın bir duvarın gövdesi üzerinde olup olmadığını kontrol eder (uç noktalar hariç)
export function isPointOnWallBody(point) {
    const toleranceSq = 0.1 * 0.1; // Çok küçük bir tolerans (karesi)
    for (const wall of state.walls) {
        // Noktanın duvar segmentine mesafesi toleranstan küçük mü?
        if (distToSegmentSquared(point, wall.p1, wall.p2) < toleranceSq) {
            // Evetse, uç noktalara olan mesafeleri kontrol et
            const distToP1 = Math.hypot(point.x - wall.p1.x, point.y - wall.p1.y);
            const distToP2 = Math.hypot(point.x - wall.p2.x, point.y - wall.p2.y);
            // Eğer her iki uca da 1cm'den daha uzaksa, gövde üzerindedir
            if (distToP1 > 1 && distToP2 > 1) {
                return true; // Gövde üzerinde
            }
        }
    }
    return false; // Gövde üzerinde değil (ya uzakta ya da uç noktada)
}

// Verilen iki node arasında zaten bir duvar olup olmadığını kontrol eder
// function wallExists(p1, p2) {
//     return state.walls.some(w => (w.p1 === p1 && w.p2 === p2) || (w.p1 === p2 && w.p2 === p1));
// }

// İkinci noktayı (p2), birinci noktaya (p1) göre 15 derecelik açılara snapler

export function snapTo15DegreeAngle(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy); // İki nokta arası mesafe
    // Çok yakınsa snap yapma
    if (distance < 10) return p2;

    let angleRad = Math.atan2(dy, dx); // Açı (radyan)
    let angleDeg = angleRad * 180 / Math.PI; // Açı (derece)

    if (state.drawingAngle === 0) return p2; // <--- DEĞİŞİKLİK BURADA
    const SNAP_ANGLE = state.drawingAngle || 15; // YENİ: State'den al

    // Açıyı en yakın SNAP_ANGLE katına yuvarla
    const snappedAngleDeg = Math.round(angleDeg / SNAP_ANGLE) * SNAP_ANGLE;
    const snappedAngleRad = snappedAngleDeg * Math.PI / 180; // Yuvarlanmış açıyı radyana çevir

    // Yeni p2 koordinatlarını hesapla (p1 + mesafe * cos/sin(snaplenmiş açı))
    const snappedX = p1.x + distance * Math.cos(snappedAngleRad);
    const snappedY = p1.y + distance * Math.sin(snappedAngleRad);

    return { x: snappedX, y: snappedY }; // Yeni p2 pozisyonunu döndür
}

// geometry.js - sonuna ekle

/**
 * Bir noktayı verilen eksene göre yansıtır
 * @param {object} point - Yansıtılacak nokta {x, y}
 * @param {object} axisP1 - Eksen başlangıç noktası {x, y}
 * @param {object} axisP2 - Eksen bitiş noktası {x, y}
 * @returns {object|null} - Yansıyan nokta {x, y} veya null
 */
export function reflectPoint(point, axisP1, axisP2) {
    if (!point || !axisP1 || !axisP2) return null;
    
    const dx = axisP2.x - axisP1.x;
    const dy = axisP2.y - axisP1.y;
    const lenSq = dx * dx + dy * dy;
    
    if (lenSq < 0.1) return null; // Eksen çok kısa
    
    // Noktanın eksene izdüşümünü bul
    const t = ((point.x - axisP1.x) * dx + (point.y - axisP1.y) * dy) / lenSq;
    const projX = axisP1.x + t * dx;
    const projY = axisP1.y + t * dy;
    
    // Yansımayı hesapla
    const reflectedX = 2 * projX - point.x;
    const reflectedY = 2 * projY - point.y;
    
    return { x: reflectedX, y: reflectedY };
}