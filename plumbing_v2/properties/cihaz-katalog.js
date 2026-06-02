// cihaz-katalog.js
// Cihaz ve tesisat ekipmanları için marka/model kataloğu.
//   - DEFAULT listeleri kod dosyasında (cihaz-katalog-data.js) — read-only.
//   - state.cihazKatalog yalnızca kullanıcının DELTA'sını tutar:
//       · Yeni eklediği kayıtlar  : { marka, model, kw, kullaniciEkledi:true }
//       · Sildiği kayıtlar         : { marka, model, deleted:true } (override)
//   - Okuma anında DEFAULT + state birleştirilir; aynı (marka, model) ikilisinde
//     kullanıcı kaydı DEFAULT'ın üzerine yazar.
//   - Bu sayede DEFAULT listesi güncellendiğinde tüm projeler otomatik faydalanır;
//     proje JSON'u şişmez ve eski projelerde TICARI/REGULATOR/... eksik kalmaz.
//
// Tipler:
//   Cihazlar : KOMBI, OCAK, SOBA, SOFBEN, KAZAN, TICARI
//   Tesisat  : REGULATOR, FILTRE, IZOLASYON, KOMPANSATOR, MANOMETRE,
//              SOLENOID, BORU, FITTING, SIZDIRMAZLIK, ESNEK,
//              GAZ_ALARM, IZOLATOR, CO_ALARM, KATODIK_ANOT, MENFEZ,
//              SISMIK_ALARM, SISMIK_VANA, TAHLIYE, VANA
//   Baca     : BACA
//
// Şema (tipik):
//   { marka:'BOSCH', model:'Condens...', kw:24, deleted:false }
// TICARI listesinde ek alan:
//   { marka, model, kw, tip:'Brülör', deleted:false }

import { state } from '../../general-files/main.js';
import {
    DEFAULT_KOMBI,
    DEFAULT_OCAK,
    DEFAULT_SOBA,
    DEFAULT_SOFBEN,
    DEFAULT_KAZAN,
    DEFAULT_TICARI,
    DEFAULT_REGULATOR,
    DEFAULT_FILTRE,
    DEFAULT_IZOLASYON,
    DEFAULT_KOMPANSATOR,
    DEFAULT_MANOMETRE,
    DEFAULT_BACA,
    DEFAULT_SOLENOID,
    DEFAULT_BORU,
    DEFAULT_FITTING,
    DEFAULT_SIZDIRMAZLIK,
    DEFAULT_ESNEK,
    DEFAULT_GAZ_ALARM,
    DEFAULT_IZOLATOR,
    DEFAULT_CO_ALARM,
    DEFAULT_KATODIK_ANOT,
    DEFAULT_MENFEZ,
    DEFAULT_SISMIK_ALARM,
    DEFAULT_SISMIK_VANA,
    DEFAULT_TAHLIYE,
    DEFAULT_VANA,
    DEFAULT_FAVORITE_MARKAS,
} from './cihaz-katalog-data.js';

// ─── TİPLER ──────────────────────────────────────────────────────────────

export const CIHAZ_KATALOG_TIPLERI = [
    'KOMBI', 'OCAK', 'SOBA', 'SOFBEN', 'KAZAN', 'TICARI',
    'REGULATOR', 'FILTRE', 'IZOLASYON', 'KOMPANSATOR', 'MANOMETRE',
    'BACA', 'SOLENOID', 'BORU', 'FITTING', 'SIZDIRMAZLIK', 'ESNEK',
    'GAZ_ALARM', 'IZOLATOR', 'CO_ALARM', 'KATODIK_ANOT', 'MENFEZ',
    'SISMIK_ALARM', 'SISMIK_VANA', 'TAHLIYE', 'VANA',
];

const DEFAULTS_BY_TIP = {
    KOMBI:        DEFAULT_KOMBI,
    OCAK:         DEFAULT_OCAK,
    SOBA:         DEFAULT_SOBA,
    SOFBEN:       DEFAULT_SOFBEN,
    KAZAN:        DEFAULT_KAZAN,
    TICARI:       DEFAULT_TICARI,
    REGULATOR:    DEFAULT_REGULATOR,
    FILTRE:       DEFAULT_FILTRE,
    IZOLASYON:    DEFAULT_IZOLASYON,
    KOMPANSATOR:  DEFAULT_KOMPANSATOR,
    MANOMETRE:    DEFAULT_MANOMETRE,
    BACA:         DEFAULT_BACA,
    SOLENOID:     DEFAULT_SOLENOID,
    BORU:         DEFAULT_BORU,
    FITTING:      DEFAULT_FITTING,
    SIZDIRMAZLIK: DEFAULT_SIZDIRMAZLIK,
    ESNEK:        DEFAULT_ESNEK,
    GAZ_ALARM:    DEFAULT_GAZ_ALARM,
    IZOLATOR:     DEFAULT_IZOLATOR,
    CO_ALARM:     DEFAULT_CO_ALARM,
    KATODIK_ANOT: DEFAULT_KATODIK_ANOT,
    MENFEZ:       DEFAULT_MENFEZ,
    SISMIK_ALARM: DEFAULT_SISMIK_ALARM,
    SISMIK_VANA:  DEFAULT_SISMIK_VANA,
    TAHLIYE:      DEFAULT_TAHLIYE,
    VANA:         DEFAULT_VANA,
};

function _normTip(tip) {
    return String(tip || '').toUpperCase();
}

/**
 * state.cihazKatalog'u (kullanıcı delta'sı) hazırla. Yoksa boş obje oluştur.
 * Her tip anahtarı en azından [] olsun ki .push() güvenle çağrılabilsin.
 */
export function ensureCihazKatalog() {
    if (!state.cihazKatalog || typeof state.cihazKatalog !== 'object') {
        state.cihazKatalog = {};
    }
    CIHAZ_KATALOG_TIPLERI.forEach(t => {
        if (!Array.isArray(state.cihazKatalog[t])) state.cihazKatalog[t] = [];
    });
    return state.cihazKatalog;
}

/**
 * DEFAULT + kullanıcı delta'sı birleşik liste döndürür.
 * Aynı (marka, model) için kullanıcı kaydı DEFAULT'ın üzerine yazar
 * (kw güncelleme, deleted override, ticari tip ekleme, vb.).
 */
function _allEntries(tip) {
    const T = _normTip(tip);
    const defaults = DEFAULTS_BY_TIP[T] || [];
    const user = ensureCihazKatalog()[T] || [];

    const byKey = new Map();
    for (const e of defaults) {
        const k = `${e.marka}|${e.model}`;
        byKey.set(k, { ...e, deleted: !!e.deleted });
    }
    for (const e of user) {
        if (!e || !e.marka || !e.model) continue;
        const k = `${e.marka}|${e.model}`;
        const base = byKey.get(k) || {};
        byKey.set(k, { ...base, ...e });
    }
    return Array.from(byKey.values());
}

/**
 * Aktif (silinmemiş) markalar — keepValue varsa silinmiş olsa bile listeye dahil
 * edilir (mevcut nesnenin değeri seçili görünebilsin diye).
 *
 * TICARI için 3. argüman (ticariTipi) verilirse o alt tipe ait markalarla
 * sınırlanır. Boş geçilirse tüm TICARI markaları döner.
 */
export function getMarkaList(tip, keepValue, ticariTipi) {
    const list = _allEntries(tip);
    const filterByTip = (_normTip(tip) === 'TICARI') && !!ticariTipi;

    const seen = new Set();
    const out = [];
    for (const e of list) {
        if (!e.marka) continue;
        if (filterByTip && e.tip !== ticariTipi) continue;
        if (seen.has(e.marka)) continue;
        const isActive = list.some(x =>
            x.marka === e.marka &&
            !x.deleted &&
            (!filterByTip || x.tip === ticariTipi)
        );
        if (!isActive && e.marka !== keepValue) continue;
        seen.add(e.marka);
        out.push(e.marka);
    }
    out.sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
    if (keepValue && !seen.has(keepValue)) out.unshift(keepValue);
    return out;
}

/**
 * Verilen marka için modeller. keepValue silinmiş veya katalogda yok olsa bile
 * mevcut nesnenin değeri seçili görünebilsin diye listeye eklenir.
 *
 * TICARI için ticariTipi verilirse o alt tipe ait modeller döner.
 */
export function getModelList(tip, marka, keepValue, ticariTipi) {
    if (!marka) return keepValue ? [keepValue] : [];
    const list = _allEntries(tip);
    const filterByTip = (_normTip(tip) === 'TICARI') && !!ticariTipi;

    const out = [];
    const seen = new Set();
    for (const e of list) {
        if (e.marka !== marka) continue;
        if (filterByTip && e.tip !== ticariTipi) continue;
        if (!e.model) continue;
        if (e.deleted && e.model !== keepValue) continue;
        if (seen.has(e.model)) continue;
        seen.add(e.model);
        out.push(e.model);
    }
    out.sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
    if (keepValue && !seen.has(keepValue)) out.unshift(keepValue);
    return out;
}

/** Bu marka DEFAULT listesinde yoksa kullanıcı tarafından manuel girilmiş demektir. */
export function isMarkaManuel(tip, marka) {
    if (!marka) return false;
    const defaults = DEFAULTS_BY_TIP[_normTip(tip)] || [];
    return !defaults.some(e => e.marka === marka);
}

/** Bu (marka, model) çifti DEFAULT'ta yoksa kullanıcı tarafından manuel girilmiş demektir. */
export function isModelManuel(tip, marka, model) {
    if (!marka || !model) return false;
    const defaults = DEFAULTS_BY_TIP[_normTip(tip)] || [];
    return !defaults.some(e => e.marka === marka && e.model === model);
}

/** Marka+model'den modelin kw kapasitesini döndürür. Bulunmazsa null. */
export function getModelKW(tip, marka, model) {
    if (!marka || !model) return null;
    const e = _allEntries(tip).find(x => x.marka === marka && x.model === model);
    return e && Number.isFinite(e.kw) ? e.kw : null;
}

/**
 * TICARI için: verilen marka+model'in alt tipini döndürür (Brülör / Fırın / ...).
 * Bulunmazsa null. Marka seçilince ticariCihazTipi otomatik atamak için kullanılır.
 */
export function getTicariTip(marka, model) {
    if (!marka) return null;
    const list = _allEntries('TICARI');
    const exact = list.find(x => x.marka === marka && x.model === model && !x.deleted);
    if (exact && exact.tip) return exact.tip;
    const byMarka = list.find(x => x.marka === marka && !x.deleted && x.tip);
    return byMarka ? byMarka.tip : null;
}

/**
 * Yeni marka+model girişi state delta'sına ekler. Aynı satır varsa deleted=false
 * yapar / alanları günceller.
 * @param {string} tip   KOMBI/OCAK/.../REGULATOR/MANOMETRE/...
 * @param {object} extra TICARI için { tip:'Brülör' } gibi ek alanlar
 */
export function addCihazEntry(tip, marka, model, kw, extra) {
    if (!marka || !model) return false;
    const k = ensureCihazKatalog();
    const T = _normTip(tip);
    const arr = k[T];
    const exist = arr.find(x => x.marka === marka && x.model === model);
    if (exist) {
        exist.deleted = false;
        if (Number.isFinite(kw)) exist.kw = kw;
        if (extra && typeof extra === 'object') Object.assign(exist, extra);
        return true;
    }
    const row = { marka, model, kw: Number.isFinite(kw) ? kw : null, deleted: false };
    if (extra && typeof extra === 'object') Object.assign(row, extra);
    arr.push(row);
    return true;
}

/**
 * Marka+model girişini soft-delete eder. DEFAULT'ta varsa state'e override kaydı
 * yazılır (DEFAULT listesi salt-okunur). Geçmişte bu modeli kullanan nesnelerde
 * eski seçim keepValue üzerinden listede görünmeye devam eder.
 */
export function softDeleteCihazEntry(tip, marka, model) {
    if (!marka) return false;
    const k = ensureCihazKatalog();
    const T = _normTip(tip);
    const arr = k[T];
    const defaults = DEFAULTS_BY_TIP[T] || [];
    let touched = false;

    // DEFAULT'taki eşleşmeleri override kaydıyla işaretle
    for (const e of defaults) {
        if (e.marka !== marka) continue;
        if (model && e.model !== model) continue;
        const existing = arr.find(x => x.marka === e.marka && x.model === e.model);
        if (existing) existing.deleted = true;
        else arr.push({ marka: e.marka, model: e.model, deleted: true });
        touched = true;
    }
    // Kullanıcının eklediği kayıtlardan eşleşenleri de işaretle
    for (const e of arr) {
        if (e.marka === marka && (!model || e.model === model)) {
            e.deleted = true; touched = true;
        }
    }
    return touched;
}

/** Tüm bir markayı (ve modellerini) soft-delete eder. */
export function softDeleteMarka(tip, marka) {
    return softDeleteCihazEntry(tip, marka, null);
}

/** Rastgele bir aktif marka döndürür (auto-fix için). Yoksa null. */
export function getRandomMarka(tip) {
    const arr = getMarkaList(tip);
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Verilen marka için rastgele aktif model döndürür. Yoksa null. */
export function getRandomModel(tip, marka) {
    const arr = getModelList(tip, marka);
    if (!arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─── FAVORİ / VARSAYILAN PREFS ───────────────────────────────────────────
// Tip başına şema:
//   { pinnedMarkas:[],         // üstte gösterilecek markalar (alfabetik)
//     pinnedModels:{[marka]:[]}, // marka başına üstte gösterilecek modeller
//     defaultMarka:string|null,  // tek varsayılan marka
//     defaultModel:{marka,model}|null, // tek varsayılan (marka,model) çifti
//     seeded:true }              // DEFAULT_FAVORITE_MARKAS uygulandı
// Invariantlar setter'lar tarafından sağlanır:
//   defaultMarka pinnedMarkas içindedir.
//   defaultModel.marka pinnedMarkas içindedir,
//   defaultModel.model pinnedModels[defaultModel.marka] içindedir.

function _ensurePrefs(tip) {
    const T = _normTip(tip);
    const k = ensureCihazKatalog();
    if (!k._prefs || typeof k._prefs !== 'object') k._prefs = {};
    if (!k._prefs[T] || typeof k._prefs[T] !== 'object') {
        k._prefs[T] = {
            pinnedMarkas: [],
            pinnedModels: {},
            defaultMarka: null,
            defaultModel: null,
            seeded: false,
        };
    }
    const p = k._prefs[T];
    if (!Array.isArray(p.pinnedMarkas)) p.pinnedMarkas = [];
    if (!p.pinnedModels || typeof p.pinnedModels !== 'object') p.pinnedModels = {};
    if (!p.seeded) {
        const seed = DEFAULT_FAVORITE_MARKAS[T] || null;
        if (Array.isArray(seed)) {
            for (const m of seed) {
                if (m && !p.pinnedMarkas.includes(m)) p.pinnedMarkas.push(m);
            }
        }
        p.seeded = true;
    }
    return p;
}

export function isMarkaPinned(tip, marka) {
    if (!marka) return false;
    return _ensurePrefs(tip).pinnedMarkas.includes(marka);
}

export function isModelPinned(tip, marka, model) {
    if (!marka || !model) return false;
    const arr = _ensurePrefs(tip).pinnedModels[marka];
    return Array.isArray(arr) && arr.includes(model);
}

export function getDefaultMarka(tip) {
    return _ensurePrefs(tip).defaultMarka || null;
}

export function getDefaultModel(tip) {
    const dm = _ensurePrefs(tip).defaultModel;
    return (dm && dm.marka && dm.model) ? { ...dm } : null;
}

export function isDefaultMarka(tip, marka) {
    return !!marka && getDefaultMarka(tip) === marka;
}

export function isDefaultModel(tip, marka, model) {
    const dm = getDefaultModel(tip);
    return !!dm && dm.marka === marka && dm.model === model;
}

function _pin(arr, val) {
    if (!val) return;
    if (!arr.includes(val)) arr.push(val);
}

function _unpin(arr, val) {
    const i = arr.indexOf(val);
    if (i >= 0) arr.splice(i, 1);
}

// NOT: pin ile default tamamen bağımsızdır. Default'lu bir öğe pin'siz kalabilir;
// pin'lenmiş bir öğe default olmak zorunda değildir. Cascade YOK.

export function setMarkaPinned(tip, marka, pinned) {
    if (!marka) return;
    const p = _ensurePrefs(tip);
    if (pinned) _pin(p.pinnedMarkas, marka);
    else _unpin(p.pinnedMarkas, marka);
}

export function setModelPinned(tip, marka, model, pinned) {
    if (!marka || !model) return;
    const p = _ensurePrefs(tip);
    if (!Array.isArray(p.pinnedModels[marka])) p.pinnedModels[marka] = [];
    if (pinned) {
        _pin(p.pinnedModels[marka], model);
    } else {
        _unpin(p.pinnedModels[marka], model);
        if (p.pinnedModels[marka].length === 0) delete p.pinnedModels[marka];
    }
}

export function setDefaultMarka(tip, marka) {
    const p = _ensurePrefs(tip);
    p.defaultMarka = marka || null;
}

export function setDefaultModel(tip, marka, model) {
    const p = _ensurePrefs(tip);
    if (!marka || !model) {
        p.defaultModel = null;
        return;
    }
    p.defaultModel = { marka, model };
}

/**
 * Aktif markalar pinned/diğer olarak gruplandırılmış halde döner.
 * Her grup kendi içinde alfabetik (Türkçe), varsayılan marka pinned'in en başında tutulur.
 * keepValue: silinmiş bile olsa listede tutulması istenen değer (mevcut seçim).
 */
export function getMarkaListGrouped(tip, keepValue, ticariTipi) {
    const flat = getMarkaList(tip, keepValue, ticariTipi);
    const p = _ensurePrefs(tip);
    const pinnedSet = new Set(p.pinnedMarkas);
    const def = p.defaultMarka;
    const pinned = [];
    const others = [];
    for (const m of flat) {
        if (pinnedSet.has(m)) pinned.push(m);
        else others.push(m);
    }
    // Varsayılan en başta — pinned alfabetik sıralanır, sonra varsayılan en üste alınır.
    if (def && pinned.includes(def)) {
        const i = pinned.indexOf(def);
        pinned.splice(i, 1);
        pinned.unshift(def);
    }
    return { pinned, others, defaultMarka: def };
}

/**
 * Verilen marka için modeller pinned/diğer olarak gruplandırılmış halde döner.
 * Varsayılan modeli (varsa) pinned'in en başında tutar.
 */
export function getModelListGrouped(tip, marka, keepValue, ticariTipi) {
    const flat = getModelList(tip, marka, keepValue, ticariTipi);
    const p = _ensurePrefs(tip);
    const pinnedArr = (p.pinnedModels && p.pinnedModels[marka]) || [];
    const pinnedSet = new Set(pinnedArr);
    const def = p.defaultModel && p.defaultModel.marka === marka ? p.defaultModel.model : null;
    const pinned = [];
    const others = [];
    for (const m of flat) {
        if (pinnedSet.has(m)) pinned.push(m);
        else others.push(m);
    }
    if (def && pinned.includes(def)) {
        const i = pinned.indexOf(def);
        pinned.splice(i, 1);
        pinned.unshift(def);
    }
    return { pinned, others, defaultModel: def };
}
