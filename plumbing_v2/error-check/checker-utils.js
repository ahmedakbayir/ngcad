// checker-utils.js
// Hata kontrol checker'ları için ortak yardımcılar:
//   • floorNameById(id)        → state.floors'tan kat adı
//   • daireLabel(comp)         → "D2" / "Ofis 1" / "Dük 1" / "KD1"
//   • findMeterUpstream(...)   → boru'dan upstream sayaç
//   • cihazAdSmall(cihazTipi)  → "kombi", "ocak", "şofben" (PDF yazımı)
//   • hatNosForComponent(...)  → bir comp/pipe'ın bulunduğu kolon hat numaraları
//   • gri(text)                → mesaj içinde inline gri (silik) parça işaretler

import { state } from '../../general-files/main.js';
import { computeHatGroups } from '../renderer/renderer-utils.js';

// Mesaj içi inline "gri" işaretleme. Sentinel olarak görünmez kontrol karakterleri
// kullanılır; HTML escape onları etkilemez, renderer span'e çevirir. Mesajların
// her yerinde kullanılabilir: `... ${gri('(...)')} ...`
export const GRI_OPEN  = '';
export const GRI_CLOSE = '';
export function gri(text) {
    return `${GRI_OPEN}${String(text ?? '')}${GRI_CLOSE}`;
}

// Kat ismini PDF wording'iyle döndürür: "Zemin" → "Zemin Kat", "1." → "1. Kat",
// "ZEMİN" → "ZEMİN KAT". İsim zaten "kat" ile bitiyorsa olduğu gibi bırakılır.
// Suffix case'i, ismin kendi case'ine göre uyarlanır (tamamı büyük harfse "KAT").
// Proje tek kat ise (placeholder hariç) kat bilgisi gerekmez → "" döner.
export function floorNameById(floorId) {
    if (floorId == null) return '';
    const realFloors = (state.floors || []).filter(f => !f.isPlaceholder);
    if (realFloors.length <= 1) return '';
    const f = realFloors.find(x => x.id === floorId);
    const raw = String(f?.name || '').trim();
    if (!raw) return '';
    if (/kat\.?$/i.test(raw)) return raw;
    // İsim büyük harf ağırlıklı mı? (en az bir harf büyük ve hiç küçük harf yok)
    const isUpper = /[A-ZÇĞİÖŞÜ]/.test(raw) && !/[a-zçğıöşü]/.test(raw);
    return `${raw} ${isUpper ? 'KAT' : 'Kat'}`;
}

export function daireLabel(comp) {
    if (!comp) return '';
    const no = comp.birimNo;
    if (no == null || String(no).trim() === '') return '';
    const tipi = comp.birimTipi || 'KONUT';
    switch (tipi) {
        case 'KONUT':         return `D${no}`;
        case 'OFİS':          return `Ofis ${no}`;
        case 'TİCARİ':        return `Dük ${no}`;
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default:              return `D${no}`;
    }
}

// PDF'te cihaz adı küçük harfle geçiyor: "Kombi için cihaz vanası gerekli"
// (cihaz vanası satırı) ile karışmaması için sadece bu fonksiyon küçük harf
// gerektirenlerde kullanılır.
const CIHAZ_KUCUK = {
    KOMBI:  'kombi',
    OCAK:   'ocak',
    SOFBEN: 'şofben',
    SOBA:   'soba',
    KAZAN:  'kazan',
    TICARI: 'ticari cihaz',
};
const CIHAZ_BUYUK = {
    KOMBI:  'Kombi',
    OCAK:   'Ocak',
    SOFBEN: 'Şofben',
    SOBA:   'Soba',
    KAZAN:  'Kazan',
    TICARI: 'Ticari Cihaz',
};
export function cihazAdSmall(cihazTipi) {
    return CIHAZ_KUCUK[(cihazTipi || '').toUpperCase()] || 'cihaz';
}
export function cihazAdBig(cihazTipi) {
    return CIHAZ_BUYUK[(cihazTipi || '').toUpperCase()] || 'Cihaz';
}

export function findMeterUpstream(manager, pipeId) {
    if (!pipeId || !manager?.pipes) return null;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const metersByExit = new Map();
    (manager.components || []).forEach(c => {
        if (c.type === 'sayac' && c.cikisBagliBoruId) {
            metersByExit.set(c.cikisBagliBoruId, c);
        }
    });
    let cursor = pipeMap.get(pipeId);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        const m = metersByExit.get(cursor.id);
        if (m) return m;
        const par = cursor.baslangicBaglanti;
        if (par?.tip === 'boru' && par.hedefId) cursor = pipeMap.get(par.hedefId);
        else break;
    }
    return null;
}

// Bu sayaç başka bir sayacın downstream zincirinde mi?
// Why: parentSayacKurali "sayaç sonrası tekrar sayaç kullanılamaz" hatasını
// üretiyor; aynı (geçersiz) sayaç için diğer kontrollerin (birim no, debi,
// emniyet vanası, konik filtre, vs.) gürültü hata üretmesini önler.
export function hasParentSayac(manager, sayac) {
    if (!manager || sayac?.type !== 'sayac') return false;
    const inputPipeId = sayac.fleksBaglanti?.boruId;
    if (!inputPipeId) return false;
    const parent = findMeterUpstream(manager, inputPipeId);
    return !!(parent && parent.id !== sayac.id);
}

// Bir bileşenin (vana/sayaç/cihaz) bulunduğu kolon hat numarası.
// Birden fazla pipe etrafına yayılmış vana/sayaç için bağlı boru üzerinden
// hat eşlemesi yapılır.
let _hatMapCache = null;
let _hatMapCacheKey = null;

function getHatMap(manager) {
    if (!manager?.pipes?.length) return new Map();
    const key = manager.pipes.length + '|' + (manager.components?.length || 0);
    if (_hatMapCache && _hatMapCacheKey === key) return _hatMapCache;
    try {
        const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
        _hatMapCache = hatMap;
        _hatMapCacheKey = key;
        return hatMap;
    } catch {
        return new Map();
    }
}

export function hatNoForPipe(manager, pipeId) {
    const hatMap = getHatMap(manager);
    return hatMap.get(pipeId) ?? null;
}

export function hatNoForComp(manager, comp) {
    if (!comp) return null;
    const pid = comp.bagliBoruId || comp.fleksBaglanti?.boruId;
    return pid ? hatNoForPipe(manager, pid) : null;
}

// Birim adı tespit edilemeyen yerler için yer tutucu — PDF: "××× biriminde"
export const BIRIM_PLACEHOLDER = '×××';

// PDF lokasyon prefix yardımcıları. Floor varsa birim boş bile olsa "×××" ile
// yer tutucu kullanılır ki cümle ("…, ××× biriminde …") anlamlı kalsın.
//   katAdi + ", " + (birimAdi|×××) + " biriminde"   →   "Zemin Kat, D2 biriminde"
//   katAdi + ", " + (birimAdi|×××)                  →   "Zemin Kat, D2"
export function locInBirim(floorId, birimLabelStr) {
    const fn = floorNameById(floorId);
    const birim = birimLabelStr || (fn ? BIRIM_PLACEHOLDER : '');
    if (fn && birim) return `${fn}, ${birim} biriminde`;
    if (fn) return fn;
    if (birim) return birim;
    return '';
}

export function locKatBirim(floorId, birimLabelStr) {
    const fn = floorNameById(floorId);
    const birim = birimLabelStr || (fn ? BIRIM_PLACEHOLDER : '');
    const parts = [];
    if (fn) parts.push(fn);
    if (birim) parts.push(birim);
    return parts.join(', ');
}

export function locKat(floorId) {
    return floorNameById(floorId);
}

// ─── HAT-BAZLI PREFIX YARDIMCILARI ───────────────────────────────────────
// PDF wording'inden vazgeçildi (kullanıcı revize): kat ismi mesajdan çıkarılır
// (ErrorItem.floorName olarak ayrıca taşınır), mesaj gövdesinde lokasyon olarak
// hedefin hat numarası kullanılır: "X nolu hattaki Kombi", "X nolu hattaki D2
// Sayacı", "X nolu hattaki branşman vanası" vb.

// "2 nolu hattaki" prefix'i. Hat tespit edilemediyse boş.
export function hatPrefix(hatNo) {
    return hatNo != null ? `${hatNo} nolu hattaki` : '';
}

// "D2 Sayacı" / "Sayaç"  veya genitive: "D2 Sayacının" / "Sayacın"
function sayacAdInternal(sayac, { genitive = false } = {}) {
    const d = daireLabel(sayac);
    if (genitive) return d ? `${d} Sayacının` : 'Sayacın';
    return d ? `${d} Sayacı` : 'Sayaç';
}

export function sayacHatLabel(manager, sayac, opts = {}) {
    const hatNo = hatNoForComp(manager, sayac);
    const pre = hatPrefix(hatNo);
    const ad = sayacAdInternal(sayac, opts);
    return pre ? `${pre} ${ad}` : ad;
}

// Cihaz-odaklı hatalar için ortak prefix (birim önce, hat sonra).
//   D2 biriminde 2 nolu hattaki     → birim + hat
//   ××× biriminde 2 nolu hattaki    → birim no eksik (sayaç var)
//   2 nolu hattaki                  → sayaç yok (kolon vb.)
//   ""                              → ne hat ne sayaç
//
// `sayac` parametresi ile cihazın bağlı olduğu birim (sayaç) verilir; null ise
// "biriminde" kısmı atlanır.
export function birimHatPrefix(manager, { sayac, hatNo }) {
    const dare = sayac ? daireLabel(sayac) : '';
    const birimPart = sayac ? `${dare || BIRIM_PLACEHOLDER} biriminde` : '';
    const hatPart = hatNo != null ? `${hatNo} nolu hattaki` : '';
    if (birimPart && hatPart) return `${birimPart} ${hatPart}`;
    return birimPart || hatPart;
}

// "D2 biriminde 2 nolu hattaki Kombi" gibi cihaz etiketi.
export function cihazHatLabel(manager, cihaz) {
    const sayac = findMeterUpstream(
        manager,
        cihaz?.fleksBaglanti?.boruId || cihaz?.bagliBoruId
    );
    const hatNo = hatNoForComp(manager, cihaz);
    const ad = cihazAdBig(cihaz?.cihazTipi);
    const pre = birimHatPrefix(manager, { sayac, hatNo });
    return pre ? `${pre} ${ad}` : ad;
}

const VANA_DISPLAY = {
    AKV: 'AKV',
    EMNIYET: 'Emn.V',
    CIHAZ: 'Cihaz vanası',
    SELENOID: 'Selenoid',
    SISMIK: 'Sismik Vana',
    YANBINA: 'Yan bina vanası',
    BRANSMAN: 'Branşman vanası',
};
export function vanaDisplayName(vana) {
    return VANA_DISPLAY[vana?.vanaTipi] || 'Vana';
}

// Branşmanlar için: "X nolu hattaki D2 branşmanı" / "branşman vanası"
// Diğer vanalar: "X nolu hattaki AKV"
export function vanaHatLabel(manager, vana) {
    const hatNo = hatNoForComp(manager, vana);
    const pre = hatPrefix(hatNo);
    let ad;
    if (vana?.vanaTipi === 'BRANSMAN') {
        const d = daireLabel(vana);
        ad = d ? `${d} branşmanı` : 'branşman vanası';
    } else {
        ad = vanaDisplayName(vana);
    }
    return pre ? `${pre} ${ad}` : ad;
}

// Bir borunun ait olduğu kolon hat numarası (basit alias)
export function hatNoForPipeId(manager, pipeId) {
    return hatNoForPipe(manager, pipeId);
}
