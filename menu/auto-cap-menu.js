// auto-cap-menu.js
// "Hesap ► Otomatik Çap Belirle" — boru çaplarını projedeki Q debilerine göre
// otomatik olarak belirler ve iteratif olarak kritik kayıp / hız limitlerine
// göre rafine eder.
//
// İki mod:
//   • SİNEĞİN YAĞINI ÇIKAR (AGGRESSIVE) → kritik yol oranı %90–%99 arası
//   • ABARTMADAN          (CONSERVATIVE) → kritik yol oranı %50–%75 arası
//
// Kurallar:
//   • Q (m³/h) → varsayılan DN (TS 7363 Çizelge 1):
//       0–2 → DN15, 2–3 → DN20, 3–6 → DN25, 6–12 → DN32, 12–18 → DN40,
//       18–25 → DN50, 25–32 → DN65, 32–40 → DN80, 40–50 → DN100,
//       (>50 için DN125, DN150, ... şeklinde uzatıldı; hız iterasyonu düzeltir)
//   • KOLON hatlarında DN < DN25 olamaz.
//   • Akış yönünde çap artmaz (child DN ≤ parent DN).
//   • Her iterasyonda bir hattın çapı bir basamak değişir.
//   • Yeni çaplarda V ≤ 6 m/s ve kritik kayıp limiti aşılmaz.
//
// Esnek tesisat (ESNEK) hatları yalnızca DN15–DN32 aralığında kalır.

import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { computeFittings } from './fittings-menu.js';
import { draw2D } from '../draw/draw2d.js';
import { recomputeAllPressures } from '../plumbing_v2/utils/pressure-recompute.js';
import {
    buildHatData,
    cascadeHats,
    enumeratePaths,
    annotatePaths,
    PATH_LIMITS,
    pathLimitForKolon,
    DN_LIST,
    ESNEK_DN_LIST,
} from './boru-cap-menu.js';

const DN_INDEX = Object.fromEntries(DN_LIST.map((dn, i) => [dn, i]));
const KOLON_MIN_IDX_LOW  = DN_INDEX['DN25']; // 21/50 mbar kolonlar için
const KOLON_MIN_IDX_HIGH = DN_INDEX['DN15']; // 300 mbar kolonlar için

function isHighPressurePipe(pipe) {
    return parseFloat(pipe?.basinc) > 50;
}

function kolonMinIdxFor(pipe) {
    return isHighPressurePipe(pipe) ? KOLON_MIN_IDX_HIGH : KOLON_MIN_IDX_LOW;
}

const TARGET_RANGES = {
    AGGRESSIVE:   { min: 0.90, max: 0.99, label: 'Sineğin Yağını Çıkar' },
    CONSERVATIVE: { min: 0.50, max: 0.75, label: 'Abartmadan' },
};

const MAX_ITER = 400;

// ─── Q → varsayılan DN ─────────────────────────────────────────────────────────
// 300 mbar (yüksek basınç) hatlarda izin verilen hız (15 m/s) ve kayıp limiti
// (KOLON_HIGH = 21 mbar) çok daha geniş olduğundan, aynı debide daha küçük çap
// ile başlanabilir. Algoritma rafine ederken zaten gerekirse yükseltir.
function chartDN(Q, basinc = 21) {
    const q = Number(Q) || 0;
    const high = parseFloat(basinc) > 50;

    if (high) {
        // 300 mbar tablosu (V ≤ 15 m/s temelli, kayıp toleransı geniş)
        if (q <= 6)     return 'DN15';
        if (q <= 12)    return 'DN20';
        if (q <= 25)    return 'DN25';
        if (q <= 50)    return 'DN32';
        if (q <= 100)   return 'DN40';
        if (q <= 175)   return 'DN50';
        if (q <= 300)   return 'DN65';
        if (q <= 500)   return 'DN80';
        if (q <= 800)   return 'DN100';
        if (q <= 1300)  return 'DN125';
        if (q <= 1800)  return 'DN150';
        if (q <= 3000)  return 'DN200';
        if (q <= 5000)  return 'DN250';
        if (q <= 8000)  return 'DN300';
        if (q <= 14000) return 'DN400';
        return 'DN450';
    }

    // 21/50 mbar tablosu (V ≤ 6 m/s)
    if (q <= 2)   return 'DN15';
    if (q <= 3)   return 'DN20';
    if (q <= 6)   return 'DN25';
    if (q <= 12)  return 'DN32';
    if (q <= 18)  return 'DN40';
    if (q <= 30)  return 'DN50';
    if (q <= 50)  return 'DN65';
    if (q <= 75)  return 'DN80';
    if (q <= 100)  return 'DN100';
    if (q <= 130)  return 'DN125';
    if (q <= 160) return 'DN150';
    if (q <= 200) return 'DN200';
    if (q <= 300) return 'DN250';
    if (q <= 500) return 'DN300';
    if (q <= 800) return 'DN400';
    return 'DN450';
}

function dnIdx(dn) {
    const i = DN_INDEX[dn];
    return Number.isFinite(i) ? i : -1;
}

// ─── Bağlam toplayıcılar (sayaç sonrası, sayaç eşlemesi) ──────────────────────
function buildPipeContext(manager) {
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });

    const downstreamOfMeter = new Set();
    const meterByPipe = new Map();
    (manager.components || []).forEach(meter => {
        if (meter.type !== 'sayac' || !meter.cikisBagliBoruId) return;
        const queue = [meter.cikisBagliBoruId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (meterByPipe.has(id)) continue;
            meterByPipe.set(id, meter);
            downstreamOfMeter.add(id);
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    });

    // Boru ID → fleksBaglanti.boruId üzerinden bağlı cihaz sayısı (downstream)
    // tek cihaz hatlarını tespit etmek için.
    const deviceByPipe = new Map(); // pipeId → device count attached at this pipe
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz') return;
        const bid = c.fleksBaglanti?.boruId;
        if (!bid) return;
        deviceByPipe.set(bid, (deviceByPipe.get(bid) || 0) + 1);
    });

    return { childrenOf, downstreamOfMeter, meterByPipe, deviceByPipe };
}

// Bu borudan başlayıp aşağı akış yönünde kaç cihaz erişilebilir?
function downstreamDeviceCount(pipeId, ctx) {
    const reachable = new Set();
    const queue = [pipeId];
    while (queue.length) {
        const id = queue.shift();
        if (reachable.has(id)) continue;
        reachable.add(id);
        for (const cid of ctx.childrenOf.get(id) || []) queue.push(cid);
    }
    let count = 0;
    reachable.forEach(id => { count += ctx.deviceByPipe.get(id) || 0; });
    return count;
}

function isSingleDeviceLine(pipeId, ctx) {
    return downstreamDeviceCount(pipeId, ctx) === 1;
}

// Bir boru, fiziksel section'ının başında mı? (parent farklı çapta veya yoksa)
function isSectionHead(pipe, manager) {
    const par = pipe.baslangicBaglanti;
    if (!par || par.tip !== 'boru' || !par.hedefId) return true;
    const parPipe = manager.pipes.find(p => p.id === par.hedefId);
    if (!parPipe) return true;
    return parPipe.boruCap !== pipe.boruCap;
}

function getHatRowForPipe(state, pipeId) {
    return state.rows.find(r => Array.isArray(r.pipeIds) && r.pipeIds.includes(pipeId));
}

// ─── Boru çapı uygulama yardımcıları ──────────────────────────────────────────
function setPipeDn(manager, pipe, newDn) {
    if (!pipe || pipe.boruCap === newDn) return false;
    pipe.boruCap = newDn;
    (manager.components || []).forEach(c => {
        if (c.type === 'vana' && c.bagliBoruId === pipe.id) c.vanaCap = newDn;
    });
    return true;
}

function applyDnToHat(manager, hatNo, newDn) {
    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    let changed = false;
    manager.pipes.forEach(p => {
        if (hatMap.get(p.id) !== hatNo) return;
        if (setPipeDn(manager, p, newDn)) changed = true;
    });
    return changed;
}

// ─── 1) Varsayılan çapları uygula ─────────────────────────────────────────────
function applyDefaults(manager) {
    const ctx = buildPipeContext(manager);
    const { downstreamOfMeter, meterByPipe } = ctx;

    manager.pipes.forEach(p => {
        const Q = Number(p.debi) || 0;
        const isTuk = downstreamOfMeter.has(p.id);
        const meter = meterByPipe.get(p.id);
        const isEsnek = isTuk && meter?.birimBoruTipi === 'ESNEK';

        let dn = chartDN(Q, p.basinc);

        // KOLON hatlarda alt sınır basınca göre değişir (300 mbar: DN15, aksi: DN25)
        const minIdx = kolonMinIdxFor(p);
        if (!isTuk && dnIdx(dn) < minIdx) {
            dn = DN_LIST[minIdx];
        }

        // DN15 sadece tek cihaz hattında izinli; aksi halde DN20 (yüksek basınçlı kolon hariç)
        if (dn === 'DN15' && !isTuk && !isHighPressurePipe(p)) {
            // Düşük basınçlı kolon DN25 minimum zaten — buraya düşmemeli
        } else if (dn === 'DN15' && isTuk && !isSingleDeviceLine(p.id, ctx)) {
            dn = 'DN20';
        }

        // ESNEK kapsamı dışına çıkıyorsa en büyük esnek çapı seç
        if (isEsnek && !ESNEK_DN_LIST.includes(dn)) {
            dn = ESNEK_DN_LIST[ESNEK_DN_LIST.length - 1];
        }

        setPipeDn(manager, p, dn);
    });
}

// ─── 2) Hesaplama (durum) ─────────────────────────────────────────────────────
function compute(manager) {
    const { rows: fitRows } = computeFittings(manager);
    const fittingsByHat = new Map();
    fitRows.forEach(r => fittingsByHat.set(r.hatNo, r.total));

    const { hats } = buildHatData(manager);
    const rows = cascadeHats(hats, fittingsByHat);

    const kolonRows = rows.filter(r => r.segmentType === 'KOLON');
    const tukRows   = rows.filter(r => r.segmentType !== 'KOLON');
    const rowsByHat = new Map(rows.map(r => [r.hatNo, r]));

    const kolonPaths = enumeratePaths(kolonRows);
    const tukPaths   = enumeratePaths(tukRows);

    // Her yolun limiti ayrı: 300 mbar kolon → 21 mbar; 21 mbar kolon → 1 mbar.
    kolonPaths.forEach(p => {
        p.limit = pathLimitForKolon(rowsByHat, p.hatNos);
        p.ratio = p.total / p.limit;
        p.segmentType = 'KOLON';
        p.overLimit = p.total >= p.limit;
    });
    tukPaths.forEach(p => {
        p.limit = PATH_LIMITS.TUKETIM;
        p.ratio = p.total / p.limit;
        p.segmentType = 'TUK';
        p.overLimit = p.total >= p.limit;
    });
    annotatePaths(kolonPaths, PATH_LIMITS.KOLON_HIGH); // kritik bayrak için (limit alanı zaten ayrı)
    annotatePaths(tukPaths,   PATH_LIMITS.TUKETIM);

    const allPaths = [...kolonPaths, ...tukPaths];

    const ratios = {
        kolon:   kolonPaths.length ? Math.max(...kolonPaths.map(p => p.ratio)) : 0,
        tuketim: tukPaths.length   ? Math.max(...tukPaths.map(p => p.ratio))   : 0,
    };
    ratios.max = Math.max(ratios.kolon, ratios.tuketim);

    const maxV = rows.reduce((m, r) => Math.max(m, Number.isFinite(r.v) ? r.v : 0), 0);
    // Hız ihlali: her hattın kendi limitine göre.
    const vViolations = rows.filter(r => {
        if (!Number.isFinite(r.v)) return false;
        const lim = Number.isFinite(r.vLimit) ? r.vLimit : 6;
        return r.v > lim;
    });
    const hasVViolation = vViolations.length > 0;
    const hasError = rows.some(r => r.error);

    return { rows, kolonPaths, tukPaths, allPaths, ratios, maxV, vViolations, hasVViolation, hasError };
}

function rowByHat(state, hatNo) {
    return state.rows.find(r => r.hatNo === hatNo);
}

function allowedListFor(row) {
    return row.boruTipi === 'ESNEK' ? ESNEK_DN_LIST : DN_LIST;
}

// ─── 3) Çap değiştirme uygunluk denetimleri ───────────────────────────────────
function canRaise(state, hatNo) {
    const row = rowByHat(state, hatNo);
    if (!row) return false;
    const allowed = allowedListFor(row);
    const localIdx = allowed.indexOf(row.dn);
    if (localIdx < 0 || localIdx >= allowed.length - 1) return false;

    const newDn = allowed[localIdx + 1];

    // Akış yönünde çap artmasın → child DN ≤ parent DN
    if (row.parentHatNo != null) {
        const parent = rowByHat(state, row.parentHatNo);
        if (parent && dnIdx(newDn) > dnIdx(parent.dn)) return false;
    }
    return true;
}

function raiseHat(manager, state, hatNo) {
    if (!canRaise(state, hatNo)) return false;
    const row = rowByHat(state, hatNo);
    const allowed = allowedListFor(row);
    const newDn = allowed[allowed.indexOf(row.dn) + 1];
    return applyDnToHat(manager, hatNo, newDn);
}

// ─── 4) Hedef seçim heuristikleri ─────────────────────────────────────────────
// Yükseltilecek hat: bir yol (kritik veya limit aşan) üzerindeki en yüksek
// kayba sahip yükseltilebilir hat.
function pickRaiseOnPath(state, hatNos) {
    let best = null, bestVal = -Infinity;
    for (const hn of hatNos) {
        if (!canRaise(state, hn)) continue;
        const r = rowByHat(state, hn);
        const contrib = (r.dPR || 0) + (r.dPF || 0);
        if (contrib > bestVal) { bestVal = contrib; best = hn; }
    }
    return best;
}

function findWorstPath(state) {
    let best = null, bestRatio = -Infinity;
    state.allPaths.forEach(p => {
        const r = p.ratio ?? 0;
        if (r > bestRatio) { bestRatio = r; best = p; }
    });
    return best;
}

// ─── 5) Snapshot / restore ────────────────────────────────────────────────────
function snapshot(manager) {
    return manager.pipes.map(p => ({ id: p.id, dn: p.boruCap }));
}
function restore(manager, snap) {
    const m = new Map(snap.map(s => [s.id, s.dn]));
    manager.pipes.forEach(p => {
        const dn = m.get(p.id);
        if (dn != null) setPipeDn(manager, p, dn);
    });
}

// ─── 5b) Pipe-bazlı redüksiyon ────────────────────────────────────────────────
// Bir hat içinde, belirli bir borudan başlayıp aşağı akış yönünde aynı çapı
// taşıyan tüm boruları topla (pipe + downstream within-section).
function collectDownstreamSameDn(manager, startPipeId, sameDn) {
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));

    const result = [];
    const visited = new Set();
    const queue = [startPipeId];
    while (queue.length) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        const p = pipeMap.get(id);
        if (!p || p.boruCap !== sameDn) continue;
        result.push(p);
        for (const cid of childrenOf.get(id) || []) queue.push(cid);
    }
    return { tail: result, childrenOf };
}

// Tek bir borunun (ve aynı çaplı aşağı kuyruğunun) çapını bir basamak düşür;
// V > 6 m/s veya başka bir yolun oranı target.max'i aşarsa geri al.
// Başarılıysa true döner.
//
// Kurallar:
//   • Yeni DN = DN15 ise yalnızca tek cihaz hatlarına uygulanır.
//   • Boru section'ın başında değilse (parent aynı çaptaysa) bu bir "split":
//       - Yalnızca AGGRESSIVE modda izin verilir.
//       - Hat uzunluğu (L_m) en az 8 m olmalı.
function tryReducePipe(manager, state, pipeId, target, mode) {
    const pipe = manager.pipes.find(p => p.id === pipeId);
    if (!pipe) return false;

    const oldDn = pipe.boruCap;
    if (!oldDn) return false;

    const ctx = buildPipeContext(manager);
    const meter  = ctx.meterByPipe.get(pipe.id);
    const isEsnek = ctx.downstreamOfMeter.has(pipe.id) && meter?.birimBoruTipi === 'ESNEK';
    const allowed = isEsnek ? ESNEK_DN_LIST : DN_LIST;
    const localIdx = allowed.indexOf(oldDn);
    if (localIdx <= 0) return false;
    const newDn = allowed[localIdx - 1];

    // KOLON minimumu — basınca göre (300 mbar: DN15, aksi: DN25)
    const isKolon = !ctx.downstreamOfMeter.has(pipe.id);
    if (isKolon && dnIdx(newDn) < kolonMinIdxFor(pipe)) return false;

    // DN15 yalnızca tek cihaz hatlarında veya yüksek basınçlı kolonlarda geçerli
    if (newDn === 'DN15' && !isSingleDeviceLine(pipe.id, ctx) && !(isKolon && isHighPressurePipe(pipe))) return false;

    // Split (hat-içi redüksiyon) sadece AGGRESSIVE modda ve ≥8m hatta
    const isSplit = !isSectionHead(pipe, manager);
    if (isSplit) {
        if (mode !== 'AGGRESSIVE') return false;
        const hatRow = getHatRowForPipe(state, pipe.id);
        if (!hatRow || (hatRow.L_m || 0) < 4) return false;
    }

    // Kuyruk: aynı çaplı, aşağı akıştaki borular
    const { tail, childrenOf } = collectDownstreamSameDn(manager, pipe.id, oldDn);
    if (tail.length === 0) return false;
    const tailIds = new Set(tail.map(p => p.id));

    // Monotonluk: kuyruğun dışındaki çocuklar (farklı çaplı/farklı section)
    // yeni DN'den büyükse düşürme bozar (asla artan çap olmayacak).
    for (const tp of tail) {
        for (const cid of childrenOf.get(tp.id) || []) {
            if (tailIds.has(cid)) continue;
            const cp = manager.pipes.find(x => x.id === cid);
            if (cp && dnIdx(cp.boruCap) > dnIdx(newDn)) return false;
        }
    }

    // Snapshot → uygula → doğrula
    const snap = snapshot(manager);
    let changed = false;
    for (const p of tail) if (setPipeDn(manager, p, newDn)) changed = true;
    if (!changed) return false;

    const after = compute(manager);
    if (after.hasVViolation) { restore(manager, snap); return false; }
    if (after.allPaths.some(p => p.ratio > target.max)) { restore(manager, snap); return false; }
    return true;
}

// Bir yol üzerindeki boruları büyükten küçüğe sırala, sırayla
// tryReducePipe denemesi yap. İlk başarılı denemede true döner.
// CONSERVATIVE modda yalnızca section başındaki borular geçerli olur
// (split yapılamaz → sadece tüm-hat redüksiyonu).
function tryReduceOnPath(manager, state, path, target, mode) {
    const pipeIds = [];
    path.hatNos.forEach(hn => {
        const r = state.rows.find(x => x.hatNo === hn);
        if (r && Array.isArray(r.pipeIds)) pipeIds.push(...r.pipeIds);
    });
    if (pipeIds.length === 0) return false;

    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const candidates = Array.from(new Set(pipeIds))
        .map(id => pipeMap.get(id))
        .filter(Boolean)
        // Önce büyük çaplılar; eşitlikte daha uzun kuyruğu olabilecek
        // upstream-yakın boruları sona at (yaprak-tarafı önceliği) →
        // küçük adımlarla yaklaş.
        .sort((a, b) => dnIdx(b.boruCap) - dnIdx(a.boruCap));

    for (const pipe of candidates) {
        if (tryReducePipe(manager, state, pipe.id, target, mode)) return true;
    }
    return false;
}

// ─── 6) Ana algoritma ─────────────────────────────────────────────────────────
function autoSize(manager, mode) {
    if (!manager?.pipes?.length) return;
    const target = TARGET_RANGES[mode];
    if (!target) return;

    // Boru basınçlarını upstream zincirinden senkronize et — chartDN doğru tabloyu seçsin
    recomputeAllPressures(manager);

    applyDefaults(manager);

    // FAZ A: V ihlali olmayana ve kritik oran ≤ 1 olana kadar yükselt (zorunlu)
    for (let i = 0; i < MAX_ITER; i++) {
        const state = compute(manager);
        if (!state.hasVViolation && state.ratios.max <= 1.0 && !state.hasError) break;

        // Hız ihlali olan hatları öncelikle yükselt (kendi vLimit'ine göre)
        const vRow = state.vViolations.slice().sort((a, b) => b.v - a.v)[0];

        let targetHat = null;
        if (vRow && canRaise(state, vRow.hatNo)) {
            targetHat = vRow.hatNo;
        } else {
            // Limit aşan yolun en katkılı hattını yükselt
            const worst = findWorstPath(state);
            if (worst) targetHat = pickRaiseOnPath(state, worst.hatNos);
        }

        if (targetHat == null) break;
        if (!raiseHat(manager, state, targetHat)) break;
    }

    // FAZ B: HER yolu hedef bandına çek
    //   • target.max'i aşan yol varsa kritik yolda hat-bazlı yükselt
    //   • aksi halde target.min altı yollarda boru-bazlı redüksiyon dene
    //   • redüksiyon doğal hat sınırlarına bağlı kalmaz: aynı çapı taşıyan
    //     bir borunun aşağı kuyruğu birlikte düşer → hat içinde redüksiyon doğar
    for (let i = 0; i < MAX_ITER * 3; i++) {
        const state = compute(manager);

        // Güvenlik: V veya tam limit ihlali yeniden gelirse zorunlu yükselt
        if (state.hasVViolation || state.ratios.max > 1.0) {
            const worst = findWorstPath(state);
            const t = worst ? pickRaiseOnPath(state, worst.hatNos) : null;
            if (t == null || !raiseHat(manager, state, t)) break;
            continue;
        }

        // target.max'in üzerindeki yolları bul
        const overBand = state.allPaths
            .filter(p => p.ratio > target.max)
            .sort((a, b) => b.ratio - a.ratio);

        if (overBand.length > 0) {
            // En kötü yolda hat yükselt
            const t = pickRaiseOnPath(state, overBand[0].hatNos);
            if (t == null || !raiseHat(manager, state, t)) break;
            continue;
        }

        // target.min altındaki yolları bul (en düşük orandan başla)
        const underBand = state.allPaths
            .filter(p => p.ratio < target.min)
            .sort((a, b) => a.ratio - b.ratio);

        if (underBand.length === 0) break; // tümü hedef bandında

        let progress = false;
        for (const ub of underBand) {
            if (tryReduceOnPath(manager, state, ub, target, mode)) {
                progress = true;
                break;
            }
        }
        if (!progress) break;
    }

    // Kalıcılaştır + yeniden çiz
    try { manager.saveToState?.(); } catch (_) {}
    try { draw2D(); } catch (_) {}
}

// ─── 7) UI: Onay modalı ───────────────────────────────────────────────────────
function ensureConfirmDom() {
    let overlay = document.getElementById('auto-cap-confirm-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'auto-cap-confirm-overlay';
    overlay.style.cssText = `
        display: none;
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 10001;
        align-items: center; justify-content: center;
    `;
    overlay.innerHTML = `
        <div id="auto-cap-confirm-modal" style="
            background: var(--bg-popup, #2b2b2b);
            color: var(--color-text, #e6e6e6);
            border: 1px solid var(--border-color, #444);
            border-radius: 8px;
            padding: 20px 24px;
            min-width: 360px;
            max-width: 480px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            font-family: inherit;
        ">
            <div id="auto-cap-confirm-title" style="
                font-size: 16px;
                font-weight: 600;
                margin-bottom: 12px;
            ">Otomatik Çap Belirle</div>
            <div id="auto-cap-confirm-msg" style="
                font-size: 14px;
                line-height: 1.5;
                margin-bottom: 18px;
                white-space: pre-wrap;
            ">Çaplar yeniden belirlenecek, emin misiniz?</div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="auto-cap-confirm-cancel" style="
                    padding: 8px 14px;
                    background: transparent;
                    color: inherit;
                    border: 1px solid var(--border-color, #555);
                    border-radius: 4px;
                    cursor: pointer;
                ">İptal</button>
                <button id="auto-cap-confirm-ok" style="
                    padding: 8px 14px;
                    background: #2563eb;
                    color: #fff;
                    border: 1px solid #1d4ed8;
                    border-radius: 4px;
                    cursor: pointer;
                ">Devam</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideConfirm();
    });
    return overlay;
}

function showConfirm(modeLabel) {
    return new Promise(resolve => {
        const overlay = ensureConfirmDom();
        const title = overlay.querySelector('#auto-cap-confirm-title');
        const msg   = overlay.querySelector('#auto-cap-confirm-msg');
        const okBtn = overlay.querySelector('#auto-cap-confirm-ok');
        const cnBtn = overlay.querySelector('#auto-cap-confirm-cancel');

        title.textContent = `Otomatik Çap Belirle — ${modeLabel}`;
        msg.textContent   = 'Çaplar yeniden belirlenecek, emin misiniz?';
        overlay.style.display = 'flex';

        const cleanup = () => {
            overlay.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cnBtn.removeEventListener('click', onCancel);
            document.removeEventListener('keydown', onKey);
        };
        const onOk     = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        const onKey    = (e) => {
            if (e.key === 'Escape') onCancel();
            else if (e.key === 'Enter') onOk();
        };
        okBtn.addEventListener('click', onOk);
        cnBtn.addEventListener('click', onCancel);
        document.addEventListener('keydown', onKey);
        okBtn.focus();
    });
}

function hideConfirm() {
    const overlay = document.getElementById('auto-cap-confirm-overlay');
    if (overlay) overlay.style.display = 'none';
}

// ─── 8) Menü bağlama ──────────────────────────────────────────────────────────
async function runMode(mode) {
    const target = TARGET_RANGES[mode];
    if (!target) return;
    const ok = await showConfirm(target.label);
    if (!ok) return;
    autoSize(plumbingManager, mode);
}

export function initAutoCapMenu() {
    const mainMenu = document.getElementById('mainMenuContent');
    const trigger  = document.getElementById('menuHesapAutoCap');
    const optAggr  = document.getElementById('menuAutoCapAggressive');
    const optCons  = document.getElementById('menuAutoCapConservative');

    // Trigger ana menüde sadece submenu açıyor — varsayılan link davranışını engelle
    if (trigger) {
        trigger.addEventListener('click', (e) => e.preventDefault());
    }
    if (optAggr) {
        optAggr.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement?.classList.remove('show');
            runMode('AGGRESSIVE');
        });
    }
    if (optCons) {
        optCons.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement?.classList.remove('show');
            runMode('CONSERVATIVE');
        });
    }
}
