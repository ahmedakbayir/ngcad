// ahmedakbayir/ngcad/ngcad-fb1bec1810a1fbdad8c3efe1b2520072bc3cd1d5/actions.js
// GÜNCELLENMİŞ: Bu dosya artık sadece bir "hit testing" yönlendiricisi
// ve birkaç genel yardımcı fonksiyon içeriyor.

import { state } from './main.js';
import { getColumnAtPoint } from './columns.js';
import { getBeamAtPoint } from './beams.js'; // <-- YENİ SATIRI EKLEYİN
import { getStairAtPoint } from './stairs.js'; // <-- MERDİVEN EKLENDİ
import { getWallAtPoint } from './wall-handler.js';
import { getDoorAtPoint } from './door-handler.js';
import { getWindowAtPoint } from './window-handler.js';
// getVentAtPoint ve getRoomAtPoint için de benzer importlar gerekir.
// Şimdilik, bu mantığı basitleştirmek için burada bırakıyorum.
import { distToSegmentSquared } from './geometry.js';


/**
 * Verilen noktadaki (pos) en üstteki nesneyi bulur.
 * @param {object} pos - Dünya koordinatları {x, y}
 * @returns {object | null} - Bulunan nesne (seçim için) veya null
 */
export function getObjectAtPoint(pos) {
    const { walls, doors, rooms, zoom } = state;
    const tolerance = 8 / zoom; // Genel tıklama toleransı

    // Nesneleri ters sırada kontrol etmek genellikle en üsttekini bulmayı sağlar.
    // Ancak handle'ları (köşe/kenar) gövdeden önce kontrol etmek daha doğru olur.

    // 1. Handle Kontrolleri (Öncelikli)
    // 1.1 Kolon Handle
    const columnHandleHit = getColumnAtPoint(pos);
    if (columnHandleHit && columnHandleHit.handle !== 'body') return columnHandleHit;
    // 1.2 Kiriş Handle
    const beamHandleHit = getBeamAtPoint(pos);
    if (beamHandleHit && beamHandleHit.handle !== 'body') return beamHandleHit;
    // 1.3 Merdiven Handle
    const stairHandleHit = getStairAtPoint(pos);
    if (stairHandleHit && stairHandleHit.handle !== 'body') return stairHandleHit;
    // 1.4 Duvar Ucu (Node)
    const wallNodeHit = getWallAtPoint(pos, tolerance);
    if (wallNodeHit && wallNodeHit.handle !== 'body') return wallNodeHit;

    // 2. Gövde Kontrolleri (Handle'lardan sonra)
    // 2.1 Kapı
    const doorHit = getDoorAtPoint(pos, tolerance);
    if (doorHit) return doorHit;
    // 2.2 Pencere
    const windowHit = getWindowAtPoint(pos, tolerance);
    if (windowHit) return windowHit;
    // 2.3 Menfez
    for (const wall of [...walls].reverse()) { // Ters sıra
        if (!wall.vents || wall.vents.length === 0 || !wall.p1 || !wall.p2) continue;
        for (const vent of wall.vents) {
            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.1) continue;
            const dx = (wall.p2.x - wall.p1.x) / wallLen;
            const dy = (wall.p2.y - wall.p1.y) / wallLen;
            const ventCenterX = wall.p1.x + dx * vent.pos;
            const ventCenterY = wall.p1.y + dy * vent.pos;
            const wallPx = wall.thickness || state.wallThickness;
            const dx_p = pos.x - ventCenterX;
            const dy_p = pos.y - ventCenterY;
            const distPerpendicular = Math.abs(dx_p * (-dy) + dy_p * dx);
            const distParallel = Math.abs(dx_p * dx + dy_p * dy);

            // Toleransı biraz daha hassas yapalım
            if (distPerpendicular < wallPx / 2 + tolerance / 2 && distParallel < vent.width / 2 + tolerance / 2) {
                return { type: "vent", object: vent, wall: wall };
            }
        }
    }
    // 2.4 Merdiven Gövdesi (Diğer gövdelerden önce kontrol edilebilir)
    if (stairHandleHit && stairHandleHit.handle === 'body') return stairHandleHit;
    // 2.5 Kiriş Gövdesi
    if (beamHandleHit && beamHandleHit.handle === 'body') return beamHandleHit;
    // 2.6 Kolon Gövdesi
    if (columnHandleHit && columnHandleHit.handle === 'body') return columnHandleHit;

    // 2.7 Mahal İsmi/Alanı (Duvar gövdesinden önce kontrol edelim)
    for (const room of [...rooms].reverse()) {
        if (!room.center || !Array.isArray(room.center) || room.center.length < 2) continue;
        const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
        // Mahal ismi için tıklama alanını biraz daha büyük yapabiliriz
        if (distToCenter < 40 / zoom) {
             return { type: 'roomName', object: room }; // Hem isim hem alan için aynı type
        }
    }

    // 2.8 Duvar Gövdesi
    if (wallNodeHit && wallNodeHit.handle === 'body') return wallNodeHit;

    // 2.9 Mahal Alanı (En son)
    for (const room of [...rooms].reverse()) {
        if (!room.polygon?.geometry?.coordinates) continue; // Check added
        try {
            const point = turf.point([pos.x, pos.y]);
            if (turf.booleanPointInPolygon(point, room.polygon)) {
                 // İsmin üzerine gelip gelmediğini tekrar kontrol et (yukarıdaki kontrol zaten yaptı ama emin olalım)
                 let isOverName = false;
                 if (room.center && Array.isArray(room.center) && room.center.length >= 2) {
                    const distToCenter = Math.hypot(pos.x - room.center[0], pos.y - room.center[1]);
                    if (distToCenter < 40 / zoom) {
                        isOverName = true;
                    }
                 }
                 // Eğer ismin üzerinde değilse, mahal alanı olarak kabul et
                 if (!isOverName) {
                    return { type: 'room', object: room };
                 }
            }
        } catch (e) {
            console.error("Error in turf.booleanPointInPolygon:", e, pos, room.polygon);
            continue;
        }
    }

    return null; // Hiçbir şey bulunamadı
}

/**
 * Bir duvarın sahip olabileceği minimum uzunluğu hesaplar.
 * (Diğer modüller buna ihtiyaç duyduğu için şimdilik burada kalabilir)
 * @param {object} wall - Duvar nesnesi
 * @returns {number} - Minimum uzunluk (cm)
 */
export function getMinWallLength(wall) {
    if (!wall || !wall.p1 || !wall.p2) return 10; // Geçersiz duvar için varsayılan min
    const wallThickness = wall.thickness || state.wallThickness;
    const UM = (wallThickness / 2) + 5; // Uç marjı
    const MIN_ITEM_WIDTH = 20; // Yerleştirilebilecek en küçük eleman genişliği
    const MIN_GAP = 0.1; // Elemanlar arası minimum boşluk
    const minLengthFromMargins = 2 * UM; // Sadece marjlar için gereken min uzunluk

    let requiredByItems = 0;
    const items = [
        ...(state.doors.filter(d => d.wall === wall)),
        ...(wall.windows || []),
        ...(wall.vents || [])
    ];
    if (items.length > 0) {
        // Öğeleri pozisyonlarına göre sırala
        items.sort((a,b)=> a.pos - b.pos);
        // İlk öğenin başlangıcı ile duvar başlangıcı arasındaki boşluk
        const spaceBeforeFirst = items[0].pos - items[0].width / 2;
        // Son öğenin bitişi ile duvar bitişi arasındaki boşluk
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        const spaceAfterLast = wallLen - (items[items.length - 1].pos + items[items.length - 1].width / 2);

        // Öğelerin kapladığı toplam genişlik (boşluklar hariç)
        const totalItemWidth = items.reduce((sum, item) => sum + item.width, 0);

        // Gereken minimum toplam uzunluk: Marjlar + Öğeler + Öğeler arasındaki boşluklar
        requiredByItems = UM + totalItemWidth + (items.length - 1) * MIN_GAP + UM;
        // Ancak, öğeler arasındaki boşluklar zaten pozisyon farklarından geldiği için
        // daha basit bir hesaplama: İlk öğenin başlangıcı + (Son öğenin bitişi - İlk öğenin başlangıcı) + Son öğeden sonraki marj
        // Veya: Duvar Marjı + İlk Eleman Ortası - İlk Eleman Yarım Genişlik + Son Eleman Ortası + Son Eleman Yarım Genişlik - (İlk Eleman Ortası - İlk Eleman Yarım Genişlik) + Duvar Marjı
        // En güvenli hesaplama: Tüm elemanların genişliği + (eleman sayısı+1) * marj (veya boşluk)
        // requiredByItems = items.reduce((sum, item) => sum + item.width, 0) + (items.length -1) * MIN_GAP + 2 * UM;

        // Daha doğru: İlk öğenin başlangıcı ile son öğenin bitişi arasındaki mesafe + 2 * marj
        requiredByItems = (items[items.length - 1].pos + items[items.length - 1].width / 2) - (items[0].pos - items[0].width / 2) + 2 * UM;

        // Eğer tek eleman varsa, onun genişliği + 2 * marj
        if(items.length === 1){
            requiredByItems = items[0].width + 2 * UM;
        }

    }

    // Gerekli minimum uzunluk, sadece marjlar için gerekenden veya öğelerle birlikte gerekenden büyük olanıdır.
    // Ayrıca en az 10 gibi mutlak bir minimum da olabilir.
    return Math.max(10, minLengthFromMargins, requiredByItems);
}

// Kalan fonksiyonlar (findLargestAvailableSegment, findAvailableSegmentAt, checkOverlapAndGap,
// getDoorPlacement, isSpaceForDoor, getWindowPlacement, isSpaceForWindow, findCollinearChain)
// ilgili handler dosyalarına (wall-item-utils.js, door-handler.js, window-handler.js, wall-handler.js) taşındı.