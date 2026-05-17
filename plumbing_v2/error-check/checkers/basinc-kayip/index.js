// basinc-kayip / index.js
// TS 7363 Md:4.3.3 (21 mbar) ve Md:4.3.4 (300 mbar) tesisatlarda kritik yol
// basınç kaybı denetimleri.
//
// Mantık: boru-cap-menu.js'in path enumerasyonu + PATH_LIMITS sistemini
// yeniden kullanır. Her overLimit yol → 1 hata satırı.
//
// Hata mesajı:    "1-2-3-6-7 : 1.2467 mbar (≤ 1.0 mbar olmalıdır)"
// Kaynak:         "TS7363 Md:4.3.3" / "TS7363 Md:4.3.4"
// Hedef (Git):    { type:'path', hatNos:[...] }
// Çözüm:          "Çap yükseltilecek" → yoldaki en küçük DN bir kademe büyür

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import {
    buildHatData,
    cascadeHats,
    enumeratePaths,
    annotatePaths,
    PATH_LIMITS,
} from '../../../../menu/boru-cap-menu.js';
import { computeFittings } from '../../../../menu/fittings-menu.js';
import { upgradeBottleneckInHats } from './fix.js';

const NF4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

// Limit değeri → PDF'teki "Gerekçe" metni.
function limitDescriptor(limit, isHighStart) {
    // 21 mbar tesisat (Md:4.3.3)
    if (!isHighStart) {
        if (Math.abs(limit - PATH_LIMITS.TUKETIM) < 1e-6) {
            return {
                source: 'TS7363 Md:4.3.3',
                detail: 'Servis kutusu çıkışı 21 mbar tesisatta, sayaç çıkışı ile cihaz arasındaki basınç kaybı en fazla 0.8 mbar olabilir.',
            };
        }
        if (Math.abs(limit - PATH_LIMITS.KOLON_BRANSMAN) < 1e-6) {
            return {
                source: 'TS7363 Md:4.3.3',
                detail: 'Servis kutusu çıkışı 21 mbar tesisatta, servis kutusu ile ilerde kullanım amacıyla birden fazla birim için bırakılan vana (+ körtapa) arasında basınç kaybı en fazla 0.7 mbar olabilir.',
            };
        }
        if (Math.abs(limit - PATH_LIMITS.KOLON) < 1e-6) {
            return {
                source: 'TS7363 Md:4.3.3',
                detail: 'Servis kutusu çıkışı 21 mbar tesisatta, servis kutusu ile sayaç vanası arasında kritik hat toplam basınç kaybı en fazla 1.0 mbar olabilir.',
            };
        }
        if (Math.abs(limit - PATH_LIMITS.KOLON_YANBINA) < 1e-6) {
            return {
                source: 'TS7363 Md:4.3.3',
                detail: 'Servis kutusu çıkışı 21 mbar tesisatta, servis kutusu ile yan binaya giden vanaya kadar basınç kaybı en fazla 0.4 mbar olabilir.',
            };
        }
    }

    // 300 mbar tesisat (Md:4.3.4)
    if (Math.abs(limit - PATH_LIMITS.REG_CIHAZ) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, sayaç sonrası tesis edilen reglaj grubu ile basınç 21 mbar\'a düşürülüyorsa reglaj grubu ile yakıcı cihaz arasında basınç kaybı en fazla 1.8 mbar olabilir.',
        };
    }
    if (Math.abs(limit - PATH_LIMITS.REG_SAYAC) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, sayaç öncesi tesis edilen reglaj grubu ile basınç 21 mbar\'a düşürülüyorsa reglaj grubu ile sayaç arasındaki basınç kaybı en fazla 1.0 mbar olabilir.',
        };
    }
    if (Math.abs(limit - PATH_LIMITS.REG_BRANSMAN) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, kolonda kullanılan regülatörden sonra, ilerde kullanım amacıyla birden fazla birim için vana (+ körtapa) bırakılıyorsa, regülatör ile vana arasında basınç kaybı en fazla 0.7 mbar olabilir.',
        };
    }
    if (Math.abs(limit - PATH_LIMITS.TUKETIM) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, sayaç öncesi tesis edilen reglaj grubu ile basınç 21 mbar\'a düşürülüyorsa, sayaç ile yakıcı cihaz arasında basınç kaybı en fazla 0.8 mbar olabilir.',
        };
    }
    if (Math.abs(limit - PATH_LIMITS.KOLON_HIGH) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, sayaçtan geçen gaz basıncı 300 mbar ise servis kutusu ile sayaç arasındaki basınç kaybı en fazla 21 mbar olabilir.',
        };
    }
    if (Math.abs(limit - PATH_LIMITS.KOLON_HIGH_BRANSMAN) < 1e-6 ||
        Math.abs(limit - PATH_LIMITS.KOLON_HIGH_YANBINA) < 1e-6) {
        return {
            source: 'TS7363 Md:4.3.4',
            detail: 'Servis kutusu çıkışı 300 mbar tesisatta, yine 300 mbar kolon üzerinde, ilerde kullanım amacıyla birden fazla birim için vana (+ körtapa) bırakılıyorsa, servis kutusu ile vana arasında basınç kaybı en fazla 15 mbar olabilir.',
        };
    }

    return {
        source: 'TS7363 Md:4.3.3 / 4.3.4',
        detail: 'Yol üzerinde toplam basınç kaybı limiti aşıldı.',
    };
}

function basincKayipChecker({ manager }) {
    if (!manager?.pipes?.length) return [];

    // 1) Fittings (Σξ) hatNo → total
    const { rows: fitRows } = computeFittings(manager);
    const fittingsByHat = new Map();
    fitRows.forEach(r => fittingsByHat.set(r.hatNo, r.total));

    // 2) Hat verileri + cascade
    const { hats } = buildHatData(manager);
    if (!hats.length) return [];
    const rows = cascadeHats(hats, fittingsByHat);
    const byHat = new Map(rows.map(r => [r.hatNo, r]));

    // 3) KOLON ve TÜKETİM yollarını ayrı ayrı enumerate et + annotate
    const kolonRows = rows.filter(r => r.segmentType === 'KOLON');
    const tukRows   = rows.filter(r => r.segmentType !== 'KOLON');
    const kolonPaths = enumeratePaths(kolonRows);
    const tukPaths   = enumeratePaths(tukRows);
    annotatePaths(kolonPaths, byHat, 'KOLON');
    annotatePaths(tukPaths,   byHat, 'TUKETIM');

    // 4) overLimit + skip değil olanları hataya çevir
    const errors = [];
    [...kolonPaths, ...tukPaths].forEach(p => {
        if (p.skip || !p.overLimit) return;

        const firstHat = byHat.get(p.hatNos[0]);
        const isHighStart = parseFloat(firstHat?.basinc) > 50;
        const desc = limitDescriptor(p.limit, isHighStart);

        // Yol etiketi — post-reg parça gösterilir.
        const displayHats = p.hatNos.slice(p.evalFromIdx || 0);
        const pathLabel = displayHats.join('-');
        const limitStr  = NF4.format(p.limit);
        const valueStr  = NF4.format(p.evalTotal ?? p.total ?? 0);

        errors.push({
            group:   ERROR_GROUP_IDS.BASINC_KAYIP,
            errorId: `pl-${p.hatNos.join('_')}-${p.limit.toFixed(4)}`,
            message: `${pathLabel} : ${valueStr} mbar (≤ ${limitStr} mbar olmalıdır)`,
            source:  desc.source,
            detail:  desc.detail,
            targets: [{ type: 'path', hatNos: p.hatNos.slice() }],
            fix: {
                description: 'Yoldaki en küçük çaplı boruları bir kademe yükselt',
                apply: () => upgradeBottleneckInHats(manager, p.hatNos),
            },
        });
    });

    return errors;
}

errorCheckManager.register('basinc-kayip', basincKayipChecker);
