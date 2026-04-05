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

export const BORU_TIPLERI    = ['ÇELİK', 'ESNEK'];
export const BAGLANTI_TIPLERI = ['DİŞLİ', 'KAYNAKLI'];
export const SAYAC_TURLERI   = ['KÖRÜKLÜ', 'ROTARY', 'TÜRBİN'];
export const SAYAC_TIPLERI   = [
    'G4', 'G6', 'G10', 'G16', 'G25', 'G40',
    'G65', 'G100', 'G160', 'G250', 'G400', 'G650', 'G1000',
];
export const BIRIM_TIPLERI   = ['KONUT', 'OFİS', 'TİCARİ', 'KAZAN DAİRESİ'];
export const ESNEK_BORU_MARKALARI = ['AYVAZ', 'GFS', 'KAS', 'HITACHI', 'PAKTERMO', 'LEXFLEX', 'KALDE', 'GFLEX'];

export const BORU_CAPLARI = {
    'ÇELİK': ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100'],
    'ESNEK': ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100'],
};

export const BORU_CAPLARI_TUMU = ['DN15', 'DN20', 'DN25', 'DN32', 'DN40', 'DN50', 'DN65', 'DN80', 'DN100'];

export const BACA_TIPLERI = ['Hermetik', 'Bacalı', 'Atmosferik'];

export const ARA_VANALAR       = ['AKV', 'KKV', 'EMNIYET', 'CIHAZ', 'SELENOID', 'SAYAC'];
export const SONLANMA_VANALARI = ['BRANSMAN', 'YANBINA', 'DOMESTIK'];
export const VANA_TIPLERI_LISTESI = [...ARA_VANALAR, ...SONLANMA_VANALARI];

export const VANA_TIP_ETIKETLERI = {
    AKV:      'AKV',
    KKV:      'KKV',
    EMNIYET:  'Emniyet',
    CIHAZ:    'Cihaz',
    SELENOID: 'Selenoid',
    SAYAC:    'Sayaç',
    BRANSMAN: 'Branşman',
    YANBINA:  'Yan Bina',
    DOMESTIK: 'Domestik',
};

export const SERVIS_KUTUSU_TIPLERI = ['S200', 'S300', 'S700', 'S2200', 'CES200'];
export const KUTU_BASINCLAR        = ['21', '300'];
export const CIKIS_YONLERI         = ['Yandan Çıkış', 'Alttan Çıkış', 'Üstten Çıkış'];

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

/** P1/P2 koordinat span'ı: değişen siyah, değişmeyen gri */
function _coordSpan(label, changed) {
    return changed
        ? `<span>${label}</span>`
        : `<span style="color:var(--color-secondary)">${label}</span>`;
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

/** Kapasite/verim değişince debi label'ını günceller. Verim % → /100 dönüşümü yapılır. */
function _refreshCihazDebi(obj, panelEl) {
    const debiSpan = panelEl.querySelector('[data-prop-id="cihazDebi"]');
    if (!debiSpan) return;
    const kcal  = parseFloat(obj.kapasiteKcal);
    const verim = (parseFloat(obj.verim) || 100) / 100;
    debiSpan.textContent = (!isNaN(kcal) && kcal > 0)
        ? `${(kcal / 8250 / verim).toFixed(2)} m³/h`
        : '—';
}

// ─── ÖZELLİK TANIMLARI ───────────────────────────────────────────────────────

export const PROPERTY_DEFS = {

    // ════════════════════════════════════════════════════════
    // BORU
    // ════════════════════════════════════════════════════════

    boru_sec_tip: { type: 'section', label: 'Tanım' },

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
        readonlyFn: (obj) => obj.debi != null ? `${obj.debi} m³/h` : '3.5 m³/h',
    },
    boruBasinc: {
        label: 'Basınç',
        type: 'readonly',
        readonlyFn: (obj) => obj.basinc != null ? `${obj.basinc} mbar` : '21 mbar',
    },
    boruHatBasincKaybi: {
        label: 'Hat Basınç Kaybı',
        type: 'readonly',
        readonlyFn: (obj) => obj.hatBasincKaybi != null ? `${obj.hatBasincKaybi} mbar` : '0.200 mbar',
    },
    boruKumulatifKayip: {
        label: 'Kümülatif Kayıp',
        type: 'readonly',
        readonlyFn: (obj) => obj.kumulatifKayip != null ? `${obj.kumulatifKayip} mbar` : '0.650 mbar',
    },
    
    boru_sec_konum: { type: 'section', label: 'Konum' },

    boruUzunluk: {
        label: 'Uzunluk',
        type: 'readonly',
        readonlyFn: (obj) => obj.uzunluk != null ? `${Math.round(obj.uzunluk)} cm` : '—',
    },

    boruP1: {
        label: 'P1',
        type: 'readonly',
        readonlyFn: (obj) => {
            if (!obj.p1 || !obj.p2) return '—';
            const x1 = Math.round(obj.p1.x), x2 = Math.round(obj.p2.x);
            const y1 = Math.round(obj.p1.y), y2 = Math.round(obj.p2.y);
            const z1 = Math.round(obj.p1.z || 0), z2 = Math.round(obj.p2.z || 0);
            return `${_coordSpan('x:'+x1, x1!==x2)}\u2002${_coordSpan('y:'+y1, y1!==y2)}\u2002${_coordSpan('z:'+z1, z1!==z2)}`;
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
            return `${_coordSpan('x:'+x2, x1!==x2)}\u2002${_coordSpan('y:'+y2, y1!==y2)}\u2002${_coordSpan('z:'+z2, z1!==z2)}`;
        },
    },

    boru_sec_ozellik: { type: 'section', label: 'Özellikler' },

    boruTopraklama: {
        label: 'Topraklama',
        type: 'toggle',
        key: 'topraklama',
        default: false,
    },
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

    sayacTipi: {
        label: 'Tip',
        type: 'select',
        key: 'sayacTipi',
        options: SAYAC_TIPLERI,
        default: 'G4',
    },
    sayacTuru: {
        label: 'Tür',
        type: 'select',
        key: 'sayacTuru',
        options: SAYAC_TURLERI,
        default: 'KÖRÜKLÜ',
    },
    sayacCikisCap: {
        label: 'Çıkış Çapı',
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

    sayac_sec_hesap: { type: 'section', label: 'Hesap Değerleri' },

    sayacdebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.sayacdebi != null ? `${obj.sayacdebi} m³/h` : '3.50 m³/h',
    },
    sayacMinDebi: {
        label: 'Min Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.minDebi != null ? `${obj.minDebi} m³/h` : '0.04 m³/h',
    },
    sayacMaxDebi: {
        label: 'Max Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.maxDebi != null ? `${obj.maxDebi} m³/h` : '6.00 m³/h',
    },
    sayacBasinc: {
        label: 'Basınç',
        type: 'select',
        key: 'basinc',
        options: KUTU_BASINCLAR,
        default: '21',
        // Servis kutusu varsa değer oradan gelir, combobox disabled
        disabledFn: (_obj, manager) => {
            if (!manager) return false;
            return manager.components.some(c => c.type === 'servis_kutusu');
        },
    },

    sayac_sec_birim_ici: { type: 'section', label: 'Birim İçi' },

    sayacBirimBoruTipi: {
        label: 'Boru Tipi',
        type: 'select',
        key: 'birimBoruTipi',
        options: BORU_TIPLERI,
        default: 'ÇELİK',
        afterChange: (obj, _manager, panelEl) => {
            const sel = panelEl?.querySelector('[data-prop-key="birimBaglantiTipi"]');
            if (!sel) return;
            if (obj.birimBoruTipi === 'ESNEK') {
                obj.birimBaglantiTipi = 'DİŞLİ';
                sel.value = 'DİŞLİ';
                sel.disabled = true;
            } else {
                sel.disabled = false;
            }
        },
    },
    sayacBirimBaglantiTipi: {
        label: 'Bağlantı Tipi',
        type: 'select',
        key: 'birimBaglantiTipi',
        options: BAGLANTI_TIPLERI,
        default: 'KAYNAKLI',
        disabledFn: (obj) => obj.birimBoruTipi === 'ESNEK',
    },
    sayacEsnekMarka: {
        label: 'Esnek Marka',
        type: 'select',
        key: 'esnekMarka',
        options: ESNEK_BORU_MARKALARI,
        placeholder: '— seçiniz —',
        default: '',
        disabledFn: (obj) => obj.birimBoruTipi !== 'ESNEK',
    },

    sayac_sec_ozellik: { type: 'section', label: 'Özellikler' },

    sayacMuhafaza: {
        label: 'Muhafaza',
        type: 'toggle',
        key: 'muhafaza',
        default: false,
    },

    sayac_sec_abone: { type: 'section', label: 'Abone Bilgileri' },

    sayacAboneNo: {
        label: 'Abone No',
        type: 'text',
        key: 'aboneNo',
        default: '',
        placeholder: 'Abone numarası...',
    },
    sayacAboneAdi: {
        label: 'Abone Adı',
        type: 'text',
        key: 'aboneAdi',
        default: '',
        placeholder: 'Ad Soyad...',
    },

    sayac_sec_yapan: { type: 'section', label: 'Yapan' },

    sayacUstaAdi: {
        label: 'Usta Adı',
        type: 'text',
        key: 'ustaAdi',
        default: '',
        placeholder: 'Usta adı...',
    },
    sayacUstaNo: {
        label: 'Usta No',
        type: 'text',
        key: 'ustaNo',
        default: '',
        placeholder: 'Usta sicil no...',
    },

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
            // DN65 altına düşünce flanşı kapat
            if (!_isDN65Plus(obj.vanaCap) && obj.flans) {
                obj.flans = false;
                const cb = panelEl?.querySelector('[data-prop-key="flans"]');
                if (cb) cb.checked = false;
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
    },

    vana_sec_birim: {
        type: 'section',
        label: 'Birim',
        visibleFn: (obj) => ['BRANSMAN', 'YANBINA', 'DOMESTIK', 'SAYAC'].includes(obj.vanaTipi),
    },

    vanaBirimNo: {
        label: 'Birim No',
        type: 'text',
        key: 'birimNo',
        default: '',
        placeholder: 'Birim no...',
        visibleFn: (obj) => ['BRANSMAN', 'YANBINA', 'DOMESTIK', 'SAYAC'].includes(obj.vanaTipi),
    },

    vana_sec_hesap: { type: 'section', label: 'Hesap Değerleri' },

    vanaDebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => obj.debi != null ? `${obj.debi} m³/h` : '3.50 m³/h',
    },
    vanaBasinc: {
        label: 'Basınç',
        type: 'readonly',
        readonlyFn: (obj) => obj.basinc != null ? `${obj.basinc} mbar` : '21 mbar',
    },
    vanaBasincKaybi: {
        label: 'Basınç Kaybı',
        type: 'readonly',
        readonlyFn: (obj) => obj.basincKaybi != null ? `${obj.basincKaybi} mbar` : '0.500 mbar',
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
            const basinc = parseFloat(obj.kutuBasinc);
            if (isNaN(basinc)) return;
            // Bağlı tüm boru ve sayaçlara basıncı yay
            manager.pipes.forEach(p => { p.basinc = basinc; });
            manager.components.forEach(c => {
                if (c.type === 'sayac') c.basinc = obj.kutuBasinc; // string, select ile uyumlu
            });
        },
    },
    kutuCikisYonu: {
        label: 'Çıkış Yönü',
        type: 'select',
        key: 'cikisYonu',
        options: CIKIS_YONLERI,
        default: 'Yandan Çıkış',
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

    // ════════════════════════════════════════════════════════
    // CİHAZ — ORTAK
    // ════════════════════════════════════════════════════════

    cihazDebi: {
        label: 'Debi',
        type: 'readonly',
        readonlyFn: (obj) => {
            const kcal  = parseFloat(obj.kapasiteKcal);
            const verim = (parseFloat(obj.verim) || 100) / 100;
            if (isNaN(kcal) || kcal <= 0) return '—';
            return `${(kcal / 8250 / verim).toFixed(2)} m³/h`;
        },
    },

    // Sayaç debi çubuğu — min/mevcut/max görseli
    sayacDebiCubugu: {
        type: 'bar',
        barFn: (obj) => {
            const _pf = (v, d) => { const n = parseFloat(v); return isNaN(n) ? d : n; };
            const minD = _pf(obj.minDebi,        0.04);
            const maxD = _pf(obj.maxDebi,        6.00);
            const curD = _pf(obj.sayacdebi,    3.50);
            const range = maxD - minD || 1;
            // Ham yüzde: [0,100] dışına çıkabilir
            const rawPct = ((curD - minD) / range) * 100;
            // Kenar kenetleme: çok uzakta ise ~4% içe al (görsel 1cm)
            const EDGE = 4;
            const pct = rawPct < 0   ? EDGE
                      : rawPct > 100 ? 100 - EDGE
                      :                rawPct;
            const pctStr = pct.toFixed(1);
            return `
<div class="debi-bar">
  <div class="debi-track">
    <span class="debi-label-cur" style="left:${pctStr}%">debi<br>${curD.toFixed(2)} m³/h</span>
    <span class="debi-arrow debi-arrow-end" style="left:0%">▽</span>
    <span class="debi-arrow debi-arrow-cur" style="left:${pctStr}%">▽</span>
    <span class="debi-arrow debi-arrow-end" style="left:100%">▽</span>
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
        afterChange: (obj, _manager, panelEl) => _refreshCihazDebi(obj, panelEl),
    },

    kombi_sec_urun: { type: 'section', label: 'Ürün' },

    kombiMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: 'DEMİRDÖKÜM',
        placeholder: 'Marka...',
    },
    kombiModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: 'AdemiX P 24/24 AS/2 (H-TR)',
        placeholder: 'Model...',
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
        disabled: true,
    },

    ocak_sec_urun: { type: 'section', label: 'Ürün' },

    ocakMarka: {
        label: 'Marka',
        type: 'text',
        key: 'marka',
        default: 'ARÇELİK',
        placeholder: 'Marka...',
    },
    ocakModel: {
        label: 'Model',
        type: 'text',
        key: 'model',
        default: 'AH153221',
        placeholder: 'Model...',
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
};

// ─── NESNE → ÖZELLİK LİSTESİ ────────────────────────────────────────────────

export const OBJECT_PROPERTIES = {
    boru: [
        'boru_sec_urun',
        'boruMarka',
        'boruModel',
        'boru_sec_tip',
        'boruCap',
        'boruTipi',
        'boru_sec_hesap',
        'boruDebi',
        'boruBasinc',
        'boruHatBasincKaybi',
        'boruKumulatifKayip',
        'boru_sec_konum',
        'boruUzunluk',
        'boruP1',
        'boruP2',
        'boru_sec_ozellik',
        'boruTopraklama',
        'boruGomulu',
    ],
    sayac: [
        'sayac_sec_tanim',
        'sayacTipi',
        'sayacTuru',
        'sayacCikisCap',
        'sayacBasinc',
        'sayac_sec_hesap',
        'sayacDebiCubugu',
        'sayac_sec_birim_ici',
        'sayacBirimBaglantiTipi',
        'sayacBirimBoruTipi',
        'sayacEsnekMarka',
        'sayac_sec_ozellik',
        'sayacMuhafaza',
        'sayac_sec_abone',
        'sayacAboneNo',
        'sayacAboneAdi',
        'sayac_sec_yapan',
        'sayacUstaAdi',
        'sayacUstaNo',
    ],
    vana: [
        'vana_sec_urun',
        'vanaMarka',
        'vanaModel',
        'vana_sec_birim',
        'vanaBirimNo',
        'vana_sec_tanim',
        'vanaTipi',
        'vanaCap',
        'vana_sec_ozellik',
        'vanaIzolator',
        'vanaFlans',
        'vanaMuhafaza',
        'vana_sec_hesap',
        'vanaDebi',
        'vanaBasinc',
        'vanaBasincKaybi',
    ],
    servis_kutusu: [
        'kutu_sec_tanim',
        'kutuTipi',
        'kutuBasinc',
        'kutuCikisYonu',
        'kutuCikisCap',
        'kutuBoruTipi',
        'kutuBaglantiTipi',
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
        boru:         'Boru',
        sayac:        'Sayaç',
        vana:         'Vana',
        servis_kutusu:'Servis Kutusu',
        cihaz:        'Cihaz',
    };
    return labels[type] || type;
}
