// onboarding/dummy-service.js
// "Servisten Al" modu için mock BinaServisi & AboneServisi.
// İleride gerçek bir HTTP endpoint'iyle değiştirilecek; bu yüzden API
// promise tabanlı ve setTimeout ile hafif gecikmeli — UI gerçek servise
// karşı nasıl davranacaksa şimdi de aynı şekilde davranıyor.
//
// Veri sözleşmesi
// ───────────────
//   bina   = { binaTesisatNo, adres, bilgi, tesisat, sayaclar:[abone] }
//   abone  = { aboneTuketimNo, aboneTipi, birimNo, birimEtiketi, aboneAdi, aboneTel, aboneTcNo }
//
// Asıl veri (1000 bina, ~6184 abone) sample-data/dataset.json içinde tutulur;
// ilk sorguda lazy fetch ile yüklenir ve cache'lenir.

const NETWORK_DELAY_MS = 200;

const DATASET_URL = new URL('./sample-data/dataset.json', import.meta.url);

let _datasetPromise = null;
let _dataset = null;

function loadDataset() {
    if (_dataset) return Promise.resolve(_dataset);
    if (_datasetPromise) return _datasetPromise;
    _datasetPromise = fetch(DATASET_URL)
        .then(r => {
            if (!r.ok) throw new Error('dataset.json yüklenemedi (' + r.status + ')');
            return r.json();
        })
        .then(d => {
            // dataset = { binalar: [...], aboneIdx: { aboneTuketimNo: binaTesisatNo, ... } }
            // Daha hızlı sorgu için bina haritası kur.
            const binaByTesisat = new Map();
            for (const b of d.binalar || []) binaByTesisat.set(String(b.binaTesisatNo), b);
            _dataset = {
                binaByTesisat,
                aboneIdx: d.aboneIdx || {},
            };
            return _dataset;
        })
        .catch(e => { _datasetPromise = null; throw e; });
    return _datasetPromise;
}

// ── PUBLIC API ─────────────────────────────────────────────────────

// BinaServisi: bina tesisat no ile bina + sayaç bilgilerini döner.
export async function fetchBinaByTesisatNo(binaTesisatNo) {
    const tno = normalize(binaTesisatNo);
    if (!tno) throw new Error('Bina Tesisat No girilmedi.');
    await delay(NETWORK_DELAY_MS);
    const ds = await loadDataset();
    const bina = ds.binaByTesisat.get(tno);
    if (!bina) throw new Error(`Bina bulunamadı: ${tno}`);
    return cloneRecord(bina);
}

// AboneServisi: tüketim no ile sayaç bilgileri + binanın tesisat no'su döner.
export async function fetchAboneByTuketimNo(aboneTuketimNo) {
    const ano = normalize(aboneTuketimNo);
    if (!ano) throw new Error('Abone Tüketim No girilmedi.');
    await delay(NETWORK_DELAY_MS);
    const ds = await loadDataset();
    const binaTesisatNo = ds.aboneIdx[ano];
    if (!binaTesisatNo) throw new Error(`Abone bulunamadı: ${ano}`);
    const bina = ds.binaByTesisat.get(String(binaTesisatNo));
    const sayac = bina?.sayaclar?.find(s => normalize(s.aboneTuketimNo) === ano);
    return {
        abone: cloneRecord(sayac),
        binaTesisatNo: String(binaTesisatNo),
    };
}

// Convenience: tüketim no → önce abone, sonra bina (zincirleme çağrı).
export async function fetchBinaByAboneTuketimNo(aboneTuketimNo) {
    const { binaTesisatNo, abone } = await fetchAboneByTuketimNo(aboneTuketimNo);
    const bina = await fetchBinaByTesisatNo(binaTesisatNo);
    return { bina, abone };
}

// ── INTERNAL ───────────────────────────────────────────────────────
function normalize(v) { return String(v ?? '').trim(); }
function cloneRecord(obj) { return obj ? JSON.parse(JSON.stringify(obj)) : null; }
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
