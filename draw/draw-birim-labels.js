/**
 * draw-birim-labels.js
 * Kapı önüne birim tipi etiketi çizer (KONUT / OFİS / TİCARİ / KAZAN DAİRESİ).
 *
 * MANTIK:
 *  1. SAHANLIK / AÇIK SAHANLIK / BAHÇE mahalleri tespit edilir.
 *  2. Bu mahallerin duvarlarındaki her kapı incelenir.
 *  3. Kapının "diğer taraf" mahalinden BFS ile birime ait tüm mahaller toplanır.
 *  4. Mahal adları sınıflandırma ağacına göre birim tipine dönüştürülür.
 *  5. Kapı merkezinin duvara dik yönde, birim tarafına kaydırılmış noktasına
 *     duvara paralel metin yazılır.
 */

import { state } from '../general-files/main.js';

// ── Separator mahaller (bunlar birim ayırır) ─────────────────────────────────
const SEPARATOR_NAMES = new Set(['SAHANLIK', 'AÇIK SAHANLIK', 'BAHÇE']);

// ── Sınıflandırma listeleri (öncelik sırasıyla) ──────────────────────────────
const KONUT_T1 = new Set(['YATAK ODASI', 'ÇOCUK ODASI', 'DAİRE']);

const TICARI = new Set([
    'ÇAY OCAĞİ', 'LOKANTA', 'KAHVEHANE', 'KAFE', 'FIRIN',
    'İMALATHANE', 'ENDÜSTRİYEL MUTFAK', 'FABRİKA', 'ATÖLYE'
]);

const OFIS = new Set([
    'OFİS', 'BEKLEME ODASI', 'TOPLANTI ODASI', 'DÜKKAN', 'BAKKAL',
    'MARKET', 'REVİR', 'MESCİD', 'CAMİ', 'OKUL', 'DANIŞMA', 'BÜFE',
    'YEMEKHANE', 'SINIF', 'SAĞLIK OCAĞI', 'SHOWROOM', 'MAĞAZA',
    'LABARATUVAR', 'SPOR SALONU', 'MUAYENEHANE', 'KANTİN', 'ARŞİV',
    'HAMAM', 'SOSYAL TESİS'
]);

const KAZAN = new Set(['KAZAN DAİRESİ', 'CİHAZ ODASI', 'ISI MERKEZİ']);

const KONUT_T2 = new Set([
    'ODA', 'MUTFAK', 'SALON', 'OTURMA ODASI', 'BANYO', 'AÇIK BALKON',
    'KAPALI BALKON', 'KORİDOR', 'ANTRE', 'AÇIK MUTFAK', 'YEMEK ODASI',
    'ÇALIŞMA ODASI', 'DUBLEKS ANTRE', 'HOL', 'WC', 'LAVABO', 'KİLER', 'TERAS'
]);

// Bunların HEPSİ bu ise birim dışı (etiket yok)
const BIRIM_DISI = new Set([
    'MAHAL', 'ASANSÖR', 'YAN BİNA', 'DEPO', 'AYDINLIK', 'GARAJ', 'BODRUM',
    'AÇIK OTOPARK', 'KAPALI OTOPARK', 'BACA', 'TEKNİK HACİM', 'AÇIK AYDINLIK',
    'ÇATI ARASI', 'YANGIN MERDİVENİ', 'TESİSAT ŞAFTI', 'BACA ŞAFTI',
    'SAYAÇ ODASI', 'SAYAÇ ŞAFTI', 'KURANGLEZ', 'SIĞINAK', 'HAVALANDIRMA',
    'TOPRAK DOLGU', 'KÖMÜRLÜK', 'ORTAK ALAN'
]);

// ── Yardımcı: bir mahale bitişik duvarları döndür ─────────────────────────────
function getWallsBorderingRoom(room, walls) {
    const TOLS = 2; // cm tolerans
    const found = [];
    const coords = room.polygon.geometry.coordinates[0];
    for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i];
        const [bx, by] = coords[i + 1];
        for (const wall of walls) {
            if (!wall.p1 || !wall.p2) continue;
            const d1 = Math.hypot(wall.p1.x - ax, wall.p1.y - ay) +
                       Math.hypot(wall.p2.x - bx, wall.p2.y - by);
            const d2 = Math.hypot(wall.p1.x - bx, wall.p1.y - by) +
                       Math.hypot(wall.p2.x - ax, wall.p2.y - ay);
            if (Math.min(d1, d2) < TOLS) { found.push(wall); break; }
        }
    }
    return found;
}

// ── Yardımcı: bir duvara bitişik mahalleri döndür ─────────────────────────────
function getRoomsAdjacentToWall(wall, rooms) {
    const TOLS = 2;
    const found = [];
    for (const room of rooms) {
        const coords = room.polygon.geometry.coordinates[0];
        for (let i = 0; i < coords.length - 1; i++) {
            const [ax, ay] = coords[i];
            const [bx, by] = coords[i + 1];
            const d1 = Math.hypot(wall.p1.x - ax, wall.p1.y - ay) +
                       Math.hypot(wall.p2.x - bx, wall.p2.y - by);
            const d2 = Math.hypot(wall.p1.x - bx, wall.p1.y - by) +
                       Math.hypot(wall.p2.x - ax, wall.p2.y - ay);
            if (Math.min(d1, d2) < TOLS) { found.push(room); break; }
        }
    }
    return found;
}

// ── Yardımcı: kapılar aracılığıyla birbirine bağlı tüm mahalleri BFS ile bul ─
function traverseUnit(startRoom, separatorRooms, walls, doors, allRooms) {
    const visited = new Set([startRoom]);
    const queue = [startRoom];
    while (queue.length > 0) {
        const cur = queue.shift();
        for (const wall of getWallsBorderingRoom(cur, walls)) {
            if (!doors.some(d => d.wall === wall)) continue; // kapısız duvar atla
            for (const neighbor of getRoomsAdjacentToWall(wall, allRooms)) {
                if (!visited.has(neighbor) && !separatorRooms.includes(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
    }
    return [...visited];
}

// ── Sınıflandırma ─────────────────────────────────────────────────────────────
function classifyUnit(unitRooms) {
    const names = unitRooms.map(r => (r.name || '').toUpperCase().trim());
    if (names.some(n => KONUT_T1.has(n)))  return 'KONUT';
    if (names.some(n => TICARI.has(n)))    return 'TİCARİ';
    if (names.some(n => OFIS.has(n)))      return 'OFİS';
    if (names.some(n => KAZAN.has(n)))     return 'KAZAN D.';
    if (names.some(n => KONUT_T2.has(n)))  return 'KONUT';
    // Tamamı birim-dışı mı?
    if (names.every(n => BIRIM_DISI.has(n) || n === '' || n === 'MAHAL')) return null;
    return null; // BİRİM HARİCİ
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let _cachedResult   = null;
let _cachedRooms    = null;
let _cachedDoors    = null;
let _cachedWalls    = null;
let _cachedFloor    = null;
let _cachedNamesKey = null;

function _roomNamesKey(rooms) {
    // Mahal adları değiştiğinde cache'i geçersiz kılmak için basit bir anahtar
    return rooms.map(r => (r.name || '') + (r.id ?? '')).join('|');
}

// ── Ana hesaplama fonksiyonu ──────────────────────────────────────────────────
export function computeUnitBirims() {
    const { rooms = [], doors = [], walls = [] } = state;
    const floorId = state.currentFloor?.id ?? null;
    const namesKey = _roomNamesKey(rooms);

    // Array referansı, kat VE mahal adları değişmemişse önbelleği kullan
    if (
        _cachedRooms === rooms &&
        _cachedDoors === doors &&
        _cachedWalls === walls &&
        _cachedFloor === floorId &&
        _cachedNamesKey === namesKey &&
        _cachedResult !== null
    ) {
        return _cachedResult;
    }

    _cachedRooms    = rooms;
    _cachedDoors    = doors;
    _cachedWalls    = walls;
    _cachedFloor    = floorId;
    _cachedNamesKey = namesKey;

    // Kat filtrele
    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    // Separator mahalleri
    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));
    if (separators.length === 0) {
        _cachedResult = [];
        return _cachedResult;
    }

    const result = [];
    const seen   = new Set(); // aynı kapıyı çift işleme

    for (const sep of separators) {
        for (const wall of getWallsBorderingRoom(sep, fWalls)) {
            const wallDoors = fDoors.filter(d => d.wall === wall);
            for (const door of wallDoors) {
                if (seen.has(door)) continue;
                seen.add(door);

                const adjacent   = getRoomsAdjacentToWall(wall, fRooms);
                const startRoom  = adjacent.find(r => !separators.includes(r));
                if (!startRoom) continue;

                const unitRooms  = traverseUnit(startRoom, separators, fWalls, fDoors, fRooms);
                const birimTipi  = classifyUnit(unitRooms);
                if (!birimTipi) continue; // BİRİM HARİCİ → etiket yok

                // Kapı merkezi (dünya koordinatı)
                const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
                if (wallLen < 0.01) continue;
                const wdx = (wall.p2.x - wall.p1.x) / wallLen;
                const wdy = (wall.p2.y - wall.p1.y) / wallLen;

                const dcx = wall.p1.x + wdx * door.pos;
                const dcy = wall.p1.y + wdy * door.pos;

                // Duvara dik vektör (normal)
                const nx = -wdy;
                const ny =  wdx;

                // Birim mahali hangi tarafta? → startRoom merkezi
                const toRx  = startRoom.center[0] - dcx;
                const toRy  = startRoom.center[1] - dcy;
                const sign  = (toRx * nx + toRy * ny) >= 0 ? 1 : -1;

                // Duvar kalınlığı yarısı + küçük boşluk kadar öteliyoruz
                const halfWall = (wall.thickness || state.wallThickness || 20) / 2;
                const offset   = halfWall + 10; // kapıdan 10cm ötede

                const labelX = dcx + nx * sign * offset;
                const labelY = dcy + ny * sign * offset;

                // Metin açısı: duvara paralel, ama ters çevrilmiş olmaması için normalize
                let angle = Math.atan2(wdy, wdx);
                if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

                // Birim toplam alanı (m²)
                const unitArea = unitRooms.reduce((sum, r) => sum + (r.area || 0), 0);

                result.push({ door, birimTipi, labelX, labelY, angle, unitArea });
            }
        }
    }

    _cachedResult = result;
    return result;
}

// Cache'i dışarıdan temizlemek için (duvar/kapı değiştiğinde state referansı zaten değişir)
export function invalidateBirimCache() {
    _cachedResult = null;
    _cachedRooms  = null;
    _cachedDoors  = null;
    _cachedWalls  = null;
}

// ── Renk paleti ───────────────────────────────────────────────────────────────
const BIRIM_COLOR = {
   
    'KONUT':         '#ffcc80', 
    'OFİS':          '#52fd58', 
    'TİCARİ':        '#32dcfa', 
    'KAZAN D.':      '#8260ff'  
    

    
};

// ── Çizim fonksiyonu (etiket – sadece metin, çerçeve yok) ────────────────────
export function drawBirimLabels(ctx2d, st) {
    if (!st.tempVisibility?.showRoomNames) return; // mahal adları kapalıysa atla

    const labels = computeUnitBirims();
    if (!labels.length) return;

    const zoom     = st.zoom || 1;
    const ZOOM_EXP = -0.1;
    const BASE_SIZE = 13;
    const fontSize  = Math.max(4, BASE_SIZE * Math.pow(zoom, ZOOM_EXP));

    ctx2d.save();
    ctx2d.textAlign    = 'center';
    ctx2d.textBaseline = 'bottom';
    ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;

    const showArea = !!st.tempVisibility?.showArchDimensions;
    const areaFontSize = fontSize * 0.9;

    for (const { labelX, labelY, angle, birimTipi, unitArea } of labels) {
        const color = BIRIM_COLOR[birimTipi] || '#ffffff';

        ctx2d.save();
        ctx2d.translate(labelX, labelY);
        ctx2d.rotate(angle);

        ctx2d.fillStyle = color;
        ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
        ctx2d.globalAlpha = 0.8;
        ctx2d.fillText(birimTipi, 0, 0);

        if (showArea && unitArea > 0) {
            ctx2d.font = `${areaFontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
            ctx2d.fillText(unitArea.toFixed(1) + ' m2', 0, fontSize);
        }

        ctx2d.restore();
    }

    ctx2d.restore();
}

// ── Birim sınır çizgileri ─────────────────────────────────────────────────────
export function drawBirimBoundaries(ctx2d, st) {
    if (!st.tempVisibility?.showBirimBoundaries) return;

    const { rooms = [], doors = [], walls = [] } = st;
    const floorId = st.currentFloor?.id ?? null;

    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    // Birim listesini hesapla
    const labels = computeUnitBirims();
    if (!labels.length) return;

    // Seçili oda varsa hangi birime ait bul (oda seçimi selectedRoom üzerinden gelir)
    const selRoom = st.selectedRoom ?? null;
    let selectedUnitRooms = null;
    let selectedSeparatorWalls = null; // SAHANLIK gibi ayrıcı mahal seçilince
    if (selRoom) {
        const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));
        const isSeparator = separators.includes(selRoom);
        if (isSeparator) {
            selectedSeparatorWalls = new Set(getWallsBorderingRoom(selRoom, fWalls));
        } else {
            const startRoom = fRooms.find(r => r === selRoom);
            if (startRoom) {
                selectedUnitRooms = new Set(traverseUnit(startRoom, separators, fWalls, fDoors, fRooms));
            }
        }
    }

    // Her duvar için: bir tarafı birim içinde, diğer tarafı birim dışında veya ayrıcı ise sınır duvarı
    // Tüm birim odası kümesini birleştir
    const allUnitRoomSets = [];
    const seenDoors = new Set();
    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));

    for (const { door, birimTipi } of labels) {
        if (seenDoors.has(door)) continue;
        seenDoors.add(door);

        const wall = door.wall;
        const adjacent = getRoomsAdjacentToWall(wall, fRooms);
        const startRoom = adjacent.find(r => !separators.includes(r));
        if (!startRoom) continue;

        const unitRooms = new Set(traverseUnit(startRoom, separators, fWalls, fDoors, fRooms));
        allUnitRoomSets.push({ unitRooms, birimTipi });
    }

    const zoom   = st.zoom || 1;
    const thinW  = 1 / zoom;    // ~6px – normal sınır
    const thickW = 2 / zoom;   // ~16px – seçili birim sınırı

    // İki geçiş: önce normal birimler, sonra seçili birim (üstte görünsün)
    ctx2d.save();
    ctx2d.lineCap  = 'round';
    ctx2d.lineJoin = 'round';

    // Geçiş 1: seçili olmayan birimler
    for (const { unitRooms, birimTipi } of allUnitRoomSets) {
        const isSelUnit = selectedUnitRooms && [...unitRooms].some(r => selectedUnitRooms.has(r));
        if (isSelUnit) continue;

        const color = BIRIM_COLOR[birimTipi] || 'rgb(255, 255, 255)';
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth   = thinW;
        ctx2d.shadowColor = color + 'aa';
        ctx2d.shadowBlur  = 5 / zoom;

        for (const wall of fWalls) {
            if (!wall.p1 || !wall.p2) continue;
            const adjacent     = getRoomsAdjacentToWall(wall, fRooms);
            const insideCount  = adjacent.filter(r =>  unitRooms.has(r)).length;
            const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
            // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
            if (insideCount === 0) continue;
            if (insideCount >= 2 && outsideCount === 0) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur  = 0;
    }

    // Geçiş 2: seçili birim – kalın + glow
    if (selectedUnitRooms) {
        for (const { unitRooms, birimTipi } of allUnitRoomSets) {
            const isSelUnit = [...unitRooms].some(r => selectedUnitRooms.has(r));
            if (!isSelUnit) continue;

            const color = BIRIM_COLOR[birimTipi] || '#ffcc80';
            ctx2d.shadowColor = color;
            ctx2d.shadowBlur  = 12 / zoom;
            ctx2d.strokeStyle = color;
            ctx2d.lineWidth   = thickW;

            for (const wall of fWalls) {
                if (!wall.p1 || !wall.p2) continue;
                const adjacent     = getRoomsAdjacentToWall(wall, fRooms);
                const insideCount  = adjacent.filter(r =>  unitRooms.has(r)).length;
                const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
                // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
            if (insideCount === 0) continue;
            if (insideCount >= 2 && outsideCount === 0) continue;
                ctx2d.beginPath();
                ctx2d.moveTo(wall.p1.x, wall.p1.y);
                ctx2d.lineTo(wall.p2.x, wall.p2.y);
                ctx2d.stroke();
            }

            ctx2d.shadowColor = 'transparent';
            ctx2d.shadowBlur  = 0;
            break;
        }
    }

    // Geçiş 3: seçili ayrıcı mahal (SAHANLIK vb.) – çevresi kalın beyaz
    if (selectedSeparatorWalls) {
        ctx2d.strokeStyle = '#ffffff';
        ctx2d.lineWidth   = thickW;
        ctx2d.shadowColor = 'rgba(255,255,255,0.6)';
        ctx2d.shadowBlur  = 8 / zoom;

        for (const wall of selectedSeparatorWalls) {
            if (!wall.p1 || !wall.p2) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur  = 0;
    }

    ctx2d.restore();
}
