// wall-item-utils.js
import { state } from './main.js';

/**
 * Duvardaki mevcut elemanları ve boşlukları dikkate alarak yerleşime uygun en büyük boş segmenti bulur.
 * @param {object} wall - Duvar nesnesi
 * @param {object} itemToExclude - (Varsa) hesaplama dışı tutulacak eleman (genellikle taşınan elemanın kendisi)
 * @returns {object | null} - { start, end, length } formatında en büyük segmenti veya null döndürür
 */
export function findLargestAvailableSegment(wall, itemToExclude = null) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const DK = wall.thickness || state.WALL_THICKNESS;
    const UM = (DK / 2) + 5; // Uç marjı
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk
    const MIN_ITEM_WIDTH = 20; // Yerleştirilebilecek en küçük eleman genişliği

    const itemsOnWall = [
        ...(state.doors.filter(d => d.wall === wall && d !== itemToExclude)),
        ...(wall.windows ? wall.windows.filter(w => w !== itemToExclude) : []),
        ...(wall.vents ? wall.vents.filter(v => v !== itemToExclude) : [])
    ];

    const boundaries = [UM]; // Güvenli bölge başlangıcı
    itemsOnWall.forEach(item => {
        boundaries.push(item.pos - item.width / 2 - MIN_GAP / 2); // Eleman başlangıcı - boşluk/2
        boundaries.push(item.pos + item.width / 2 + MIN_GAP / 2); // Eleman bitişi + boşluk/2
    });
    boundaries.push(DG - UM); // Güvenli bölge bitişi

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

    let largestSegment = null;
    let maxLen = 0;

    for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const segStart = uniqueBoundaries[i];
        const segEnd = uniqueBoundaries[i + 1];

        const effectiveStart = Math.max(UM, segStart);
        const effectiveEnd = Math.min(DG - UM, segEnd);
        const segLen = effectiveEnd - effectiveStart;

        if (segLen >= MIN_ITEM_WIDTH && segLen > maxLen && segLen > 0.1) {
            maxLen = segLen;
            largestSegment = { start: effectiveStart, end: effectiveEnd, length: segLen };
        }
    }
    return largestSegment;
}

/**
 * Verilen pozisyonun (posOnWall) içinde bulunduğu boş segmenti bulur.
 * @param {object} wall - Duvar nesnesi
 * @param {number} posOnWall - Duvar üzerindeki pozisyon
 * @param {object} itemToExclude - (Varsa) hesaplama dışı tutulacak eleman
 * @returns {object | null} - { start, end, length } formatında bulunan segmenti veya null döndürür
 */
export function findAvailableSegmentAt(wall, posOnWall, itemToExclude = null) {
    const DG = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    const DK = wall.thickness || WALL_THICKNESS;
    const UM = (DK / 2) + 5;
    const MIN_GAP = 0.1;
    const MIN_ITEM_WIDTH = 20;
    const POSITION_TOLERANCE = 0.5;

    const itemsOnWall = [
        ...(state.doors.filter(d => d.wall === wall && d !== itemToExclude)),
        ...(wall.windows ? wall.windows.filter(w => w !== itemToExclude) : []),
        ...(wall.vents ? wall.vents.filter(v => v !== itemToExclude) : [])
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
    for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const segStart = uniqueBoundaries[i];
        const segEnd = uniqueBoundaries[i + 1];
        const effectiveStart = Math.max(UM, segStart);
        const effectiveEnd = Math.min(DG - UM, segEnd);

        if (posOnWall >= effectiveStart - POSITION_TOLERANCE && posOnWall <= effectiveEnd + POSITION_TOLERANCE) {
            const segLen = effectiveEnd - effectiveStart;
            if (segLen >= MIN_ITEM_WIDTH && segLen > 0.1) {
                foundSegment = { start: effectiveStart, end: effectiveEnd, length: segLen };
                break;
            }
        }
    }
    return foundSegment;
}

/**
 * İki aralığın çakışıp çakışmadığını veya aralarındaki boşluğun minGap'ten az olup olmadığını kontrol eder.
 * @param {number} start1 - Birinci aralık başlangıcı
 * @param {number} end1 - Birinci aralık bitişi
 * @param {number} start2 - İkinci aralık başlangıcı
 * @param {number} end2 - İkinci aralık bitişi
 * @param {number} minGap - İki aralık arasındaki minimum boşluk
 * @returns {boolean} - Çakışma veya yetersiz boşluk varsa true
 */
export function checkOverlapAndGap(start1, end1, start2, end2, minGap) {
    const isSeparate = (end1 + minGap <= start2) || (end2 + minGap <= start1);
    return !isSeparate;
}