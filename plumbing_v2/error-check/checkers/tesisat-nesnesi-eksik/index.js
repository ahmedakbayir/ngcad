// tesisat-nesnesi-eksik / index.js
// "Tesisat nesnesi eksik" grubu — kolonda topraklama çubuğu ve muhafaza.
//
// Kurallar:
//   1. Md:5.1.20 — Servis kutusu sonrası ilk kolon parçasında Topraklama
//      çubuğu bulunmalı (ilk vana veya ilk dallanmadan önce).
//   2. Md:5.1.9  — Atmosfere açık ortamdaki AKV ve diğer ekipmanlar
//      (vana, sayaç, cihaz, regülatör, manometre) muhafazalı olmalı.
//      "Atmosfere açık": hiçbir mahalin içinde değil (dış ortam) veya
//      içinde bulunduğu mahalin balkon duvarı var.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { ensureTopraklama, ensureMuhafaza } from './fix.js';
import {
    hatNoForComp, hatNoForPipe, floorNameById,
    vanaHatLabel, sayacHatLabel, cihazHatLabel, hatPrefix,
} from '../../checker-utils.js';
import { state } from '../../../../general-files/main.js';

// ─── Yardımcılar ──────────────────────────────────────────────────────────
function buildChildrenMap(pipes) {
    const ch = new Map();
    pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!ch.has(bag.hedefId)) ch.set(bag.hedefId, []);
            ch.get(bag.hedefId).push(p.id);
        }
    });
    return ch;
}

function hasValveOnPipe(manager, pipeId) {
    return (manager.components || []).some(c =>
        c.type === 'vana' && c.bagliBoruId === pipeId
    );
}

// Servis kutusundan başlayıp ilk vana veya ilk dallanmaya kadar olan
// pipe id'lerini toplar. İlk parçayı bu küme temsil eder.
function firstSegmentPipeIds(manager, rootPipe, childrenOf) {
    const ids = new Set();
    if (!rootPipe) return ids;
    let cursor = rootPipe;
    const visited = new Set();
    while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        ids.add(cursor.id);
        // Bu boruda vana varsa "ilk parça" buraya kadardır.
        if (hasValveOnPipe(manager, cursor.id)) break;
        const children = (childrenOf.get(cursor.id) || []);
        if (children.length !== 1) break; // ayrım veya uç
        const nextPipe = manager.pipes.find(p => p.id === children[0]);
        if (!nextPipe) break;
        // Sonraki boruda regülatör de bir "kesişim" sayılır → dur.
        // (Şu an basit tutuyoruz; ilerleyen kuralarda revize edilebilir.)
        cursor = nextPipe;
    }
    return ids;
}

// ─── Kurallar ─────────────────────────────────────────────────────────────

function topraklamaKurali(manager, out) {
    const boxes = (manager.components || []).filter(c => c.type === 'servis_kutusu');
    if (!boxes.length) return;
    const childrenOf = buildChildrenMap(manager.pipes);

    boxes.forEach(box => {
        // Servis kutusundan başlayan kök boru(lar)
        const roots = manager.pipes.filter(p =>
            p.baslangicBaglanti?.tip === 'servis_kutusu' &&
            p.baslangicBaglanti.hedefId === box.id
        );
        if (!roots.length) return;

        // Birden fazla kök varsa her birini ayrı zincir olarak ele almak yerine
        // tek "ilk parça" hesabı için ilk kök yeterli; geri kalan kolonlar
        // ileride farklı projelerde nadiren rastlanır.
        const firstRoot = roots[0];
        const segment = firstSegmentPipeIds(manager, firstRoot, childrenOf);
        if (!segment.size) return;

        // İlk parça borularından birinde topraklama var mı?
        const hasTop = (manager.components || []).some(c =>
            c.type === 'topraklama' && segment.has(c.bagliBoruId)
        );
        if (hasTop) return;

        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `topraklama-${box.id}`,
            message: 'Kolonda topraklama çubuğu gerekmektedir.',
            floorName: floorNameById(box.floorId),
            source:  'TS7363 Md:5.1.20',
            detail:  'Topraklama en az 16 mm çapında ve 1,5 m uzunlukta som bakır çubuk elektrotlar, en az 20 mm çapında ve 1,25 m uzunluğunda som bakır çubuk elektrotlar veya 0,5 m² ve 2 mm kalınlığında bakır levha ile yapılmalıdır.',
            targets: [{ type: 'pipe', id: firstRoot.id }],
            fix: {
                description: 'AKV\'nin 50 cm altına (yükselen kolona) topraklama eklenecek',
                apply: () => ensureTopraklama(manager, box.id),
            },
        });
    });
}

// ─── Atmosfere açıklık tespiti ────────────────────────────────────────────
// "Atmosfere açık" = bileşen hiçbir mahalin içinde değil (dış ortam) VEYA
// içinde olduğu mahalin duvarlarından en az biri 'balcony' (balkon duvarı).

const _WALL_TOL_CM = 2;

function _roomWalls(room, walls) {
    const out = [];
    const coords = room?.polygon?.geometry?.coordinates?.[0];
    if (!coords) return out;
    for (let i = 0; i < coords.length - 1; i++) {
        const [ax, ay] = coords[i];
        const [bx, by] = coords[i + 1];
        for (const w of walls) {
            if (!w?.p1 || !w?.p2) continue;
            const d1 = Math.hypot(w.p1.x - ax, w.p1.y - ay) + Math.hypot(w.p2.x - bx, w.p2.y - by);
            const d2 = Math.hypot(w.p1.x - bx, w.p1.y - by) + Math.hypot(w.p2.x - ax, w.p2.y - ay);
            if (Math.min(d1, d2) < _WALL_TOL_CM) { out.push(w); break; }
        }
    }
    return out;
}

function _pointInRoom(pt, room) {
    if (!pt || !room?.polygon || typeof turf === 'undefined') return false;
    try { return turf.booleanPointInPolygon(turf.point([pt.x, pt.y]), room.polygon); }
    catch { return false; }
}

function isComponentAtmosphereOpen(comp) {
    if (typeof comp?.x !== 'number') return false;
    const cFid = comp.floorId ?? null;
    const sameFloor = (o) => {
        const f = o?.floorId ?? null;
        return f === null || cFid === null || f === cFid;
    };
    const rooms = (state.rooms || []).filter(sameFloor);
    const containing = rooms.find(r => _pointInRoom({ x: comp.x, y: comp.y }, r));
    if (!containing) return true; // dış ortam
    const walls = (state.walls || []).filter(sameFloor);
    return _roomWalls(containing, walls).some(w => w.wallType === 'balcony');
}

// ─── Muhafaza Kuralları ───────────────────────────────────────────────────
// Atmosfere açık olan vana/sayaç/cihaz/regülatör/manometre muhafazalı olmalı.

// Emniyet vanası sayaç öncesi kolonda olduğu için hatMap'ten çıkarılabilir;
// bu durumda downstream sayacın çıkış borusunun hat numarasını kullanırız.
function _hatNoForEmniyetVana(manager, vana) {
    const direct = hatNoForComp(manager, vana);
    if (direct != null) return direct;
    if (!vana?.bagliBoruId || !manager?.pipes) return null;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    for (const s of (manager.components || [])) {
        if (s.type !== 'sayac') continue;
        let cursor = s.fleksBaglanti?.boruId;
        const seen = new Set();
        while (cursor && !seen.has(cursor)) {
            seen.add(cursor);
            if (cursor === vana.bagliBoruId) {
                return s.cikisBagliBoruId ? hatNoForPipe(manager, s.cikisBagliBoruId) : null;
            }
            const p = pipeMap.get(cursor);
            const par = p?.baslangicBaglanti;
            if (par?.tip === 'boru' && par.hedefId) cursor = par.hedefId;
            else break;
        }
    }
    return null;
}

function _muhafazaLabelFor(manager, c) {
    if (c.type === 'vana') {
        if (c.vanaTipi === 'AKV') {
            const hatNo = hatNoForComp(manager, c);
            return hatNo != null ? `${hatNo} nolu hattaki AKV` : 'AKV';
        }
        if (c.vanaTipi === 'EMNIYET') {
            const hatNo = _hatNoForEmniyetVana(manager, c);
            return hatNo != null ? `${hatNo} nolu hattaki Emn.V` : 'Emn.V';
        }
        return vanaHatLabel(manager, c);
    }
    if (c.type === 'sayac') return sayacHatLabel(manager, c);
    if (c.type === 'cihaz') return cihazHatLabel(manager, c);
    if (c.type === 'regulator') {
        const hatNo = hatNoForComp(manager, c);
        const pre = hatPrefix(hatNo);
        return pre ? `${pre} Regülatör` : 'Regülatör';
    }
    if (c.type === 'manometre') {
        const hatNo = hatNoForComp(manager, c);
        const pre = hatPrefix(hatNo);
        return pre ? `${pre} Manometre` : 'Manometre';
    }
    return 'Ekipman';
}

function muhafazaKurali(manager, out) {
    const TIPS = new Set(['vana', 'sayac', 'cihaz', 'regulator', 'manometre']);
    (manager.components || []).forEach(c => {
        if (!TIPS.has(c.type)) return;
        if (c.muhafaza === true) return;
        if (!isComponentAtmosphereOpen(c)) return;
        const label = _muhafazaLabelFor(manager, c);
        out.push({
            group:   ERROR_GROUP_IDS.MUHAFAZA,
            errorId: `muhafaza-${c.id}`,
            message: `${label} muhafazalı olmalıdır`,
            floorName: floorNameById(c.floorId),
            source:  'TS7363 Md:5.1.9',
            detail:  'Atmosfere açık ortamdaki (dış ortam veya balkon duvarı bulunan mahaldeki) ekipmanlar havalandırılmış bir muhafaza içine alınmalıdır.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'Ekipman için muhafaza işaretlenecek',
                apply: () => ensureMuhafaza(manager, c.id),
            },
        });
    });
}

// ─── Toplu checker ────────────────────────────────────────────────────────
function tesisatNesnesiEksikChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    topraklamaKurali(manager, out);
    muhafazaKurali(manager, out);
    return out;
}

errorCheckManager.register('tesisat-nesnesi-eksik', tesisatNesnesiEksikChecker);
