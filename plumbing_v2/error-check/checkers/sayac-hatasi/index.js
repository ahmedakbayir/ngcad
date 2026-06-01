// sayac-hatasi / index.js
// PDF "Sayaç Hatası" grubu — sayaçla ilgili dört kontrol:
//   1. Çizelge 15 — Sayaç tipi/türü uyumsuzluğu
//        G4, G6, G10        → KÖRÜKLÜ olmalı
//        G16, G25           → KÖRÜKLÜ veya ROTARY olmalı (TÜRBİN olamaz)
//        G40 ve üstü        → ROTARY veya TÜRBİN olmalı (KÖRÜKLÜ olamaz)
//   2. Md:5.2.12 — Sayaç alt okuma sınırı
//        Birime bağlı en küçük debili cihaz sayaç Qmin'in altında ise hata.
//   3. Sayaç üst okuma sınırı
//        Birim toplam debisi sayaç Qmax21/Qmax300'den büyük ise hata.
//   4. Birim içi tesisat ESNEK ise sayaçta esnek marka seçili olmalı.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { SAYAC_DEBI_TABLOSU } from '../../../properties/property-definitions.js';
import { draw2D } from '../../../../draw/draw2d.js';
import {
    daireLabel,
    cihazAdBig,
    BIRIM_PLACEHOLDER,
    sayacHatLabel,
    hatPrefix,
    hatNoForComp,
    floorNameById,
    gri,
} from '../../checker-utils.js';

const NF2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n) => (n == null || !isFinite(n)) ? '–' : NF2.format(n);

const CIHAZ_MIN_DEBI = { OCAK: 1.6, KOMBI: 2.5 };

function cihazDebi(c) {
    if (Number.isFinite(c?.debi) && c.debi > 0) return c.debi;
    const kcal = parseFloat(c?.kapasiteKcal);
    const verim = (parseFloat(c?.verim) || 100) / 100;
    if (!isFinite(kcal) || kcal <= 0) return 0;
    const raw = kcal / 8250 / verim;
    const min = CIHAZ_MIN_DEBI[(c.cihazTipi || '').toUpperCase()] ?? 0;
    return Math.max(raw, min);
}


// Bir sayacın çıkış borusundan başlayarak downstream tüm cihazları topla.
function cihazlarAfterMeter(manager, sayac) {
    if (!manager?.pipes || !sayac?.cikisBagliBoruId) return [];
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });
    const downstream = new Set();
    const queue = [sayac.cikisBagliBoruId];
    while (queue.length) {
        const id = queue.shift();
        if (downstream.has(id)) continue;
        downstream.add(id);
        (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
    }
    return (manager.components || []).filter(c =>
        c.type === 'cihaz' &&
        (downstream.has(c.fleksBaglanti?.boruId) || downstream.has(c.bagliBoruId))
    );
}

function sayacToplamDebi(manager, sayac) {
    if (!manager) return 0;
    const exitId = sayac?.cikisBagliBoruId;
    if (!exitId) return 0;
    const pipe = manager.pipes.find(p => p.id === exitId);
    return Number(pipe?.debi) || 0;
}

// Birim/daire referansında hat no eklenmez (kullanıcı kuralı):
//   "D2 biriminde" / "××× biriminde"
//   "D2 birimindeki" / "××× birimindeki"
//   "D2 Sayacında" / "××× Sayacında"
// Cihaz referansı varsa, cihazın hat no'su mesaja inline gömülür.
function birimindePrefix(sayac) {
    const d = daireLabel(sayac) || BIRIM_PLACEHOLDER;
    return `${d} biriminde`;
}
function birimindekiPrefix(sayac) {
    const d = daireLabel(sayac) || BIRIM_PLACEHOLDER;
    return `${d} birimindeki`;
}
function sayacindaPrefix(sayac) {
    const d = daireLabel(sayac) || BIRIM_PLACEHOLDER;
    return `${d} Sayacında`;
}

function sayacLimits(sayac) {
    const row = SAYAC_DEBI_TABLOSU.find(r => r.Tip === sayac?.sayacTipi);
    if (!row) return null;
    const is300 = String(sayac.basinc) === '300';
    return { tipi: row.Tip, tur: row.Tur, Qmin: row.Qmin, Qmax: is300 ? row.Qmax300 : row.Qmax21 };
}

// ─── Kural 1 — Sayaç tipi / türü uyumsuzluğu ─────────────────────────────
function sayacTipUyumKurali(manager, out) {
    const KORUKLU_ONLY = new Set(['G4', 'G6', 'G10']);
    const NO_TURBIN    = new Set(['G16', 'G25']);
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const tip = s.sayacTipi;
        const tur = s.sayacTuru;
        if (!tip || !tur) return;

        let invalid = false;
        let target = null;
        if (KORUKLU_ONLY.has(tip) && tur !== 'KÖRÜKLÜ') {
            invalid = true;
            target = 'KÖRÜKLÜ';
        } else if (NO_TURBIN.has(tip) && tur === 'TÜRBİN') {
            invalid = true;
            target = 'KÖRÜKLÜ';
        } else if (!KORUKLU_ONLY.has(tip) && !NO_TURBIN.has(tip) && tur === 'KÖRÜKLÜ') {
            // G40 ve üstü körüklü olamaz
            invalid = true;
            target = 'ROTARY';
        }
        if (!invalid) return;

        const turLower = tur.charAt(0) + tur.slice(1).toLowerCase();
        const kb = birimindePrefix(s);
        // "D2 biriminde kullanılan G16 sayacı Rotary olamaz"
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `sayac-tur-${s.id}`,
            message: `${kb} kullanılan ${tip} sayacı ${turLower} olamaz`,
            floorName: floorNameById(s.floorId),
            source:  'TS7363 Çizelge 15',
            detail:  'Doğal gaz tesisatında; G4–G10 için körüklü tip, G16–G25 için körüklü ya da rotary, G40 ve üstü için rotary ya da türbin tip sayaçlar kullanılmalıdır.',
            targets: [{ type: 'comp', id: s.id }],
            fix: {
                description: `Sayaç türü ${target} yapılacak`,
                apply: () => {
                    s.sayacTuru = target;
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

// ─── Kural 2 — Sayaç alt okuma sınırı ────────────────────────────────────
function sayacAltDebiKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const lim = sayacLimits(s);
        if (!lim) return;
        const cihazlar = cihazlarAfterMeter(manager, s);
        if (!cihazlar.length) return;

        for (const c of cihazlar) {
            const d = cihazDebi(c);
            if (!isFinite(d) || d <= 0) continue;
            if (d >= lim.Qmin) continue;
            const ad = cihazAdBig(c.cihazTipi);
            const bi = birimindePrefix(s);
            // Cihazın hat no'su inline: "D2 birimindeki X nolu hattaki Ocak debisi, ..."
            const cihazHatNo = hatNoForComp(manager, c);
            const cihazPart = cihazHatNo != null
                ? `${cihazHatNo} nolu hattaki ${ad}`
                : ad;
            out.push({
                group:   ERROR_GROUP_IDS.TASARIM,
                errorId: `sayac-altdebi-${s.id}-${c.id}`,
                message: `${bi} ${ad} debisi ${gri(`(${fmt(d)} m³/h)`)} ${lim.tipi} Sayacın okuyabileceği en düşük debiden ${gri(`(${fmt(lim.Qmin)} m³/h)`)} daha aşağıda olduğu için, bu cihaz ve sayaç birlikte kullanılamaz`,
                floorName: floorNameById(s.floorId),
                source:  'TS7363 Md:5.2.12',
                detail:  'Tesisat üzerine takılacak cihaz seçilirken, her cihazın projedeki tüketim debileri sayaçların asgari okuma debisinden az olmamalıdır.',
                targets: [{ type: 'comp', id: s.id }],
                fix: null,
            });
        }
    });
}

// Birime bağlı en küçük cihaz debisini bul (Qmin uygunluğu için).
function enKucukCihazDebi(manager, sayac) {
    const cihazlar = cihazlarAfterMeter(manager, sayac);
    let min = Infinity;
    cihazlar.forEach(c => {
        const d = cihazDebi(c);
        if (isFinite(d) && d > 0) min = Math.min(min, d);
    });
    return isFinite(min) ? min : 0;
}

// Verilen toplam debi + basınç için Qmax yetecek en küçük sayaç satırı.
// Opsiyonel: cihazMinDebi geçilirse Qmin ≤ cihazMinDebi koşulu da aranır.
function findSuitableSayac(toplam, basinc, cihazMinDebi) {
    const is300 = String(basinc) === '300';
    for (const row of SAYAC_DEBI_TABLOSU) {
        const qmax = is300 ? row.Qmax300 : row.Qmax21;
        if (qmax < toplam) continue;
        if (cihazMinDebi > 0 && row.Qmin > cihazMinDebi) continue;
        return row;
    }
    return null;
}

// ─── Kural 3 — Sayaç üst okuma sınırı ────────────────────────────────────
function sayacUstDebiKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const lim = sayacLimits(s);
        if (!lim) return;
        const toplam = sayacToplamDebi(manager, s);
        if (!isFinite(toplam) || toplam <= 0) return;
        if (toplam <= lim.Qmax) return;

        const bi = birimindekiPrefix(s);
        // Öneri: toplam debiyi karşılayan en küçük sayaç tipi.
        const suggested = findSuitableSayac(toplam, s.basinc, 0);
        const oneri = suggested
            ? ` (${s.basinc} mbar-${fmt(toplam)} m³/h debi için ${suggested.Tip} sayaç kullanılabilir)`
            : '';
        // Ana metin önerinin sayacın yeterli olmadığını söyler, alt satırda
        // Qmax karşılaştırması paranteziyle gri olarak gösterilir.
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `sayac-ustdebi-${s.id}`,
            message: `${bi} toplam debi ${gri(`(${fmt(toplam)} m³/h)`)} ${lim.tipi} Sayacın okuyabileceği en yüksek debiden ${gri(`(${fmt(lim.Qmax)} m³/h)`)} daha yukarıda olduğu için ${lim.tipi} yerine ${suggested.Tip} seçebilirsiniz.`,
            floorName: floorNameById(s.floorId),
            source:  'TS7363 Md:5.2.12',
            detail:  'Birim toplam tüketim debisi seçilen sayacın okuyabileceği en yüksek debiden büyük olamaz. Daha büyük sayaç seçilmelidir.',
            targets: [{ type: 'comp', id: s.id }],
            fix: suggested ? {
                description: `Sayaç tipi ${suggested.Tip} yapılacak`,
                apply: () => {
                    s.sayacTipi = suggested.Tip;
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            } : null,
        });
    });
}

// ─── Kural 3b — Sayaç fazla büyük (UYARI/mavi) ───────────────────────────
// Mevcut sayaç toplam debiyi karşılıyor ama daha küçük bir sayaç da yeterli.
function sayacBuyukUyariKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const lim = sayacLimits(s);
        if (!lim) return;
        const toplam = sayacToplamDebi(manager, s);
        if (!isFinite(toplam) || toplam <= 0) return;
        if (toplam > lim.Qmax) return; // üst-debi hatası ayrı tetiklenir

        const cihazMin = enKucukCihazDebi(manager, s);
        const suggested = findSuitableSayac(toplam, s.basinc, cihazMin);
        if (!suggested) return;
        if (suggested.Tip === s.sayacTipi) return; // zaten en küçüğü

        const currIdx = SAYAC_DEBI_TABLOSU.findIndex(r => r.Tip === s.sayacTipi);
        const newIdx  = SAYAC_DEBI_TABLOSU.indexOf(suggested);
        if (currIdx < 0 || newIdx >= currIdx) return; // mevcuttan küçük değil

        const bi = birimindePrefix(s);
        // "UYARI: D436 biriminde kullanılan G10 Sayacı yerine daha düşük bir
        //  sayaç kullanılabilir. (21 mbar - 9 m³ için G6 sayaç yeterlidir)"
        out.push({
            severity: 'warning',
            group:    ERROR_GROUP_IDS.TASARIM,
            errorId:  `sayac-buyuk-uyari-${s.id}`,
            message:  `UYARI: ${bi} kullanılan ${s.sayacTipi} Sayacı yerine ${gri(`(${s.basinc} mbar - ${fmt(toplam)} m³/h için)` ) } ${suggested.Tip} kullanılabilir.`,
            floorName: floorNameById(s.floorId),
            source:   'TS7363 Çizelge 15',
            detail:   'Birim toplam tüketim debisine uygun en küçük sayaç seçilmesi maliyet ve doğru ölçüm açısından önerilir.',
            targets:  [{ type: 'comp', id: s.id }],
            fix: {
                description: `Sayaç tipi ${suggested.Tip} yapılacak`,
                apply: () => {
                    s.sayacTipi = suggested.Tip;
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

// ─── Kural 4 — Esnek tesisatlı sayaçta marka eksik ───────────────────────
function esnekMarkaKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        if (s.birimBoruTipi !== 'ESNEK') return;
        const marka = String(s.esnekMarka || '').trim();
        if (marka) return;

        const sl = sayacindaPrefix(s);
        // "D2 Sayacında esnek tesisat markası girilmelidir"
        out.push({
            group:   ERROR_GROUP_IDS.MARKA_MODEL_HATA,
            errorId: `sayac-esnek-marka-${s.id}`,
            message: `${sl} esnek tesisat markası girilmelidir`,
            floorName: floorNameById(s.floorId),
            source:  'proje gereği',
            detail:  'Birim içi tesisat esnek (ondüleli) seçilmişse, sayaç üzerinde kullanılan esnek borunun markası seçilmelidir.',
            targets: [{ type: 'comp', id: s.id }],
            fix: null,
        });
    });
}

// ─── Toplu checker ───────────────────────────────────────────────────────
function sayacHatasiChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    sayacTipUyumKurali(manager, out);
    sayacAltDebiKurali(manager, out);
    sayacUstDebiKurali(manager, out);
    sayacBuyukUyariKurali(manager, out);
    esnekMarkaKurali(manager, out);
    return out;
}

errorCheckManager.register('sayac-hatasi', sayacHatasiChecker);
