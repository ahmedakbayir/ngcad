import { state, WALL_THICKNESS } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { getColumnAtPoint } from './columns.js';

// --- YARDIMCI FONKSİYON - EXPORT EKLENDİ ---
// Duvardaki mevcut elemanları ve 5cm boşluğu dikkate alarak yerleşime uygun en büyük boş segmenti bulur.
export function findLargestAvailableSegment(wall, itemToExclude = null) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const DK = wall.thickness || WALL_THICKNESS;
    const UM = (DK / 2) + 5;
    const MIN_GAP = 10; // Elemanlar arası minimum boşluk

    const itemsOnWall = [
        ...(state.doors.filter(d => d.wall === wall && d !== itemToExclude)),
        ...(wall.windows ? wall.windows.filter(w => w !== itemToExclude) : [])
    ];

    // Duvarın başlangıç ve bitiş güvenli sınırlarını ve mevcut elemanların sınırlarını (boşluk dahil) bir listeye ekle
    const boundaries = [UM]; // Güvenli bölge başlangıcı
    itemsOnWall.forEach(item => {
        boundaries.push(item.pos - item.width / 2 - MIN_GAP / 2); // Eleman başlangıcı - boşluk/2
        boundaries.push(item.pos + item.width / 2 + MIN_GAP / 2); // Eleman bitişi + boşluk/2
    });
    boundaries.push(DG - UM); // Güvenli bölge bitişi

    // Sınırları sırala ve tekilleştir (çok yakın değerleri birleştir)
    boundaries.sort((a, b) => a - b);
    const uniqueBoundaries = [];
    if (boundaries.length > 0) {
        uniqueBoundaries.push(boundaries[0]);
        for (let i = 1; i < boundaries.length; i++) {
            // Birbirine çok yakın (0.1 cm'den az) sınırları birleştirme
            if (boundaries[i] - uniqueBoundaries[uniqueBoundaries.length - 1] > 0.1) {
                uniqueBoundaries.push(boundaries[i]);
            }
        }
    }


    let largestSegment = { start: UM, end: DG - UM, length: DG - 2 * UM };
    let maxLen = 0;

    // Sıralı sınırlar arasındaki boşlukları (segmentleri) kontrol et
    for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const segStart = uniqueBoundaries[i];
        const segEnd = uniqueBoundaries[i + 1];

        // Segmentin başlangıcı ve bitişi genel güvenli bölge (UM -> DG-UM) içinde mi?
        const effectiveStart = Math.max(UM, segStart);
        const effectiveEnd = Math.min(DG - UM, segEnd);

        const segLen = effectiveEnd - effectiveStart;

        // Segment geçerli ve şimdiye kadarki en büyük segmentten daha büyükse
        if (segLen > maxLen && segLen > 0.1) {
            maxLen = segLen;
            largestSegment = { start: effectiveStart, end: effectiveEnd, length: segLen };
        }
    }
     // Eğer hesaplanan en büyük segment 20cm'den küçükse, uygun segment yok demektir.
     if (largestSegment.length < 20) {
         return null;
     }

    return largestSegment;
}
// --- YARDIMCI FONKSİYON SONU ---


export function getObjectAtPoint(pos) {
    const { walls, doors, rooms, zoom } = state;
    const tolerance = 8 / zoom;

    // KOLON KONTROLÜ - ÖNCELİKLİ
    const columnHit = getColumnAtPoint(pos);
    if (columnHit) return columnHit;

    // Duvar ucu kontrolü
    for (const wall of [...walls].reverse()) {
        const d1 = Math.hypot(pos.x - wall.p1.x, pos.y - wall.p1.y);
        const d2 = Math.hypot(pos.x - wall.p2.x, pos.y - wall.p1.y);
        if (d1 < tolerance) return { type: "wall", object: wall, handle: "p1" };
        if (d2 < tolerance) return { type: "wall", object: wall, handle: "p2" };
    }

    // Kapı kontrolü
    for (const door of [...doors].reverse()) {
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue;
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.1) continue;
        const dx = (wall.p2.x - wall.p1.x) / wallLen;
        const dy = (wall.p2.y - wall.p1.y) / wallLen;
        const doorCenterX = wall.p1.x + dx * door.pos;
        const doorCenterY = wall.p1.y + dy * door.pos;
        const distToDoor = Math.hypot(pos.x - doorCenterX, pos.y - doorCenterY);
        if (distToDoor < door.width / 2 + tolerance) {
            return { type: "door", object: door };
        }
    }

    // Pencere kontrolü
    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0) continue;
        for (const window of wall.windows) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
            const distToWindow = Math.hypot(pos.x - windowCenterX, pos.y - windowCenterY);
            if (distToWindow < window.width / 2 + tolerance) {
                return { type: "window", object: window, wall: wall };
            }
        }
    }

    // Menfez kontrolü
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0) continue;
        for (const vent of wall.vents) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const distToVent = Math.hypot(pos.x - ventCenterX, pos.y - ventCenterY);
            if (distToVent < vent.width / 2 + tolerance) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }

    // Mahal ismi/alanı kontrolü
    for (const room of [...rooms].reverse()) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
        if (distToCenter < 30) {
            return { type: 'roomName', object: room };
        }
    }

    // Duvar gövdesi kontrolü
    for (const wall of [...walls].reverse()) {
        const wallPx = wall.thickness || WALL_THICKNESS;
        const bodyHitToleranceSq = (wallPx / 2) ** 2;
        if (distToSegmentSquared(pos, wall.p1, wall.p2) < bodyHitToleranceSq) {
            return { type: "wall", object: wall, handle: "body" };
        }
    }

    // Mahal alanı kontrolü
    for (const room of [...rooms].reverse()) {
        if (!room.polygon || !room.polygon.geometry) continue;
        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                return { type: 'room', object: room };
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

// --- GÜNCELLENMİŞ FONKSİYON ---
export function getDoorPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (DG < 1) return null;

    // En büyük uygun segmenti bul (mevcut elemanları ve 5cm boşluğu dikkate alarak)
    const largestSegment = findLargestAvailableSegment(wall);

    if (!largestSegment) return null; // Uygun segment yoksa çık

    let KG = largestSegment.length; // Genişliği segmentin uzunluğu olarak al
    KG = KG > 70 ? 70 : KG; // Max 70 ile sınırla

    // Minimum genişlik kontrolü
    if (KG < 20) return null;

    const doorWidth = KG;

    // Fare pozisyonunu duvar üzerine izdüşür
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    // Kapının yerleşebileceği minimum ve maksimum pozisyonlar (merkez noktası için)
    // Bu sınırlar artık bulunan segmentin başlangıç ve bitişine göre hesaplanır
    const minPos = largestSegment.start + doorWidth / 2;
    const maxPos = largestSegment.end - doorWidth / 2;

    // Hesaplanan genişlik için segment yeterince büyük mü?
    if (minPos > maxPos) return null;

    // Fare pozisyonunu bulunan segmentin sınırlarına kıstır
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));

    return { wall: wall, pos: clampedPos, width: doorWidth, type: 'door' };
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

// --- GÜNCELLENMİŞ FONKSİYON ---
export function isSpaceForDoor(door) {
    const wall = door.wall;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const UM = (wallThickness / 2) + 5; // Uç Mesafe
    const MIN_GAP = 5; // Elemanlar arası minimum boşluk

    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;

    // Duvarın uç boşluklarını kontrol et
    if (doorStart < UM || doorEnd > wallLen - UM) {
        return false;
    }

    // Diğer kapılarla çakışma ve boşluk kontrolü
    const doorsOnWall = state.doors.filter(d => d.wall === wall && d !== door);
    for (const existingDoor of doorsOnWall) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        // İki eleman arasında MIN_GAP kadar boşluk var mı?
        if (doorEnd + MIN_GAP > existingStart && doorStart < existingEnd + MIN_GAP) {
            return false; // Yeterli boşluk yok veya çakışma var
        }
    }

    // Pencerelerle çakışma ve boşluk kontrolü
    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
        // İki eleman arasında MIN_GAP kadar boşluk var mı?
        if (doorEnd + MIN_GAP > windowStart && doorStart < windowEnd + MIN_GAP) {
            return false; // Yeterli boşluk yok veya çakışma var
        }
    }

    return true; // Yer var
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---


// --- GÜNCELLENMİŞ FONKSİYON ---
export function getWindowPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    if (DG < 1) return null;

    // En büyük uygun segmenti bul
    const largestSegment = findLargestAvailableSegment(wall);

    if (!largestSegment) return null;

    let PG = largestSegment.length; // Genişliği segmentin uzunluğu olarak al
    PG = PG > 120 ? 120 : PG; // Max 120 ile sınırla

    // Minimum genişlik kontrolü
    if (PG < 20) return null;

    const windowWidth = PG;

    // Fare pozisyonunu duvar üzerine izdüşür
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    // Pencerenin yerleşebileceği minimum ve maksimum pozisyonlar (merkez noktası için)
    const minPos = largestSegment.start + windowWidth / 2;
    const maxPos = largestSegment.end - windowWidth / 2;

    // Hesaplanan genişlik için segment yeterince büyük mü?
    if (minPos > maxPos) return null;

    // Fare pozisyonunu bulunan segmentin sınırlarına kıstır
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));

    return { wall: wall, pos: clampedPos, width: windowWidth };
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

// --- GÜNCELLENMİŞ FONKSİYON ---
export function isSpaceForWindow(windowData) {
    const wall = windowData.wall;
    const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const UM = (wallThickness / 2) + 5; // Uç Mesafe
    const MIN_GAP = 5; // Elemanlar arası minimum boşluk

    // windowData'dan gelen pencere bilgilerini al (bu, yeni yerleştirilecek veya taşınan pencere olabilir)
    const window = windowData.object || windowData; // 'object' alanı taşıma sırasında gelir
    const windowStart = window.pos - window.width / 2;
    const windowEnd = window.pos + window.width / 2;


    // Duvarın uç boşluklarını kontrol et
    if (windowStart < UM || windowEnd > wallLen - UM) {
        return false;
    }

    // Kapılarla çakışma ve boşluk kontrolü
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    for (const door of doorsOnWall) {
        const doorStart = door.pos - door.width / 2;
        const doorEnd = door.pos + door.width / 2;
        // İki eleman arasında MIN_GAP kadar boşluk var mı?
        if (windowEnd + MIN_GAP > doorStart && windowStart < doorEnd + MIN_GAP) {
            return false;
        }
    }

    // Diğer pencerelerle çakışma ve boşluk kontrolü
    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        // Kontrol edilen pencerenin kendisiyle karşılaştırmasını atla
        if (existingWindow === window) continue;

        const existingStart = existingWindow.pos - existingWindow.width / 2;
        const existingEnd = existingWindow.pos + existingWindow.width / 2;
        // İki eleman arasında MIN_GAP kadar boşluk var mı?
         if (windowEnd + MIN_GAP > existingStart && windowStart < existingEnd + MIN_GAP) {
            return false;
        }
    }

    return true; // Yer var
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

export function getMinWallLength(wall) {
    const wallThickness = wall.thickness || WALL_THICKNESS;
    // Minimum uzunluk sadece duvarın kendi kalınlığı ve uç boşluklarıdır.
    // Kapı/pencere genişlikleri artık dinamik olduğu için burada hesaba katılmaz.
    const UM = (wallThickness / 2) + 5;
    const minLength = 2 * UM + 20; // İki uç boşluk + minimum 20cm'lik yerleşebilir alan

    // Mevcut elemanların gerektirdiği minimum uzunluğu da kontrol edelim
    let requiredByItems = 0;
    const items = [
        ...(state.doors.filter(d => d.wall === wall)),
        ...(wall.windows || [])
    ];
    if (items.length > 0) {
        items.sort((a,b)=> a.pos - b.pos);
        const firstItemStart = items[0].pos - items[0].width / 2;
        const lastItemEnd = items[items.length - 1].pos + items[items.length - 1].width / 2;
        requiredByItems = (firstItemStart - UM) // Baştaki boşluk
                         + (lastItemEnd - firstItemStart) // Elemanların kapladığı alan
                         + (UM) // Sondaki boşluk
                         + (items.length - 1) * 5; // Aralardaki minimum 5cm boşluklar
        requiredByItems = Math.max(0, requiredByItems); // Negatif olmasın
    }


    return Math.max(minLength, requiredByItems);
}

export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);

    const exploreFrom = (wall) => {
        [wall.p1, wall.p2].forEach(node => {
            state.walls.forEach(w => {
                if (visited.has(w)) return;
                if (w.p1 !== node && w.p2 !== node) return;

                const v1 = { x: wall.p2.x - wall.p1.x, y: wall.p2.y - wall.p1.y };
                const v2 = { x: w.p2.x - w.p1.x, y: w.p2.y - w.p1.y };
                const len1 = Math.hypot(v1.x, v1.y);
                const len2 = Math.hypot(v2.x, v2.y);

                if (len1 < 0.1 || len2 < 0.1) return;

                v1.x /= len1; v1.y /= len1;
                v2.x /= len2; v2.y /= len2;

                const dot = Math.abs(v1.x * v2.x + v1.y * v2.y);
                if (dot > 0.999) {
                    chain.push(w);
                    visited.add(w);
                    exploreFrom(w);
                }
            });
        });
    };

    exploreFrom(startWall);
    return chain;
}