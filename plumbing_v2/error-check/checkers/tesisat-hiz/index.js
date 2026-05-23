// tesisat-hiz / index.js
// TS 7363 hız kontrolleri — 3 alt kural:
//   1. Md:4.3.3 — 21 mbar tesisat, ≤ 6 m/s
//   2. Md:4.3.4 — 300 mbar tesisat, ≤50 mbar hatlar, ≤ 6 m/s
//   3. Md:4.3.4 — 300 mbar tesisat, >50 mbar hatlar, ≤ 15 m/s

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import {
    buildHatData,
    cascadeHats,
} from '../../../../menu/boru-cap-menu.js';
import { computeFittings } from '../../../../menu/fittings-menu.js';
import { upgradeHat } from './fix.js';
import { floorNameById } from '../../checker-utils.js';

const NF2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f2  = (n) => (n == null || !isFinite(n)) ? '–' : NF2.format(n);
const isHigh = (b) => parseFloat(b) > 50;

// Hesap satırlarını üret + her satıra rootBasinc ekle
// (parent zincirini takip edip kök hattın basıncını bulur)
function computeRowsWithRoot(manager) {
    const { rows: fitRows } = computeFittings(manager);
    const fittingsByHat = new Map();
    fitRows.forEach(r => fittingsByHat.set(r.hatNo, r.total));

    const { hats } = buildHatData(manager);
    if (!hats.length) return [];

    const rows = cascadeHats(hats, fittingsByHat);
    const byHat = new Map(rows.map(r => [r.hatNo, r]));

    rows.forEach(r => {
        let cursor = r;
        const seen = new Set();
        while (cursor && cursor.parentHatNo != null && !seen.has(cursor.hatNo)) {
            seen.add(cursor.hatNo);
            const parent = byHat.get(cursor.parentHatNo);
            if (!parent) break;
            cursor = parent;
        }
        r.rootBasinc = parseFloat(cursor?.basinc ?? r.basinc) || 0;
    });

    return rows;
}

// Üç farklı kural için ortak hata yapıcısı.
// "7 nolu kolon hattında hız yüksek. (7 m/s > 6 m/s)" + floorName: "Zemin Kat"
function makeErr(manager, r, vLim, source, detail, idPrefix) {
    const segLabel = r.segmentType === 'KOLON' ? 'kolon' : 'iç tesisat';
    // Hattın head pipe'ından kat bilgisi
    const headPipe = r.headPipeId
        ? manager.pipes.find(p => p.id === r.headPipeId)
        : null;
    return {
        group:   ERROR_GROUP_IDS.TESISAT_HIZ,
        errorId: `${idPrefix}-${r.hatNo}`,
        message: `${r.hatNo} nolu ${segLabel} hattında hız yüksek. (${f2(r.v)} m/s > ${vLim} m/s)`,
        floorName: floorNameById(headPipe?.floorId),
        source,
        detail,
        targets: [{ type: 'hat', no: r.hatNo }],
        fix: {
            description: `${r.hatNo} nolu hattın çapı bir kademe yükseltilecek`,
            apply: () => upgradeHat(manager, r.hatNo),
        },
    };
}

function tesisatHizChecker({ manager }) {
    if (!manager?.pipes?.length) return [];
    const rows = computeRowsWithRoot(manager);
    const out = [];

    for (const r of rows) {
        if (!isFinite(r.v)) continue;

        // Kural 3 — 300 mbar gövde, >50 mbar hat (en spesifik önce)
        if (isHigh(r.basinc)) {
            if (r.v > 15) {
                out.push(makeErr(
                    manager, r, 15,
                    'TS7363 Md:4.3.4',
                    'Servis kutusu çıkışı 300 mbar tesisatta, 50 mbar\'dan büyük basınçlı hatlarda, gaz hızı 15 m/s\'yi geçmemelidir.',
                    'vel300hi',
                ));
            }
            continue;
        }

        // Kural 2 — 300 mbar gövde, ≤50 mbar hat
        if (isHigh(r.rootBasinc)) {
            if (r.v > 6) {
                out.push(makeErr(
                    manager, r, 6,
                    'TS7363 Md:4.3.4',
                    'Servis kutusu çıkışı 300 mbar tesisatta, 50 mbar ve daha düşük basınçlı hatlarda, gaz hızı 6 m/s\'yi geçmemelidir.',
                    'vel300lo',
                ));
            }
            continue;
        }

        // Kural 1 — 21 mbar gövde
        if (r.v > 6) {
            out.push(makeErr(
                manager, r, 6,
                'TS7363 Md:4.3.3',
                'Servis kutusu çıkışı 21 mbar tesisatta, gaz hızı 6 m/s\'yi geçmemelidir.',
                'vel21',
            ));
        }
    }

    return out;
}

errorCheckManager.register('tesisat-hiz', tesisatHizChecker);
