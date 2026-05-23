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
import { daireLabel, cihazAdSmall, findMeterUpstream, floorNameById } from '../../checker-utils.js';

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

// Path bitiş etiketi — PDF wording'i:
//   SAYAC          → "D2 sayacı"
//   CIHAZ          → "kombi"
//   BRANSMAN       → "D2 branşmanı"
//   BRANSMAN_ILERDE → "2 birimlik ileride kullanım vanası"
//   YANBINA        → "yan bina vanası"
function pathEndLabel(manager, path, byHat) {
    const lastHatNo = path.hatNos[path.hatNos.length - 1];
    const lastHat = byHat.get(lastHatNo);
    const tailPipeId = lastHat?.tailPipeId;
    const type = path.endpointType;
    if (!type) return '';

    if (type === 'YANBINA') return 'yan bina vanası';

    // tail pipe'a bağlı componentleri bul
    const compsOnTail = (manager.components || []).filter(c =>
        c.bagliBoruId === tailPipeId ||
        c.fleksBaglanti?.boruId === tailPipeId
    );

    if (type === 'SAYAC') {
        const sayac = compsOnTail.find(c => c.type === 'sayac');
        const d = daireLabel(sayac);
        return d ? `${d} sayacı` : 'sayaç';
    }
    if (type === 'CIHAZ') {
        const cihaz = compsOnTail.find(c => c.type === 'cihaz');
        return cihazAdSmall(cihaz?.cihazTipi);
    }
    if (type === 'BRANSMAN') {
        const bran = compsOnTail.find(c => c.type === 'vana' && c.vanaTipi === 'BRANSMAN');
        const d = daireLabel(bran);
        return d ? `${d} branşmanı` : 'branşman';
    }
    if (type === 'BRANSMAN_ILERDE') {
        const bran = compsOnTail.find(c => c.type === 'vana' && c.vanaTipi === 'BRANSMAN' && c.ilerdeKullanim);
        const n = parseInt(bran?.birimSayisi, 10) || 0;
        return n > 0
            ? `${n} birimlik ileride kullanım vanası`
            : 'ileride kullanım vanası';
    }
    return '';
}

// Path başlangıç etiketi:
//   KOLON  + !reg → "Servis kutusu"
//   KOLON  + reg  → "Regülatör"
//   TUKETIM + !reg → "{daire} sayacı"   (sayaç sonrası iç tesisat)
//   TUKETIM + reg  → "Regülatör"        (sayaç sonrası reg → cihaz)
function pathStartLabel(manager, path, byHat, segmentType) {
    if (segmentType === 'KOLON') {
        return path.hasRegulator ? 'Regülatör' : 'Servis kutusu';
    }
    // TUKETIM
    if (path.hasRegulator) return 'Regülatör';
    // İlk hat'ın head pipe'ından upstream sayaç
    const firstHat = byHat.get(path.hatNos[0]);
    const headPipeId = firstHat?.headPipeId;
    const sayac = headPipeId ? findMeterUpstream(manager, headPipeId) : null;
    const d = daireLabel(sayac);
    return d ? `${d} sayacı` : 'sayaç';
}

// Bir hattın baş borusundan upstream gidip 300 mbar (>50) segment olup olmadığını
// kontrol eder. Sayaç sonrası iç tesisat hatları için "kutu çıkışı 300 + sayaç
// öncesi reglaj 21" senaryosunu ayırt etmek için kullanılır.
function hasUpstreamHighPressure(manager, startPipeId) {
    if (!startPipeId) return false;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    let cursor = pipeMap.get(startPipeId);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (parseFloat(cursor.basinc) > 50) return true;
        const par = cursor.baslangicBaglanti;
        if (par?.tip === 'boru' && par.hedefId) cursor = pipeMap.get(par.hedefId);
        else break;
    }
    return false;
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
    const allPaths = [
        ...kolonPaths.map(p => ({ p, segmentType: 'KOLON' })),
        ...tukPaths.map(p => ({ p, segmentType: 'TUKETIM' })),
    ];
    allPaths.forEach(({ p, segmentType }) => {
        if (p.skip || !p.overLimit) return;

        const firstHat = byHat.get(p.hatNos[0]);
        // İç tesisat (sayaç sonrası) hattı 21 mbar başlasa da, üst zincirde
        // 300 mbar segment varsa "kutu çıkışı 300 + sayaç öncesi reglaj 21"
        // senaryosudur → 4.3.4 metni kullanılmalı.
        const isHighStart = parseFloat(firstHat?.basinc) > 50
            || (segmentType !== 'KOLON' && hasUpstreamHighPressure(manager, firstHat?.headPipeId));
        const desc = limitDescriptor(p.limit, isHighStart);

        // Yol etiketi — post-reg parça gösterilir.
        const displayHats = p.hatNos.slice(p.evalFromIdx || 0);
        const pathLabel = displayHats.join('-');
        const limitStr  = NF4.format(p.limit);
        const evalVal   = p.evalTotal ?? p.total ?? 0;
        const valueStr  = isFinite(evalVal) ? NF4.format(evalVal) : 'kapasite dışı';

        const segLabel = segmentType === 'KOLON' ? 'kolon' : 'iç tesisat';
        const startLbl = pathStartLabel(manager, p, byHat, segmentType);
        const endLbl   = pathEndLabel(manager, p, byHat);

        // PDF: "{hatler} nolu {kolon|iç tesisat} hatlarında {start} ile {end}
        //       arasında toplam basınç kaybı yüksek ({valueStr} mbar > {limitStr} mbar)"
        const message = `${pathLabel} nolu ${segLabel} hatlarında ${startLbl} ile ${endLbl} arasında toplam basınç kaybı yüksek (${valueStr} mbar > ${limitStr} mbar)`;
        // floorName: yolun son hattının katı (en spesifik konum)
        const lastHat = byHat.get(p.hatNos[p.hatNos.length - 1]);
        const tailPipe = lastHat?.tailPipeId
            ? manager.pipes.find(pp => pp.id === lastHat.tailPipeId)
            : null;
        const floorName = floorNameById(tailPipe?.floorId);

        errors.push({
            group:   ERROR_GROUP_IDS.BASINC_KAYIP,
            errorId: `pl-${p.hatNos.join('_')}-${p.limit.toFixed(4)}`,
            message,
            floorName,
            source:  desc.source,
            detail:  desc.detail,
            // Mesajda gösterilen post-reg parça seçilsin (regülatör öncesi hatlar
            // mesaja dahil değil, seçimde de olmasın).
            targets: [{ type: 'path', hatNos: displayHats.slice() }],
            fix: {
                description: 'Yoldaki en küçük çaplı boruları bir kademe yükselt',
                apply: () => upgradeBottleneckInHats(manager, p.hatNos),
            },
        });
    });

    return errors;
}

errorCheckManager.register('basinc-kayip', basincKayipChecker);
