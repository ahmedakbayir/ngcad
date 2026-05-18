// auto-name.js
// Mahal isimlerini kurallara göre otomatik atar.
//
// Kurallar (kullanıcı tarafından sağlanmıştır):
//
//  Birim içinde;
//   - OCAK olan mahal(ler) MUTFAK,
//   - Balkon duvarı olan ve içinde SAYAÇ varsa AÇIK SAHANLIK,
//   - Balkon duvarı olmayan ve içinde SAYAÇ varsa SAHANLIK,
//   - MERDİVEN olan yer SAHANLIK,
//   - Sahanlıktan kapı açılan birim içi mahal ANTRE
//     veya mahallerin ortasında kalan ve en fazla odaya açılan mahal ANTRE
//     veya mutfaktan kapı açılan ve 3'ten fazla mahal ile ortak duvar komşuluğu olan mahal ANTRE
//   - Geriye kalanlardan en büyük alanlı mahal SALON
//   - ANTRE'ye komşu alanı 3 m² den küçük mahal WC
//   - ANTRE'ye komşu en küçük alanlı mahal BANYO
//   - ANTRE'ye komşu olmayan, alanı 5 m² den küçük mahaller:
//        balkon duvarı varsa AÇIK BALKON, yoksa KAPALI BALKON
//   - Antreye komşu diğer mahaller dönüşümlü: YATAK ODASI / OTURMA ODASI
//
// ÖNEMLİ: Kullanıcının atadığı isimler korunur. Yalnızca "MAHAL" veya boş
// isimli mahallere isim atanır.

import { state } from '../../../../general-files/main.js';
import { plumbingManager } from '../../../plumbing-manager.js';
import { getStairCorners } from '../../../../architectural-objects/stairs.js';

const NEEDS = (n) => {
    const s = String(n || '').trim().toUpperCase();
    return s === '' || s === 'MAHAL';
};

// Komponent kaynaklı zorunlu isimler — bu kümedeki bir isimle başlayan
// mahaller, kural değiştiyse otomatik yeniden adlandırılabilir.
// (örn. eski auto-name SAHANLIK demişse, sayaç taşındı, şimdi MUTFAK olabilir)
const COMPONENT_DRIVEN = new Set([
    'MAHAL', '', 'MUTFAK', 'SAHANLIK', 'AÇIK SAHANLIK',
]);
const CAN_OVERRIDE_FOR_COMPONENT = (n) =>
    COMPONENT_DRIVEN.has(String(n || '').trim().toUpperCase());

// Kalan (yapısal kural eşleşmemiş) mahaller için sıralı isim seti.
// Dönüşümlü atanır: ilk → YATAK ODASI, ikinci → OTURMA ODASI, üçüncü → ÇALIŞMA ODASI, ...
const FALLBACK_NAMES = [
    'YATAK ODASI',
    'OTURMA ODASI',
    'ÇALIŞMA ODASI',
    'YEMEK ODASI',
    'ÇOCUK ODASI',
];

const SEPARATOR_NAMES = new Set(['SAHANLIK', 'AÇIK SAHANLIK', 'BAHÇE']);

// ─── Geometri yardımcıları ────────────────────────────────────────────────

const TOL = 2; // cm — duvar-mahal eşleştirme toleransı

function roomAreaM2(room) {
    // geometry.js → room.area zaten m² cinsinden saklanır (areaInM2 = areaInCm2 / 10000)
    return Number(room.area) || 0;
}

function roomFloorId(room) {
    return room.floorId ?? null;
}

function roomWalls(room, walls) {
    const out = [];
    const coords = room.polygon?.geometry?.coordinates?.[0];
    if (!coords) return out;
    for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i];
        const [bx, by] = coords[i + 1];
        for (const w of walls) {
            if (!w.p1 || !w.p2) continue;
            const d1 = Math.hypot(w.p1.x - ax, w.p1.y - ay) + Math.hypot(w.p2.x - bx, w.p2.y - by);
            const d2 = Math.hypot(w.p1.x - bx, w.p1.y - by) + Math.hypot(w.p2.x - ax, w.p2.y - ay);
            if (Math.min(d1, d2) < TOL) { out.push(w); break; }
        }
    }
    return out;
}

function wallRooms(wall, rooms) {
    const out = [];
    for (const r of rooms) {
        const coords = r.polygon?.geometry?.coordinates?.[0];
        if (!coords) continue;
        for (let i = 0; i < coords.length - 1; i++) {
            const [ax, ay] = coords[i];
            const [bx, by] = coords[i + 1];
            const d1 = Math.hypot(wall.p1.x - ax, wall.p1.y - ay) + Math.hypot(wall.p2.x - bx, wall.p2.y - by);
            const d2 = Math.hypot(wall.p1.x - bx, wall.p1.y - by) + Math.hypot(wall.p2.x - ax, wall.p2.y - ay);
            if (Math.min(d1, d2) < TOL) { out.push(r); break; }
        }
    }
    return out;
}

function pointInRoom(pt, room) {
    if (!pt || !room?.polygon) return false;
    try {
        return turf.booleanPointInPolygon(turf.point([pt.x, pt.y]), room.polygon);
    } catch { return false; }
}

// Polygon ortalama (centroid) — basit aritmetik ortalama (uç düğüm yok).
function roomCentroid(r) {
    const coords = r?.polygon?.geometry?.coordinates?.[0];
    if (!Array.isArray(coords) || coords.length < 3) return null;
    let sx = 0, sy = 0, n = 0;
    // Son köşe genelde ilki ile aynıdır — onu atla.
    for (let i = 0; i < coords.length - 1; i++) {
        const c = coords[i];
        if (!c || c.length < 2) continue;
        sx += c[0]; sy += c[1]; n++;
    }
    if (n === 0) return null;
    return { x: sx / n, y: sy / n };
}

// ─── Bileşen-mahal indeksleri ─────────────────────────────────────────────

// Mahalin içinde belirli tipte tesisat bileşeni var mı?
function roomContainsType(room, comps, type) {
    return comps.some(c => c.type === type && pointInRoom({ x: c.x, y: c.y }, room));
}

// Cihaz tipi spesifik (OCAK vs KOMBI). 'cihaz' componentinde cihazTipi var.
function roomContainsCihazTipi(room, comps, cihazTipi) {
    return comps.some(c =>
        c.type === 'cihaz' &&
        c.cihazTipi === cihazTipi &&
        pointInRoom({ x: c.x, y: c.y }, room)
    );
}

// "Tesisat olan tarafı öncelikli" — YATAK ODASI vs OTURMA ODASI seçiminde
// kombi/şofben/soba veya cihaz vanası içeren oda öncelikli olarak
// OTURMA ODASI atanır. Bulunmazsa null.
const TESISAT_OTURMA_CIHAZ = new Set(['KOMBI', 'SOFBEN', 'SOBA']);
function pickOturmaByTesisat(rooms, comps) {
    for (const r of rooms) {
        const hasIsiTesisat = comps.some(c =>
            c.type === 'cihaz' &&
            TESISAT_OTURMA_CIHAZ.has(c.cihazTipi) &&
            pointInRoom({ x: c.x, y: c.y }, r)
        );
        if (hasIsiTesisat) return r;
    }
    return null;
}

// Birimin (daire) içinde herhangi bir tesisat cihazı (kombi/ocak/şofben/...)
// veya sayaç var mı?
function isUnitWithTesisat(unit, comps) {
    for (const r of unit) {
        for (const c of comps) {
            if (c.type !== 'cihaz' && c.type !== 'sayac') continue;
            if (pointInRoom({ x: c.x, y: c.y }, r)) return true;
        }
    }
    return false;
}

// Mahalin duvarları üzerindeki toplam kapı sayısı.
function roomDoorCount(room, walls, doors) {
    const rWalls = roomWalls(room, walls);
    if (!rWalls.length) return 0;
    let count = 0;
    for (const d of doors) {
        if (rWalls.some(w => doorOnWall(d, w))) count++;
    }
    return count;
}

// Mahalin dış ortama açılan kapısı var mı?
// Bir kapı "dış" sayılır: o duvarın diğer tarafında başka mahal yok.
function hasExteriorDoor(room, walls, doors, allRooms) {
    const rWalls = roomWalls(room, walls);
    for (const d of doors) {
        const matchingWall = rWalls.find(w => doorOnWall(d, w));
        if (!matchingWall) continue;
        const adj = wallRooms(matchingWall, allRooms);
        // Sadece bu mahal duvara sınır → dış kapı.
        if (adj.length <= 1) return true;
    }
    return false;
}

// Aynı kat içinde simetri / benzer birim için isim kopyala.
// En az 1 isimli odası olan birimleri şablon olarak kabul eder. Reflection
// (perpendicular bisector) ile hedef birimin odalarını şablon odalarına eşler.
function applySameFloorMirror(units, roomCentroidFn, setName) {
    const unitTotalArea = (u) => u.reduce((s, r) => s + (Number(r.area) || 0), 0);
    const unitNamedRatio = (u) => {
        if (!u.length) return 0;
        const NEEDS_LOCAL = (n) => {
            const s = String(n || '').trim().toUpperCase();
            return s === '' || s === 'MAHAL';
        };
        return u.filter(r => !NEEDS_LOCAL(r.name)).length / u.length;
    };
    const unitCentroid = (u) => {
        let sx = 0, sy = 0, n = 0;
        for (const r of u) {
            const c = roomCentroidFn(r);
            if (!c) continue;
            sx += c.x; sy += c.y; n++;
        }
        if (n === 0) return null;
        return { x: sx / n, y: sy / n };
    };
    const reflectAcrossAxis = (point, pA, pB) => {
        const dx = pB.x - pA.x, dy = pB.y - pA.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) return { ...point };
        const nx = dx / len, ny = dy / len;
        const midx = (pA.x + pB.x) / 2;
        const midy = (pA.y + pB.y) / 2;
        const vx = point.x - midx, vy = point.y - midy;
        const dot = vx * nx + vy * ny;
        return {
            x: point.x - 2 * dot * nx,
            y: point.y - 2 * dot * ny,
        };
    };

    const NEEDS_LOCAL = (n) => {
        const s = String(n || '').trim().toUpperCase();
        return s === '' || s === 'MAHAL';
    };
    // Şablon: en az 1 isimli oda içeren herhangi bir birim. Tercih: en yüksek
    // isimli oranı + benzer alan.
    const candidateTemplates = units.filter(u => u.some(r => !NEEDS_LOCAL(r.name)));
    for (const target of units) {
        if (!target.some(r => NEEDS_LOCAL(r.name))) continue;
        const tArea = unitTotalArea(target);
        const tCount = target.length;
        const tCentroid = unitCentroid(target);
        if (!tCentroid) continue;

        // En iyi şablonu seç: oda sayısı ±1, alan ±%40.
        let bestTemplate = null, bestScore = -Infinity;
        for (const tmpl of candidateTemplates) {
            if (tmpl === target) continue;
            if (Math.abs(tmpl.length - tCount) > 1) continue;
            const ta = unitTotalArea(tmpl);
            if (tArea <= 0 || ta <= 0) continue;
            const ratio = Math.abs(ta - tArea) / Math.max(ta, tArea);
            if (ratio > 0.40) continue;
            const score = unitNamedRatio(tmpl) - ratio;
            if (score > bestScore) { bestScore = score; bestTemplate = tmpl; }
        }
        if (!bestTemplate) continue;

        const sCentroid = unitCentroid(bestTemplate);
        if (!sCentroid) continue;

        // Hedef oda merkezini şablon merkezine yansıt → en yakın şablon odasını
        // bul → ismi kopyala.
        for (const tr of target) {
            if (!NEEDS_LOCAL(tr.name)) continue;
            const tc = roomCentroidFn(tr);
            if (!tc) continue;
            const reflected = reflectAcrossAxis(tc, tCentroid, sCentroid);
            let best = null, bestD = Infinity;
            for (const sr of bestTemplate) {
                const sc = roomCentroidFn(sr);
                if (!sc) continue;
                const d = Math.hypot(sc.x - reflected.x, sc.y - reflected.y);
                if (d < bestD) { bestD = d; best = sr; }
            }
            if (best && !NEEDS_LOCAL(best.name)) setName(tr, best.name);
        }
    }
}

function roomContainsStairs(room, stairs) {
    return stairs.some(s => {
        if (s.floorId != null && room.floorId != null && s.floorId !== room.floorId) return false;
        const c = s.center;
        if (c && pointInRoom({ x: c.x, y: c.y }, room)) return true;
        // Merkez polygon dışında kalmış olabilir — köşelerle de kontrol et.
        try {
            const corners = getStairCorners(s);
            return corners.some(k => pointInRoom(k, room));
        } catch { return false; }
    });
}

// Bir mahalin "balkon duvarı" var mı?
// Tanım: Mahale bitişik herhangi bir duvar wallType === 'balcony' ise.
// (wall-panel.js'de kullanıcı duvar tipini açıkça 'balcony' olarak işaretler;
// "diğer tarafında oda yok" tanımı her dış duvarı yanlışlıkla balkon yapıyordu.)
function hasBalkonWall(room, walls /*, allRooms */) {
    const rWalls = roomWalls(room, walls);
    return rWalls.some(w => w.wallType === 'balcony');
}

// Mahalin kapıdan ulaştığı (kendisi hariç) farklı mahal sayısı
function roomDoorNeighborCount(room, doorGraph) {
    return (doorGraph.get(room) || new Set()).size;
}

// Mahalin duvar komşuluğu olan mahal sayısı (kapı olsun olmasın)
function roomWallNeighborCount(room, walls, rooms) {
    const rWalls = roomWalls(room, walls);
    const set = new Set();
    for (const w of rWalls) {
        const adj = wallRooms(w, rooms).filter(r => r !== room);
        adj.forEach(r => set.add(r));
    }
    return set.size;
}

// Bir kapı geometrik olarak verilen duvarda mı? Referans eşitliği başarısızsa
// (örn. duvar yeniden oluşturulmuş, door.wall stale) → uç noktaları TOL içinde
// karşılaştırarak match eder.
function doorOnWall(door, wall) {
    if (!door?.wall || !wall?.p1 || !wall?.p2) return false;
    if (door.wall === wall) return true;
    const a1 = door.wall.p1, a2 = door.wall.p2;
    if (!a1 || !a2) return false;
    const d1 = Math.hypot(a1.x - wall.p1.x, a1.y - wall.p1.y) +
               Math.hypot(a2.x - wall.p2.x, a2.y - wall.p2.y);
    const d2 = Math.hypot(a1.x - wall.p2.x, a1.y - wall.p2.y) +
               Math.hypot(a2.x - wall.p1.x, a2.y - wall.p1.y);
    return Math.min(d1, d2) < TOL;
}

// İki mahal arasında kapı var mı?
function hasDoorBetween(a, b, walls, doors) {
    const aWalls = new Set(roomWalls(a, walls));
    for (const w of aWalls) {
        if (!doors.some(d => doorOnWall(d, w))) continue;
        const adj = wallRooms(w, [a, b]);
        if (adj.includes(a) && adj.includes(b)) return true;
    }
    return false;
}

// Kapı bazlı mahal-mahal komşuluk grafiği. Her kapı, kendi duvarına bitişik
// 2 odayı birbirine bağlar. BFS bu grafi kullanır — referans / segment / split
// sorunlarına karşı dayanıklı.
function buildRoomDoorGraph(rooms, walls, doors) {
    const adj = new Map();
    rooms.forEach(r => adj.set(r, new Set()));
    for (const door of doors) {
        const matchingWall = walls.find(w => doorOnWall(door, w));
        if (!matchingWall) continue;
        const adjRooms = wallRooms(matchingWall, rooms);
        for (let i = 0; i < adjRooms.length; i++) {
            for (let j = i + 1; j < adjRooms.length; j++) {
                adj.get(adjRooms[i]).add(adjRooms[j]);
                adj.get(adjRooms[j]).add(adjRooms[i]);
            }
        }
    }
    return adj;
}

// İki mahal "komşu" mu (ortak duvar var mı)?
function areAdjacent(a, b, walls) {
    const aWalls = new Set(roomWalls(a, walls));
    for (const w of aWalls) {
        if (!w?.p1 || !w?.p2) continue;
        const adj = wallRooms(w, [a, b]);
        if (adj.includes(a) && adj.includes(b)) return true;
    }
    return false;
}

// ─── Birim grupları (kapılarla bağlanan, separator'lar dışında) ──────────

function buildUnits(rooms, separators, doorGraph) {
    const sepSet = new Set(separators);
    const visited = new Set();
    const units = [];
    for (const start of rooms) {
        if (sepSet.has(start) || visited.has(start)) continue;
        const group = [];
        const queue = [start];
        visited.add(start);
        while (queue.length) {
            const cur = queue.shift();
            group.push(cur);
            for (const n of (doorGraph.get(cur) || [])) {
                if (visited.has(n) || sepSet.has(n)) continue;
                visited.add(n);
                queue.push(n);
            }
        }
        if (group.length) units.push(group);
    }
    return units;
}

// ─── Phase 1 ön-geçişi: tüm katlarda komponent türetilmiş isimleri set et ──
// Bu sayede nameFloor(F) çağrısı, sıradan diğer katların komponent kaynaklı
// isimlerini (MUTFAK / SAHANLIK / AÇIK SAHANLIK) referans olarak kullanabilir.
// Idempotent: aynı çağrılarda tekrar set olur ama herhangi bir yan etki yok.
function applyComponentNamesForFloor(targetFid) {
    const matchRoom = (r) => (r?.floorId ?? null) === targetFid;
    const matchOrLegacy = (obj) => {
        const fid = obj?.floorId ?? null;
        return fid === null || fid === targetFid;
    };
    const rooms  = (state.rooms || []).filter(matchRoom);
    if (!rooms.length) return;
    const walls  = (state.walls || []).filter(matchOrLegacy);
    const stairs = (state.stairs || []).filter(matchOrLegacy);
    const comps  = (plumbingManager?.components || []).filter(matchOrLegacy);

    const setForComp = (r, n) => {
        if (!CAN_OVERRIDE_FOR_COMPONENT(r.name)) return;
        if (r.name === n) return;
        r.name = n;
    };

    for (const r of rooms) {
        const hasOcak  = roomContainsCihazTipi(r, comps, 'OCAK');
        const hasSayac = roomContainsType(r, comps, 'sayac');
        const hasStair = roomContainsStairs(r, stairs);
        if (hasOcak)  { setForComp(r, 'MUTFAK'); continue; }
        if (hasSayac) {
            if (hasBalkonWall(r, walls, rooms)) setForComp(r, 'AÇIK SAHANLIK');
            else                                 setForComp(r, 'SAHANLIK');
            continue;
        }
        if (hasStair) { setForComp(r, 'SAHANLIK'); continue; }
    }
}

// ─── Tek bir kata isim atama ──────────────────────────────────────────────

export function nameFloor(floorId) {
    // Ön-geçiş: tüm katlarda komponent kaynaklı isimleri set et.
    // Böylece cross-floor pattern (Phase 1.5) hangi sırada çalışırsa çalışsın
    // diğer katlarda MUTFAK/SAHANLIK referansını bulur.
    const allFids = new Set((state.rooms || []).map(r => r.floorId ?? null));
    for (const fid of allFids) applyComponentNamesForFloor(fid);
    // Rooms: KESİN floor eşleşmesi (yanlış katta isim değiştirmemek için).
    // Walls/doors/stairs/comps: floor eşleşmesi VEYA floorId hiç set edilmemiş
    // (legacy/paylaşımlı objeler) → coğrafyaya göre roomWalls onları zaten odanın
    // çevresine eşler; başka kata bulaşma riski geometrik filtreyle sıfırdır.
    const targetFid = floorId ?? null;
    const matchRoom = (r) => (r?.floorId ?? null) === targetFid;
    const matchOrLegacy = (obj) => {
        const fid = obj?.floorId ?? null;
        return fid === null || fid === targetFid;
    };
    const rooms  = (state.rooms || []).filter(matchRoom);
    const walls  = (state.walls || []).filter(matchOrLegacy);
    const doors  = (state.doors || []).filter(matchOrLegacy);
    const stairs = (state.stairs || []).filter(matchOrLegacy);
    const comps  = (plumbingManager?.components || []).filter(matchOrLegacy);

    if (!rooms.length) return 0;

    let changed = 0;
    // Sadece eksik (MAHAL/boş) mahallere atama yapar — kullanıcı isimlerini ezmez.
    const setName = (r, n) => {
        if (!NEEDS(r.name)) return false;
        if (r.name === n) return false;
        r.name = n;
        changed++;
        return true;
    };
    // Komponent kaynaklı kurallar için: önceki auto-name ismini de ezebilir.
    // (örn. eski tur MAHAL → SAHANLIK demiş, sayaç taşınmış; tekrar değerlendir.)
    const setNameForComponent = (r, n) => {
        if (!CAN_OVERRIDE_FOR_COMPONENT(r.name)) return false;
        if (r.name === n) return false;
        r.name = n;
        changed++;
        return true;
    };

    // ── Faz 1 — Komponent kaynaklı atamalar (kullanıcı dışı isimleri ezer) ──
    for (const r of rooms) {
        const hasOcak  = roomContainsCihazTipi(r, comps, 'OCAK');
        const hasSayac = roomContainsType(r, comps, 'sayac');
        const hasStair = roomContainsStairs(r, stairs);
        if (hasOcak) { setNameForComponent(r, 'MUTFAK'); continue; }
        if (hasSayac) {
            if (hasBalkonWall(r, walls, rooms)) setNameForComponent(r, 'AÇIK SAHANLIK');
            else                                 setNameForComponent(r, 'SAHANLIK');
            continue;
        }
        if (hasStair) { setNameForComponent(r, 'SAHANLIK'); continue; }
    }

    // Sahanlık (separator) listesi — Faz 1 sonrası tekrar hesaplanır
    const separators = rooms.filter(r => SEPARATOR_NAMES.has(String(r.name || '').toUpperCase().trim()));

    // ── Kapı-oda komşuluk grafiği (Faz 2-3 için kullanılır) ──
    const doorGraph = buildRoomDoorGraph(rooms, walls, doors);

    // ── Faz 2 — Birimlere böl ──
    const units = buildUnits(rooms, separators, doorGraph);

    // ── Faz 2.5 — Aynı kat simetri (erken pas) ──
    // Phase 1/1.5'ten gelen kısmî isimlerle (MUTFAK/SAHANLIK) bir başlangıç
    // simetri kopyası dene. Phase 3a'dan sonra tekrar çalıştırılır.
    applySameFloorMirror(units, roomCentroid, setName);

    // ── Faz 3 — Birim içi atamalar ──
    // Restructure: önce TESİSAT olan dairelerin tamamı isimlendirilir.
    // Sonra Phase 2.5 simetrik daireleri kopyalar. En sonda kalan daireler
    // için kurallar tekrar çalışır.

    // Bir birimi mevcut kurallarla isimlendiren yerel fonksiyon.
    const nameUnitRules = (unit) => {
        const unitSet = new Set(unit);

        // ── ANTRE adayları ──
        // Mevcutta ANTRE varsa onu kullan
        let antre = unit.find(r => String(r.name || '').toUpperCase().trim() === 'ANTRE') || null;

        if (!antre) {
            // Atanmamış adaylar arasından seç (kullanıcı atamasını ezme)
            const candidates = unit.filter(r => NEEDS(r.name));

            // Aday 1: Sahanlıktan kapı açılan birim içi mahaller
            const fromSahanlik = candidates.filter(r => {
                const rWalls = roomWalls(r, walls);
                return rWalls.some(w => {
                    if (!doors.some(d => d.wall === w)) return false;
                    const adj = wallRooms(w, [...separators, r]);
                    return adj.some(x => separators.includes(x)) && adj.includes(r);
                });
            });

            // Aday 2: Mutfaktan kapı açılan + duvar komşuluğu 3'ten fazla
            const mutfaks = unit.filter(r => String(r.name || '').toUpperCase().trim() === 'MUTFAK');
            const fromMutfak = candidates.filter(r => {
                const wallNeighbors = roomWallNeighborCount(r, walls, rooms);
                if (wallNeighbors <= 3) return false;
                return mutfaks.some(m => hasDoorBetween(m, r, walls, doors));
            });

            // Aday 3: Birim içi mahallerin "ortasında" — en fazla odaya kapı açan
            // (kapı komşu sayısı en yüksek olan; ≥ 2 değişik mahale açılıyorsa aday)
            const unitSet2 = new Set(unit);
            const candidatesWithDoorCount = candidates.map(r => ({
                room: r,
                neighbors: [...(doorGraph.get(r) || [])].filter(x => unitSet2.has(x)).length,
            }));
            candidatesWithDoorCount.sort((a, b) => b.neighbors - a.neighbors);
            const middleRoom = candidatesWithDoorCount[0]?.neighbors >= 2
                ? candidatesWithDoorCount[0].room
                : null;

            antre = fromSahanlik[0] || fromMutfak[0] || middleRoom || null;
            if (antre) setName(antre, 'ANTRE');
        }

        // Kural sırası (kullanıcının revize spec'i):
        //  A. SALON  — geriye kalan en büyük (ANTRE varsa)
        //  B. WC     — antreye komşu + alan < 3 m² + max 1 kapı (birden fazla)
        //  C. BANYO  — WC yoksa, antreye komşu en küçük + max 1 kapı
        //  D. BALKON — antreye komşu OLMAYAN + alan < 5 m² (AÇIK/KAPALI)
        //  E. HOL    — min 3 kapı + dış kapı yok
        //  F. YATAK/MUTFAK/OTURMA — alan sırasına göre:
        //     • Tesisat varsa: 1=YATAK, 2=OTURMA (kombi → OTURMA önceliği)
        //     • Tesisat yoksa: 1=YATAK, 2=MUTFAK, 3=OTURMA
        //  G. Kalanlar — >5 m² OTURMA ODASI, ≤5 m² HOL

        const antreNeighbors = antre
            ? unit.filter(r => r !== antre && areAdjacent(antre, r, walls))
            : [];
        const hasName = (target) =>
            unit.some(r => String(r.name || '').toUpperCase().trim() === target);

        // A. SALON
        if (antre && !hasName('SALON')) {
            const rem = unit.filter(r => NEEDS(r.name)).sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
            if (rem.length) setName(rem[0], 'SALON');
        }

        // B. WC — antreye komşu + alan < 3 m² + max 1 kapı (birden fazla)
        let wcAssigned = false;
        for (const r of antreNeighbors) {
            if (!NEEDS(r.name)) continue;
            if (roomAreaM2(r) >= 3) continue;
            if (roomDoorCount(r, walls, doors) > 1) continue;
            setName(r, 'WC');
            wcAssigned = true;
        }

        // C. BANYO — WC yoksa, antreye komşu en küçük + max 1 kapı
        if (antre && !wcAssigned && !hasName('BANYO')) {
            const cand = antreNeighbors
                .filter(r => NEEDS(r.name))
                .filter(r => roomDoorCount(r, walls, doors) <= 1)
                .sort((a, b) => roomAreaM2(a) - roomAreaM2(b));
            if (cand[0]) setName(cand[0], 'BANYO');
        }

        // D. BALKON — antreye komşu OLMAYAN + alan < 5 m²
        for (const r of unit) {
            if (!NEEDS(r.name)) continue;
            if (antre && areAdjacent(antre, r, walls)) continue;
            if (roomAreaM2(r) >= 5) continue;
            if (hasBalkonWall(r, walls)) setName(r, 'AÇIK BALKON');
            else                          setName(r, 'KAPALI BALKON');
        }

        // E. HOL — min 3 kapı + dış kapı yok (ANTRE değil)
        for (const r of unit) {
            if (!NEEDS(r.name)) continue;
            if (r === antre) continue;
            if (roomDoorCount(r, walls, doors) < 3) continue;
            if (hasExteriorDoor(r, walls, doors, rooms)) continue;
            setName(r, 'HOL');
        }

        // F. YATAK / MUTFAK / OTURMA — alan sırasına göre
        const tesisatVar = isUnitWithTesisat(unit, comps);
        const candidatePool = (antre && antreNeighbors.length)
            ? antreNeighbors.filter(r => NEEDS(r.name))
            : unit.filter(r => NEEDS(r.name));
        const ranked = candidatePool.sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
        if (tesisatVar) {
            // Tesisat varsa: top 2 — kombi → OTURMA önceliği
            const top2 = ranked.slice(0, 2);
            if (top2.length) {
                const oturmaPick = pickOturmaByTesisat(top2, comps);
                if (oturmaPick) {
                    setName(oturmaPick, 'OTURMA ODASI');
                    const other = top2.find(r => r !== oturmaPick);
                    if (other) setName(other, 'YATAK ODASI');
                } else {
                    setName(top2[0], 'YATAK ODASI');
                    if (top2[1]) setName(top2[1], 'OTURMA ODASI');
                }
            }
        } else {
            // Tesisat yoksa: 1=YATAK, 2=MUTFAK, 3=OTURMA
            if (ranked[0]) setName(ranked[0], 'YATAK ODASI');
            if (ranked[1] && !hasName('MUTFAK')) setName(ranked[1], 'MUTFAK');
            else if (ranked[1]) setName(ranked[1], 'OTURMA ODASI');
            if (ranked[2] && !hasName('OTURMA ODASI')) setName(ranked[2], 'OTURMA ODASI');
        }

        // G. Kalanlar — >5 m² OTURMA ODASI, ≤5 m² HOL
        for (const r of unit) {
            if (!NEEDS(r.name)) continue;
            if (roomAreaM2(r) > 5) setName(r, 'OTURMA ODASI');
            else                    setName(r, 'HOL');
        }
    };

    // ── Faz 3a — TESİSAT olan birimleri tam isimlendir ──
    const tesisatUnits = units.filter(u => isUnitWithTesisat(u, comps));
    const otherUnits   = units.filter(u => !isUnitWithTesisat(u, comps));
    for (const unit of tesisatUnits) nameUnitRules(unit);

    // ── Faz 3b — Aynı kat simetrisi tetikleyici ──
    // Phase 2.5 zaten yukarıda Phase 3'ten önce çalıştı; ancak o sırada
    // tesisat birimi henüz tam isimlendirilmemiş olabilirdi. TESİSAT birimi
    // şimdi tam isimli olduğu için diğer birimleri yeniden eşle.
    if (otherUnits.length && tesisatUnits.length) {
        applySameFloorMirror(units, roomCentroid, setName);
    }

    // ── Faz 3c — Kalan birimleri kurallarla isimlendir ──
    for (const unit of otherUnits) nameUnitRules(unit);

    // ── Faz 4a — Cross-floor pattern: başka katlardaki aynı pozisyondaki ──
    // Bu kat içindeki isimsiz odalar için diğer katlardaki aynı pozisyondaki
    // isimleri kopyala (kullanıcı veya başka kat auto-name çıktısı).
    {
        const POSITION_TOL_CM = 100;
        const AREA_TOL_RATIO  = 0.30;
        const otherFloorNamed = (state.rooms || []).filter(o =>
            (o.floorId ?? null) !== targetFid &&
            !NEEDS(o.name)
        );
        if (otherFloorNamed.length) {
            for (const r of rooms) {
                if (!NEEDS(r.name)) continue;
                const c = roomCentroid(r);
                if (!c) continue;
                const ra = roomAreaM2(r);
                let best = null, bestD = Infinity;
                for (const o of otherFloorNamed) {
                    const oc = roomCentroid(o);
                    if (!oc) continue;
                    const d = Math.hypot(oc.x - c.x, oc.y - c.y);
                    if (d > POSITION_TOL_CM) continue;
                    const oa = roomAreaM2(o);
                    if (ra > 0 && oa > 0) {
                        const ratio = Math.abs(oa - ra) / Math.max(oa, ra);
                        if (ratio > AREA_TOL_RATIO) continue;
                    }
                    if (d < bestD) { bestD = d; best = o; }
                }
                if (best) setName(r, best.name);
            }
        }
    }

    // ── Faz 4 — Güvenlik ağı ──
    // Hiçbir birime girmemiş (çevresinde kapı yok, separator değil) mahaller.
    let gi = 0;
    for (const r of rooms) {
        if (!NEEDS(r.name)) continue;
        setName(r, FALLBACK_NAMES[gi % FALLBACK_NAMES.length]);
        gi++;
    }

    return changed;
}

/**
 * Tüm katlardaki mahal isimlerini atar. Mevcut isimler (≠ 'MAHAL') korunur.
 * @returns {number} İsim ataması yapılan toplam mahal sayısı
 */
export function autoNameAllFloors() {
    const floors = new Set();
    (state.rooms || []).forEach(r => floors.add(r.floorId ?? null));
    let total = 0;
    for (const fid of floors) total += nameFloor(fid);
    return total;
}

/**
 * Adı eksik (boş veya "MAHAL") mahalleri kat bazında sayar.
 * @returns {Array<{ floorId: string|null, floorName: string, count: number, rooms: object[] }>}
 */
export function countUnnamedByFloor() {
    const map = new Map();
    (state.rooms || []).forEach(r => {
        if (!NEEDS(r.name)) return;
        const fid = r.floorId ?? null;
        if (!map.has(fid)) map.set(fid, []);
        map.get(fid).push(r);
    });
    const floors = state.floors || [];
    const orderIndex = (fid) => {
        const i = floors.findIndex(x => x.id === fid);
        return i === -1 ? 9999 : i;
    };
    const out = [];
    for (const [fid, rooms] of map.entries()) {
        const f = floors.find(x => x.id === fid);
        out.push({
            floorId: fid,
            floorName: f?.name || (fid ?? 'Kat'),
            count: rooms.length,
            rooms,
        });
    }
    // Floor panel sırasına göre sırala (alt kat → üst kat)
    out.sort((a, b) => orderIndex(a.floorId) - orderIndex(b.floorId));
    return out;
}
