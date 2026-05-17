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

// ─── Tek bir kata isim atama ──────────────────────────────────────────────

export function nameFloor(floorId) {
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

    // ── Faz 3 — Birim içi atamalar ──
    for (const unit of units) {
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

        // Kural sırası (kullanıcının güncel spec'i):
        //  1. SALON      — geriye kalan en büyük (sadece ANTRE varsa)
        //  2. WC         — antreye komşu + alan < 3 m²  (birden fazla)
        //  3. BANYO (erken) — WC YOKSA, antreye komşu en küçük alanlı kalan
        //                  (WC varsa bu adım atlanır)
        //  4. BALKON     — antreye komşu OLMAYAN + alan < 5 m² (birden fazla)
        //  5. İlk 2 antreye komşu (büyükten küçüğe): YATAK ODASI, OTURMA ODASI
        //  6. BANYO (geç) — antreye komşu en küçük alanlı kalan
        //                  (yukarıda BANYO atandıysa atlanır)
        //  7. Kalan antre komşuları: dönüşümlü YATAK ODASI / OTURMA ODASI

        const antreNeighbors = antre
            ? unit.filter(r => r !== antre && areAdjacent(antre, r, walls))
            : [];
        const hasName = (target) =>
            unit.some(r => String(r.name || '').toUpperCase().trim() === target);

        // 1. SALON
        if (antre && !hasName('SALON')) {
            const rem = unit.filter(r => NEEDS(r.name)).sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
            if (rem.length) setName(rem[0], 'SALON');
        }

        // 2. WC (birden fazla)
        let wcAssigned = false;
        for (const r of antreNeighbors) {
            if (!NEEDS(r.name)) continue;
            if (roomAreaM2(r) < 3) { setName(r, 'WC'); wcAssigned = true; }
        }

        // 3. BANYO — sadece WC atanmadıysa
        if (antre && !wcAssigned && !hasName('BANYO')) {
            const cand = antreNeighbors
                .filter(r => NEEDS(r.name))
                .sort((a, b) => roomAreaM2(a) - roomAreaM2(b));
            if (cand[0]) setName(cand[0], 'BANYO');
        }

        // 4. BALKON (birden fazla)
        for (const r of unit) {
            if (!NEEDS(r.name)) continue;
            if (antre && areAdjacent(antre, r, walls)) continue;
            if (roomAreaM2(r) >= 5) continue;
            if (hasBalkonWall(r, walls)) setName(r, 'AÇIK BALKON');
            else                          setName(r, 'KAPALI BALKON');
        }

        // 5. İlk 2 antre komşusu (büyükten küçüğe): YATAK ODASI, OTURMA ODASI
        if (antre) {
            const top2 = antreNeighbors
                .filter(r => NEEDS(r.name))
                .sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
            if (top2[0]) setName(top2[0], 'YATAK ODASI');
            if (top2[1]) setName(top2[1], 'OTURMA ODASI');
        }

        // 6. BANYO (geç) — antreye komşu en küçük kalan (üstte atanmadıysa)
        if (antre && !hasName('BANYO')) {
            const cand = antreNeighbors
                .filter(r => NEEDS(r.name))
                .sort((a, b) => roomAreaM2(a) - roomAreaM2(b));
            if (cand[0]) setName(cand[0], 'BANYO');
        }

        // 7. Kalan antre komşuları: dönüşümlü YATAK ODASI / OTURMA ODASI
        if (antre) {
            const leftovers = antreNeighbors
                .filter(r => NEEDS(r.name))
                .sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
            let toggle = 0;
            for (const r of leftovers) {
                setName(r, toggle === 0 ? 'YATAK ODASI' : 'OTURMA ODASI');
                toggle = 1 - toggle;
            }
        }

        // Birim içi diğer kalanlar (antreye komşu değil, balkon değil, > 5 m²)
        // → sıralı fallback isim listesi
        const farLeftovers = unit
            .filter(r => NEEDS(r.name))
            .sort((a, b) => roomAreaM2(b) - roomAreaM2(a));
        let fi = 0;
        for (const r of farLeftovers) {
            setName(r, FALLBACK_NAMES[fi % FALLBACK_NAMES.length]);
            fi++;
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
