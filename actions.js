// ahmedakbayir/ngcad/ngcad-ad56530de4465cbe8a9f9e5e0a4ec4205c63557c/actions.js
// GÜNCELLENMİŞ: Kapılar arası boşluk ve yerleştirme mantığı iyileştirildi.

import { state, WALL_THICKNESS } from './main.js';
import { distToSegmentSquared } from './geometry.js';
import { getColumnAtPoint } from './columns.js';

// --- YARDIMCI FONKSİYON - EXPORT EKLENDİ ---
// Duvardaki mevcut elemanları ve 30cm boşluğu dikkate alarak yerleşime uygun en büyük boş segmenti bulur.
export function findLargestAvailableSegment(wall, itemToExclude = null) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const DK = wall.thickness || WALL_THICKNESS;
    const UM = (DK / 2) + 5;
    // GÜNCELLEME: Kapılar arası minimum boşluk kaldırıldı (0.1)
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk (30 olarak ayarlandı)
    const MIN_ITEM_WIDTH = 20; // Yerleştirilebilecek en küçük eleman genişliği

    const itemsOnWall = [
        ...(state.doors.filter(d => d.wall === wall && d !== itemToExclude)),
        ...(wall.windows ? wall.windows.filter(w => w !== itemToExclude) : []),
        ...(wall.vents ? wall.vents.filter(v => v !== itemToExclude) : []) // Menfezler de eklendi
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


    let largestSegment = null; // Başlangıçta null
    let maxLen = 0;

    // Sıralı sınırlar arasındaki boşlukları (segmentleri) kontrol et
    for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const segStart = uniqueBoundaries[i];
        const segEnd = uniqueBoundaries[i + 1];

        // Segmentin başlangıcı ve bitişi genel güvenli bölge (UM -> DG-UM) içinde mi?
        const effectiveStart = Math.max(UM, segStart);
        const effectiveEnd = Math.min(DG - UM, segEnd);

        const segLen = effectiveEnd - effectiveStart;

        // Segment geçerli (minimum eleman genişliğinden büyük veya eşit)
        // ve şimdiye kadarki en büyük segmentten daha büyükse
        if (segLen >= MIN_ITEM_WIDTH && segLen > maxLen && segLen > 0.1) { // GÜNCELLEME: >= MIN_ITEM_WIDTH kontrolü eklendi
            maxLen = segLen;
            largestSegment = { start: effectiveStart, end: effectiveEnd, length: segLen };
        }
    }

    return largestSegment; // Bulunduysa segmenti, bulunamadıysa null döndürür
}
// --- YARDIMCI FONKSİYON SONU ---

// --- YARDIMCI FONKSİYON ---
// Duvardaki mevcut elemanları (ve 30cm boşluğu) dikkate alarak,
// verilen pozisyonun (posOnWall) içinde bulunduğu boş segmenti bulur.
export function findAvailableSegmentAt(wall, posOnWall, itemToExclude = null) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const DK = wall.thickness || WALL_THICKNESS;
    const UM = (DK / 2) + 5;
    // GÜNCELLEME: Kapılar arası minimum boşluk kaldırıldı (0.1)
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk (30 olarak ayarlandı)
    const MIN_ITEM_WIDTH = 20; // Yerleştirilebilecek en küçük eleman genişliği
    const POSITION_TOLERANCE = 0.5; // GÜNCELLEME: Toleransı 0.1'den 0.5'e çıkardık

    const itemsOnWall = [
        ...(state.doors.filter(d => d.wall === wall && d !== itemToExclude)),
        ...(wall.windows ? wall.windows.filter(w => w !== itemToExclude) : []),
        ...(wall.vents ? wall.vents.filter(v => v !== itemToExclude) : []) // Menfezler de eklendi
    ];

    const boundaries = [UM];
    itemsOnWall.forEach(item => {
        boundaries.push(item.pos - item.width / 2 - MIN_GAP / 2);
        boundaries.push(item.pos + item.width / 2 + MIN_GAP / 2);
    });
    boundaries.push(DG - UM);

    boundaries.sort((a, b) => a - b);
    const uniqueBoundaries = [];
    if (boundaries.length > 0) {
        uniqueBoundaries.push(boundaries[0]);
        for (let i = 1; i < boundaries.length; i++) {
            if (boundaries[i] - uniqueBoundaries[uniqueBoundaries.length - 1] > 0.1) {
                uniqueBoundaries.push(boundaries[i]);
            }
        }
    }

    let foundSegment = null;
    // Sıralı sınırlar arasındaki boşlukları (segmentleri) kontrol et
    for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const segStart = uniqueBoundaries[i];
        const segEnd = uniqueBoundaries[i + 1];

        const effectiveStart = Math.max(UM, segStart);
        const effectiveEnd = Math.min(DG - UM, segEnd);

        // Fare pozisyonu bu geçerli segmentin içinde mi? (GÜNCELLENMİŞ TOLERANSLA)
        if (posOnWall >= effectiveStart - POSITION_TOLERANCE && posOnWall <= effectiveEnd + POSITION_TOLERANCE) {
            const segLen = effectiveEnd - effectiveStart;
             // Eğer segment minimum eleman genişliğinden büyük veya eşitse geçerlidir
            if (segLen >= MIN_ITEM_WIDTH && segLen > 0.1) {
                foundSegment = { start: effectiveStart, end: effectiveEnd, length: segLen };
                break; // Aradığımız segmenti bulduk
            }
        }
    }

    return foundSegment; // Bulunduysa segmenti, bulunamadıysa null döndürür
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
        if (!wall.p1 || !wall.p2) continue; // GÜNCELLEME: Geçersiz duvarları atla
        const d1 = Math.hypot(pos.x - wall.p1.x, pos.y - wall.p1.y);
        const d2 = Math.hypot(pos.x - wall.p2.x, pos.y - wall.p2.y); // GÜNCELLEME: wall.p1.y -> wall.p2.y
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
        const wallPx = wall.thickness || WALL_THICKNESS;
        const dx_p = pos.x - doorCenterX;
        const dy_p = pos.y - doorCenterY;
        const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx); // nx = -dy, ny = dx
        const distParallel = Math.abs(dx_p * dx + dy_p * dy);

        // Hem dikey hem yatay mesafe sınırlar içindeyse
        if (distPerpendicular < wallPx / 2 + tolerance && distParallel < door.width / 2 + tolerance) {
             return { type: "door", object: door };
        }
    }

    // Pencere kontrolü
    for (const wall of walls) {
        if (!wall.windows || wall.windows.length === 0 || !wall.p1 || !wall.p2) continue; // GÜNCELLEME: Geçersiz duvarları atla
        for (const window of wall.windows) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const windowCenterX = wall.p1.x + dx * window.pos;
            const windowCenterY = wall.p1.y + dy * window.pos;
             const wallPx = wall.thickness || WALL_THICKNESS;
             const dx_p = pos.x - windowCenterX;
             const dy_p = pos.y - windowCenterY;
             const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
             const distParallel = Math.abs(dx_p * dx + dy_p * dy);

             if (distPerpendicular < wallPx / 2 + tolerance && distParallel < window.width / 2 + tolerance) {
                 return { type: "window", object: window, wall: wall };
             }
        }
    }

    // Menfez kontrolü
    for (const wall of walls) {
        if (!wall.vents || wall.vents.length === 0 || !wall.p1 || !wall.p2) continue; // GÜNCELLEME: Geçersiz duvarları atla
        for (const vent of wall.vents) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const wallPx = wall.thickness || WALL_THICKNESS;
            const dx_p = pos.x - ventCenterX;
            const dy_p = pos.y - ventCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

            if (distPerpendicular < wallPx / 2 + tolerance && distParallel < vent.width / 2 + tolerance) {
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
        if (!wall.p1 || !wall.p2) continue; // GÜNCELLEME: Geçersiz duvarları atla
        const wallPx = wall.thickness || WALL_THICKNESS;
        const bodyHitToleranceSq = (wallPx / 2 + tolerance)**2; // Toleransı ekle
        if (distToSegmentSquared(pos, wall.p1, wall.p2) < bodyHitToleranceSq) {
            const d1Sq = (pos.x - wall.p1.x)**2 + (pos.y - wall.p1.y)**2;
            const d2Sq = (pos.x - wall.p2.x)**2 + (pos.y - wall.p2.y)**2;
            if (d1Sq > tolerance**2 && d2Sq > tolerance**2) {
                return { type: "wall", object: wall, handle: "body" };
            }
        }
    }

    // Mahal alanı kontrolü
    for (const room of [...rooms].reverse()) {
        if (!room.polygon || !room.polygon.geometry) continue;
        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                let isOverName = false;
                 if (room.center && Array.isArray(room.center) && room.center.length >= 2) {
                    const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
                    if (distToCenter < 30) {
                        isOverName = true;
                    }
                 }
                 if (!isOverName) {
                    return { type: 'room', object: room };
                 }
            }
        } catch (e) {
            continue;
        }
    }

    return null;
}

// --- GÜNCELLENMİŞ FONKSİYON (Request 2) ---
export function getDoorPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const MIN_ITEM_WIDTH = 20;
    if (DG < MIN_ITEM_WIDTH) return null; // Duvar minimum eleman için bile çok kısaysa çık

    // Fare pozisyonunu duvar üzerine izdüşür
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    // Fare pozisyonundaki segmenti bul
    const segmentAtMouse = findAvailableSegmentAt(wall, posOnWall);

    if (!segmentAtMouse) return null; // Farenin olduğu yerde uygun segment yoksa çık

    // --- YENİ YERLEŞTİRME MANTIĞI ---
    const doorWidth = 70; // SABİT KAPI GENİŞLİĞİ

    // Segment bu kapı için yeterince geniş mi?
    if (segmentAtMouse.length < doorWidth) {
        // Yeterli değil. Alan ne kadarsa o kadar kapı göster.
        const smallerWidth = segmentAtMouse.length;
        if (smallerWidth < MIN_ITEM_WIDTH) return null; // Min. genişlikten de küçükse çık
        
        // Alan küçükse (örn 50cm), kapı 50cm olur ve segmentin tam ortasına kilitlenir
        const minPos = segmentAtMouse.start + smallerWidth / 2;
        const maxPos = segmentAtMouse.end - smallerWidth / 2;
        // (Bu durumda minPos == maxPos olacak)
        const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
        return { wall: wall, pos: clampedPos, width: smallerWidth, type: 'door' };
    }
    
    // Segment 70cm veya daha BÜYÜKSE:
    // Kapının yerleşebileceği min/max merkez pozisyonları (70cm genişlik için)
    const minPos = segmentAtMouse.start + doorWidth / 2;
    const maxPos = segmentAtMouse.end - doorWidth / 2;

    // (minPos <= maxPos olmalı, çünkü segment.length >= doorWidth)

    // Fare pozisyonunu bulunan segmentin sınırlarına kıstır (Mouse'u takip et)
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
    
    return { wall: wall, pos: clampedPos, width: doorWidth, type: 'door' };
    // --- YENİ MANTIK SONU ---
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

// --- YENİ ÇAKIŞMA KONTROL FONKSİYONU ---
// İki aralığın [start1, end1] ve [start2, end2] çakışıp çakışmadığını veya
// aralarındaki boşluğun minGap'ten az olup olmadığını kontrol eder.
function checkOverlapAndGap(start1, end1, start2, end2, minGap) {
    // Aralıkların birbirine göre konumunu kontrol et
    const isSeparate = (end1 + minGap <= start2) || (end2 + minGap <= start1);
    // Eğer ayrı değillerse, çakışma veya yetersiz boşluk var demektir.
    return !isSeparate;
}
// --- YENİ ÇAKIŞMA KONTROL FONKSİYONU SONU ---

// --- GÜNCELLENMİŞ FONKSİYON (Request 1) ---
export function isSpaceForDoor(door) {
    const wall = door.wall;
    if (!wall) return false;
    // GÜNCELLEME: Kapılar arası minimum boşluk kaldırıldı (0.1)
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk

    const doorStart = door.pos - door.width / 2;
    const doorEnd = door.pos + door.width / 2;

    // Diğer kapılarla kontrol
    const doorsOnWall = state.doors.filter(d => d.wall === wall && d !== door);
    for (const existingDoor of doorsOnWall) {
        const existingStart = existingDoor.pos - existingDoor.width / 2;
        const existingEnd = existingDoor.pos + existingDoor.width / 2;
        if (checkOverlapAndGap(doorStart, doorEnd, existingStart, existingEnd, MIN_GAP)) {
            return false;
        }
    }

    // Pencerelerle kontrol
    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        const windowStart = existingWindow.pos - existingWindow.width / 2;
        const windowEnd = existingWindow.pos + existingWindow.width / 2;
        if (checkOverlapAndGap(doorStart, doorEnd, windowStart, windowEnd, MIN_GAP)) {
            return false;
        }
    }

    // Menfezlerle kontrol
    const ventsOnWall = wall.vents || [];
    for (const existingVent of ventsOnWall) {
        const ventStart = existingVent.pos - existingVent.width / 2;
        const ventEnd = existingVent.pos + existingVent.width / 2;
         if (checkOverlapAndGap(doorStart, doorEnd, ventStart, ventEnd, MIN_GAP)) {
             return false;
         }
    }

    return true; // Yer var
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---


// --- GÜNCELLENMİŞ FONKSİYON (Request 2) ---
export function getWindowPlacement(wall, mousePos) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const MIN_ITEM_WIDTH = 20;
    if (DG < MIN_ITEM_WIDTH) return null; // Duvar minimum eleman için bile çok kısaysa çık

    // Fare pozisyonunu duvar üzerine izdüşür
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    const t = Math.max(0, Math.min(1, ((mousePos.x - wall.p1.x) * dx + (mousePos.y - wall.p1.y) * dy) / (dx * dx + dy * dy)));
    const posOnWall = t * DG;

    // Fare pozisyonundaki segmenti bul
    const segmentAtMouse = findAvailableSegmentAt(wall, posOnWall);

    if (!segmentAtMouse) return null;

    // --- YENİ YERLEŞTİRME MANTIĞI ---
    const windowWidth = 120; // SABİT PENCERE GENİŞLİĞİ

    // Segment bu pencere için yeterince geniş mi?
    if (segmentAtMouse.length < windowWidth) {
        // Yeterli değil. Alan ne kadarsa o kadar pencere göster.
        const smallerWidth = segmentAtMouse.length;
        if (smallerWidth < MIN_ITEM_WIDTH) return null;
        
        const minPos = segmentAtMouse.start + smallerWidth / 2;
        const maxPos = segmentAtMouse.end - smallerWidth / 2;
        const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
        return { wall: wall, pos: clampedPos, width: smallerWidth };
    }
    
    // Segment 120cm veya daha BÜYÜKSE:
    const minPos = segmentAtMouse.start + windowWidth / 2;
    const maxPos = segmentAtMouse.end - windowWidth / 2;
    const clampedPos = Math.max(minPos, Math.min(maxPos, posOnWall));
    return { wall: wall, pos: clampedPos, width: windowWidth };
    // --- YENİ MANTIK SONU ---
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

// --- GÜNCELLENMİŞ FONKSİYON (Request 1) ---
export function isSpaceForWindow(windowData) {
    // windowData'dan gelen pencere bilgilerini al (bu, yeni yerleştirilecek veya taşınan pencere olabilir)
    const window = windowData.object || windowData; // 'object' alanı taşıma sırasında gelir
    const wall = windowData.wall;
    if (!wall) return false;
    // GÜNCELLEME: Kapılar arası minimum boşluk kaldırıldı (0.1)
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk

    const windowStart = window.pos - window.width / 2;
    const windowEnd = window.pos + window.width / 2;

    // Kapılarla kontrol
    const doorsOnWall = state.doors.filter(d => d.wall === wall);
    for (const door of doorsOnWall) {
        const doorStart = door.pos - door.width / 2;
        const doorEnd = door.pos + door.width / 2;
        if (checkOverlapAndGap(windowStart, windowEnd, doorStart, doorEnd, MIN_GAP)) {
            return false;
        }
    }

    // Diğer pencerelerle kontrol
    const windowsOnWall = wall.windows || [];
    for (const existingWindow of windowsOnWall) {
        // Kontrol edilen pencerenin kendisiyle karşılaştırmasını atla
        if (existingWindow === window) continue;

        const existingStart = existingWindow.pos - existingWindow.width / 2;
        const existingEnd = existingWindow.pos + existingWindow.width / 2;
         if (checkOverlapAndGap(windowStart, windowEnd, existingStart, existingEnd, MIN_GAP)) {
            return false;
        }
    }

    // Menfezlerle kontrol
    const ventsOnWall = wall.vents || [];
     for (const existingVent of ventsOnWall) {
         const ventStart = existingVent.pos - existingVent.width / 2;
         const ventEnd = existingVent.pos + existingVent.width / 2;
         if (checkOverlapAndGap(windowStart, windowEnd, ventStart, ventEnd, MIN_GAP)) {
             return false;
         }
     }

    return true; // Yer var
}
// --- GÜNCELLENMİŞ FONKSİYON SONU ---

export function getMinWallLength(wall) {
    const wallThickness = wall.thickness || WALL_THICKNESS;
    const UM = (wallThickness / 2) + 5;
    const MIN_ITEM_WIDTH = 20; // En küçük eleman genişliği
    // GÜNCELLEME: Kapılar arası minimum boşluk kaldırıldı (0.1)
    const MIN_GAP = 0.1; // Elemanlar arası boşluk
    const minLength = 2 * UM + MIN_ITEM_WIDTH; // İki uç boşluk + minimum 20cm'lik yerleşebilir alan

    // Mevcut elemanların gerektirdiği minimum uzunluğu da kontrol edelim
    let requiredByItems = 0;
    const items = [
        ...(state.doors.filter(d => d.wall === wall)),
        ...(wall.windows || []),
        ...(wall.vents || []) // Menfezler de eklendi
    ];
    if (items.length > 0) {
        items.sort((a,b)=> a.pos - b.pos);
        const firstItemStart = items[0].pos - items[0].width / 2;
        const lastItemEnd = items[items.length - 1].pos + items[items.length - 1].width / 2;
        requiredByItems = (firstItemStart - UM) // Baştaki boşluk
                         + (lastItemEnd - firstItemStart) // Elemanların kapladığı alan
                         + (UM) // Sondaki boşluk
                         + (items.length - 1) * MIN_GAP; // Aralardaki minimum boşluklar
        requiredByItems = Math.max(0, requiredByItems); // Negatif olmasın
    }

    return Math.max(minLength, requiredByItems);
}

export function findCollinearChain(startWall) {
    const chain = [startWall];
    const visited = new Set([startWall]);

    const exploreFrom = (wall) => {
        // GÜNCELLEME: Ensure wall has valid points before proceeding
        if (!wall || !wall.p1 || !wall.p2) return;

        [wall.p1, wall.p2].forEach(node => {
            state.walls.forEach(w => {
                if (visited.has(w)) return;
                // GÜNCELLEME: Check if wall exists before accessing p1/p2
                if (!w || w.p1 !== node && w.p2 !== node) return;

                // GÜNCELLEME: Ensure w also has valid points
                if (!w.p1 || !w.p2) return;

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