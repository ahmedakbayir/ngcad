// onboarding/address-data.js
// "Adres Seç" modu için lazy-loaded adres verisi.
//
// index.json  → tüm il/ilçe/mahalle (panel açılınca bir defa yüklenir)
// streets/{ilceKod}.json → ilgili ilçenin sokakları (ilçe seçilince yüklenir)
//
// Veriler build-address-data.js ile üretilir:
//     node general-files/build-address-data.js
//
// kod alanı: ilçe/mahalle/sokak için "kimlikNo"nun string hali. İl '34' sabit.

let indexData = null;
let indexPromise = null;
const streetsCache = new Map();    // ilceKod → { mahalleKod: [{ kod, ad }] }
const streetsPromises = new Map(); // ilceKod → in-flight Promise

const DATA_BASE = new URL('./address-data/', import.meta.url);

// ── LOADERS ────────────────────────────────────────────────────────
export function loadAddressIndex() {
    if (indexData) return Promise.resolve(indexData);
    if (indexPromise) return indexPromise;
    indexPromise = fetch(new URL('index.json', DATA_BASE).href)
        .then(r => {
            if (!r.ok) throw new Error('index.json yüklenemedi (' + r.status + ')');
            return r.json();
        })
        .then(j => { indexData = j; return j; })
        .catch(e => { indexPromise = null; throw e; });
    return indexPromise;
}

export function loadStreets(ilceKod) {
    if (!ilceKod) return Promise.resolve(null);
    if (streetsCache.has(ilceKod)) return Promise.resolve(streetsCache.get(ilceKod));
    if (streetsPromises.has(ilceKod)) return streetsPromises.get(ilceKod);
    const url = new URL('streets/' + encodeURIComponent(ilceKod) + '.json', DATA_BASE).href;
    const p = fetch(url)
        .then(r => {
            if (!r.ok) throw new Error('sokak verisi yüklenemedi (' + r.status + ')');
            return r.json();
        })
        .then(j => {
            streetsCache.set(ilceKod, j);
            streetsPromises.delete(ilceKod);
            return j;
        })
        .catch(e => { streetsPromises.delete(ilceKod); throw e; });
    streetsPromises.set(ilceKod, p);
    return p;
}

// ── STATUS HELPERS (panel re-render kararı için) ───────────────────
export function isIndexLoaded() { return indexData != null; }
export function isStreetsLoaded(ilceKod) { return streetsCache.has(ilceKod); }

// ── SYNC LOOKUPS (cache'den okur — yoksa boş döner) ────────────────
export function getIller() {
    if (!indexData) return [];
    return indexData.iller.map(({ kod, ad }) => ({ kod, ad }));
}

export function getIlceler(ilKod) {
    if (!indexData) return [];
    const il = indexData.iller.find(x => x.kod === ilKod);
    if (!il) return [];
    return (il.ilceler || []).map(({ kod, ad }) => ({ kod, ad }));
}

export function getMahalleler(ilKod, ilceKod) {
    if (!indexData) return [];
    const il = indexData.iller.find(x => x.kod === ilKod);
    const ilce = il?.ilceler?.find(x => x.kod === ilceKod);
    if (!ilce) return [];
    return (ilce.mahalleler || []).map(({ kod, ad }) => ({ kod, ad }));
}

export function getCaddeSokaklar(ilKod, ilceKod, mahalleKod) {
    if (!ilceKod || !mahalleKod) return [];
    const ilceStreets = streetsCache.get(ilceKod);
    if (!ilceStreets) return [];
    return (ilceStreets[mahalleKod] || []).map(({ kod, ad }) => ({ kod, ad }));
}

export function adFromKod(level, codes) {
    const { ilKod, ilceKod, mahalleKod, cadSokKod } = codes || {};
    if (!indexData) return '';
    const il = indexData.iller.find(x => x.kod === ilKod);
    if (level === 'il') return il?.ad || '';
    const ilce = il?.ilceler?.find(x => x.kod === ilceKod);
    if (level === 'ilce') return ilce?.ad || '';
    const mahalle = ilce?.mahalleler?.find(x => x.kod === mahalleKod);
    if (level === 'mahalle') return mahalle?.ad || '';
    if (level === 'cadsok') {
        const list = streetsCache.get(ilceKod);
        const arr = list?.[mahalleKod] || [];
        return arr.find(x => x.kod === cadSokKod)?.ad || '';
    }
    return '';
}
