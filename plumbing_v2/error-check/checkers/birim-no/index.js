// birim-no / index.js
// PDF "Tasarım Hatası" alt grubu — birim numarası kuralları.
//
// Kurallar:
//   1. Aynı (birimTipi, birimNo) farklı çapalarda (BRANSMAN vana veya sayaç)
//      birden fazla kez girilmişse → "X birim no birden fazla girilmiş".
//      Tetik: projede en az bir birim no girilmişse karşılaştırma yapılır.
//   2. Branşman vanada birim no boş ise → "Zemin katta birim no girilmemiş
//      branşman olmamalıdır".
//
// Her iki kural için fix tanımlanmaz (PDF'te "şimdilik öneri yapmayacağız").

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { floorNameById, hatNoForComp } from '../../checker-utils.js';

function birimLabel(tipi, no) {
    switch (tipi) {
        case 'KONUT':         return `D${no}`;
        case 'OFİS':          return `Ofis ${no}`;
        case 'TİCARİ':        return `Dük ${no}`;
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default:              return `D${no}`;
    }
}

// Birim çapaları: BRANSMAN vanaları (ilerde kullanım hariç) + sayaçlar
function collectAnchors(manager) {
    return (manager.components || []).filter(c => {
        if (c.type === 'sayac') return true;
        if (c.type === 'vana' && c.vanaTipi === 'BRANSMAN' && !c.ilerdeKullanim) return true;
        return false;
    });
}

// ─── Kural 1 — Çoğul birim no ────────────────────────────────────────────
function cogulBirimNoKurali(manager, out) {
    const anchors = collectAnchors(manager);
    if (!anchors.length) return;

    const buckets = new Map();
    let anyFilled = false;
    for (const a of anchors) {
        const no = String(a.birimNo ?? '').trim();
        if (!no) continue;
        anyFilled = true;
        const tipi = a.birimTipi || 'KONUT';
        const key = `${tipi}|${no}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(a);
    }
    if (!anyFilled) return;

    for (const [key, list] of buckets.entries()) {
        if (list.length < 2) continue;
        const [tipi, no] = key.split('|');
        const label = birimLabel(tipi, no);

        // Hangi katlarda görülüyor? (sonda gri olarak gösterilir)
        const floorNames = [...new Set(list.map(a => floorNameById(a.floorId) || '(?)'))];
        const floorSuffix = floorNames.join(', ');

        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `birimno-cogul-${key}`,
            message: `${label} birim no birden fazla girilmiş.`,
            floorName: floorSuffix,
            source:  'proje gereği',
            detail:  'Aynı birim numarası birden fazla yere girilemez. Her birim (daire, ofis, dükkan vb.) benzersiz bir numara almalıdır.',
            targets: list.map(a => ({ type: 'comp', id: a.id })),
            fix: null,
        });
    }
}

// ─── Kural 2 — Branşman / Sayaçta birim no boş ───────────────────────────
// "X nolu kolon hattındaki" prefix'i — hat tespit edilemediyse boş.
function _kolonHatPrefix(manager, comp) {
    const hatNo = hatNoForComp(manager, comp);
    return hatNo != null ? `${hatNo} nolu kolon hattındaki ` : '';
}

function bransmanBirimNoBosKurali(manager, out) {
    (manager.components || []).forEach(v => {
        if (v.type !== 'vana' || v.vanaTipi !== 'BRANSMAN') return;
        if (v.ilerdeKullanim) return; // İlerde kullanım modunda birim no otomatik üretilir
        const no = String(v.birimNo ?? '').trim();
        if (no) return;

        const pre = _kolonHatPrefix(manager, v);
        const msg = pre
            ? `${pre}branşman vanasının birim nosu girilmelidir.`
            : `Branşman vanasının birim nosu girilmelidir.`;
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `birimno-eksik-${v.id}`,
            message: msg,
            floorName: floorNameById(v.floorId),
            source:  'proje gereği',
            detail:  'Branşman vanasına bağlı her birim için birim numarası girilmelidir.',
            targets: [{ type: 'comp', id: v.id }],
            fix: null,
        });
    });
}

function sayacBirimNoBosKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const no = String(s.birimNo ?? '').trim();
        if (no) return;

        const pre = _kolonHatPrefix(manager, s);
        const msg = pre
            ? `${pre}sayacın birim nosu girilmelidir.`
            : `Sayacın birim nosu girilmelidir.`;
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `birimno-eksik-sayac-${s.id}`,
            message: msg,
            floorName: floorNameById(s.floorId),
            source:  'proje gereği',
            detail:  'Sayaca bağlı her birim için birim numarası girilmelidir.',
            targets: [{ type: 'comp', id: s.id }],
            fix: null,
        });
    });
}

function birimNoChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    cogulBirimNoKurali(manager, out);
    bransmanBirimNoBosKurali(manager, out);
    sayacBirimNoBosKurali(manager, out);
    return out;
}

errorCheckManager.register('birim-no', birimNoChecker);
