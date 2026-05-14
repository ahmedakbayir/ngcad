/**
 * Boru bazlı hız ve kayıp lookup'ları.
 * boru-cap-menu.js'teki buildHatData + cascadeHats çıktısını cache'ler ve
 * pipe.id → hat satırı sorgusu yapar. Properties paneli rAF döngüsünden
 * sık sık çağrılır; aynı manager için ~250ms'lik bir cache yeterli.
 */
import { buildHatData, cascadeHats } from '../../menu/boru-cap-menu.js';
import { computeFittings } from '../../menu/fittings-menu.js';

const CACHE_TTL_MS = 250;
let _cache = { manager: null, ts: 0, byHat: null };

function _getCascade(manager) {
    if (!manager) return null;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (_cache.manager === manager && _cache.byHat && (now - _cache.ts) < CACHE_TTL_MS) {
        return _cache.byHat;
    }
    const { hats } = buildHatData(manager);
    const byHat = new Map();
    if (hats && hats.length) {
        const { rows: fitRows } = computeFittings(manager);
        const fittingsByHat = new Map((fitRows || []).map(r => [r.hatNo, r.total]));
        const rows = cascadeHats(hats, fittingsByHat);
        rows.forEach(r => { if (r) byHat.set(r.hatNo, r); });
    }
    _cache = { manager, ts: now, byHat };
    return byHat;
}

/** Borunun bulunduğu hattın hesap satırını döndürür (v, sumDP, parentHatNo, ...) ya da null. */
export function getHatRowForPipe(pipe, manager) {
    if (!pipe || !manager) return null;
    const hatNo = window._hatMap?.get(pipe.id);
    if (hatNo == null) return null;
    const byHat = _getCascade(manager);
    return byHat?.get(hatNo) || null;
}

/**
 * Bir hattan başlayarak kaynağa (kutu/sayaç/regülatör) kadar kayıpları topla.
 * Kuralı:
 *  - Mevcut hat kendi kaybı eklenir.
 *  - parentHatNo yoksa zincir kutu/sayaç çıkışında — dururuz.
 *  - parent.regAtTail true ise regülatör bir taze kaynak — parent'ı eklemeden dururuz.
 */
export function getCumulativeLossForHat(hatNo, manager) {
    if (hatNo == null || !manager) return 0;
    const byHat = _getCascade(manager);
    if (!byHat) return 0;
    let sum = 0;
    let cur = hatNo;
    const visited = new Set();
    while (cur != null && !visited.has(cur)) {
        visited.add(cur);
        const row = byHat.get(cur);
        if (!row) break;
        sum += Number(row.sumDP) || 0;
        const parentNo = row.parentHatNo;
        if (parentNo == null) break;
        const parentRow = byHat.get(parentNo);
        if (!parentRow) break;
        if (parentRow.regAtTail) break;
        cur = parentNo;
    }
    return sum;
}

/** Cache'i dışarıdan boşaltmak için (opsiyonel). */
export function invalidatePipeCalcCache() {
    _cache = { manager: null, ts: 0, byHat: null };
}
