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

import { isLightMode, state } from '../general-files/main.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';

// ── Separator mahaller (bunlar birim ayırır) ─────────────────────────────────
const SEPARATOR_NAMES = new Set(['SAHANLIK', 'AÇIK SAHANLIK', 'BAHÇE']);

// ── Sınıflandırma listeleri (öncelik sırasıyla) ──────────────────────────────
const KONUT_T1 = new Set(['YATAK ODASI', 'ÇOCUK ODASI', 'DAİRE']);

const TICARI = new Set([
    'ÇAY OCAĞİ', 'LOKANTA', 'KAHVEHANE', 'KAFE', 'FIRIN','YEMEKHANE', 
    'İMALATHANE', 'ENDÜSTRİYEL MUTFAK', 'FABRİKA', 'ATÖLYE','KANTİN'
]);

const OFIS = new Set([
    'OFİS', 'BEKLEME ODASI', 'TOPLANTI ODASI', 'DÜKKAN', 'BAKKAL',
    'MARKET', 'REVİR', 'MESCİD', 'CAMİ', 'OKUL', 'DANIŞMA', 'BÜFE',
    'SINIF', 'SAĞLIK OCAĞI', 'SHOWROOM', 'MAĞAZA',
    'LABARATUVAR', 'SPOR SALONU', 'MUAYENEHANE',  'ARŞİV',
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
    if (names.some(n => KONUT_T1.has(n))) return 'KONUT';
    if (names.some(n => TICARI.has(n))) return 'TİCARİ';
    if (names.some(n => OFIS.has(n))) return 'OFİS';
    if (names.some(n => KAZAN.has(n))) return 'KAZAN D.';
    if (names.some(n => KONUT_T2.has(n))) return 'KONUT';
    // Tamamı birim-dışı mı?
    if (names.every(n => BIRIM_DISI.has(n) || n === '' || n === 'MAHAL')) return null;
    return null; // BİRİM HARİCİ
}

// ── Cache (per-floor) ─────────────────────────────────────────────────────────
const _cache = new Map(); // floorId → { rooms, doors, walls, namesKey, result }

function _roomNamesKey(rooms) {
    // Mahal adları / birim no değiştiğinde cache'i geçersiz kılmak için anahtar
    return rooms.map(r => (r.name || '') + (r.id ?? '') + ':' + (r.birimNo ?? '')).join('|');
}

// ── Ana hesaplama fonksiyonu ──────────────────────────────────────────────────
export function computeUnitBirims(overrideFloorId) {
    const { rooms = [], doors = [], walls = [] } = state;
    const floorId = overrideFloorId !== undefined
        ? overrideFloorId
        : (state.currentFloor?.id ?? null);
    const namesKey = _roomNamesKey(rooms);

    const cached = _cache.get(floorId);
    if (
        cached &&
        cached.rooms === rooms &&
        cached.doors === doors &&
        cached.walls === walls &&
        cached.namesKey === namesKey
    ) {
        return cached.result;
    }

    // Kat filtrele
    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    // Separator mahalleri (sahanlık / bahçe vb.)
    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));

    const result = [];
    const seen = new Set(); // aynı kapıyı çift işleme

    // Tek döngü: hem sahanlık/bahçe kapıları hem de dış cephe kapıları
    for (const door of fDoors) {
        if (seen.has(door)) continue;
        const wall = door.wall;
        if (!wall || !wall.p1 || !wall.p2) continue;

        const adjacent = getRoomsAdjacentToWall(wall, fRooms);

        // Birim mahali belirle:
        //  • 2 komşu: biri separator (sahanlık vb.), diğeri birim mahali → sahanlık kapısı
        //  • 1 komşu: dış cephe kapısı, o komşu birim mahali olmalı
        let startRoom = null;
        if (adjacent.length === 2) {
            const sepAdj = adjacent.filter(r => separators.includes(r));
            const nonSepAdj = adjacent.filter(r => !separators.includes(r));
            if (sepAdj.length === 1 && nonSepAdj.length === 1) {
                startRoom = nonSepAdj[0];
            }
        } else if (adjacent.length === 1 && !separators.includes(adjacent[0])) {
            startRoom = adjacent[0];
        }
        if (!startRoom) continue;

        const unitRooms = traverseUnit(startRoom, separators, fWalls, fDoors, fRooms);
        const birimTipi = classifyUnit(unitRooms);
        if (!birimTipi) continue; // BİRİM HARİCİ → etiket yok

        // Bu birimin TÜM giriş kapılarını seen'e ekle — her kapıya ayrı
        // etiket basılmasın, birim başına yalnızca 1 etiket olsun.
        const unitRoomSet = new Set(unitRooms);
        for (const d of fDoors) {
            if (seen.has(d)) continue;
            if (!d.wall) continue;
            const adj = getRoomsAdjacentToWall(d.wall, fRooms);
            // d, bu birimi sahanlık/bahçe ile veya dışarıyla bağlayan kapı mı?
            const inUnit = adj.some(r => unitRoomSet.has(r));
            if (!inUnit) continue;
            const otherSide = adj.filter(r => !unitRoomSet.has(r));
            // Hiç dış komşu yok (iki tarafı da birim içi) veya dış komşu separator/dış → bu birime ait giriş kapısıdır
            const isUnitEntry = otherSide.length === 0
                || otherSide.every(r => separators.includes(r));
            if (isUnitEntry) seen.add(d);
        }

        // Kapı merkezi (dünya koordinatı)
        const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
        if (wallLen < 0.01) continue;
        const wdx = (wall.p2.x - wall.p1.x) / wallLen;
        const wdy = (wall.p2.y - wall.p1.y) / wallLen;

        const dcx = wall.p1.x + wdx * door.pos;
        const dcy = wall.p1.y + wdy * door.pos;

        // Duvara dik vektör (normal)
        const nx = -wdy;
        const ny = wdx;

        // Birim mahali hangi tarafta? → startRoom merkezi
        const toRx = startRoom.center[0] - dcx;
        const toRy = startRoom.center[1] - dcy;
        const sign = (toRx * nx + toRy * ny) >= 0 ? 1 : -1;

        // Duvar kalınlığı yarısı + küçük boşluk kadar öteliyoruz
        const halfWall = (wall.thickness || state.wallThickness || 20) / 2;
        const offset = halfWall + 10; // kapıdan 10cm ötede

        const labelX = dcx + nx * sign * offset;
        const labelY = dcy + ny * sign * offset;
        const outerLabelX = dcx - nx * sign * offset;
        const outerLabelY = dcy - ny * sign * offset;

        // Dış yöne (sahanlık/bahçe) birim vektör (3D kapı etiketi için)
        const outerDirX = -nx * sign;
        const outerDirY = -ny * sign;

        // Metin açısı: duvara paralel, ama ters çevrilmiş olmaması için normalize
        let angle = Math.atan2(wdy, wdx);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

        // Birim toplam alanı (m²)
        const unitArea = unitRooms.reduce((sum, r) => sum + (r.area || 0), 0);

        // Birim no: unitRooms içinden birimNo girilmiş olanı al (öncelik)
        const roomWithNo = unitRooms.find(r => r.birimNo != null && String(r.birimNo).trim() !== '');
        const roomBirimNo = roomWithNo ? String(roomWithNo.birimNo).trim() : '';

        result.push({
            door, birimTipi, labelX, labelY, angle, unitArea,
            outerLabelX, outerLabelY,
            outerDirX, outerDirY,
            floorId: door.floorId ?? wall.floorId ?? floorId,
            unitRooms,
            roomBirimNo,
        });
    }

    _cache.set(floorId, { rooms, doors, walls, namesKey, result });
    return result;
}

// Cache'i dışarıdan temizlemek için (duvar/kapı değiştiğinde state referansı zaten değişir)
export function invalidateBirimCache() {
    _cache.clear();
}

// ── Bir mahalin ait olduğu birimdeki tüm mahalleri döndür ───────────────────
// Kapılar üzerinden BFS ile bağlı mahaller; separator (SAHANLIK/BAHÇE) hariç.
// Separator mahalin kendisi verilirse sadece o mahal döner.
export function getUnitRoomsForRoom(room) {
    if (!room) return [];
    const { rooms = [], doors = [], walls = [] } = state;
    const floorId = room.floorId ?? state.currentFloor?.id ?? null;

    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);

    const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));
    if (separators.includes(room)) return [room];

    return traverseUnit(room, separators, fWalls, fDoors, fRooms);
}

// ── Birim dış çevresini (cm) hesapla: birim içi-dış sınırındaki duvarların toplamı ─
export function getUnitBoundaryPerimeter(unitRooms) {
    if (!Array.isArray(unitRooms) || !unitRooms.length) return 0;
    const { walls = [] } = state;
    const floorId = unitRooms[0].floorId ?? state.currentFloor?.id ?? null;
    const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);
    const { rooms = [] } = state;
    const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
    const unitSet = new Set(unitRooms);
    let total = 0;
    for (const wall of fWalls) {
        if (!wall.p1 || !wall.p2) continue;
        const adj = getRoomsAdjacentToWall(wall, fRooms);
        const insideCount = adj.filter(r => unitSet.has(r)).length;
        if (insideCount === 0) continue;                         // duvar birime değmiyor
        if (adj.length >= 2 && insideCount === adj.length) continue; // iki yanı da birim içi
        total += Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
    }
    return total;
}

// ── Birim için sayaç bul (tip uyumlu + dış etikete en yakın) ─────────────────
export function findBirimSayac(entry, sayaclar) {
    if (!entry || !Array.isArray(sayaclar) || !sayaclar.length) return null;
    const { birimTipi, outerLabelX, outerLabelY, floorId } = entry;
    let best = null, bestDist = Infinity;
    for (const s of sayaclar) {
        if (s.floorId != null && floorId != null && s.floorId !== floorId) continue;
        if (s.birimTipi && birimTipi && s.birimTipi !== birimTipi
            && !(birimTipi === 'KAZAN D.' && s.birimTipi === 'KAZAN DAİRESİ')) {
            continue;
        }
        const d = Math.hypot(s.x - outerLabelX, s.y - outerLabelY);
        if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
}

// ── Sayacın çıkış borusu ağacı birim odalarından birine giriyor mu? ──────────
function _isPointInAnyRoom(pt, rooms) {
    if (!pt || !Array.isArray(rooms)) return false;
    const p = turf.point([pt.x, pt.y]);
    for (const room of rooms) {
        if (!room?.polygon) continue;
        try {
            if (turf.booleanPointInPolygon(p, room.polygon)) return true;
        } catch { /* polygon bozuk → atla */ }
    }
    return false;
}

// Bir borunun komşu boru id'lerini toplar: baslangic/bitis bağlantıları,
// T-bağlantıları ve bu boruya başka borulardan gelen referanslar dahil.
function _getPipeNeighbors(pipe, pipes) {
    const out = new Set();
    if (pipe.baslangicBaglanti?.tip === 'boru' && pipe.baslangicBaglanti.hedefId) {
        out.add(pipe.baslangicBaglanti.hedefId);
    }
    if (pipe.bitisBaglanti?.tip === 'boru' && pipe.bitisBaglanti.hedefId) {
        out.add(pipe.bitisBaglanti.hedefId);
    }
    (pipe.tBaglantilar || []).forEach(tb => { if (tb?.boruId) out.add(tb.boruId); });
    // Ters yön: başka borular bu boruya referans veriyor olabilir
    for (const p of pipes) {
        if (p === pipe) continue;
        if (p.baslangicBaglanti?.tip === 'boru' && p.baslangicBaglanti.hedefId === pipe.id) out.add(p.id);
        if (p.bitisBaglanti?.tip === 'boru' && p.bitisBaglanti.hedefId === pipe.id) out.add(p.id);
        if ((p.tBaglantilar || []).some(tb => tb?.boruId === pipe.id)) out.add(p.id);
    }
    return out;
}

// Diğer sayaçların çıkış borularını toplar (onların bölgesine girmeyi engellemek için)
function _getOtherSayacBarrierPipes(excludeSayac) {
    const comps = plumbingManager?.components || [];
    const barrier = new Set();
    for (const c of comps) {
        if (c.type !== 'sayac' || c === excludeSayac) continue;
        if (c.cikisBagliBoruId) barrier.add(c.cikisBagliBoruId);
        if (c.fleksBaglanti?.boruId) barrier.add(c.fleksBaglanti.boruId);
    }
    return barrier;
}

// Boru ağacında uç noktaları verilen odalardan birine düşen ilk odayı bulur
function _pipeTreeFindFirstRoom(startPipeId, rooms, pipes, barrier = new Set()) {
    const visited = new Set();
    const stack = [startPipeId];
    while (stack.length) {
        const pid = stack.pop();
        if (!pid || visited.has(pid)) continue;
        visited.add(pid);
        if (pid !== startPipeId && barrier.has(pid)) continue; // diğer sayaca ait boru
        const pipe = pipes.find(p => p.id === pid);
        if (!pipe) continue;
        for (const r of rooms) {
            if (!r?.polygon) continue;
            try {
                if (pipe.p1 && turf.booleanPointInPolygon(turf.point([pipe.p1.x, pipe.p1.y]), r.polygon)) return r;
                if (pipe.p2 && turf.booleanPointInPolygon(turf.point([pipe.p2.x, pipe.p2.y]), r.polygon)) return r;
            } catch { /* ignore */ }
        }
        for (const nid of _getPipeNeighbors(pipe, pipes)) stack.push(nid);
    }
    return null;
}

function _pipeTreeEntersUnit(startPipeId, unitRooms, pipes, barrier = new Set()) {
    const visited = new Set();
    const stack = [startPipeId];
    while (stack.length) {
        const pid = stack.pop();
        if (!pid || visited.has(pid)) continue;
        visited.add(pid);
        if (pid !== startPipeId && barrier.has(pid)) continue;
        const pipe = pipes.find(p => p.id === pid);
        if (!pipe) continue;
        if (_isPointInAnyRoom(pipe.p1, unitRooms)) return true;
        if (_isPointInAnyRoom(pipe.p2, unitRooms)) return true;
        for (const nid of _getPipeNeighbors(pipe, pipes)) stack.push(nid);
    }
    return false;
}

function _findSayacByPipeIntoUnit(entry) {
    const unitRooms = entry?.unitRooms;
    if (!Array.isArray(unitRooms) || !unitRooms.length) return null;
    const pm = plumbingManager;
    const pipes = pm?.pipes || [];
    const comps = pm?.components || [];
    if (!pipes.length || !comps.length) return null;
    const floorId = entry.floorId;
    for (const s of comps) {
        if (s.type !== 'sayac') continue;
        if (s.floorId != null && floorId != null && s.floorId !== floorId) continue;
        if (!s.cikisBagliBoruId) continue;
        const barrier = _getOtherSayacBarrierPipes(s);
        if (_pipeTreeEntersUnit(s.cikisBagliBoruId, unitRooms, pipes, barrier)) return s;
    }
    return null;
}

// classifyUnit çıktısını sayaç.birimTipi sözlüğüne eşler ('KAZAN D.' → 'KAZAN DAİRESİ')
function _classifyToSayacTipi(tipi) {
    if (tipi === 'KAZAN D.') return 'KAZAN DAİRESİ';
    return tipi || '';
}

// Verilen bir oda için: bu odanın biriminin borusu giren sayacı döner (varsa)
export function findSayacEnteringRoomUnit(room) {
    if (!room) return null;
    const unitRooms = getUnitRoomsForRoom(room);
    const floorId = room.floorId ?? state.currentFloor?.id ?? null;
    return _findSayacByPipeIntoUnit({ unitRooms, floorId });
}

// Yardımcı: bir sayaç için boruyla bağlı birim odalarını döner (yoksa null)
function _getUnitRoomsForSayac(s) {
    const pm = plumbingManager;
    if (!pm?.pipes || !s?.cikisBagliBoruId) return null;
    // Sayaç boru ağacı önce sahanlık/koridor/separator odalarına girebilir;
    // bizim aradığımız gerçek birime ait odadır. Bu yüzden separator/birim-dışı
    // odaları aday listesinden çıkarıyoruz.
    const candidateRooms = (state.rooms || []).filter(r => {
        if (s.floorId != null && r.floorId != null && r.floorId !== s.floorId) return false;
        const nm = (r.name || '').toUpperCase().trim();
        if (SEPARATOR_NAMES.has(nm)) return false;
        if (BIRIM_DISI.has(nm)) return false;
        return true;
    });
    const barrier = _getOtherSayacBarrierPipes(s);
    const anyRoom = _pipeTreeFindFirstRoom(s.cikisBagliBoruId, candidateRooms, pm.pipes, barrier);
    if (!anyRoom) return null;
    const unitRooms = getUnitRoomsForRoom(anyRoom);
    return unitRooms.length ? unitRooms : null;
}

// Sayaç ↔ birim odaları arasında çift yönlü birimNo/birimTipi senkronu.
// Kural:
//  • Sayaçta birimNo DOLU → odalara yaz (sayaç otoriter).
//  • Sayaçta birimNo BOŞ ama odada yazılı → odadaki değeri sayaca kopyala,
//    sonra tüm birim odalarına yay.
//  • Sayaçta birimTipi BOŞ → oda sınıflandırmasından atanır.
export function syncBirimState() {
    const pm = plumbingManager;
    if (!pm?.components || !pm?.pipes) return false;
    let changed = false;
    for (const s of pm.components) {
        if (s.type !== 'sayac') continue;
        const unitRooms = _getUnitRoomsForSayac(s);
        if (!unitRooms) continue;

        // Birim tipi: sayaçta yoksa oda sınıflandırmasından
        if (!s.birimTipi) {
            const classified = _classifyToSayacTipi(classifyUnit(unitRooms));
            if (classified) { s.birimTipi = classified; changed = true; }
        }

        let sayacNo = (s.birimNo ?? '').toString().trim();
        if (!sayacNo) {
            const roomWithNo = unitRooms.find(r => r.birimNo != null && String(r.birimNo).trim() !== '');
            if (roomWithNo) {
                sayacNo = String(roomWithNo.birimNo).trim();
                if (s.birimNo !== sayacNo) { s.birimNo = sayacNo; changed = true; }
            }
        }

        // sayaç → odalar: sayaçtaki değer (boş olsa bile) odalara aynen yansıtılır
        for (const r of unitRooms) {
            const rn = (r.birimNo ?? '').toString();
            if (rn !== sayacNo) { r.birimNo = sayacNo; changed = true; }
        }
    }

    if (changed) invalidateBirimCache();
    return changed;
}

// Geriye dönük uyum: tohumlama ayrı bir çağrı olarak da kullanılabilir
export function seedSayacFromRooms() { return syncBirimState(); }

// 3 m içindeki BRANSMAN vanalarının birim no'su, bir kattaki dairelerin
// giriş kapısına en yakın olanı seçilerek o dairenin BİRİM NO'suna yazılır.
// Sayaç bağlanmamış (downstream) BRANSMAN'lar için syncBirimState'in pipe-tree
// yolu çalışmaz; bu fonksiyon proximity tabanlı olarak boşluğu kapatır.
const BRANSMAN_DOOR_MAX_DIST_CM = 300; // 3 m

export function syncBransmanToRooms() {
    const pm = plumbingManager;
    if (!pm?.components) return false;
    const { rooms = [], doors = [], walls = [] } = state;
    if (!rooms.length || !doors.length) return false;

    // Kat → birim no dolu BRANSMAN vanaları (ilerde kullanım hariç)
    const vanasByFloor = new Map();
    for (const c of pm.components) {
        if (c.type !== 'vana' || c.vanaTipi !== 'BRANSMAN') continue;
        if (c.ilerdeKullanim) continue;
        const no = String(c.birimNo ?? '').trim();
        if (!no) continue;
        const fid = c.floorId ?? null;
        if (!vanasByFloor.has(fid)) vanasByFloor.set(fid, []);
        vanasByFloor.get(fid).push(c);
    }
    if (!vanasByFloor.size) return false;

    let changed = false;
    for (const [floorId, vanas] of vanasByFloor.entries()) {
        const fRooms = rooms.filter(r => !floorId || !r.floorId || r.floorId === floorId);
        const fDoors = doors.filter(d => !floorId || !d.floorId || d.floorId === floorId);
        const fWalls = walls.filter(w => !floorId || !w.floorId || w.floorId === floorId);
        if (!fRooms.length || !fDoors.length) continue;
        const separators = fRooms.filter(r => SEPARATOR_NAMES.has((r.name || '').toUpperCase().trim()));

        // Birim girişi kapıları (sahanlığa veya dış cepheye bakan) — birim odalarına göre grupla
        // Aynı birim birden fazla giriş kapısına sahip olabilir; en yakın vana hepsi üzerinde aranır.
        const unitEntries = []; // { unitRooms, entranceDoors: [{cx,cy}] }
        for (const door of fDoors) {
            const wall = door.wall;
            if (!wall || !wall.p1 || !wall.p2) continue;
            const adjacent = getRoomsAdjacentToWall(wall, fRooms);
            let startRoom = null;
            if (adjacent.length === 2) {
                const sepAdj = adjacent.filter(r => separators.includes(r));
                const nonSepAdj = adjacent.filter(r => !separators.includes(r));
                if (sepAdj.length === 1 && nonSepAdj.length === 1) startRoom = nonSepAdj[0];
            } else if (adjacent.length === 1 && !separators.includes(adjacent[0])) {
                startRoom = adjacent[0];
            }
            if (!startRoom) continue;

            const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
            if (wallLen < 0.01) continue;
            const wdx = (wall.p2.x - wall.p1.x) / wallLen;
            const wdy = (wall.p2.y - wall.p1.y) / wallLen;
            const cx = wall.p1.x + wdx * door.pos;
            const cy = wall.p1.y + wdy * door.pos;

            // Bu giriş, mevcut bir birime mi ait? (birim odaları kesişimine bak)
            let entry = null;
            for (const e of unitEntries) {
                if (e.unitRooms.includes(startRoom)) { entry = e; break; }
            }
            if (entry) {
                entry.entranceDoors.push({ cx, cy });
            } else {
                const unitRooms = traverseUnit(startRoom, separators, fWalls, fDoors, fRooms);
                if (!classifyUnit(unitRooms)) continue; // birim harici (BIRIM_DISI vb.)
                unitEntries.push({ unitRooms, entranceDoors: [{ cx, cy }] });
            }
        }
        if (!unitEntries.length) continue;

        // Her birim için: tüm giriş kapılarına en yakın olan BRANSMAN vanası
        // 3 m içinde ise birim no'sunu birim odalarına yaz.
        for (const { unitRooms, entranceDoors } of unitEntries) {
            let best = null;
            let bestDist = Infinity;
            for (const v of vanas) {
                const vx = v.x ?? 0;
                const vy = v.y ?? 0;
                for (const ed of entranceDoors) {
                    const d = Math.hypot(vx - ed.cx, vy - ed.cy);
                    if (d < bestDist) { bestDist = d; best = v; }
                }
            }
            if (!best || bestDist > BRANSMAN_DOOR_MAX_DIST_CM) continue;
            const no = String(best.birimNo).trim();
            if (!no) continue;
            for (const r of unitRooms) {
                const cur = (r.birimNo ?? '').toString();
                if (cur !== no) { r.birimNo = no; changed = true; }
            }
        }
    }
    if (changed) invalidateBirimCache();
    return changed;
}

// Bir oda verildiğinde, birim için atanmış birimNo'yu çöz (sayaç önceliğine göre)
export function resolveBirimNoForRoom(room) {
    if (!room) return { no: '', assigned: false };
    const unitRooms = getUnitRoomsForRoom(room);
    const roomWithNo = unitRooms.find(r => r.birimNo != null && String(r.birimNo).trim() !== '');
    const roomBirimNo = roomWithNo ? String(roomWithNo.birimNo).trim() : '';
    const entry = {
        unitRooms,
        floorId: room.floorId ?? state.currentFloor?.id ?? null,
        roomBirimNo,
    };
    return resolveBirimNo(entry);
}

// ── Birim için etiket numarasını çöz: boru-girişli sayaç > oda > en yakın sayaç
// Döner: { no: string, assigned: boolean } — assigned=false ise hiçbir eşleşme yok
export function resolveBirimNo(entry) {
    if (!entry) return { no: '', assigned: false };
    const piped = _findSayacByPipeIntoUnit(entry);
    if (piped) return { no: String(piped.birimNo ?? '').trim(), assigned: true };
    if (entry.roomBirimNo) return { no: entry.roomBirimNo, assigned: true };
    const sayaclar = (plumbingManager?.components || []).filter(c => c.type === 'sayac');
    const s = findBirimSayac(entry, sayaclar);
    if (s) return { no: String(s.birimNo ?? '').trim(), assigned: true };
    return { no: '', assigned: false };
}

// ── Birim tipi kısaltması satırları (ör. ["D2"], ["Dük3","Ofis"], ["KD1"]) ─
export function getBirimShortLabelLines(birimTipi, birimNo) {
    const no = birimNo || '';
    switch (birimTipi) {
        case 'KONUT': return [`D${no}`];
        case 'OFİS': return [`(Ofis) Dük${no}`];
        case 'TİCARİ': return [`(Ticari) Dük${no}`];
        case 'KAZAN D.':
        case 'KAZAN DAİRESİ': return [`KazanD. ${no}`];
        default: return [`D${no}`];
    }
}

// Backward-compat tek-satır birleştirilmiş etiket (OFİS/TİCARİ → "Dük3 Ofis")
export function getBirimShortLabel(birimTipi, birimNo) {
    return getBirimShortLabelLines(birimTipi, birimNo).join(' ');
}

// ── Renk paleti ───────────────────────────────────────────────────────────────
const BIRIM_COLOR = {
    dark: {
        'KONUT': 'rgb(255, 200, 140)',
        'OFİS': 'rgb(140, 255, 140)',
        'TİCARİ': 'rgb(255, 140, 140)',
        'KAZAN D.': 'rgb(255, 140, 255)'
    },
    light: {
        'KONUT': 'rgb(200, 100, 0)',
        'OFİS': 'rgb(0, 150, 0)',
        'TİCARİ': 'rgb(150, 0, 0)',
        'KAZAN D.': 'rgb(150, 0, 150)'
    }
};

// ── Çizim fonksiyonu (etiket – sadece metin, çerçeve yok) ────────────────────
export function drawBirimLabels(ctx2d, st) {
    // Sync görünürlük bayrağından bağımsız çalışmalı ki panel değerleri güncel kalsın
    syncBirimState();
    if (!st.tempVisibility?.showRoomNames) return; // mahal adları kapalıysa çizme

    const labels = computeUnitBirims();
    if (!labels.length) return;

    const zoom = st.zoom || 1;
    const ZOOM_EXP = -0.1;
    const BASE_SIZE = 10;
    const fontSize = Math.max(4, BASE_SIZE * Math.pow(zoom, ZOOM_EXP));

    ctx2d.save();
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;

    const showArea = !!st.tempVisibility?.showArchDimensions;
    const areaFontSize = fontSize * 0.9;

    for (const entry of labels) {
        const { labelX, labelY, angle, birimTipi, unitArea } = entry;
        const color = isLightMode() ? BIRIM_COLOR.light[birimTipi] : BIRIM_COLOR.dark[birimTipi];

        const { no: birimNo, assigned } = resolveBirimNo(entry);
        const labelLines = assigned ? getBirimShortLabelLines(birimTipi, birimNo) : [birimTipi];

        ctx2d.save();
        ctx2d.translate(labelX, labelY);
        ctx2d.rotate(angle);

        ctx2d.fillStyle = color;
        ctx2d.font = `bold ${fontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
        ctx2d.globalAlpha = 1;
        labelLines.forEach((line, i) => {
            ctx2d.fillText(line, 0, i * fontSize);
        });

        if (showArea && unitArea > 0) {
            ctx2d.font = `${areaFontSize}px "Segoe UI","Roboto","Helvetica Neue",sans-serif`;
            ctx2d.fillText(unitArea.toFixed(0) + ' m2', 0, labelLines.length * fontSize);
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

    const zoom = st.zoom || 1;
    const thinW = 1 / zoom;    // ~6px – normal sınır
    const thickW = 2 / zoom;   // ~16px – seçili birim sınırı

    // İki geçiş: önce normal birimler, sonra seçili birim (üstte görünsün)
    ctx2d.save();
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';

    // Geçiş 1: seçili olmayan birimler
    for (const { unitRooms, birimTipi } of allUnitRoomSets) {
        const isSelUnit = selectedUnitRooms && [...unitRooms].some(r => selectedUnitRooms.has(r));
        if (isSelUnit) continue;

        const color = isLightMode() ? BIRIM_COLOR.light[birimTipi] : BIRIM_COLOR.dark[birimTipi];
        ctx2d.strokeStyle = color;
        ctx2d.lineWidth = thinW;
        ctx2d.shadowColor = color + 'aa';
        ctx2d.shadowBlur = 5 / zoom;

        for (const wall of fWalls) {
            if (!wall.p1 || !wall.p2) continue;
            const adjacent = getRoomsAdjacentToWall(wall, fRooms);
            const insideCount = adjacent.filter(r => unitRooms.has(r)).length;
            const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
            // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
            // if (insideCount === 0) continue;
            // if (insideCount >= 2 && outsideCount === 0) continue;
            if (insideCount === 0 || outsideCount === 0) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur = 0;
    }

    // Geçiş 2: seçili birim – kalın + glow
    if (selectedUnitRooms) {
        for (const { unitRooms, birimTipi } of allUnitRoomSets) {
            const isSelUnit = [...unitRooms].some(r => selectedUnitRooms.has(r));
            if (!isSelUnit) continue;

            const color = isLightMode() ? BIRIM_COLOR.light[birimTipi] : BIRIM_COLOR.dark[birimTipi];
            ctx2d.shadowColor = color;
            ctx2d.shadowBlur = 12 / zoom;
            ctx2d.strokeStyle = color;
            ctx2d.lineWidth = thickW;

            for (const wall of fWalls) {
                if (!wall.p1 || !wall.p2) continue;
                const adjacent = getRoomsAdjacentToWall(wall, fRooms);
                const insideCount = adjacent.filter(r => unitRooms.has(r)).length;
                const outsideCount = adjacent.filter(r => !unitRooms.has(r)).length;
                // İç duvar (her iki komşu da birim içi) → atla; dış cephe veya sınır duvarı → çiz
                // if (insideCount === 0) continue;
                // if (insideCount >= 2 && outsideCount === 0) continue;
                if (insideCount === 0 || outsideCount === 0) continue;
                ctx2d.beginPath();
                ctx2d.moveTo(wall.p1.x, wall.p1.y);
                ctx2d.lineTo(wall.p2.x, wall.p2.y);
                ctx2d.stroke();
            }

            ctx2d.shadowColor = 'transparent';
            ctx2d.shadowBlur = 0;
            break;
        }
    }

    // Geçiş 3: seçili ayrıcı mahal (SAHANLIK vb.) – çevresi kalın beyaz
    if (selectedSeparatorWalls) {
        ctx2d.strokeStyle = isLightMode() ? '#000' : '#fff'
        ctx2d.lineWidth = thickW;
        ctx2d.shadowColor = 'rgba(255,255,255,0.6)';
        ctx2d.shadowBlur = 8 / zoom;

        for (const wall of selectedSeparatorWalls) {
            if (!wall.p1 || !wall.p2) continue;
            ctx2d.beginPath();
            ctx2d.moveTo(wall.p1.x, wall.p1.y);
            ctx2d.lineTo(wall.p2.x, wall.p2.y);
            ctx2d.stroke();
        }

        ctx2d.shadowColor = 'transparent';
        ctx2d.shadowBlur = 0;
    }

    ctx2d.restore();
}
