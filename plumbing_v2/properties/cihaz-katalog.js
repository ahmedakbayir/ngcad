// cihaz-katalog.js
// Kombi ve ocak için marka/model kataloğu.
//   - Demo varsayılan listeyle başlar (KOMBI / OCAK)
//   - Kullanıcı ekleyip silebilir; silme soft-delete (deleted=true) — geçmiş verisi kaybolmaz
//   - state.cihazKatalog içinde tutulur, proje JSON ile birlikte yazılır/okunur
//
// Şema:
//   {
//     KOMBI: [
//       { marka:'BOSCH', model:'Condens GC2201iW 24 C 23', kw:24, deleted:false },
//       ...
//     ],
//     OCAK: [ ... ]
//   }
//
// "kw" alanı modelin nominal kapasitesidir; modeli seçince cihazın kapasiteKW
// (ve oradan kcal) alanına atanır.

import { state } from '../../general-files/main.js';

// ─── DEMO LİSTELER ────────────────────────────────────────────────────────

const DEFAULT_KOMBI = [
    { marka: 'BOSCH',       model: 'Condens GC2201iW 24 C 23',              kw: 24   },
    { marka: 'BOSCH',       model: 'Condens GC2200iW 20/25 C 23 ',          kw: 20   },
    { marka: 'BOSCH',       model: 'Condens GC5700IW 30/30 C 23',           kw: 31.1 },
    { marka: 'BOSCH',       model: 'Condens GC5700IW 35/35 C 23',           kw: 35   },
    { marka: 'BOSCH',       model: 'Condens GC1200W 28/30 C 23',            kw: 28   },
    { marka: 'BAYMAK',      model: 'DUOTEC 42',                             kw: 41.8 },
    { marka: 'BAYMAK',      model: 'NOVADENS 24',                           kw: 23.7 },
    { marka: 'BAYMAK',      model: 'LUNATEC PREMIX 24',                     kw: 23.9 },
    { marka: 'ECA',         model: 'CALORA PREMIX 24 HM',                   kw: 24   },
    { marka: 'ECA',         model: 'PROTEUS PREMIX 35 HM',                  kw: 35   },
    { marka: 'ECA',         model: 'CITIUS PREMIX 24 HM',                   kw: 24   },
    { marka: 'ECA',         model: 'CONFEO PREMİX P 30',                    kw: 30   },
    { marka: 'ECA',         model: 'PROTEUS PREMIX X 30 HM',                kw: 29.6 },
    { marka: 'ECA',         model: 'PROTEUS PREMIX H2 BLEND READY 30 HM DG',kw: 30   },
    { marka: 'DAIKIN',      model: 'D2CPX024',                              kw: 24.1 },
    { marka: 'DAIKIN',      model: 'EHYKOMB33AA',                           kw: 32.7 },
    { marka: 'DAIKIN',      model: 'VZ Premix 30 kW D2CPX030',              kw: 29.8 },
    { marka: 'DAIKIN',      model: 'VZ Premix 26 kW D2CPX026',              kw: 26.1 },
    { marka: 'DAIKIN',      model: 'CSU Premix 24 kW D2CNL024',             kw: 24   },
    { marka: 'İMMERGAS',    model: 'Victrix TERA V2 32 EU',                 kw: 28   },
    { marka: 'İMMERGAS',    model: 'Victrix OMNIA',                         kw: 20.2 },
    { marka: 'VİESSMANN',   model: 'Vitodens 050-W 24 kW',                  kw: 24   },
    { marka: 'VİESSMANN',   model: 'Vitodens 100-W - 32 kW',                kw: 32   },
    { marka: 'VAİLLANT',    model: 'VUW 18/24 AS/1-1 (H-TR) ecoTEC intro',  kw: 18.3 },
    { marka: 'VAİLLANT',    model: 'VUW 24/28 AS/1-1 (H-TR) ecoTEC intro',  kw: 23.9 },
    { marka: 'VAİLLANT',    model: 'VUW 246/1-RC (H-TR)',                   kw: 24.1 },
    { marka: 'VAİLLANT',    model: 'VUW 236/7-2 (H-TR) S',                  kw: 18.5 },
    { marka: 'VAİLLANT',    model: 'VUW 286/7-2 (H-TR) S',                  kw: 26.1 },
    { marka: 'VAİLLANT',    model: 'VUW 286/1-RC (H-TR)',                   kw: 27.4 },
    { marka: 'WARMHAUS',    model: 'LAWA PLUS 24',                          kw: 24   },
    { marka: 'WARMHAUS',    model: 'PRIWA PLUS ErP 28',                     kw: 29.5 },
    { marka: 'BUDERUS',     model: 'GB122i.2-24 KD H',                      kw: 25   },
    { marka: 'BUDERUS',     model: 'GB022i-24 K H',                         kw: 25.2 },
    { marka: 'BUDERUS',     model: 'GB072 - 24K (V2)',                      kw: 23.8 },
    { marka: 'BUDERUS',     model: 'GB062-20 KD H',                         kw: 20.4 },
    { marka: 'BUDERUS',     model: 'GB122i-24 KD H',                        kw: 25   },
    { marka: 'DE DIETRICH', model: 'Naneo S 24',                            kw: 20.9 },
    { marka: 'DE DIETRICH', model: 'INIDENS 24',                            kw: 23.9 },
    { marka: 'DE DIETRICH', model: 'INIDENS NEO 35',                        kw: 30   },
    { marka: 'DE DIETRICH', model: 'INIDENS NEO 30',                        kw: 29.9 },
    { marka: 'DE DIETRICH', model: 'AGC 35',                                kw: 34.8 },
    { marka: 'DEMİRDÖKÜM',  model: 'Atron Condense P 24-FC/3 (H-TR)',       kw: 24.5 },    
    { marka: 'DEMİRDÖKÜM',  model: 'Atromix P 20 - A/2 (H-TR)',             kw: 20.4 },
    { marka: 'DEMİRDÖKÜM',  model: 'NİTROMİX P 28',                         kw: 28   },
    { marka: 'DEMİRDÖKÜM',  model: 'NİTROMİX P 24',                         kw: 24   },
    { marka: 'DEMİRDÖKÜM',  model: 'Nitromix ioni P34/36-CS/1 (N-TR)',      kw: 34   },
    { marka: 'DEMİRDÖKÜM',  model: 'Atromix P 28 - A/2 (H-TR)',             kw: 28.3 },
    { marka: 'DEMİRDÖKÜM',  model: 'Atron Condense P 24-FC/3 (H-TR)',       kw: 24.5 },
    { marka: 'DEMİRDÖKÜM',  model: 'ademiX P 28/28 AS/2 (H-TR)',            kw: 28   },
    { marka: 'DEMİRDÖKÜM',  model: 'ademiX P 24/28-AS/1 (H-TR)',            kw: 23.9 },
];

const DEFAULT_OCAK = [
    { marka: 'ARÇELİK',    model: 'BFG04H12X',                              kw: 8.3  },
    { marka: 'ARÇELİK',    model: 'BFG04H11X',                              kw: 7.9  },
    { marka: 'ARÇELİK',    model: '60BSGO2222321',                          kw: 8.3  },
    { marka: 'ARÇELİK',    model: 'AH153221',                               kw: 9.5  },
    { marka: 'Beko',       model: 'BFG04H11X',                              kw: 7.9  },
    { marka: 'Beko',       model: 'LU12111211',                             kw: 12.4 },
    { marka: 'Beko',       model: 'GO121',                                  kw: 9    },
    { marka: 'EMİNÇELİK',  model: '22 385 Ocak 10,8 kW',                    kw: 10.8 },
    { marka: 'EMİNÇELİK',  model: '41 220 Ocak 4,3 kW',                     kw: 4.3  },
    { marka: 'EMİNÇELİK',  model: '34 230 Ocak 7 kW',                       kw: 7    },
    { marka: 'FRANKE',     model: 'FHNL 905 4G TC XS C',                    kw: 11.3 },
    { marka: 'FRANKE',     model: 'FHNS 905 4G TC BK C',                    kw: 11.3 },
    { marka: 'FRANKE',     model: 'FHNS 604 4G WH C',                       kw: 7.5  },
    { marka: 'KUMTEL',     model: 'KO-420F',                                kw: 6.6  },
    { marka: 'KUMTEL',     model: 'KO-430F',                                kw: 4    },
    { marka: 'LUXELL',     model: 'M6-40BF',                                kw: 6.6  },
    { marka: 'LUXELL',     model: 'M6-31BF',                                kw: 6.6  },
    { marka: 'SILVERLINE', model: 'CS5363',                                 kw: 11.2 },
    { marka: 'SILVERLINE', model: 'CS5349',                                 kw: 7.4  },
    { marka: 'GAGGENAU',   model: 'VG231220 Wok Ocak 6 kW',                 kw: 6    },
    { marka: 'GAGGENAU',   model: 'CG261210 Ankastre Ocak 9,75 kW',         kw: 9.75 },
    { marka: 'ALVEUS',     model: 'GLS SE 640',                             kw: 6.35 },
    { marka: 'ALVEUS',     model: 'GLS 640 bl',                             kw: 6.35 },
];

export const CIHAZ_KATALOG_TIPLERI = ['KOMBI', 'OCAK'];

function _normTip(tip) {
    return String(tip || '').toUpperCase();
}

function _cloneList(list) {
    return list.map(e => ({ ...e, deleted: !!e.deleted }));
}

/** Sıfırdan demo katalog döndürür (yeni proje veya eksik state için). */
export function getDefaultCihazKatalog() {
    return {
        KOMBI: _cloneList(DEFAULT_KOMBI),
        OCAK:  _cloneList(DEFAULT_OCAK),
    };
}

/**
 * state.cihazKatalog hazır değilse demo katalog ile doldurur.
 * Çağrılana referans döner — aynı obje ileride yeniden kullanılır.
 */
export function ensureCihazKatalog() {
    if (!state.cihazKatalog || typeof state.cihazKatalog !== 'object') {
        state.cihazKatalog = getDefaultCihazKatalog();
    } else {
        // Tip anahtarları eksikse tamamla
        CIHAZ_KATALOG_TIPLERI.forEach(t => {
            if (!Array.isArray(state.cihazKatalog[t])) state.cihazKatalog[t] = [];
        });
    }
    return state.cihazKatalog;
}

/** Verilen tip için tüm girişler (aktif + soft-deleted). */
function _allEntries(tip) {
    const k = ensureCihazKatalog();
    return Array.isArray(k[_normTip(tip)]) ? k[_normTip(tip)] : [];
}

/**
 * Aktif (silinmemiş) markalar — keepValue varsa silinmiş olsa bile listeye dahil
 * edilir (mevcut nesnenin değeri seçili görünebilsin diye).
 */
export function getMarkaList(tip, keepValue) {
    const list = _allEntries(tip);
    const seen = new Set();
    const out = [];
    for (const e of list) {
        if (!e.marka) continue;
        if (seen.has(e.marka)) continue;
        const isActive = list.some(x => x.marka === e.marka && !x.deleted);
        if (!isActive && e.marka !== keepValue) continue;
        seen.add(e.marka);
        out.push(e.marka);
    }
    // keepValue katalogda hiç yoksa yine de listeye ekle (kayıp veriyi göster)
    if (keepValue && !seen.has(keepValue)) out.unshift(keepValue);
    return out;
}

/**
 * Verilen marka için modeller. keepValue silinmiş veya katalogda yok olsa bile
 * mevcut nesnenin değeri seçili görünebilsin diye listeye eklenir.
 */
export function getModelList(tip, marka, keepValue) {
    if (!marka) return keepValue ? [keepValue] : [];
    const list = _allEntries(tip);
    const out = [];
    const seen = new Set();
    for (const e of list) {
        if (e.marka !== marka) continue;
        if (!e.model) continue;
        if (e.deleted && e.model !== keepValue) continue;
        if (seen.has(e.model)) continue;
        seen.add(e.model);
        out.push(e.model);
    }
    if (keepValue && !seen.has(keepValue)) out.unshift(keepValue);
    return out;
}

/** Marka+model'den modelin kw kapasitesini döndürür. Bulunmazsa null. */
export function getModelKW(tip, marka, model) {
    if (!marka || !model) return null;
    const e = _allEntries(tip).find(x => x.marka === marka && x.model === model);
    return e && Number.isFinite(e.kw) ? e.kw : null;
}

/**
 * Yeni marka+model girişi ekler. Aynı satır varsa deleted=false yapar.
 * @returns {boolean} eklendi/diriltildi mi
 */
export function addCihazEntry(tip, marka, model, kw) {
    if (!marka || !model) return false;
    const list = _allEntries(tip);
    const exist = list.find(x => x.marka === marka && x.model === model);
    if (exist) {
        exist.deleted = false;
        if (Number.isFinite(kw)) exist.kw = kw;
        return true;
    }
    list.push({ marka, model, kw: Number.isFinite(kw) ? kw : null, deleted: false });
    return true;
}

/**
 * Marka+model girişini soft-delete eder (silmez). Geçmişte bu modeli kullanan
 * cihazlarda eski seçim listede görünmeye devam eder.
 */
export function softDeleteCihazEntry(tip, marka, model) {
    const list = _allEntries(tip);
    let touched = false;
    for (const e of list) {
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
