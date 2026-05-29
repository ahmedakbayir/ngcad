import { getCizelge6Debi } from '../renderer/renderer-utils.js';
import { MAHAL_LISTESI, WALL_HEIGHT, state } from '../../general-files/main.js';
import { getFloorAtElevation } from '../../floor/floor-handler.js';
import { addDoorToWall, addWindowToWall, addVentToWall, addColumnToWall, flipArcWall } from '../../wall/wall-panel.js';
import { recalculateStepCount } from '../../architectural-objects/stairs.js';
import { getUnitRoomsForRoom, getUnitBoundaryPerimeter, invalidateBirimCache, resolveBirimNoForRoom, syncBirimState, findSayacEnteringRoomUnit } from '../../draw/draw-birim-labels.js';
import { recomputeAllPressures } from '../utils/pressure-recompute.js';
import { getHatRowForPipe, getCumulativeLossForHat } from '../utils/pipe-calculations.js';
import { TOPRAKLAMA_YONTEMLERI } from '../objects/pipe-fitting.js';
import { ensureRegulatorAccessories } from '../objects/regulator-accessories.js';
import { getMarkaList, getModelList, getModelKW } from './cihaz-katalog.js';

/**
 * Sayacın çıkış (iç tesisat) zincirinde bir regülatör var mı?
 * Bu durumda sayacın basıncı kullanıcı tarafından bağımsız ayarlanabilir.
 */
function _hasRegulatorDownstreamOfMeter(sayac, manager) {
    if (!sayac || !manager) return false;
    const startPipeId = sayac.cikisBagliBoruId;
    if (!startPipeId) return false;

    const pipesWithRegulator = new Set();
    (manager.components || []).forEach(c => {
        if (c.type === 'regulator' && c.bagliBoruId) pipesWithRegulator.add(c.bagliBoruId);
    });
    if (pipesWithRegulator.size === 0) return false;

    const childrenOf = new Map();
    (manager.pipes || []).forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });

    const queue = [startPipeId];
    const visited = new Set();
    while (queue.length > 0) {
        const pid = queue.shift();
        if (visited.has(pid)) continue;
        visited.add(pid);
        if (pipesWithRegulator.has(pid)) return true;
        const kids = childrenOf.get(pid);
        if (kids) kids.forEach(k => queue.push(k));
    }
    return false;
}

/**
 * CANLI HAT modunda (servis_kutusu yok) sayacın fleksBaglanti.boruId zincirini
 * (baslangicBaglanti.tip='boru' takip ederek upstream) verilen basınca çeker.
 * Açık uçlu kolon borularının basıncını recompute korur, böylece sayacın
 * basıncı sayaç compute() dalında bu zincirden türetilebilir.
 */
function _setMeterUpstreamPressure(sayac, manager, value) {
    if (!sayac || !manager) return;
    const girisPipeId = sayac.fleksBaglanti?.boruId;
    if (!girisPipeId) return;
    let current = (manager.pipes || []).find(p => p.id === girisPipeId) || null;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        current.basinc = value;
        const bag = current.baslangicBaglanti;
        if (bag?.tip === 'boru') {
            current = (manager.pipes || []).find(p => p.id === bag.hedefId) || null;
        } else {
            break;
        }
    }
}

/**
 * Özellik Tanımları
 * Her özellik burada tek bir yerde tanımlanır.
 * Her nesne tipi hangi özellikleri göstereceğini OBJECT_PROPERTIES'te belirtir.
 *
 * DESTEKLENEN TIPLER:
 *   'select'   → Combobox  (key, options, default, optionsAreObjects, placeholder, disabledFn)
 *   'text'     → Textbox   (key, default, placeholder, disabled, disabledFn, afterChange)
 *   'toggle'   → On/Off    (key, default, disabled)
 *   'readonly' → Salt okunur etiket (readonlyFn: (obj, manager) => string)
 *   'section'  → Görsel grup başlığı (label)
 */

// ─── SABİTLER ────────────────────────────────────────────────────────────────

export const BORU_TIPLERI = ['ÇELİK', 'ESNEK'];
export const BAGLANTI_TIPLERI = ['DİŞLİ', 'KAYNAKLI'];
export const SAYAC_TURLERI = ['KÖRÜKLÜ', 'ROTARY', 'TÜRBİN'];
export const SAYAC_TIPLERI = [
    'G4', 'G6', 'G10', 'G16', 'G25', 'G40',
    'G65', 'G100', 'G160', 'G250', 'G400', 'G650', 'G1000', 'G1600',
];
export const BIRIM_TIPLERI = ['KONUT', 'OFİS', 'TİCARİ', 'KAZAN DAİRESİ'];
export const ESNEK_BORU_MARKALARI = ['AYVAZ', 'GFS', 'KAS', 'HITACHI', 'PAKTERMO', 'LEXFLEX', 'KALDE', 'GFLEX'];

export const BORU_CAPLARI = {
    'ÇELİK': ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100','DN125','DN150','DN200','DN250','DN300','DN400','DN450'],
    'ESNEK': ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100','DN125','DN150','DN200','DN250','DN300','DN400','DN450'],
};

export const BORU_CAPLARI_TUMU = ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100','DN125','DN150','DN200','DN250','DN300','DN400','DN450'];

export const BACA_TIPLERI = ['Hermetik', 'Bacalı', 'Atmosferik'];

export const ARA_VANALAR = ['AKV', 'EMNIYET', 'CIHAZ', 'SELENOID'];
export const SONLANMA_VANALARI = ['BRANSMAN', 'YANBINA'];
export const VANA_TIPLERI_LISTESI = [...ARA_VANALAR, ...SONLANMA_VANALARI];

export const VANA_TIP_ETIKETLERI = {
    AKV: 'AKV',
    EMNIYET: 'Emniyet Vanası',
    CIHAZ: 'Cihaz Vanası',
    SELENOID: 'Selenoid Vana',
    BRANSMAN: 'Branşman Vanası',
    YANBINA: 'Yan Bina Vanası',
};

export const SERVIS_KUTUSU_TIPLERI = ['S200', 'S300', 'S700', 'S2200', 'CES200'];
export const KUTU_BASINCLAR = ['21', '300'];
export const CIKIS_YONLERI = [
    { value: 'sag', label: 'Yandan Çıkış' },
    { value: 'alt', label: 'Alttan Çıkış' },
    { value: 'ust', label: 'Üstten Çıkış' },
];

/** Sayaç debi tablosu — Tip, Tür, min/max kapasiteler ve çıkış çapı */
export const SAYAC_DEBI_TABLOSU = [
    { Tip: 'G4', Tur: 'KÖRÜKLÜ', Qmin: 0.04, Qmax21: 6, Qmax300: 7.8, Cap: 25 },
    { Tip: 'G6', Tur: 'KÖRÜKLÜ', Qmin: 0.06, Qmax21: 10, Qmax300: 13, Cap: 25 },
    { Tip: 'G10', Tur: 'KÖRÜKLÜ', Qmin: 0.1, Qmax21: 16, Qmax300: 20.8, Cap: 40 },
    { Tip: 'G16', Tur: 'KÖRÜKLÜ', Qmin: 0.16, Qmax21: 25, Qmax300: 32.5, Cap: 40 },
    { Tip: 'G25', Tur: 'KÖRÜKLÜ', Qmin: 0.25, Qmax21: 40, Qmax300: 52, Cap: 50 },
    { Tip: 'G40', Tur: 'ROTARY', Qmin: 0.4, Qmax21: 65, Qmax300: 84.5, Cap: 50 },
    { Tip: 'G65', Tur: 'ROTARY', Qmin: 0.65, Qmax21: 100, Qmax300: 130, Cap: 50 },
    { Tip: 'G100', Tur: 'ROTARY', Qmin: 1, Qmax21: 160, Qmax300: 208, Cap: 50 },
    { Tip: 'G160', Tur: 'ROTARY', Qmin: 1.6, Qmax21: 250, Qmax300: 325, Cap: 50 },
    { Tip: 'G250', Tur: 'ROTARY', Qmin: 2.5, Qmax21: 400, Qmax300: 520, Cap: 50 },
    { Tip: 'G400', Tur: 'TÜRBİN', Qmin: 4, Qmax21: 650, Qmax300: 845, Cap: 50 },
    { Tip: 'G650', Tur: 'TÜRBİN', Qmin: 6.5, Qmax21: 1000, Qmax300: 1300, Cap: 50 },
    { Tip: 'G1000', Tur: 'TÜRBİN', Qmin: 10, Qmax21: 1600, Qmax300: 2080, Cap: 50 },
    { Tip: 'G1600', Tur: 'TÜRBİN', Qmin: 16, Qmax21: 2500, Qmax300: 3250, Cap: 50 },
];

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

/** Sayaç tipine ve basınca göre min/max debi limitlerini döndürür */
function _getSayacLimits(obj) {
    const row = SAYAC_DEBI_TABLOSU.find(r => r.Tip === obj.sayacTipi);
    if (!row) return { tur: '—', minDebi: 0.04, maxDebi: 6 };
    const is300 = String(obj.basinc) === '300';
    return {
        tur: row.Tur,
        minDebi: row.Qmin,
        maxDebi: is300 ? row.Qmax300 : row.Qmax21,
    };
}

/**
 * Sayaç çıkışındaki ilk borunun kümülatif debisini döndürür.
 * computePipeDebileri her boruya alt dalların toplamını zaten atar,
 * bu yüzden ilk boru tek başına tüm tesisatın debisini içerir.
 */
function _sumDebiAfterSayac(sayac, manager) {
    if (!manager || !sayac.cikisBagliBoruId) return 0;
    const pipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
    return pipe?.debi || 0;
}

/** Birim Tipi → kısa Türkçe etiket (Birim No otomatik metni için) */
function _birimTipiKisaLabel(birimTipi) {
    switch (birimTipi) {
        case 'KONUT': return 'daire';
        case 'OFİS': return 'ofis';
        case 'TİCARİ': return 'dükkan';
        case 'KAZAN DAİRESİ': return 'kazan dairesi';
        default: return 'daire';
    }
}

/** İlerde kullanım modunda Birim No'yu "{sayı} {tipi}" formatına getir */
function _updateIlerdeBirimNo(obj) {
    if (!obj?.ilerdeKullanim) return;
    const n = parseInt(obj.birimSayisi, 10) || 0;
    const lbl = _birimTipiKisaLabel(obj.birimTipi || 'KONUT');
    obj.birimNo = n > 0 ? `${n} ${lbl}` : '';
}

/**
 * BRANSMAN vanasının pipe ucuna bağlı sayacı bul.
 * Vana boru üzerinde fromEnd ucunda sonlanır; sayaç o boruya o uçtan fleks ile bağlanmıştır.
 */
function _findSayacForBransman(vana, manager) {
    if (!vana || !manager) return null;
    if (vana.vanaTipi !== 'BRANSMAN') return null;
    const pipeId = vana.bagliBoruId;
    if (!pipeId) return null;
    const endpoint = vana.fromEnd || null;
    return (manager.components || []).find(c =>
        c.type === 'sayac' &&
        c.fleksBaglanti?.boruId === pipeId &&
        (!endpoint || c.fleksBaglanti?.endpoint === endpoint)
    ) || null;
}

/** Birim çapasına (BRANSMAN vana veya sayaç) aynı birim no'yu yaz */
function _applyBirimNoToAnchor(anchor, no, manager) {
    if (!anchor) return;
    anchor.birimNo = String(no);
    // BRANSMAN'ın bağlı bir sayacı varsa (ara durum) ona da yansıt.
    if (anchor.type === 'vana' && anchor.vanaTipi === 'BRANSMAN') {
        const sayac = _findSayacForBransman(anchor, manager);
        if (sayac) {
            sayac.birimNo = String(no);
            if (!sayac.birimTipi && anchor.birimTipi) sayac.birimTipi = anchor.birimTipi;
        }
    }
}

/**
 * Kattaki birim çapaları: BRANSMAN vanaları (ilerdeKullanim hariç) + sayaçlar,
 * x/y konumuna göre sıralı. Sayaçlar da numaralanır çünkü sayaç eklenince
 * BRANSMAN otomatikmen EMNIYET'e dönüşür ve birim no sayaçta tutulur.
 */
function _unitAnchorsOnFloor(manager, floorId) {
    if (!manager) return [];
    const anchors = [];
    for (const c of (manager.components || [])) {
        if (c.floorId !== floorId) continue;
        if (c.type === 'vana' && c.vanaTipi === 'BRANSMAN' && !c.ilerdeKullanim) {
            anchors.push(c);
        } else if (c.type === 'sayac') {
            anchors.push(c);
        }
    }
    return anchors.sort((a, b) => (a.x - b.x) || (a.y - b.y));
}

/** Placeholder olmayan katlar, alttan üste sıralı */
function _orderedRealFloors() {
    const floors = state.floors || [];
    return floors
        .filter(f => !f.isPlaceholder)
        .slice()
        .sort((a, b) => (a.bottomElevation || 0) - (b.bottomElevation || 0));
}

/**
 * Branşman vanalarına otomatik birim no atama.
 *
 * Kat içi temel kural: verilen no'lar (refs) kattaki EN KÜÇÜK no'lardır. Kattaki TÜM boş
 * vanalara no atanır; ancak hiçbiri maxRefNo'dan küçük olamaz.
 *   - "5" girildiyse diğerleri 6,7,8…
 *   - "1,2" girildiyse diğerleri 3,4,5…
 *   - "8,9" girildiyse diğerleri 10,11,12…
 *
 * Step:
 *   - 1 ref → step = 1
 *   - ≥2 ref → step = max(1, round(|noDiff| / idxDiff)). Yön refs sırasından bellidir.
 *
 * Atama iki aşamada:
 *   a) Refs aralığındaki boşluklar (refFirst.idx < idx < refLast.idx) interpolation ile,
 *      en yakın ref'in no'suna step × idx farkı eklenerek.
 *   b) Refs aralığı dışındaki boşluklar: maxRefNo + step'ten artarak; önce refs'in sağındaki
 *      idx'ler (sondan), sonra solundakine sarmala (baştan refFirst−1'e kadar).
 *
 * Katlar arası: kat içi tamamlandıktan sonra patternLen = mevcut kattaki vana sayısı.
 *   Her diğer kat için delta = (kat_idx − currentIdx) × patternLen. Geometrik eşleştirilen
 *   vanalara no = sourceNo + delta. Hesaplanan no ≤ 0 olan vana atlanır (aşağıya doğru 1'e
 *   indikten sonra kalan vanalara no girilmez).
 *
 * Örn. zemin + 2 normal kat, her katta 2 daire; aradaki katta 3 ve 4 girip butona basılınca:
 *   alttaki kat → 1, 2;  üstteki kat → 5, 6.
 *
 * Eşleme: en yakın komşu (tolerans 100 cm). Sayaçlar da senkronize edilir.
 */
function _autoAssignByFloorPattern(vana, manager) {
    if (!vana || !manager || !vana.floorId) return;
    const floors = _orderedRealFloors();
    const currentIdx = floors.findIndex(f => f.id === vana.floorId);
    if (currentIdx < 0) return;

    // Sadece basılan çapanın birim tipiyle aynı tipteki çapaları numaralandır.
    // (KONUT için sadece konutlar, OFİS/TİCARİ için sadece kendi tipi.)
    const wantedTipi = vana.birimTipi || 'KONUT';
    const matchTipi = (a) => (a.birimTipi || 'KONUT') === wantedTipi;

    const allHere = _unitAnchorsOnFloor(manager, vana.floorId).filter(matchTipi);
    if (allHere.length === 0) return;

    // Mevcut kattaki vanaları, no'larıyla birlikte indeksle
    const here = allHere.map((v, i) => ({ v, idx: i, no: parseInt(v.birimNo, 10) }));
    const refs = here.filter(h => Number.isFinite(h.no));
    if (refs.length === 0) return;

    // Kat içi step (pozitif). Yön refs sırasından gelir.
    let step = 1;
    if (refs.length >= 2) {
        const first = refs[0];
        const last = refs[refs.length - 1];
        const idxDiff = last.idx - first.idx;
        const noDiff = Math.abs(last.no - first.no);
        if (idxDiff > 0) step = Math.max(1, Math.round(noDiff / idxDiff));
    }

    // 1) Kat içini tamamla
    //   a) refs aralığındaki boşluklara interpolation (en yakın anchor + step)
    //   b) refs aralığı dışındakilere: maxRefNo + step'ten başlayıp sırayla;
    //      önce refs'in sağındaki idx'ler (refLast+1 → son), sonra solundakine sarmala (0 → refFirst−1)
    const refFirst = refs[0];
    const refLast = refs[refs.length - 1];

    for (const h of here) {
        if (Number.isFinite(h.no)) continue;
        if (h.idx <= refFirst.idx || h.idx >= refLast.idx) continue; // dışarıdakini aşama 2'ye bırak
        let anchor = null, bestDist = Infinity;
        for (const r of refs) {
            const d = Math.abs(r.idx - h.idx);
            if (d < bestDist) { bestDist = d; anchor = r; }
        }
        if (!anchor) continue;
        const newN = anchor.no + (h.idx - anchor.idx) * step;
        if (!Number.isFinite(newN) || newN <= 0) continue;
        _applyBirimNoToAnchor(h.v, newN, manager);
        h.no = newN;
    }

    // Aşama 2: refs aralığı dışındaki tüm boş vanalara, maxRefNo + step'ten artarak sarmala
    const maxRefNo = refs.reduce((m, r) => Math.max(m, r.no), -Infinity);
    const outsideEmpty = [];
    for (let i = refLast.idx + 1; i < here.length; i++) {
        if (!Number.isFinite(here[i].no)) outsideEmpty.push(here[i]);
    }
    for (let i = 0; i < refFirst.idx; i++) {
        if (!Number.isFinite(here[i].no)) outsideEmpty.push(here[i]);
    }
    let nextNo = maxRefNo + step;
    for (const h of outsideEmpty) {
        _applyBirimNoToAnchor(h.v, nextNo, manager);
        h.no = nextNo;
        nextNo += step;
    }

    // Mevcut katın dolu vanalarına da apply çağır (sayaç senkronu için)
    for (const r of refs) {
        if (Number.isFinite(r.no)) _applyBirimNoToAnchor(r.v, r.no, manager);
    }

    // 2) Katlar arası: her vana için (kat_idx − currentIdx) × patternLen offset ile
    //    diğer katlardaki en yakın konumlu vanaya ata
    const patternLen = allHere.length;
    const TOL = 100; // cm

    for (let k = 0; k < floors.length; k++) {
        if (k === currentIdx) continue;
        const delta = (k - currentIdx) * patternLen;
        const targets = _unitAnchorsOnFloor(manager, floors[k].id).filter(matchTipi);
        const used = new Set();
        for (const h of here) {
            if (!Number.isFinite(h.no)) continue;
            const newN = h.no + delta;
            if (!Number.isFinite(newN) || newN <= 0) continue;
            let bestIdx = -1, bestDist = Infinity;
            for (let i = 0; i < targets.length; i++) {
                if (used.has(i)) continue;
                const t = targets[i];
                const d = Math.hypot(t.x - h.v.x, t.y - h.v.y);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestIdx >= 0 && bestDist <= TOL) {
                used.add(bestIdx);
                _applyBirimNoToAnchor(targets[bestIdx], newN, manager);
            }
        }
    }

    try { syncBirimState(); invalidateBirimCache(); } catch (e) { console.error(e); }
}

/** P1/P2 koordinat span'ı: değişen siyah, değişmeyen gri */
function _coordSpan(label, changed) {
    return changed
        ? `<span>${label}</span>`
        : `<span style="color:var(--color-secondary)">${label}</span>`;
}

/** Bina kotunu alıp "z:325 (25)" formatı için kat-rölatif z döndür; bulunamazsa null */
function _floorRelZ(zBuilding) {
    const z = Number(zBuilding) || 0;
    const floor = getFloorAtElevation(z);
    if (!floor) return null;
    return Math.round(z - (floor.bottomElevation || 0));
}

/**
 * Borunun tipini bağlantı zincirini geriye takip ederek bulur.
 * Doğrudan sayaca bağlıysa sayaç.birimBoruTipi,
 * servis kutusuna bağlıysa kutu.kutuBoruTipi döner.
 * Ara borular varsa kökü bulana kadar zincirleme gider.
 */
function _getBoruTipi(obj, manager) {
    if (!manager) return 'ÇELİK';
    let current = obj;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        const bag = current.baslangicBaglanti;
        if (!bag?.tip) break;
        if (bag.tip === 'sayac') {
            const sayac = manager.components.find(c => c.id === bag.hedefId);
            return sayac?.birimBoruTipi || 'ÇELİK';
        }
        if (bag.tip === 'servis_kutusu') {
            const kutu = manager.components.find(c => c.id === bag.hedefId);
            return kutu?.kutuBoruTipi || 'ÇELİK';
        }
        if (bag.tip === 'boru') {
            current = manager.pipes.find(p => p.id === bag.hedefId) || null;
            continue;
        }
        break;
    }
    return 'ÇELİK';
}

/** DN65 ve üzeri mi? (Flanş kontrolü) */
function _isDN65Plus(cap) {
    return parseInt((cap || '').replace('DN', '') || '0') >= 65;
}

const _CIHAZ_MIN_DEBI = { OCAK: 1.6, KOMBI: 2.5 };

function _cihazDebiHesapla(obj) {
    const kcal = parseFloat(obj.kapasiteKcal);
    const verim = (parseFloat(obj.verim) || 100) / 100;
    if (isNaN(kcal) || kcal <= 0) return null;
    const raw = kcal / 8250 / verim;
    const min = _CIHAZ_MIN_DEBI[(obj.cihazTipi || '').toUpperCase()] ?? 0;
    return Math.max(raw, min);
}

/**
 * Cihaz model seçimi sonrası kapasite KW + kcal alanlarını günceller ve
 * panel inputlarını senkronlar. Model bilinmiyorsa hiçbir şey yapmaz.
 */
function _applyCihazModelKapasite(obj, panelEl) {
    const kw = getModelKW(obj.cihazTipi, obj.marka, obj.model);
    if (!Number.isFinite(kw)) return;
    obj.kapasiteKW = kw;
    obj.kapasiteKcal = Math.round(kw * 860);
    if (panelEl) {
        const kwEl = panelEl.querySelector('[data-prop-key="kapasiteKW"]');
        if (kwEl) kwEl.value = parseFloat(kw.toFixed(2));
        const kcalEl = panelEl.querySelector('[data-prop-key="kapasiteKcal"]');
        if (kcalEl) kcalEl.value = obj.kapasiteKcal;
        _refreshCihazDebi(obj, panelEl);
    }
}

/** Kapasite/verim değişince debi label'ını günceller. Verim % → /100 dönüşümü yapılır. */
function _refreshCihazDebi(obj, panelEl) {
    const debiSpan = panelEl.querySelector('[data-prop-id="cihazDebi"]');
    if (!debiSpan) return;
    const debi = _cihazDebiHesapla(obj);
    debiSpan.textContent = debi != null ? `${debi.toFixed(2)} m³/h` : '—';
}

// ─── ÖZELLİK TANIMLARI ───────────────────────────────────────────────────────

export const PROPERTY_DEFS = {

    // ════════════════════════════════════════════════════════
    // BORU
    // ════════════════════════════════════════════════════════

    boru_sec_tip: { type: 'section', label: 'Tanım' },

    boruHatNo: {
        label: 'Hat No',
        type: 'readonly',
        readonlyFn: (obj) => {
            const no = window._hatMap?.get(obj.id);
            return no != null ? String(no) : '—';
        },
    },

    boruCap: {
        label: 'Çap',
        type: 'select',
        key: 'boruCap',
        options: (obj, manager) => BORU_CAPLARI[_getBoruTipi(obj, manager)] || BORU_CAPLARI_TUMU,
        default: 'DN25',
    },
    boruTipi: {
        label: 'Tip',
        type: 'readonly',
        readonlyFn: (obj, manager) => _getBoruTipi(obj, manager),
    },

    boru_sec_hesap: { type: 'section', label: 'Hesap Değerleri' },

    boruDebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => (obj.debi != null && obj.debi > 0) ? `${Number(obj.debi).toFixed(2)} m³/h` : '— m³/h',
    },
    boruBasinc: {
        label: 'Basınç',
        type: 'readonly',
        readonlyFn: (obj) => obj.basinc != null ? `${Math.round(Number(obj.basinc))} mbar` : '21 mbar',
    },
    boruHiz: {
        label: 'Hız',
        type: 'readonly',
        readonlyFn: (obj, manager) => {
            const row = getHatRowForPipe(obj, manager);
            if (!row || !Number.isFinite(row.v)) return '—';
            const txt = `${Number(row.v).toFixed(2)} m/s`;
            return row.vWarn
                ? `<span style="color:#ff5252;font-weight:600" title="Limit: ${row.vLimit} m/s — aşıldı">${txt}</span>`
                : txt;
        },
    },
    boruHatBasincKaybi: {
        label: 'Hat Basınç Kaybı',
        type: 'readonly',
        readonlyFn: (obj, manager) => {
            const row = getHatRowForPipe(obj, manager);
            if (!row || row.sumDP == null || !Number.isFinite(row.sumDP)) return '—';
            return `${Number(row.sumDP).toFixed(3)} mbar`;
        },
    },
    boruKumulatifKayip: {
        label: 'Kümülatif Kayıp',
        type: 'readonly',
        readonlyFn: (obj, manager) => {
            const hatNo = window._hatMap?.get(obj.id);
            if (hatNo == null) return '—';
            const sum = getCumulativeLossForHat(hatNo, manager);
            return `${Number(sum).toFixed(3)} mbar`;
        },
    },

    boru_sec_konum: { type: 'section', label: 'Konum' },

    boruUzunluk: {
        label: 'Uzunluk',
        type: 'readonly',
        readonlyFn: (obj) => {
            if (!obj?.p1 || !obj?.p2) return '—';
            const dx = obj.p2.x - obj.p1.x;
            const dy = obj.p2.y - obj.p1.y;
            const dz = (obj.p2.z || 0) - (obj.p1.z || 0);
            return `${Math.round(Math.hypot(dx, dy, dz))} cm`;
        },
    },

    boruP1: {
        label: 'P1',
        type: 'readonly',
        readonlyFn: (obj) => {
            if (!obj.p1 || !obj.p2) return '—';
            const x1 = Math.round(obj.p1.x), x2 = Math.round(obj.p2.x);
            const y1 = Math.round(obj.p1.y), y2 = Math.round(obj.p2.y);
            const z1 = Math.round(obj.p1.z || 0), z2 = Math.round(obj.p2.z || 0);
            const zRel1 = _floorRelZ(obj.p1.z || 0);
            const zLabel1 = zRel1 != null ? `z:${z1} (${zRel1})` : `z:${z1}`;
            return `${_coordSpan('x:' + x1, x1 !== x2)}\u2002${_coordSpan('y:' + y1, y1 !== y2)}\u2002${_coordSpan(zLabel1, z1 !== z2)}`;
        },
    },
    boruP2: {
        label: 'P2',
        type: 'readonly',
        readonlyFn: (obj) => {
            if (!obj.p1 || !obj.p2) return '—';
            const x1 = Math.round(obj.p1.x), x2 = Math.round(obj.p2.x);
            const y1 = Math.round(obj.p1.y), y2 = Math.round(obj.p2.y);
            const z1 = Math.round(obj.p1.z || 0), z2 = Math.round(obj.p2.z || 0);
            const zRel2 = _floorRelZ(obj.p2.z || 0);
            const zLabel2 = zRel2 != null ? `z:${z2} (${zRel2})` : `z:${z2}`;
            return `${_coordSpan('x:' + x2, x1 !== x2)}\u2002${_coordSpan('y:' + y2, y1 !== y2)}\u2002${_coordSpan(zLabel2, z1 !== z2)}`;
        },
    },

    boru_sec_ozellik: { type: 'section', label: 'Özellikler' },

    boruGomulu: {
        label: 'Gömülü Hat',
        type: 'toggle',
        key: 'gomulu',
        default: false,
    },

    boru_sec_urun: { type: 'section', label: 'Ürün' },

    boruMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    boruModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // ════════════════════════════════════════════════════════
    // SAYAÇ
    // ════════════════════════════════════════════════════════

    sayac_sec_tanim: { type: 'section', label: 'Tanım' },

    // Tip + Tür yanyana
    sayac_tiptur: {
        type: 'dual',
        label: 'Tip - Tür',
        fields: [
            {
                type: 'select',
                key: 'sayacTipi',
                options: SAYAC_TIPLERI,
                default: 'G4',
                afterChange: (obj, _manager, panelEl) => {
                    const row = SAYAC_DEBI_TABLOSU.find(r => r.Tip === obj.sayacTipi);
                    if (row) {
                        const turSel = panelEl?.querySelector('[data-prop-key="sayacTuru"]');
                        if (turSel) { obj.sayacTuru = row.Tur; turSel.value = row.Tur; }
                        const capSel = panelEl?.querySelector('[data-prop-key="cikisCap"]');
                        if (capSel) { obj.cikisCap = `DN${row.Cap}`; capSel.value = `DN${row.Cap}`; }
                    }
                },
            },
            {
                type: 'select',
                key: 'sayacTuru',
                options: SAYAC_TURLERI,
                default: 'KÖRÜKLÜ',
            },
        ],
    },

    // Çap + Basınç yanyana
    sayac_capbasinc: {
        type: 'dual',
        label: 'Çap - Basınç',
        fields: [
            {
                type: 'select',
                key: 'cikisCap',
                options: (obj, manager) => {
                    if (manager && obj.cikisBagliBoruId) {
                        const boru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
                        if (boru?.boruTipi) return BORU_CAPLARI[boru.boruTipi] || BORU_CAPLARI_TUMU;
                    }
                    return BORU_CAPLARI_TUMU;
                },
                default: 'DN25',
            },
            {
                type: 'select',
                key: 'basinc',
                options: KUTU_BASINCLAR,
                default: '21',
                disabledFn: (obj, manager) => {
                    if (!manager) return false;
                    // Sayaç sonrası iç tesisatta regülatör varsa, sayaç basıncı manuel
                    // ayarlanabilmeli (regülatör girişi 300, çıkışı 21 gibi senaryolar için).
                    if (_hasRegulatorDownstreamOfMeter(obj, manager)) return false;
                    return manager.components.some(c => c.type === 'servis_kutusu');
                },
                afterChange: (obj, manager) => {
                    if (!manager) return;
                    const isCanliHat = !manager.components.some(c => c.type === 'servis_kutusu');
                    // Sayaç basıncı manuel olarak 300'e çekildiyse, upstream kaynağı
                    // de 300'e yükselt — aksi takdirde recompute kolonu 21'de tutar
                    // ve sayaç girişi/çıkışı arasında fiziksel olmayan bir basınç farkı oluşur.
                    //  - Normal mod: tüm servis_kutusu.kutuBasinc='300'
                    //  - CANLI HAT (servis_kutusu yok): fleksBaglanti.boruId zincirini 300'e çek
                    if (obj?.basinc === '300') {
                        if (isCanliHat) {
                            _setMeterUpstreamPressure(obj, manager, 300);
                        } else {
                            manager.components.forEach(c => {
                                if (c.type === 'servis_kutusu' && c.kutuBasinc !== '300') {
                                    c.kutuBasinc = '300';
                                }
                            });
                        }
                    } else if (obj?.basinc === '21' && isCanliHat) {
                        // CANLI HAT'ta 21'e dönüş: zincir önce 300 yapılmıştı, geri çek
                        // (sayaç öncesi regülatör YOKSA — varsa propagateRegulatorsUpstream
                        //  zaten 300'e zorlar ve burada 21 yazsak da recompute geri 300 yapar)
                        _setMeterUpstreamPressure(obj, manager, 21);
                    }
                    recomputeAllPressures(manager);
                },
            },
        ],
    },

    sayacdebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.sayacdebi != null ? `${Number(obj.sayacdebi).toFixed(2)} m³/h` : '3.50 m³/h',
    },
    sayacMinDebi: {
        label: 'Min Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.minDebi != null ? `${Number(obj.minDebi).toFixed(2)} m³/h` : '0.04 m³/h',
    },
    sayacMaxDebi: {
        label: 'Max Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.maxDebi != null ? `${Number(obj.maxDebi).toFixed(2)} m³/h` : '6.00 m³/h',
    },

    sayac_sec_birim: { type: 'section', label: 'Birim' },

    // Birim Tipi + No yanyana
    sayac_birimtipi_no: {
        type: 'dual',
        label: 'Birim Tipi - No',
        fields: [
            {
                type: 'select',
                key: 'birimTipi',
                options: BIRIM_TIPLERI,
                default: 'KONUT',
                placeholder: '— seçiniz —',
                flex: 2,
            },
            {
                type: 'text',
                key: 'birimNo',
                default: '',
                placeholder: 'No...',
                flex: 1,
                inlineButtons: [
                    {
                        label: '⇅',
                        title: 'Aynı birim tipindeki tüm vana ve sayaçları (kat içi + diğer katlar) otomatik numaralandır.',
                        onClick: (obj, manager) => _autoAssignByFloorPattern(obj, manager),
                    },
                ],
            },
        ],
    },

    // Boru bağlantısı: kombine select (birimBoruTipi + birimBaglantiTipi)
    sayac_borubag: {
        label: 'Boru Bağlantısı',
        type: 'select',
        key: 'borubag',
        valueFn: (obj) => {
            if (obj.birimBoruTipi === 'ESNEK') return 'ESNEK';
            if (obj.birimBaglantiTipi === 'DİŞLİ') return 'DİŞLİ_ÇELİK';
            return 'KAYNAKLI_ÇELİK';
        },
        // relatedFields: defaults for underlying real keys
        relatedFields: [
            { key: 'birimBoruTipi', default: 'ÇELİK' },
            { key: 'birimBaglantiTipi', default: 'KAYNAKLI' },
        ],
        options: [
            { value: 'DİŞLİ_ÇELİK', label: 'Dişli Tesisat (Çelik)' },
            { value: 'KAYNAKLI_ÇELİK', label: 'Kaynaklı Tesisat (Çelik)' },
            { value: 'ESNEK', label: 'Esnek Tesisat' },
        ],
        optionsAreObjects: true,
        afterChange: (obj, _manager, panelEl) => {
            const val = obj.borubag;
            if (val === 'ESNEK') {
                obj.birimBoruTipi = 'ESNEK';
                obj.birimBaglantiTipi = '';
            } else if (val === 'DİŞLİ_ÇELİK') {
                obj.birimBoruTipi = 'ÇELİK';
                obj.birimBaglantiTipi = 'DİŞLİ';
            } else {
                obj.birimBoruTipi = 'ÇELİK';
                obj.birimBaglantiTipi = 'KAYNAKLI';
            }
            // Re-render panel so esnekMarka row appears/disappears
            if (panelEl?._refresh) panelEl._refresh();
        },
    },

    sayacEsnekMarka: {
        label: 'Esnek Marka',
        type: 'select',
        key: 'esnekMarka',
        options: ESNEK_BORU_MARKALARI,
        placeholder: '— seçiniz —',
        default: '',
        visibleFn: (obj) => obj.birimBoruTipi === 'ESNEK',
    },

    // Tekil tanımlar — sayaç panelinde her seçim ayrı satırda görünür
    sayacTipi: {
        label: 'Tip', type: 'select', key: 'sayacTipi',
        options: SAYAC_TIPLERI, default: 'G4',
        afterChange: (obj, _manager, panelEl) => {
            const row = SAYAC_DEBI_TABLOSU.find(r => r.Tip === obj.sayacTipi);
            if (row) {
                const turSel = panelEl?.querySelector('[data-prop-key="sayacTuru"]');
                if (turSel) { obj.sayacTuru = row.Tur; turSel.value = row.Tur; }
                const capSel = panelEl?.querySelector('[data-prop-key="cikisCap"]');
                if (capSel) { obj.cikisCap = `DN${row.Cap}`; capSel.value = `DN${row.Cap}`; }
            }
        },
    },
    sayacTuru: {
        label: 'Tür', type: 'select', key: 'sayacTuru',
        options: SAYAC_TURLERI, default: 'KÖRÜKLÜ',
    },
    sayacCikisCap: {
        label: 'Çıkış Çapı', type: 'select', key: 'cikisCap',
        options: (obj, manager) => {
            if (manager && obj.cikisBagliBoruId) {
                const boru = manager.pipes.find(p => p.id === obj.cikisBagliBoruId);
                if (boru?.boruTipi) return BORU_CAPLARI[boru.boruTipi] || BORU_CAPLARI_TUMU;
            }
            return BORU_CAPLARI_TUMU;
        },
        default: 'DN25',
    },
    sayacBasinc: {
        label: 'Basınç', type: 'select', key: 'basinc',
        options: KUTU_BASINCLAR, default: '21',
        disabledFn: (obj, manager) => {
            if (!manager) return false;
            if (_hasRegulatorDownstreamOfMeter(obj, manager)) return false;
            return manager.components.some(c => c.type === 'servis_kutusu');
        },
        afterChange: (obj, manager) => {
            if (!manager) return;
            const isCanliHat = !manager.components.some(c => c.type === 'servis_kutusu');
            if (obj?.basinc === '300') {
                if (isCanliHat) {
                    _setMeterUpstreamPressure(obj, manager, 300);
                } else {
                    manager.components.forEach(c => {
                        if (c.type === 'servis_kutusu' && c.kutuBasinc !== '300') {
                            c.kutuBasinc = '300';
                        }
                    });
                }
            } else if (obj?.basinc === '21' && isCanliHat) {
                _setMeterUpstreamPressure(obj, manager, 21);
            }
            recomputeAllPressures(manager);
        },
    },
    sayacBirimTipi: {
        label: 'Birim Tipi', type: 'select', key: 'birimTipi',
        options: BIRIM_TIPLERI, default: 'KONUT', placeholder: '— seçiniz —',
        afterChange: () => { syncBirimState(); invalidateBirimCache(); },
    },
    sayacBirimNo: {
        label: 'Birim No', type: 'text', key: 'birimNo',
        default: '', placeholder: 'Birim no...',
        afterChange: () => { syncBirimState(); invalidateBirimCache(); },
        inlineButtons: [
            {
                label: '⇅',
                title: 'Aynı birim tipindeki tüm vana ve sayaçları (kat içi + diğer katlar) otomatik numaralandır.',
                onClick: (obj, manager) => _autoAssignByFloorPattern(obj, manager),
            },
        ],
    },
    sayacBirimBoruTipi: {
        label: 'Boru Tipi', type: 'select', key: 'birimBoruTipi',
        options: BORU_TIPLERI, default: 'ÇELİK',
    },
    sayacBirimBaglantiTipi: {
        label: 'Bağlantı Tipi', type: 'select', key: 'birimBaglantiTipi',
        options: BAGLANTI_TIPLERI, default: 'KAYNAKLI',
    },

    sayac_sec_ozellik: { type: 'section', label: 'Özellikler' },

    sayacMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },

    sayac_sec_abone_usta: { type: 'section', label: 'Abone - Usta Bilgileri' },

    // Abone adı + no yanyana, etiketsiz
    sayac_abone_row: {
        type: 'dual',
        noLabel: true,
        fields: [
            { type: 'text', key: 'aboneAdi', default: '', placeholder: 'Abone Adı...' },
            { type: 'text', key: 'aboneNo', default: '', placeholder: 'Abone No...' },
        ],
    },

    // Usta adı + no yanyana, etiketsiz
    sayac_usta_row: {
        type: 'dual',
        noLabel: true,
        fields: [
            { type: 'text', key: 'ustaAdi', default: '', placeholder: 'Usta Adı...' },
            { type: 'text', key: 'ustaNo', default: '', placeholder: 'Sicil No...' },
        ],
    },

    // Eski tekil abone/usta tanımları (başka nesnelerde kullanılabilir)
    sayac_sec_abone: { type: 'section', label: 'Abone Bilgileri' },
    sayacAboneAdi: { label: 'Abone Adı', type: 'text', key: 'aboneAdi', default: '', placeholder: 'Ad Soyad...' },
    sayacAboneNo: { label: 'Abone No', type: 'text', key: 'aboneNo', default: '', placeholder: 'Abone numarası...' },
    sayac_sec_yapan: { type: 'section', label: 'Yapan' },
    sayacUstaAdi: { label: 'Usta Adı', type: 'text', key: 'ustaAdi', default: '', placeholder: 'Usta adı...' },
    sayacUstaNo: { label: 'Usta No', type: 'text', key: 'ustaNo', default: '', placeholder: 'Usta sicil no...' },

    // ════════════════════════════════════════════════════════
    // VANA
    // ════════════════════════════════════════════════════════

    vana_sec_tanim: { type: 'section', label: 'Tanım' },

    vanaTipi: {
        label: 'Tip',
        type: 'select',
        key: 'vanaTipi',
        options: VANA_TIPLERI_LISTESI.map(id => ({ value: id, label: VANA_TIP_ETIKETLERI[id] || id })),
        default: 'BRANSMAN',
        optionsAreObjects: true,
    },
    vanaCap: {
        label: 'Çap',
        type: 'select',
        key: 'vanaCap',
        options: (obj, manager) => {
            if (manager && obj.bagliBoruId) {
                const boru = manager.pipes.find(p => p.id === obj.bagliBoruId);
                if (boru?.boruTipi) return BORU_CAPLARI[boru.boruTipi] || BORU_CAPLARI_TUMU;
            }
            return BORU_CAPLARI_TUMU;
        },
        default: 'DN25',
        afterChange: (obj, _manager, panelEl) => {
            const isDN65 = _isDN65Plus(obj.vanaCap);
            const cb = panelEl?.querySelector('[data-prop-key="flans"]');
            if (cb) {
                cb.disabled = !isDN65;
                // DN65 altına düşünce flanşı kapat
                if (!isDN65 && obj.flans) {
                    obj.flans = false;
                    cb.checked = false;
                }
                // Toggle görselini de güncelle
                const wrapper = cb.closest('.props-toggle');
                if (wrapper) {
                    if (!isDN65) wrapper.classList.add('props-toggle-disabled');
                    else wrapper.classList.remove('props-toggle-disabled');
                }
            }
        },
    },

    vana_sec_ozellik: { type: 'section', label: 'Özellikler' },

    vanaIzolator: {
        label: 'İzolatör',
        type: 'toggle',
        key: 'izolator',
        default: false,
        visibleFn: (obj) => obj.vanaTipi === 'CIHAZ',
    },
    vanaFlans: {
        label: 'Flanş',
        type: 'toggle',
        key: 'flans',
        default: false,
        disabledFn: (obj) => !_isDN65Plus(obj.vanaCap),
    },
    vanaMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },

    vana_sec_birim: {
        type: 'section',
        label: 'Birim',
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN',
    },

    vanaBirimTipi: {
        label: 'Birim Tipi',
        type: 'select',
        key: 'birimTipi',
        options: BIRIM_TIPLERI,
        default: 'KONUT',
        placeholder: '— seçiniz —',
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN',
        afterChange: (obj, manager, panelEl) => {
            if (obj.ilerdeKullanim) {
                _updateIlerdeBirimNo(obj);
                if (panelEl?._refresh) panelEl._refresh();
            }
        },
    },

    vanaIlerdeKullanim: {
        label: 'İlerde Kullanım Amacıyla',
        type: 'toggle',
        key: 'ilerdeKullanim',
        default: false,
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN',
        afterChange: (obj, manager, panelEl) => {
            if (obj.ilerdeKullanim) {
                if (!obj.birimSayisi) obj.birimSayisi = '1';
                _updateIlerdeBirimNo(obj);
            } else {
                // Kapatılınca ilerde kullanım için yazılmış "N daire/ofis…"
                // birim no'su temizlenir; alan boş hale gelsin.
                obj.birimNo = '';
            }
            if (panelEl?._refresh) panelEl._refresh();
            if (manager) recomputeAllPressures(manager);
        },
    },

    vanaBirimSayisi: {
        label: 'Birim Sayısı',
        type: 'select',
        key: 'birimSayisi',
        options: Array.from({ length: 20 }, (_, i) => String(i + 1)),
        default: '1',
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN' && !!obj.ilerdeKullanim,
        afterChange: (obj, manager, panelEl) => {
            _updateIlerdeBirimNo(obj);
            if (panelEl?._refresh) panelEl._refresh();
            if (manager) recomputeAllPressures(manager);
        },
    },

    vanaBirimNo: {
        label: 'Birim No',
        type: 'text',
        key: 'birimNo',
        default: '',
        placeholder: 'No...',
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN',
        disabledFn: (obj) => !!obj.ilerdeKullanim,
        inlineButtons: [
            {
                label: '⇅',
                title: 'Önce kat içindeki boş vanaları, sonra alt/üst katları geometrik konuma göre otomatik doldur (sayaçlar dahil).',
                disabledFn: (obj) => !!obj.ilerdeKullanim,
                onClick: (obj, manager) => _autoAssignByFloorPattern(obj, manager),
            },
        ],
    },

    // YANBINA ek bilgiler
    vanaTesisatNo: {
        label: 'Tesisat No',
        type: 'text',
        key: 'tesisatNo',
        default: '',
        placeholder: 'Tesisat no...',
        visibleFn: (obj) => obj.vanaTipi === 'YANBINA',
    },
    vanaDaireSayisi: {
        label: 'Daire Sayısı',
        type: 'text',
        key: 'daireSayisi',
        default: '0',
        placeholder: '0',
        inputType: 'number',
        precision: 0,
        visibleFn: (obj) => obj.vanaTipi === 'YANBINA',
    },
    vanaDukkanSayisi: {
        label: 'Dükkan Sayısı',
        type: 'text',
        key: 'dukkanSayisi',
        default: '0',
        placeholder: '0',
        inputType: 'number',
        precision: 0,
        visibleFn: (obj) => obj.vanaTipi === 'YANBINA',
    },
    vanaEkDebi: {
        label: 'Ek Debi (m³/h)',
        type: 'text',
        key: 'ekDebi',
        default: '0',
        placeholder: '0.00',
        inputType: 'number',
        precision: 2,
        visibleFn: (obj) => obj.vanaTipi === 'YANBINA',
    },
    vanaYanBinaToplam: {
        label: 'Toplam Debi',
        type: 'readonly',
        readonlyFn: (obj) => {
            const n = (parseFloat(obj.daireSayisi) || 0) + (parseFloat(obj.dukkanSayisi) || 0);
            const ek = parseFloat(obj.ekDebi) || 0;
            const faktorlu = n > 0 ? getCizelge6Debi(n, 0, true) : 0;
            const toplam = faktorlu + ek;
            return `${toplam.toFixed(2)} m³/h`;
        },
        visibleFn: (obj) => obj.vanaTipi === 'YANBINA',
    },

    vana_sec_hesap: { type: 'section', label: 'Hesap Değerleri' },

    vanaBransmanDebi: {
        label: 'Debi (m³/h)',
        type: 'text',
        inputType: 'number',
        key: 'bransmanDebi',
        default: '3.5',
        placeholder: '3.50',
        precision: 2,
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN' && !obj.ilerdeKullanim,
        afterChange: (obj, manager) => {
            if (!manager || !obj.bagliBoruId) return;
            const debi = parseFloat(obj.bransmanDebi) || 0;
            const pipe = manager.pipes.find(p => p.id === obj.bagliBoruId);
            if (pipe) pipe.debi = debi;
        },
    },
    vanaBransmanIlerdeToplam: {
        label: 'Toplam Debi',
        type: 'readonly',
        readonlyFn: (obj) => {
            const n = parseInt(obj.birimSayisi, 10) || 0;
            const debi = n > 0 ? getCizelge6Debi(n, 0, true) : 0;
            return `${debi.toFixed(2)} m³/h`;
        },
        visibleFn: (obj) => obj.vanaTipi === 'BRANSMAN' && !!obj.ilerdeKullanim,
    },
    vanaDebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.debi != null ? `${Number(obj.debi).toFixed(2)} m³/h` : '— m³/h',
        visibleFn: (obj) => obj.vanaTipi !== 'BRANSMAN',
    },
    vanaBasinc: {
        label: 'Basınç',
        type: 'readonly',
        readonlyFn: (obj) => obj.basinc != null ? `${Math.round(Number(obj.basinc))} mbar` : '21 mbar',
    },
    vanaBasincKaybi: {
        label: 'Basınç Kaybı',
        type: 'readonly',
        readonlyFn: (obj) => obj.basincKaybi != null ? `${Number(obj.basincKaybi).toFixed(3)} mbar` : '0.500 mbar',
    },

    vana_sec_urun: { type: 'section', label: 'Ürün' },

    vanaMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    vanaModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // ════════════════════════════════════════════════════════
    // REGÜLATÖR
    // ════════════════════════════════════════════════════════

    regulator_sec_tanim: { type: 'section', label: 'Tanım' },

    regulatorCikisBasinc: {
        label: 'Çıkış Basıncı',
        type: 'select',
        key: 'cikisBasinc',
        options: [
            { value: '21', label: '21 mbar' },
            { value: '50', label: '50 mbar' },
        ],
        optionsAreObjects: true,
        default: '21',
        afterChange: (_obj, manager) => {
            if (manager) recomputeAllPressures(manager);
        },
    },

    regulatorShutOff: {
        label: 'Shut-Off',
        type: 'toggle',
        key: 'shutOff',
        default: true,
    },
    regulatorGirisVana: {
        label: 'Giriş Vanası',
        type: 'toggle',
        key: 'girisVana',
        default: true,
        afterChange: (obj, manager) => {
            if (manager) ensureRegulatorAccessories(manager, obj);
        },
    },
    regulatorGirisManometre: {
        label: 'Giriş Manometresi',
        type: 'toggle',
        key: 'girisManometre',
        default: true,
        afterChange: (obj, manager) => {
            if (manager) ensureRegulatorAccessories(manager, obj);
        },
    },
    regulatorCikisManometre: {
        label: 'Çıkış Manometresi',
        type: 'toggle',
        key: 'cikisManometre',
        default: true,
        afterChange: (obj, manager) => {
            if (manager) ensureRegulatorAccessories(manager, obj);
        },
    },
    regulatorCikisVana: {
        label: 'Çıkış Vanası',
        type: 'toggle',
        key: 'cikisVana',
        default: true,
        afterChange: (obj, manager) => {
            if (manager) ensureRegulatorAccessories(manager, obj);
        },
    },
    regulatorMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },

    regulator_sec_urun: { type: 'section', label: 'Ürün' },

    regulatorMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: 'ESKA',
        placeholder: 'Marka...',
    },
    regulatorModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: 'ERG',
        placeholder: 'Model...',
    },

    // ════════════════════════════════════════════════════════
    // TESİSAT AKSESUARLARI (Filtre / İzolasyon Flanşı / Kompansatör / Manometre)
    // ════════════════════════════════════════════════════════

    // FİLTRE
    filtre_sec_tanim: { type: 'section', label: 'Tanım' },
    filtreKonik: {
        label: 'Konik',
        type: 'toggle',
        key: 'konik',
        default: false,
    },
    filtreMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },
    filtre_sec_urun: { type: 'section', label: 'Ürün' },
    filtreMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    filtreModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // İZOLASYON FLANŞI
    izolasyon_sec_urun: { type: 'section', label: 'Ürün' },
    izolasyonMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    izolasyonModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // KOMPANSATÖR
    kompansator_sec_urun: { type: 'section', label: 'Ürün' },
    kompansatorMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    kompansatorModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // TOPRAKLAMA
    topraklama_sec_tanim: { type: 'section', label: 'Tanım' },
    topraklamaYontemi: {
        label: 'Topraklama Yöntemi',
        type: 'select',
        key: 'topraklamaYontemi',
        options: TOPRAKLAMA_YONTEMLERI,
        default: TOPRAKLAMA_YONTEMLERI[0],
    },
    topraklama_sec_urun: { type: 'section', label: 'Ürün' },
    topraklamaMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    topraklamaModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // MANOMETRE
    manometre_sec_tanim: { type: 'section', label: 'Tanım' },
    manometreMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },
    manometre_sec_urun: { type: 'section', label: 'Ürün' },
    manometreMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: '',
        placeholder: 'Marka...',
    },
    manometreModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: '',
        placeholder: 'Model...',
    },

    // ════════════════════════════════════════════════════════
    // SERVİS KUTUSU
    // ════════════════════════════════════════════════════════

    kutu_sec_tanim: { type: 'section', label: 'Tanım' },

    kutuTipi: {
        label: 'Kutu Tipi',
        type: 'select',
        key: 'kutuTipi',
        options: SERVIS_KUTUSU_TIPLERI,
        default: 'S200',
    },
    kutuBasinc: {
        label: 'Kutu Basıncı',
        type: 'select',
        key: 'kutuBasinc',
        options: KUTU_BASINCLAR,
        default: '21',
        afterChange: (obj, manager) => {
            if (!manager) return;
            // Sayaçların basıncı recomputeAllPressures içinde upstream zincirinden
            // türetilir; tüm sayaçları kutu basıncına eşitlemek regülatör sonrası
            // sayaçları yanlış değerle bırakır.
            recomputeAllPressures(manager);
        },
    },
    kutuCikisYonu: {
        label: 'Çıkış Yönü',
        type: 'select',
        key: 'cikisYonu',
        options: CIKIS_YONLERI,
        optionsAreObjects: true,
        default: 'sag',
        afterChange: (obj) => {
            if (typeof obj.setCikisYonu === 'function') obj.setCikisYonu(obj.cikisYonu);
        },
    },
    kutuCikisCap: {
        label: 'Çıkış Çapı',
        type: 'select',
        key: 'cikisCap',
        options: BORU_CAPLARI_TUMU,
        default: 'DN32',
    },
    kutuBoruTipi: {
        label: 'Boru Tipi',
        type: 'select',
        key: 'kutuBoruTipi',
        options: BORU_TIPLERI,
        default: 'ÇELİK',
        disabled: true,
    },
    kutuBaglantiTipi: {
        label: 'Bağlantı Tipi',
        type: 'select',
        key: 'kutuBaglantiTipi',
        options: BAGLANTI_TIPLERI,
        default: 'KAYNAKLI',
        disabled: true,
    },
    kutuCikisKotu: {
        label: 'Çıkış Kotu (cm)',
        type: 'text',
        inputType: 'number',
        key: 'z', // Teknik olarak nesnenin Z koordinatını kontrol eder
        default: 1,
        precision: 1,
        afterChange: (obj, manager) => {
            if (!manager || !obj) return;

            const newZ = parseFloat(obj.z);
            if (isNaN(newZ)) return;

            // Kutunun bağlı olduğu tüm boruları tara
            manager.pipes.forEach(pipe => {
                // Borunun başlangıcı (p1) bu kutuya mı bağlı?
                if (pipe.baslangicBaglanti?.tip === 'servis_kutusu' && pipe.baslangicBaglanti.hedefId === obj.id) {
                    // Node koordinatını güncelle (bu sayede 3D render boruyu yeni yerde çizer)
                    pipe.p1.z = newZ;
                    // Eğer boru dikey değilse etiket pozisyonunu sıfırla
                    if (typeof manager.interactionManager?.clearLabelAutoPos === 'function') {
                        manager.interactionManager.clearLabelAutoPos(pipe.id);
                    }
                }

                // Borunun bitişi (p2) bu kutuya mı bağlı?
                if (pipe.bitisBaglanti?.tip === 'servis_kutusu' && pipe.bitisBaglanti.hedefId === obj.id) {
                    pipe.p2.z = newZ;
                    if (typeof manager.interactionManager?.clearLabelAutoPos === 'function') {
                        manager.interactionManager.clearLabelAutoPos(pipe.id);
                    }
                }
            });

            // Değişiklikleri kaydet ve tüm sahneyi (2D/3D) yeniden çiz
            if (typeof manager.saveToState === 'function') {
                manager.saveToState();
            }

            // 3D sahnenin anlık güncellenmesi için (eğer varsa)
            if (window.update3DScene) {
                window.update3DScene();
            }
        }
    },
    // Kombine boru bağlantısı (kutuBoruTipi + kutuBaglantiTipi)
    kutu_borubag: {
        label: 'Boru Bağlantısı',
        type: 'select',
        key: 'kutuBorubag',
        valueFn: (obj) => {
            if (obj.kutuBoruTipi === 'ESNEK') return 'ESNEK';
            if (obj.kutuBaglantiTipi === 'DİŞLİ') return 'DİŞLİ_ÇELİK';
            return 'KAYNAKLI_ÇELİK';
        },
        relatedFields: [
            { key: 'kutuBoruTipi', default: 'ÇELİK' },
            { key: 'kutuBaglantiTipi', default: 'KAYNAKLI' },
        ],
        options: [
            { value: 'DİŞLİ_ÇELİK', label: 'Dişli Tesisat (Çelik)' },
            { value: 'KAYNAKLI_ÇELİK', label: 'Kaynaklı Tesisat (Çelik)' },
            { value: 'ESNEK', label: 'Esnek Tesisat' },
        ],
        optionsAreObjects: true,
        afterChange: (obj) => {
            const val = obj.kutuBorubag;
            if (val === 'ESNEK') {
                obj.kutuBoruTipi = 'ESNEK';
                obj.kutuBaglantiTipi = '';
            } else if (val === 'DİŞLİ_ÇELİK') {
                obj.kutuBoruTipi = 'ÇELİK';
                obj.kutuBaglantiTipi = 'DİŞLİ';
            } else {
                obj.kutuBoruTipi = 'ÇELİK';
                obj.kutuBaglantiTipi = 'KAYNAKLI';
            }
        },
    },

    // ════════════════════════════════════════════════════════
    // CİHAZ — ORTAK
    // ════════════════════════════════════════════════════════

    cihazDebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => {
            const debi = _cihazDebiHesapla(obj);
            return debi != null ? `${debi.toFixed(2)} m³/h` : '—';
        },
    },

    // Sayaç debi çubuğu — min/mevcut/max görseli
    sayacDebiCubugu: {
        type: 'bar',
        barFn: (obj, manager) => {
            const { minDebi, maxDebi } = _getSayacLimits(obj);
            const minD = minDebi;
            const maxD = maxDebi;
            const raw = _sumDebiAfterSayac(obj, manager);
            // Boru bağlı değilse 3.5 m³/h referans değeri göster
            const curD = raw > 0 ? raw : Math.min(3.5, maxD * 0.9);

            let pct;
            if (curD <= maxD) {
                // Normal aralık: lineer [0,100]
                const range = maxD - minD || 1;
                pct = ((curD - minD) / range) * 100;
                pct = Math.max(1, Math.min(100, pct));
            } else {
                // Max aşıldı: logaritmik ölçek, max noktası en fazla %50'de
                // maxD noktası %50'ye yerleşir, fazlası log(curD/maxD) ile uzar
                // Toplam [50,100] aralığına sıkıştırılır
                const logRatio = Math.log(curD / maxD) / Math.log(100); // 0..1+ range
                const overflow = Math.min(logRatio, 1.0); // üst limit
                pct = 50 + overflow * 50; // 50..100 arası
                pct = Math.min(99, pct);
            }

            const pctStr = pct.toFixed(1);
            const isOver = curD > maxD;
            // max debi ok'u: overflow varsa %50'ye sabitlenir
            const maxPct = isOver ? '50' : '100';

            return `
<div class="debi-bar">
  <div class="debi-track">
    <span class="debi-label-cur" style="left:${pctStr}%">${raw > 0 ? `debi<br>${curD.toFixed(2)} m³/h` : `<span style="opacity:.5">—</span><br>${curD.toFixed(2)} m³/h`}</span>
    <span class="debi-arrow debi-arrow-end" style="left:0%">▽</span>
    <span class="debi-arrow debi-arrow-cur${isOver ? ' debi-over' : ''}" style="left:${pctStr}%">▽</span>
    <span class="debi-arrow debi-arrow-end" style="left:${maxPct}%">▽</span>
  </div>
  <div class="debi-minmax">
    <span>min debi<br>${minD.toFixed(2)} m³/h</span>
    <span>max. debi<br>${maxD.toFixed(2)} m³/h</span>
  </div>
</div>`;
        },
    },

    // ════════════════════════════════════════════════════════
    // CİHAZ — KOMBİ
    // ════════════════════════════════════════════════════════

    kombi_sec_kapasite: { type: 'section', label: 'Kapasite' },

    kombiKapasiteKcal: {
        label: 'Kapasite (Kcal/h)',
        type: 'text',
        inputType: 'number',
        step: '100',
        min: '0',
        key: 'kapasiteKcal',
        default: '20640',
        placeholder: 'kcal/h',
        precision: 0,
        afterChange: (obj, _manager, panelEl) => {
            const kcal = parseFloat(obj.kapasiteKcal);
            if (!isNaN(kcal)) {
                obj.kapasiteKW = parseFloat((kcal / 860).toFixed(2));
                const kwEl = panelEl.querySelector('[data-prop-key="kapasiteKW"]');
                if (kwEl) kwEl.value = obj.kapasiteKW;
            }
            _refreshCihazDebi(obj, panelEl);
        },
    },
    kombiKapasiteKW: {
        label: 'Kapasite (kW)',
        type: 'text',
        inputType: 'number',
        step: '1',
        min: '0',
        key: 'kapasiteKW',
        default: '24',
        placeholder: 'kW',
        precision: 2,
        afterChange: (obj, _manager, panelEl) => {
            const kw = parseFloat(obj.kapasiteKW);
            if (!isNaN(kw)) {
                obj.kapasiteKcal = Math.round(kw * 860);
                const kcalEl = panelEl.querySelector('[data-prop-key="kapasiteKcal"]');
                if (kcalEl) kcalEl.value = obj.kapasiteKcal;
            }
            _refreshCihazDebi(obj, panelEl);
        },
    },
    kombiVerim: {
        label: 'Verim (%)',
        type: 'text',
        inputType: 'number',
        step: '1',
        min: '0',
        max: '100',
        key: 'verim',
        default: '100',
        placeholder: '%',
        precision: 0,
        afterChange: (obj, _manager, panelEl) => _refreshCihazDebi(obj, panelEl),
    },

    kombi_sec_urun: { type: 'section', label: 'Ürün' },

    kombiMarka: {
        label: 'Marka',
        type: 'select',
        key: 'marka',
        options: (obj) => getMarkaList('KOMBI', obj?.marka || ''),
        placeholder: 'Marka seçin...',
        afterChange: (obj, _manager, panelEl) => {
            // Marka değişince eski model artık geçersiz — temizle, panel yenilensin
            obj.model = '';
            if (panelEl?._refresh) panelEl._refresh();
        },
    },
    kombiModel: {
        label: 'Model',
        type: 'select',
        key: 'model',
        options: (obj) => getModelList('KOMBI', obj?.marka, obj?.model || ''),
        placeholder: 'Model seçin...',
        disabledFn: (obj) => !obj?.marka,
        afterChange: (obj, _manager, panelEl) => _applyCihazModelKapasite(obj, panelEl),
    },
    kombiBacaTipi: {
        label: 'Baca Tipi',
        type: 'select',
        key: 'bacaTipi',
        options: BACA_TIPLERI,
        default: 'Hermetik',
    },

    kombi_sec_ozellik: { type: 'section', label: 'Özellikler' },

    kombiMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },
    kombiYedekCihaz: {
        label: 'Yedek Cihaz',
        type: 'toggle',
        key: 'yedekCihaz',
        default: false,
    },
    kombiYogusmali: {
        label: 'Yoğuşmalı',
        type: 'toggle',
        key: 'yogusmali',
        default: true,
    },

    // ════════════════════════════════════════════════════════
    // CİHAZ — OCAK
    // ════════════════════════════════════════════════════════

    ocak_sec_kapasite: { type: 'section', label: 'Kapasite' },

    ocakKapasiteKcal: {
        label: 'Kapasite (Kcal/h)',
        type: 'text',
        inputType: 'number',
        step: '100',
        min: '0',
        key: 'kapasiteKcal',
        default: '13200',
        placeholder: 'kcal/h',
        precision: 0,
        afterChange: (obj, _manager, panelEl) => {
            const kcal = parseFloat(obj.kapasiteKcal);
            if (!isNaN(kcal)) {
                obj.kapasiteKW = parseFloat((kcal / 860).toFixed(2));
                const kwEl = panelEl.querySelector('[data-prop-key="kapasiteKW"]');
                if (kwEl) kwEl.value = obj.kapasiteKW;
            }
            _refreshCihazDebi(obj, panelEl);
        },
    },
    ocakKapasiteKW: {
        label: 'Kapasite (kW)',
        type: 'text',
        inputType: 'number',
        step: '1',
        min: '0',
        key: 'kapasiteKW',
        default: '15.35',
        placeholder: 'kW',
        precision: 2,
        afterChange: (obj, _manager, panelEl) => {
            const kw = parseFloat(obj.kapasiteKW);
            if (!isNaN(kw)) {
                obj.kapasiteKcal = Math.round(kw * 860);
                const kcalEl = panelEl.querySelector('[data-prop-key="kapasiteKcal"]');
                if (kcalEl) kcalEl.value = obj.kapasiteKcal;
            }
            _refreshCihazDebi(obj, panelEl);
        },
    },
    ocakVerim: {
        label: 'Verim (%)',
        type: 'text',
        inputType: 'number',
        step: '1',
        min: '0',
        max: '100',
        key: 'verim',
        default: '100',
        placeholder: '%',
        precision: 0,
        disabled: true,
    },

    ocak_sec_urun: { type: 'section', label: 'Ürün' },

    ocakMarka: {
        label: 'Marka',
        type: 'select',
        key: 'marka',
        options: (obj) => getMarkaList('OCAK', obj?.marka || ''),
        placeholder: 'Marka seçin...',
        afterChange: (obj, _manager, panelEl) => {
            obj.model = '';
            if (panelEl?._refresh) panelEl._refresh();
        },
    },
    ocakModel: {
        label: 'Model',
        type: 'select',
        key: 'model',
        options: (obj) => getModelList('OCAK', obj?.marka, obj?.model || ''),
        placeholder: 'Model seçin...',
        disabledFn: (obj) => !obj?.marka,
        afterChange: (obj, _manager, panelEl) => _applyCihazModelKapasite(obj, panelEl),
    },
    ocakBacaTipi: {
        label: 'Baca Tipi',
        type: 'select',
        key: 'bacaTipi',
        options: BACA_TIPLERI,
        default: 'Atmosferik',
    },

    ocak_sec_ozellik: { type: 'section', label: 'Özellikler' },

    ocakMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
        groupBtn: 'muhafazaGrupla',
    },
    ocakYedekCihaz: {
        label: 'Yedek Cihaz',
        type: 'toggle',
        key: 'yedekCihaz',
        default: false,
    },
    ocakYogusmali: {
        label: 'Yoğuşmalı',
        type: 'toggle',
        key: 'yogusmali',
        default: false,
        disabled: true,
    },

    // ─── MİMARİ NESNELER ─────────────────────────────────────────────────────

    // Oda (room)
    room_sec_tanim: { type: 'section', label: 'Tanım' },
    roomName: {
        label: 'Mahal Adı',
        type: 'select',
        key: 'name',
        default: 'MAHAL',
        options: () => MAHAL_LISTESI,
    },
    roomBirimNo: {
        label: 'Birim No',
        type: 'text',
        key: 'birimNo',
        default: '',
        placeholder: 'Birim no...',
        valueFn: (obj) => {
            const own = obj?.birimNo;
            if (own != null && String(own).trim() !== '') return own;
            const unitRooms = getUnitRoomsForRoom(obj);
            const sibling = unitRooms.find(r => r !== obj && r.birimNo != null && String(r.birimNo).trim() !== '');
            if (sibling) return sibling.birimNo;
            const resolved = resolveBirimNoForRoom(obj);
            return resolved.assigned ? resolved.no : '';
        },
        // Sayaçta bir no atanmışsa bu odanın birim no'su sayaçtan gelir — kilit
        disabledFn: (obj) => {
            const s = findSayacEnteringRoomUnit(obj);
            return !!(s && String(s.birimNo ?? '').trim() !== '');
        },
        afterChange: (obj) => {
            const val = obj.birimNo;
            const unitRooms = getUnitRoomsForRoom(obj);
            unitRooms.forEach(r => { if (r !== obj) r.birimNo = val; });
            syncBirimState();
            invalidateBirimCache();
        },
    },
    roomFloor: {
        label: 'Kat',
        type: 'readonly',
        readonlyFn: (obj) => {
            const f = (state.floors || []).find(fl => fl.id === obj?.floorId);
            return f?.name || '—';
        },
    },
    room_sec_olcu: { type: 'section', label: 'Ölçü' },
    roomDimensionsTable: {
        type: 'table',
        tableFn: (obj) => {
            const a = Number(obj?.area) || 0;
            const getFloorHeightM = (room) => {
                const f = (state.floors || []).find(fl => fl.id === room?.floorId);
                const cm = f ? (Number(f.topElevation) - Number(f.bottomElevation)) : Number(state.defaultFloorHeight);
                return (Number.isFinite(cm) && cm > 0 ? cm : WALL_HEIGHT) / 100;
            };
            const h = getFloorHeightM(obj);
            const coords = obj?.polygon?.geometry?.coordinates?.[0];
            let per = 0;
            if (Array.isArray(coords) && coords.length >= 2) {
                for (let i = 0; i < coords.length - 1; i++) {
                    const [ax, ay] = coords[i];
                    const [bx, by] = coords[i + 1];
                    per += Math.hypot(bx - ax, by - ay);
                }
            }
            const unitRooms = getUnitRoomsForRoom(obj);
            const unitA = unitRooms.reduce((s, r) => s + (Number(r.area) || 0), 0);
            const unitVol = unitRooms.reduce((s, r) => s + (Number(r.area) || 0) * getFloorHeightM(r), 0);
            const unitPer = getUnitBoundaryPerimeter(unitRooms);
            const rows = [
                ['Alan', `${a.toFixed(2)} m²`, `${unitA.toFixed(2)} m²`],
                ['Hacim', `${(a * h).toFixed(2)} m³`, `${unitVol.toFixed(2)} m³`],
                ['Çevre', `${(per / 100).toFixed(2)} m`, `${(unitPer / 100).toFixed(2)} m`],
            ];
            return { showUnit: true, rows };
        },
    },

    /* roomWallCount: {
         label: 'Duvar Sayısı',
         type: 'readonly',
         readonlyFn: (obj) => {
             const coords = obj?.polygon?.geometry?.coordinates?.[0];
             return Array.isArray(coords) ? String(Math.max(0, coords.length - 1)) : '—';
         },
     },
 
     */
    // Kolon (column) — en, boy
    column_sec_boyut: { type: 'section', label: 'Boyut' },
    columnWidth: {
        label: 'En (cm)',
        type: 'text',
        key: 'width',
        inputType: 'number',
        default: 40,
        min: 5,
        max: 500,
        precision: 0,
        afterChange: (obj) => { if (obj) obj.size = obj.width; },
    },
    columnDepth: {
        label: 'Boy (cm)',
        type: 'text',
        key: 'height',
        inputType: 'number',
        default: 40,
        min: 5,
        max: 500,
        precision: 0,
    },

    // Kiriş (beam) — en, boy, yükseklik
    beam_sec_boyut: { type: 'section', label: 'Boyut' },
    beamWidth: {
        label: 'En (cm)',
        type: 'text',
        key: 'height',   // Kullanıcının "en"i kodda "height" (kalınlık)
        inputType: 'number',
        default: 20,
        min: 5,
        max: 200,
        precision: 0,
    },
    beamLength: {
        label: 'Boy (cm)',
        type: 'text',
        key: 'width',    // Kullanıcının "boy"u kodda "width" (uzunluk)
        inputType: 'number',
        default: 100,
        min: 5,
        max: 2000,
        precision: 0,
    },
    beamHeight: {
        label: 'Yükseklik (cm)',
        type: 'text',
        key: 'depth',    // Z boyutu
        inputType: 'number',
        default: 20,
        min: 5,
        max: 200,
        precision: 0,
    },

    // Duvar (wall)
    wall_sec_boyut: { type: 'section', label: 'Boyut' },
    wallThickness: {
        label: 'Kalınlık (cm)',
        type: 'text',
        key: 'thickness',
        inputType: 'number',
        default: 20,
        min: 5,
        max: 50,
        precision: 0,
    },
    wallType: {
        label: 'Tip',
        type: 'select',
        key: 'wallType',
        default: 'normal',
        optionsAreObjects: true,
        options: [
            { value: 'normal', label: 'Normal Duvar' },
            { value: 'balcony', label: 'Balkon Duvarı' },
            { value: 'glass', label: 'Camekan' },
            { value: 'half', label: 'Yarım Duvar' },
        ],
    },
    wallArc: {
        label: 'Yay Duvar',
        type: 'toggle',
        key: 'isArc',
        default: false,
        afterChange: (obj, _manager, panelEl) => {
            if (obj.isArc && !obj.arcControl1) {
                const dx = obj.p2.x - obj.p1.x;
                const dy = obj.p2.y - obj.p1.y;
                const len = Math.hypot(dx, dy);
                if (len > 1e-6) {
                    const nx = -dy / len, ny = dx / len;
                    const offset = len / 2;
                    obj.arcControl1 = { x: obj.p1.x + nx * offset, y: obj.p1.y + ny * offset };
                    obj.arcControl2 = { x: obj.p2.x + nx * offset, y: obj.p2.y + ny * offset };
                }
            }
            if (panelEl?._refresh) panelEl._refresh();
        },
        inlineAction: {
            label: '↻',
            title: 'Yayı Ters Çevir',
            visibleFn: (obj) => !!(obj.isArc && obj.arcControl1 && obj.arcControl2),
            onClick: (obj) => flipArcWall(obj),
        },
    },
    wall_sec_ekle: { type: 'section', label: 'Ekle' },
    wallActions: {
        type: 'actions',
        noLabel: true,
        buttons: [
            { label: 'Kapı Ekle', onClick: (obj) => addDoorToWall(obj) },
            { label: 'Pencere Ekle', onClick: (obj) => addWindowToWall(obj) },
            { label: 'Menfez Ekle', onClick: (obj) => addVentToWall(obj) },
            { label: 'Kolon Ekle', onClick: (obj) => addColumnToWall(obj) },
        ],
    },

    // Kapı (door) / Pencere (window) — en, boy, kot
    door_sec_boyut: { type: 'section', label: 'Boyut' },
    doorWidth: {
        label: 'En (cm)',
        type: 'text',
        key: 'width',
        inputType: 'number',
        default: 90,
        min: 30,
        max: 400,
        precision: 0,
    },
    doorHeight: {
        label: 'Boy (cm)',
        type: 'text',
        key: 'height',
        inputType: 'number',
        default: 220,
        min: 100,
        max: 400,
        precision: 0,
    },
    doorKot: {
        label: 'Kot (cm)',
        type: 'text',
        key: 'kot',
        inputType: 'number',
        default: 0,
        min: -500,
        max: 500,
        precision: 0,
    },
    window_sec_boyut: { type: 'section', label: 'Boyut' },
    windowWidth: {
        label: 'En (cm)',
        type: 'text',
        key: 'width',
        inputType: 'number',
        default: 120,
        min: 30,
        max: 500,
        precision: 0,
    },
    windowHeight: {
        label: 'Boy (cm)',
        type: 'text',
        key: 'height',
        inputType: 'number',
        default: 140,
        min: 30,
        max: 400,
        precision: 0,
    },
    windowKot: {
        label: 'Kot (cm)',
        type: 'text',
        key: 'kot',
        inputType: 'number',
        default: 80,
        min: -500,
        max: 500,
        precision: 0,
    },

    // Menfez (vent) — dairesel; çap ve alt kot
    vent_sec_boyut: { type: 'section', label: 'Boyut' },
    ventWidth: {
        label: 'Çap (cm)',
        type: 'text',
        key: 'width',
        inputType: 'number',
        default: 25,
        min: 5,
        max: 100,
        precision: 0,
    },
    ventKot: {
        label: 'Alt Kot (cm)',
        type: 'text',
        key: 'kot',
        inputType: 'number',
        default: 230,
        min: 0,
        max: 500,
        precision: 0,
    },

    // Merdiven (stairs)
    stair_sec_tanim: { type: 'section', label: 'Tanım' },
    stairName: {
        label: 'Ad',
        type: 'text',
        key: 'name',
        default: '',
        placeholder: 'Merdiven adı...',
    },
    stairIsLanding: {
        label: 'Sahanlık',
        type: 'toggle',
        key: 'isLanding',
        default: false,
    },
    stair_sec_boyut: { type: 'section', label: 'Boyut' },
    stairStepDepthRange: {
        label: 'Basamak Derinliği',
        type: 'select',
        key: 'stepDepthRange',
        optionsAreObjects: true,
        options: [
            { value: '20-30', label: '20-30 cm' },
            { value: '25-35', label: '25-35 cm' },
            { value: '30-40', label: '30-40 cm' },
            { value: '35-45', label: '35-45 cm' },
            { value: '40-50', label: '40-50 cm' },
            { value: '45-55', label: '45-55 cm' },
            { value: '50-60', label: '50-60 cm' },
        ],
        valueFn: (obj) => obj.stepDepthRange || state.stairSettings?.stepDepthRange || '30-40',
        afterChange: (obj) => { recalculateStepCount(obj); },
    },
    stairLength: {
        label: 'Uzunluk (cm)',
        type: 'text',
        key: 'width',
        inputType: 'number',
        default: 300,
        min: 50,
        precision: 0,
        afterChange: (obj) => { recalculateStepCount(obj); },
    },
    stairDepth: {
        label: 'Genişlik (cm)',
        type: 'text',
        key: 'height',
        inputType: 'number',
        default: 120,
        min: 50,
        precision: 0,
    },
    stairStepCount: {
        label: 'Basamak Sayısı',
        type: 'readonly',
        readonlyFn: (obj) => String(obj?.stepCount ?? 1),
    },
    stair_sec_kot: { type: 'section', label: 'Kot' },
    stairBottomElevation: {
        label: 'Alt Kot (cm)',
        type: 'text',
        key: 'bottomElevation',
        inputType: 'number',
        default: 0,
        precision: 0,
        afterChange: (obj) => { recalculateStepCount(obj); },
    },
    stairTopElevation: {
        label: 'Üst Kot (cm)',
        type: 'text',
        key: 'topElevation',
        inputType: 'number',
        default: 135,
        precision: 0,
        afterChange: (obj) => { recalculateStepCount(obj); },
    },
    stairShowRailing: {
        label: 'Korkuluk Göster',
        type: 'toggle',
        key: 'showRailing',
        default: true,
    },
};

// ─── NESNE → ÖZELLİK LİSTESİ ────────────────────────────────────────────────

export const OBJECT_PROPERTIES = {
    boru: [
        // 'boru_sec_urun',
        // 'boruMarka',
        // 'boruModel',
        'boru_sec_tip',
        'boruHatNo',
        'boruCap',
        'boruTipi',
        'boru_sec_hesap',
        'boruDebi',
        'boruBasinc',
        'boruHiz',
        'boruHatBasincKaybi',
        'boruKumulatifKayip',
        'boru_sec_konum',
        'boruUzunluk',
        'boruP1',
        'boruP2',
        'boru_sec_ozellik',
        'boruGomulu',
    ],
    sayac: [
        'sayac_sec_tanim',
        'sayacTipi',
        'sayacTuru',
        'sayacCikisCap',
        'sayacBasinc',
        'sayacMuhafaza',        // Sayaç özelliği (birim değil) — TANIM grubunda
        'sayacDebiCubugu',
        'sayac_sec_birim',
        'sayacBirimTipi',
        'sayacBirimNo',
        'sayac_borubag',
        'sayacEsnekMarka',
        'sayac_sec_abone_usta',
        'sayacAboneAdi',
        'sayacAboneNo',
        'sayacUstaAdi',
        'sayacUstaNo',
    ],
    vana: [
        // 'vana_sec_urun',
        // 'vanaMarka',
        // 'vanaModel',
        'vana_sec_tanim',
        'vanaTipi',
        'vanaCap',
        'vana_sec_birim',
        'vanaBirimTipi',
        'vanaBirimNo',
        'vanaBransmanDebi',
        'vanaBransmanIlerdeToplam',
        'vanaIlerdeKullanim',
        'vanaBirimSayisi',
        //'vanaDebi',
        'vanaTesisatNo',
        'vanaDaireSayisi',
        'vanaDukkanSayisi',
        'vanaEkDebi',
        'vanaYanBinaToplam',
        'vana_sec_ozellik',
        'vanaIzolator',
        'vanaFlans',
        'vanaMuhafaza',
    ],
    regulator: [
        'regulator_sec_tanim',
        'regulatorCikisBasinc',
        'regulatorShutOff',
        'regulatorGirisVana',
        'regulatorGirisManometre',
        'regulatorCikisManometre',
        'regulatorCikisVana',
        'regulatorMuhafaza',
        'regulator_sec_urun',
        'regulatorMarka',
        'regulatorModel',
    ],
    filtre: [
        'filtre_sec_tanim',
        'filtreKonik',
        'filtreMuhafaza',
        'filtre_sec_urun',
        'filtreMarka',
        'filtreModel',
    ],
    izolasyon_flansi: [
        'izolasyon_sec_urun',
        'izolasyonMarka',
        'izolasyonModel',
    ],
    kompansator: [
        'kompansator_sec_urun',
        'kompansatorMarka',
        'kompansatorModel',
    ],
    manometre: [
        'manometre_sec_tanim',
        'manometreMuhafaza',
        'manometre_sec_urun',
        'manometreMarka',
        'manometreModel',
    ],
    topraklama: [
        'topraklama_sec_tanim',
        'topraklamaYontemi',
        'topraklama_sec_urun',
        'topraklamaMarka',
        'topraklamaModel',
    ],
    servis_kutusu: [
        // 'kutu_sec_tanim',
        'kutuTipi',
        'kutuBasinc',
        'kutuCikisYonu',
        'kutuCikisKotu',
        'kutuCikisCap',
        'kutu_borubag',
    ],
    cihaz_kombi: [
        'kombi_sec_urun',
        'kombiMarka',
        'kombiModel',
        'kombiBacaTipi',
        'kombi_sec_kapasite',
        'kombiKapasiteKcal',
        'kombiKapasiteKW',
        'kombiVerim',
        'cihazDebi',
        'kombi_sec_ozellik',
        'kombiMuhafaza',
        'kombiYedekCihaz',
        'kombiYogusmali',
    ],
    cihaz_ocak: [
        'ocak_sec_urun',
        'ocakMarka',
        'ocakModel',
        'ocakBacaTipi',
        'ocak_sec_kapasite',
        'ocakKapasiteKcal',
        'ocakKapasiteKW',
        'ocakVerim',
        'cihazDebi',
        'ocak_sec_ozellik',
        'ocakMuhafaza',
        'ocakYedekCihaz',
    ],

    // Mimari nesneler
    room: [
        'room_sec_tanim',
        'roomName',
        'roomBirimNo',
        'roomFloor',
        'room_sec_olcu',
        'roomDimensionsTable',
        'roomWallCount',
    ],
    wall: [
        'wall_sec_boyut',
        'wallThickness',
        'wallType',
        'wallArc',
        'wall_sec_ekle',
        'wallActions',
    ],
    column: [
        'column_sec_boyut',
        'columnWidth',
        'columnDepth',
    ],
    beam: [
        'beam_sec_boyut',
        'beamWidth',
        'beamLength',
        'beamHeight',
    ],
    door: [
        'door_sec_boyut',
        'doorWidth',
        'doorHeight',
        'doorKot',
    ],
    window: [
        'window_sec_boyut',
        'windowWidth',
        'windowHeight',
        'windowKot',
    ],
    vent: [
        'vent_sec_boyut',
        'ventWidth',
        'ventKot',
    ],
    stairs: [
        'stair_sec_tanim',
        'stairName',
        'stairIsLanding',
        'stair_sec_boyut',
        'stairStepDepthRange',
        'stairLength',
        'stairDepth',
        'stairStepCount',
        'stair_sec_kot',
        'stairBottomElevation',
        'stairTopElevation',
        'stairShowRailing',
    ],
};

// ─── DIŞA AKTARILAN FONKSİYONLAR ─────────────────────────────────────────────

/** Nesne tipine göre gösterilecek özellik tanımlarını döndürür */
export function getPropertiesForObject(obj) {
    let key = obj.type;
    if (obj.type === 'cihaz') {
        key = `cihaz_${(obj.cihazTipi || 'KOMBI').toLowerCase()}`;
    }
    const propIds = OBJECT_PROPERTIES[key] || OBJECT_PROPERTIES[obj.type] || [];
    return propIds.map(id => ({ id, ...PROPERTY_DEFS[id] })).filter(p => p && p.type);
}

/** Panel başlığı için nesne etiketi */
export function getObjectLabel(obj) {
    if (obj.type === 'cihaz') {
        return { KOMBI: 'Kombi', OCAK: 'Ocak' }[obj.cihazTipi] || 'Cihaz';
    }
    return getObjectTypeLabel(obj.type);
}

/** Nesne tipi için okunabilir başlık */
export function getObjectTypeLabel(type) {
    const labels = {
        boru: 'Boru',
        sayac: 'Sayaç',
        vana: 'Vana',
        regulator: 'Regülatör',
        filtre: 'Filtre',
        izolasyon_flansi: 'İzolasyon Flanşı',
        kompansator: 'Kompansatör',
        manometre: 'Manometre',
        topraklama: 'Topraklama',
        servis_kutusu: 'Servis Kutusu',
        cihaz: 'Cihaz',
        room: 'Oda',
        wall: 'Duvar',
        column: 'Kolon',
        beam: 'Kiriş',
        door: 'Kapı',
        window: 'Pencere',
        vent: 'Menfez',
        stairs: 'Merdiven',
    };
    return labels[type] || type;
}
