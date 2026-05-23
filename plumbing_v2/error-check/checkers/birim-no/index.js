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
import { floorNameById } from '../../checker-utils.js';

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

        // Hangi katlarda görülüyor?
        const floorNames = [...new Set(list.map(a => floorNameById(a.floorId) || '(?)'))];
        // PDF: "Zemin katta D2 birim no birden fazla girilmiş."
        //      "Zemin ve 2. Katta D2 birim no birden fazla girilmiş."
        //      "Zemin kat, 2.Kat, 3. Kat ve 4. Katta D2 birim no birden fazla girilmiş."
        const floorsStr = floorNames.length === 1
            ? `${floorNames[0]}ta`
            : floorNames.slice(0, -1).join(', ') + ' ve ' + floorNames[floorNames.length - 1] + 'ta';

        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `birimno-cogul-${key}`,
            message: `${floorsStr} ${label} birim no birden fazla girilmiş.`,
            source:  'proje gereği',
            detail:  'Aynı birim numarası birden fazla yere girilemez. Her birim (daire, ofis, dükkan vb.) benzersiz bir numara almalıdır.',
            targets: list.map(a => ({ type: 'comp', id: a.id })),
            fix: null,
        });
    }
}

// ─── Kural 2 — Branşmanda birim no boş ───────────────────────────────────
function bransmanBirimNoBosKurali(manager, out) {
    (manager.components || []).forEach(v => {
        if (v.type !== 'vana' || v.vanaTipi !== 'BRANSMAN') return;
        if (v.ilerdeKullanim) return; // İlerde kullanım modunda birim no otomatik üretilir
        const no = String(v.birimNo ?? '').trim();
        if (no) return;

        const fn = floorNameById(v.floorId);
        // PDF: "Zemin katta birim no girilmemiş branşman olmamalıdır"
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `birimno-eksik-${v.id}`,
            message: `${fn ? fn + 'ta b' : 'B'}irim no girilmemiş branşman olmamalıdır`,
            source:  'proje gereği',
            detail:  'Branşman vanasına bağlı her birim için birim numarası girilmelidir.',
            targets: [{ type: 'comp', id: v.id }],
            fix: null,
        });
    });
}

function birimNoChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    cogulBirimNoKurali(manager, out);
    bransmanBirimNoBosKurali(manager, out);
    return out;
}

errorCheckManager.register('birim-no', birimNoChecker);
