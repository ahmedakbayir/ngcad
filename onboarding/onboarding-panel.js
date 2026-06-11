// onboarding-panel.js
// Welcome / new-project onboarding panel.
// Compact layout: project name on top, 3 tabs (Adres | Tesisat | Sorumlu),
// schematic preview only visible on Tesisat tab.

import { state, setState } from '../general-files/main.js';
import { draw2D } from '../draw/draw2d.js';
import { renderMiniPanel } from '../floor/floor-panel.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { OnboardingSchematic } from './onboarding-schematic.js';
import {
    getIller,
    getIlceler,
    getMahalleler,
    getCaddeSokaklar,
    adFromKod,
    loadAddressIndex,
    loadStreets,
    isIndexLoaded,
    isStreetsLoaded,
} from './address-data.js';
import {
    fetchBinaByTesisatNo,
    fetchBinaByAboneTuketimNo,
} from './dummy-service.js';

const LS_SHOW_AT_START = 'onboarding_show_at_start';
const LS_LAST_SETTINGS = 'onboarding_last_settings';

// ── YANDEX API KEYS ────────────────────────────────────────────────
// İki ayrı servis, iki ayrı key (developer.tech.yandex.com'dan ücretsiz alınır):
//   - JS API key  → harita widget'ı yüklemek ve ymaps.geocode() çağrısı için
//   - Geocoder API key → HTTP geocode-maps.yandex.ru/v1/ fetch çağrısı için
// Boşsa (''), o servis atlanır.
const YANDEX_JS_API_KEY       = '523911f6-824a-4ae0-b29f-c2d7e66af38d';
const YANDEX_GEOCODER_API_KEY = '1662d8b0-5c87-4a4c-8bae-85b42f8c8b46';

const DEFAULT_FORM = {
    projectName: 'Ahmet Akbayır',

    // Adres
    // Mod seçimi: 'servis' = Bina Tesisat No / Abone Tüketim No ile çek (öncelik),
    //             'sec'    = İl/İlçe/Mahalle/Cadde-Sokak combobox + Kapı No
    adresMode: 'servis',
    servis: {
        binaTesisatNo: '',
        aboneTuketimNo: '',
        // Son başarılı sorgu sonucunun özeti (UI'da göstermek için).
        lastResult: null, // { binaTesisatNo, aboneAdi?, birimSayisi, kaynak: 'bina' | 'abone' }
    },
    adres: {
        // Cascading combobox kodları (Adres Seç modu için)
        ilKod: '34',
        ilceKod: '',
        mahalleKod: '',
        cadSokKod: '',
        // Görünür ad alanları (her iki modda da doldurulur, state'e bunlar gider)
        il: 'İSTANBUL',
        ilce: '',
        mahalle: '',
        sokak: '',
        binaNo: '',     // Kapı No olarak gösterilir
        lat: null,
        lng: null,
    },
    birimler: [],
    binaBilgi: null, // Servisten gelen: { daireSayisi, dukkanSayisi, katSayisi, alan, kapasite }

    // Tesisat
    // projectType = (kolonTadilat || icTesisatTadilat) ? 'tadilat' : 'yeni'
    // — switch'ler değiştikçe syncProjectType() tarafından türetilir.
    projectType: 'yeni',
    tadilatSebep: '',
    projeKapagiNotu: '',
    kolonVar: true,
    kolonTadilat: false,           // sadece kolonVar=true iken anlamlı
    icTesisatVar: true,
    icTesisatTadilat: false,       // sadece icTesisatVar=true iken anlamlı
    birimTadilat: {},              // birimNo → bool (her birim için bağımsız tadilat override)
    kutuTipi: 'duvar',             // 'duvar' | 'yer'
    kutuBasinc: '21',              // '21' | '300' mbar — projeden veya servisten gelir
    zeminKatYukseklik: 300,
    zeminKat0Offset: 0,
    bodrumSayisi: 0,
    normalKatSayisi: 0,
    tumKatlarAyniYukseklik: true,
    katYukseklikleri: [],
    // Kolon yokken (kolonVar=false) hangi katlarda iç tesisat yapılacağı.
    // Index düzeni katYukseklikleri ile birebir: [bodrum1, bodrum2..., zemin, kat1, kat2...].
    // Default tüm katlar false; kullanıcı işaretlediği katları true yapar.
    katIcTesisatVar: [],
    isinmaTipi: 'bireysel',        // 'bireysel' | 'merkezi' | 'boylerli'
    mustakilProje: false,
    onProje: false,

    // Sorumlu (dummy defaults)
    sorumlu: {
        yetkiliFirma: 'AKRE ISI MÜHENDİSLİK',
        yetkiliMuhendis: 'AHMET AKBAYIR',
        projeyiCizen: 'ÖMER ÇELİK',
        usta: 'FATİH KAYA',
    },
};

const TAB_IDS = ['adres', 'tesisat', 'katlar', 'sorumlu'];
const TAB_META = {
    adres:   { label: 'Adres' },
    tesisat: { label: 'Tesisat' },
    katlar:  { label: 'Katlar' },
    sorumlu: { label: 'Sorumlu' },
};

let form = deepClone(DEFAULT_FORM);
let currentTab = 'adres';
let overlay = null;
let schematic = null;
let ymap = null;
let ymark = null;
let ymapsLoadPromise = null;
// 'create' = yeni proje (default); 'edit' = mevcut projeyi düzenle (Proje Detayları menüsünden).
// Edit modunda form mevcut state'ten doldurulur ve uygulanırken katlar/duvarlar korunur.
let panelMode = 'create';

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── PUBLIC API ─────────────────────────────────────────────────────
export function showOnboardingPanel(force = false, mode = 'create') {
    if (!force) {
        const pref = localStorage.getItem(LS_SHOW_AT_START);
        if (pref === 'false') return;
    }
    if (!overlay) buildOverlay();
    panelMode = (mode === 'edit') ? 'edit' : 'create';
    if (panelMode === 'edit') {
        form = buildFormFromState();
    } else {
        form = deepClone(DEFAULT_FORM);
    }
    syncKatYukseklikleri();
    currentTab = 'adres';
    renderAll();
    overlay.classList.add('ob-visible');
    setTimeout(() => {
        const input = overlay.querySelector('.ob-project-input');
        if (input) input.focus();
    }, 100);
}

export function hideOnboardingPanel() {
    if (overlay) overlay.classList.remove('ob-visible');
    if (ymap) {
        try { ymap.destroy(); } catch {}
        ymap = null;
        ymark = null;
    }
}

window.__showOnboarding = showOnboardingPanel;

// ── BUILD DOM ──────────────────────────────────────────────────────
function buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
        <div class="ob-panel" role="dialog" aria-modal="true">
            <header class="ob-top">
                <input type="text" class="ob-project-input" id="ob-project-name"
                       placeholder="Proje adı..." autocomplete="off" />
                <div class="ob-summary-bar" id="ob-summary-bar"></div>
                <button class="ob-close" id="ob-close" type="button" aria-label="Kapat">×</button>
            </header>

            <aside class="ob-tabs" id="ob-tabs"></aside>

            <section class="ob-body">
                <div class="ob-form" id="ob-form"></div>
            </section>

            <section class="ob-schematic" id="ob-schematic">
                <div class="ob-schematic-header">
                    <span>ŞEMATİK ÖNİZLEME</span>
                    <span class="ob-schematic-hint">↕ sürükle: konum / yükseklik</span>
                </div>
                <div class="ob-canvas-wrap">
                    <canvas class="ob-canvas" id="ob-canvas"></canvas>
                </div>
            </section>

            <footer class="ob-footer">
                <label class="ob-footer-switch">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-show-at-start" />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Açılışta göster</span>
                </label>
                <div class="ob-footer-info">Tüm seçenekler daha sonra değiştirilebilir.</div>
                <button class="ob-cta" id="ob-start" type="button">Projeye Başla →</button>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#ob-project-name').addEventListener('input', e => {
        form.projectName = e.target.value;
        updateCTA();
    });

    overlay.querySelector('#ob-close').addEventListener('click', hideOnboardingPanel);

    overlay.querySelector('#ob-tabs').addEventListener('click', e => {
        const item = e.target.closest('.ob-tab');
        if (!item) return;
        switchTab(item.dataset.tab);
    });

    const sw = overlay.querySelector('#ob-show-at-start');
    sw.checked = localStorage.getItem(LS_SHOW_AT_START) !== 'false';
    sw.addEventListener('change', () => {
        localStorage.setItem(LS_SHOW_AT_START, sw.checked ? 'true' : 'false');
    });

    overlay.querySelector('#ob-start').addEventListener('click', () => {
        if (panelMode === 'edit') applyEditAndClose();
        else applyAndClose();
    });

    const canvas = overlay.querySelector('#ob-canvas');
    schematic = new OnboardingSchematic(
        canvas,
        () => form,
        partial => { Object.assign(form, partial); syncKatYukseklikleri(); renderForm(); schematic.render(); }
    );

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('ob-visible')) {
            hideOnboardingPanel();
        }
    });
}

function switchTab(id) {
    if (!TAB_IDS.includes(id) || id === currentTab) return;
    // Leaving adres tab: tear down map so it can be re-initialized cleanly next time
    if (currentTab === 'adres' && ymap) {
        try { ymap.destroy(); } catch {}
        ymap = null;
        ymark = null;
    }
    currentTab = id;
    renderTabs();
    renderForm();
    updateSchematicVisibility();
}

// ── RENDER ─────────────────────────────────────────────────────────
function renderAll() {
    renderTopBar();
    renderSummaryBar();
    renderTabs();
    renderForm();
    updateSchematicVisibility();
    updateCTA();
}

// Üst şerit — proje türü, ısınma, basınç, kolon/iç tesisat, müstakil, ruhsat
// özetini chip dizisi olarak gösterir. Değer yoksa "-" (soluk) görünür.
function renderSummaryBar() {
    const bar = overlay.querySelector('#ob-summary-bar');
    if (!bar) return;
    const items = [
        summaryKolon(),
        summaryProjectType(),
        summaryIsinma(),
        summaryBasinc(),
        summaryMustakil(),
        summaryOnProje(),
    ];
    bar.innerHTML = items.map((it, i) => {
        const sep = i > 0 ? `<span class="ob-summary-sep"></span>` : '';
        const cls = it.empty ? 'is-empty' : (it.tone || '');
        return `${sep}<span class="ob-summary-chip ${cls}">${it.text}</span>`;
    }).join('');
}

function summaryProjectType() {
    if (form.projectType === 'tadilat') return { text: 'TADİLAT', tone: 'amber' };
    return { text: 'YENİ', tone: 'blue' };
}
function summaryIsinma() {
    if (form.isinmaTipi === 'merkezi')  return { text: 'MERKEZİ',          tone: 'cyan' };
    if (form.isinmaTipi === 'boylerli') return { text: 'MERKEZİ BOYLERLİ', tone: 'cyan' };
    return { text: 'BİREYSEL', tone: 'cyan' };
}
function summaryBasinc() {
    // Projeden veya servisten gelen kutuBasinc'ı kullan — duvar/yer tipi belirleyici DEĞİL.
    const b = String(form.kutuBasinc || '').trim();
    return b ? { text: `${b} mbar`, tone: 'mute' } : { text: '-', empty: true };
}
function summaryKolon() {
    // Kolon var + İç tesisat var → KOLON + İÇ TES.
    // Sadece kolon → KOLON. Sadece iç tesisat → İÇ TESİSAT. İkisi de yok → "-".
    if (form.kolonVar && form.icTesisatVar) return { text: 'KOLON + İÇ TESİSAT', tone: 'green' };
    if (form.kolonVar)     return { text: 'KOLON',     tone: 'green' };
    if (form.icTesisatVar) return { text: 'İÇ TESİSAT', tone: 'green' };
    return { text: '-', empty: true };
}
function summaryMustakil() {
    return form.mustakilProje ? { text: 'MÜSTAKİL', tone: 'violet' } : { text: '-', empty: true };
}
function summaryOnProje() {
    return form.onProje ? { text: 'ÖN PROJE', tone: 'pink' } : { text: '-', empty: true };
}

function renderTopBar() {
    overlay.querySelector('#ob-project-name').value = form.projectName;
}

function renderTabs() {
    const root = overlay.querySelector('#ob-tabs');
    const title = panelMode === 'edit' ? 'PROJE DETAYLARI' : 'YENİ PROJE';
    root.innerHTML = `
        ${TAB_IDS.map(id => {
            const isActive = id === currentTab;
            return `<div class="ob-tab ${isActive ? 'ob-tab-active' : ''}" data-tab="${id}">
                        <span class="ob-tab-label">${TAB_META[id].label}</span>
                    </div>`;
        }).join('')}
    `;
    // Edit modunda CTA "Uygula" olur, "Açılışta göster" anahtarı gizlenir.
    const cta = overlay.querySelector('#ob-start');
    if (cta) cta.textContent = panelMode === 'edit' ? 'Uygula' : 'Projeye Başla →';
    const swWrap = overlay.querySelector('.ob-footer-switch');
    if (swWrap) swWrap.style.display = panelMode === 'edit' ? 'none' : '';
    const info = overlay.querySelector('.ob-footer-info');
    if (info) info.textContent = panelMode === 'edit'
        ? 'Değişiklikler mevcut projeye uygulanacak.'
        : 'Tüm seçenekler daha sonra değiştirilebilir.';
}

function renderForm() {
    const root = overlay.querySelector('#ob-form');
    root.innerHTML = renderTabContent(currentTab);
    attachTabListeners(currentTab);
    if (currentTab === 'katlar' && schematic) schematic.render();
    if (currentTab === 'adres') {
        initMap();
        ensureAddressDataLoaded();
    }
    renderSummaryBar();
    updateCTA();
}

// Sokak yüklemesi tipik olarak <100 ms sürer; anlık "yükleniyor" mesajı pırpır
// etkisi yapar. Status'u 250 ms gecikmeyle göster — bu süre içinde tamamlanırsa
// hiç görünmesin.
let _streetsStatusShown = false;
let _streetsStatusTimer = null;
let _streetsLoadingFor = null; // şu an zamanlayıcı kurulu olan ilçe kodu

// Adres Seç modunda lazy veriler: indeks (il/ilçe/mahalle) + ilgili ilçenin sokakları.
// Yükleme tamamlanınca form re-render — kullanıcı bekleme animasyonu/durumu görür.
function ensureAddressDataLoaded() {
    if (form.adresMode !== 'sec') return;
    if (!isIndexLoaded()) {
        loadAddressIndex()
            .then(() => { if (currentTab === 'adres') renderForm(); })
            .catch(err => {
                console.warn('Adres indeksi yüklenemedi:', err);
                if (currentTab === 'adres') renderForm();
            });
    }
    const ilceKod = form.adres.ilceKod;
    if (ilceKod && !isStreetsLoaded(ilceKod)) {
        // Aynı ilçe için zamanlayıcı zaten kuruluysa yeniden kurma (re-render
        // ensureAddressDataLoaded'ı tekrar tetiklediğinde sonsuz döngü olmasın).
        if (_streetsLoadingFor !== ilceKod) {
            if (_streetsStatusTimer) clearTimeout(_streetsStatusTimer);
            _streetsLoadingFor = ilceKod;
            _streetsStatusShown = false;
            _streetsStatusTimer = setTimeout(() => {
                _streetsStatusTimer = null;
                if (currentTab === 'adres' && form.adres.ilceKod === ilceKod && !isStreetsLoaded(ilceKod)) {
                    _streetsStatusShown = true;
                    renderForm();
                }
            }, 250);
            loadStreets(ilceKod)
                .then(() => {
                    if (_streetsLoadingFor === ilceKod) {
                        if (_streetsStatusTimer) clearTimeout(_streetsStatusTimer);
                        _streetsStatusTimer = null;
                        _streetsStatusShown = false;
                        _streetsLoadingFor = null;
                    }
                    if (currentTab === 'adres') renderForm();
                })
                .catch(err => {
                    if (_streetsLoadingFor === ilceKod) {
                        if (_streetsStatusTimer) clearTimeout(_streetsStatusTimer);
                        _streetsStatusTimer = null;
                        _streetsStatusShown = false;
                        _streetsLoadingFor = null;
                    }
                    console.warn('Sokak verisi yüklenemedi:', err);
                    if (currentTab === 'adres') renderForm();
                });
        }
    } else {
        // Yükleme yok — bekleyen zamanlayıcıyı temizle.
        if (_streetsStatusTimer) clearTimeout(_streetsStatusTimer);
        _streetsStatusTimer = null;
        _streetsStatusShown = false;
        _streetsLoadingFor = null;
    }
}

function updateSchematicVisibility() {
    const sch = overlay.querySelector('#ob-schematic');
    const panel = overlay.querySelector('.ob-panel');
    const show = currentTab === 'katlar';
    sch.style.display = show ? '' : 'none';
    panel.classList.toggle('ob-no-schematic', !show);
}

function renderTabContent(id) {
    switch (id) {
        case 'adres':    return renderAdres();
        case 'tesisat':  return renderTesisat();
        case 'katlar':   return renderKatlar();
        case 'sorumlu':  return renderSorumlu();
    }
    return '';
}

// ── ADRES TAB ──────────────────────────────────────────────────────
// Yapı:
//   1) Adres bölümü = mod segmenti + 2 grup yan yana (Sorgu / Adres bilgileri)
//      Mod değişiminde HİÇBİR input ID yer değiştirmez; sadece is-active/is-passive
//      ile group seviyesinde görsel öncelik geçer ve inputlar disabled/enabled.
//   2) Bina özeti — servisten veri geldiyse compact 5 metrikli kart.
//   3) Konum & Birimler — sol grup Birimler listesi, sağ grup Harita + koordinatlar.
function renderAdres() {
    const isServis = form.adresMode === 'servis';
    return `
        <section class="adr-section">
            <div class="ob-seg ob-seg-block" id="ob-adres-mode">
                <button type="button" class="ob-seg-btn ${isServis ? 'ob-active' : ''}" data-val="servis">Servisten Al</button>
                <button type="button" class="ob-seg-btn ${!isServis ? 'ob-active' : ''}" data-val="sec">Adres Seç</button>
            </div>

            <div class="adr-row-grid">
                <div class="adr-group ${isServis ? 'is-active' : 'is-passive'}">
                    <div class="adr-group-head">
                        <span>Servisten sorgu</span>
                        <button type="button" class="adr-reset-btn" id="ob-reset-servis" title="Bina/abone no'larını ve servis verisini sıfırla" aria-label="Sıfırla">
                            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8 a 6 6 0 1 1 -1.8 -4.2"/><path d="M14 2 v 4 h -4"/></svg>
                        </button>
                    </div>
                    ${renderServisInputs(!isServis)}
                    <div class="adr-status" id="ob-servis-status"></div>
                </div>

                <div class="adr-group ${isServis ? 'is-passive' : 'is-active'}">
                    <div class="adr-group-head">
                        <span>Adres bilgileri</span>
                        <button type="button" class="adr-reset-btn" id="ob-reset-adres" title="Adres alanlarını sıfırla" aria-label="Sıfırla">
                            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8 a 6 6 0 1 1 -1.8 -4.2"/><path d="M14 2 v 4 h -4"/></svg>
                        </button>
                    </div>
                    ${isServis ? renderServisAdresFields() : renderAdresSec()}
                </div>
            </div>
        </section>
            <h2 class="adr-section-title"><p></h2>
        <section class="adr-section">
            <div class="adr-bina-ozet">
                ${renderOzetItem('Daire',       ozetDaire())}
                ${renderOzetItem('Dükkan',      ozetDukkan())}
                ${renderOzetItem('Toplam Alan', ozetAlan(),     'm²')}
                ${renderOzetItem('Kapasite',    ozetKapasite(), 'm³/h')}
                ${renderOzetItem('Kat Sayısı',  ozetKatSayisi())}
            </div>
        </section>
            <h2 class="adr-section-title"><p></h2>

        <section class="adr-section">
            <div class="adr-konum-grid">
                <div class="adr-group">
                    <div class="adr-group-head">Birimler${form.birimler?.length ? ` (${form.birimler.length})` : ''}</div>
                    <div class="adr-birim-list" id="ob-birimler-list">
                        ${renderBirimlerList(form.birimler)}
                    </div>
                </div>
                <div class="adr-group">
                    <div class="adr-group-head">Harita</div>
                    <div class="adr-konum-top">
                        ${numField('Enlem', 'adres.lat', form.adres.lat, 'any')}
                        ${numField('Boylam', 'adres.lng', form.adres.lng, 'any')}
                        <button type="button" class="ob-mini-btn adr-konum-btn" id="ob-geocode" title="Adresi OSM ile haritada bul">
                            <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><line x1="10.3" y1="10.3" x2="13.5" y2="13.5"/></svg>
                            Haritada Bul
                        </button>
                    </div>
                    <div class="adr-status" id="ob-geocode-status"></div>
                    <div class="adr-map-wrap">
                        <div class="ob-map" id="ob-map"></div>
                        <div class="adr-map-fallback" id="ob-map-fallback" style="display:none">
                            Harita yüklenemedi. Konumu yukarıdan elle girin.
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

// ── Bina özeti yardımcıları ────────────────────────────────────────
// Servisten bilgi geldiyse o değer kullanılır. Adres Seç modunda ya da bilgi
// gelmediğinde projeden türetilebilen alanlar (kat sayısı) form state'inden
// hesaplanır; türetilemeyenler "—" görünür.
function ozetValue(value, fallback = '—') {
    if (value == null) return fallback;
    if (value === '' || value === 0 || value === '0') return fallback;
    return value;
}
function ozetDaire() {
    const b = form.binaBilgi;
    if (b && b.daireSayisi != null) return ozetValue(b.daireSayisi);
    // form.birimler'den türet (sayaç listesi varsa Daire tipinde olanları say)
    const fromBirim = (form.birimler || []).filter(x => (x.aboneTipi || '').toLowerCase() === 'daire').length;
    return fromBirim > 0 ? fromBirim : '—';
}
function ozetDukkan() {
    const b = form.binaBilgi;
    if (b && b.dukkanSayisi != null) return ozetValue(b.dukkanSayisi);
    const fromBirim = (form.birimler || []).filter(x => (x.aboneTipi || '').toLowerCase() === 'dukkan').length;
    return fromBirim > 0 ? fromBirim : '—';
}
function ozetAlan() {
    return ozetValue(form.binaBilgi?.alan);
}
function ozetKapasite() {
    return ozetValue(form.binaBilgi?.kapasite);
}
function ozetKatSayisi() {
    if (form.binaBilgi?.katSayisi != null) return ozetValue(form.binaBilgi.katSayisi);
    // Projeden türet: bodrum + 1 (zemin) + normal kat
    const derived = (form.bodrumSayisi || 0) + 1 + (form.normalKatSayisi || 0);
    return derived;
}
function renderOzetItem(label, value, suffix) {
    const hasValue = value !== '—' && value !== '' && value != null;
    const display = hasValue && suffix ? `${value} ${suffix}` : value;
    return `
        <div class="adr-ozet-item">
            <span class="adr-ozet-k">${label}</span>
            <span class="adr-ozet-v ${hasValue ? '' : 'is-empty'}">${display}</span>
        </div>
    `;
}

// Birimler listesi — JSON tarzı tek satırlı kart (etiket | abone adı | tüketim no).
function renderBirimlerList(birimler) {
    if (!Array.isArray(birimler) || birimler.length === 0) {
        return `<div class="adr-birim-empty">Henüz birim yok</div>`;
    }
    return birimler.map(b => {
        const etiket = b.birimEtiketi || b.birimNo || '?';
        const adi    = b.aboneAdi    || '—';
        const tno    = b.aboneTuketimNo || '—';
        // Kopyalanabilir özet metni: "D1 | Mehmet Demir | 3001"
        const copyText = `${etiket} | ${adi} | ${tno}`;
        return `
            <div class="adr-birim-card">
                <div class="adr-birim-etiket">${escapeHtml(etiket)}</div>
                <div class="adr-birim-adi">${escapeHtml(adi)}</div>
                <div class="adr-birim-tno">${escapeHtml(tno)}</div>
                <button type="button" class="adr-birim-copy" data-copy="${escapeHtml(copyText)}" title="Kopyala" aria-label="Kopyala">
                    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="4.5" width="8" height="9" rx="1.2"/><path d="M3 11 V3 a 1 1 0 0 1 1 -1 h 7"/></svg>
                </button>
            </div>
        `;
    }).join('');
}

// Servisten Al — 2 alan + Sorgula butonlu kompakt sorgu satırları.
// Disabled olunca buton ve input pasifleşir.
function renderServisInputs(disabled) {
    const s = form.servis;
    const dis = disabled ? 'disabled' : '';
    return `
        <div class="adr-servis-grid">
            <div class="adr-row adr-row-no-btn">
                <label class="adr-row-label">Bina Tesisat No</label>
                <input type="text" class="adr-input" id="ob-bina-tesisat-no" ${dis}
                       value="${escapeHtml(s.binaTesisatNo)}" autocomplete="off"
                       placeholder="Test 1-1000 arası" />
            </div>
            <div class="adr-row adr-row-no-btn">
                <label class="adr-row-label">Abone Tüketim No</label>
                <input type="text" class="adr-input" id="ob-abone-tuketim-no" ${dis}
                       value="${escapeHtml(s.aboneTuketimNo)}" autocomplete="off"
                       placeholder="Test 3001-9000 arası" />
            </div>
            <button type="button" class="adr-btn adr-sorgula-tall" id="ob-sorgula" ${dis}>Sorgula</button>
        </div>
    `;
}

// Servis modu adres alanları — 5 satır, pasif readonly inputlar. Her zaman render.
function renderServisAdresFields() {
    const a = form.adres;
    return `
        <div class="adr-stack">
            ${readonlyRow('İl',             a.il)}
            ${readonlyRow('İlçe',           a.ilce)}
            ${readonlyRow('Mahalle',        a.mahalle)}
            ${readonlyRow('Cadde / Sokak',  a.sokak)}
            ${readonlyRow('Kapı No',        a.binaNo)}
        </div>
    `;
}

function readonlyRow(label, value) {
    return `
        <div class="adr-row">
            <label class="adr-row-label">${label}</label>
            <input type="text" class="adr-input is-readonly" value="${escapeHtml(value ?? '')}" readonly disabled autocomplete="off" />
        </div>
    `;
}

// "Adres Seç" — 4 cascading combobox + Kapı No (free text), tek sütun stacked.
function renderAdresSec() {
    const a = form.adres;
    const indexLoaded = isIndexLoaded();
    const streetsLoading = !!(a.ilceKod && !isStreetsLoaded(a.ilceKod));
    const iller      = getIller();
    const ilceler    = getIlceler(a.ilKod);
    const mahalleler = getMahalleler(a.ilKod, a.ilceKod);
    const cadSoklar  = getCaddeSokaklar(a.ilKod, a.ilceKod, a.mahalleKod);

    let statusMsg = '';
    if (!indexLoaded) statusMsg = 'Adres verileri yükleniyor…';
    else if (streetsLoading && _streetsStatusShown) statusMsg = 'Cadde / sokak listesi yükleniyor…';

    // Servisten metin değeri geldiyse ama eşleşen kod yoksa select yerine
    // DÜZENLENEBİLİR text input göster — kullanıcı bilgiyi görür ve değiştirebilir.
    const ilField = (!a.ilKod && a.il)
        ? textRow('İl', 'adres.il', a.il)
        : selectRow('İl', 'ilKod', iller, a.ilKod, !indexLoaded || iller.length === 0);
    const ilceField = (!a.ilceKod && a.ilce)
        ? textRow('İlçe', 'adres.ilce', a.ilce)
        : selectRow('İlçe', 'ilceKod', ilceler, a.ilceKod, !indexLoaded || !a.ilKod || ilceler.length === 0);
    const mahalleField = (!a.mahalleKod && a.mahalle)
        ? textRow('Mahalle', 'adres.mahalle', a.mahalle)
        : selectRow('Mahalle', 'mahalleKod', mahalleler, a.mahalleKod, !a.ilceKod || mahalleler.length === 0);
    const sokakField = (!a.cadSokKod && a.sokak)
        ? textRow('Cadde / Sokak', 'adres.sokak', a.sokak)
        : selectRow('Cadde / Sokak', 'cadSokKod', cadSoklar, a.cadSokKod, !a.mahalleKod || streetsLoading || cadSoklar.length === 0);

    return `
        <div class="adr-stack">
            ${ilField}
            ${ilceField}
            ${mahalleField}
            ${sokakField}
            ${textRow('Kapı No', 'adres.binaNo', a.binaNo)}
        </div>
        ${statusMsg ? `<div class="adr-status adr-status-info">${statusMsg}</div>` : ''}
    `;
}

// Stacked layout için: label sol + select sağ.
function selectRow(label, cascadeKey, options, value, disabled) {
    const opts = options.map(o => `<option value="${escapeHtml(o.kod)}" ${o.kod === value ? 'selected' : ''}>${escapeHtml(o.ad)}</option>`).join('');
    return `
        <div class="adr-row">
            <label class="adr-row-label">${label}</label>
            <select class="adr-input adr-select" data-cascade="${cascadeKey}" ${disabled ? 'disabled' : ''}>
                <option value="" ${!value ? 'selected' : ''}>${disabled && options.length === 0 ? '—' : 'Seçin…'}</option>
                ${opts}
            </select>
        </div>
    `;
}

// Stacked layout için: label sol + text input sağ.
function textRow(label, path, value) {
    return `
        <div class="adr-row">
            <label class="adr-row-label">${label}</label>
            <input type="text" class="adr-input" data-path="${path}" value="${escapeHtml(value ?? '')}" autocomplete="off" />
        </div>
    `;
}

// ── TESISAT TAB ────────────────────────────────────────────────────
// Yeni yapı:
//   1) Kolon var / İç tesisat var — iki kategori yan yana, her birinde
//      ana switch + Tadilat sub-switch + (iç tesisat için) birim listesi.
//   2) Tadilat açıklaması + Proje kapağı notu — yan yana büyük textarea'lar.
//      Tadilat açıklaması ancak kolonTadilat veya icTesisatTadilat açıkken aktif.
//   3) Isınma + Müstakil + Ön Proje — compact tek satır.
function renderTesisat() {
    const anyTadilat = !!(form.kolonTadilat || (form.icTesisatVar && form.icTesisatTadilat));
    return `
        <section class="tes-section">
            <div class="tes-cat-row">
                ${renderTesCat({
                    title: 'Kolon var',
                    mainId: 'ob-kolon-var',
                    mainChecked: form.kolonVar,
                    tadilatId: 'ob-kolon-tadilat',
                    tadilatChecked: form.kolonTadilat,
                    tadilatEnabled: form.kolonVar,
                })}
                ${renderTesCat({
                    title: 'İç tesisat var',
                    mainId: 'ob-ic-tesisat-var',
                    mainChecked: form.icTesisatVar,
                    tadilatId: 'ob-ic-tesisat-tadilat',
                    tadilatChecked: form.icTesisatTadilat && form.kolonTadilat,
                    // İç tesisat Tadilat ancak Kolon Tadilat AÇIK iken aktif olur.
                    tadilatEnabled: form.icTesisatVar && form.kolonTadilat,
                    extra: form.icTesisatVar ? renderBirimTadilatList() : '',
                })}
            </div>
        </section>

        <section class="tes-section">
            <div class="tes-bottom">
                <div class="tes-isinma ob-radio-row" data-group="isinmaTipi">
                    <label class="tes-isinma-opt">
                        <input type="radio" name="isinmaTipi" value="bireysel" ${form.isinmaTipi === 'bireysel' ? 'checked' : ''} />
                        <span>Bireysel</span>
                    </label>
                    <label class="tes-isinma-opt">
                        <input type="radio" name="isinmaTipi" value="merkezi" ${form.isinmaTipi === 'merkezi' ? 'checked' : ''} />
                        <span>Merkezi</span>
                    </label>
                    <label class="tes-isinma-opt">
                        <input type="radio" name="isinmaTipi" value="boylerli" ${form.isinmaTipi === 'boylerli' ? 'checked' : ''} />
                        <span>Boylerli</span>
                    </label>
                </div>
                <label class="ob-switch-row tes-mini-switch">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-mustakil" ${form.mustakilProje ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Müstakil</span>
                </label>
                <label class="ob-switch-row tes-mini-switch">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-on-proje" ${form.onProje ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Ön Proje</span>
                </label>
            </div>
        </section>

        <section class="tes-section">
            <div class="tes-notes-stack">
                <div class="ob-field ${anyTadilat ? '' : 'is-disabled'} ${(form.projectType === 'tadilat' && !form.tadilatSebep.trim()) ? 'is-invalid' : ''}">
                    <label class="ob-field-label">Tadilat açıklaması</label>
                    <textarea class="ob-text" data-path="tadilatSebep" rows="2"
                              ${anyTadilat ? '' : 'disabled'}
                              placeholder="Hangi tadilat yapılıyor?">${escapeHtml(form.tadilatSebep)}</textarea>
                </div>
                <div class="ob-field">
                    <label class="ob-field-label">Proje kapağı notu</label>
                    <textarea class="ob-text" data-path="projeKapagiNotu" rows="2"
                              placeholder="Proje kapağında görünecek not...">${escapeHtml(form.projeKapagiNotu)}</textarea>
                </div>
            </div>
        </section>
    `;
}

function renderTesCat({ title, mainId, mainChecked, tadilatId, tadilatChecked, tadilatEnabled, extra }) {
    return `
        <div class="tes-cat ${mainChecked ? 'is-on' : 'is-off'}">
            <div class="tes-cat-header">
                <label class="tes-cat-main">
                    <span class="ob-switch">
                        <input type="checkbox" id="${mainId}" ${mainChecked ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="tes-cat-title">${title}</span>
                </label>
                <label class="tes-cat-sub ${tadilatEnabled ? '' : 'is-disabled'}">
                    <span class="ob-switch">
                        <input type="checkbox" id="${tadilatId}" ${tadilatChecked ? 'checked' : ''} ${tadilatEnabled ? '' : 'disabled'} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="tes-cat-sub-label">Tadilat</span>
                </label>
            </div>
            ${extra || ''}
        </div>
    `;
}

// Projedeki anonim birim listesi.
// Öncelik sırası:
//   1) plumbingManager.components içinde mevcut sayaç/BRANSMAN'lardan benzersiz
//      (birimTipi+birimNo) çiftlerini topla → projedeki gerçek tüm birimler.
//   2) Hiç plumbing bileşeni yoksa form.binaBilgi.daireSayisi/dukkanSayisi'ne düş.
//   3) O da yoksa en az D1 — yeni proje varsayılanı.
// Projedeki kolon bileşeni var mı? (servis kutusu, regülatör vb.)
function _projectHasServisKutusu() {
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    return !!pm?.components?.some(c => c.type === 'servis_kutusu');
}
// Projede iç tesisat birimleri var mı? (sayaç veya BRANSMAN vana)
function _projectHasIcTesisat() {
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    return !!pm?.components?.some(c =>
        c.type === 'sayac' || (c.type === 'vana' && c.vanaTipi === 'BRANSMAN')
    );
}
// Kolon bileşenlerini sil — sağ-tık menüsündeki "Kolon Tesisatını Sil"
// fonksiyonunu kullanır (sayaç içlerini koruyup üst zinciri kaldırır).
async function _deleteKolonComponents() {
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    if (!pm) return;
    try {
        const mod = await import('../plumbing_v2/interactions/plumbing-context-menu.js');
        mod.deleteKolonTesisati?.(pm);
    } catch (e) { console.warn('Kolon silme başarısız:', e); }
}
// İç tesisat bileşenlerini sil — sağ-tık menüsündeki "Tüm İç Tesisatları Sil"
// fonksiyonunu projedeki tüm sayaçlara uygular.
async function _deleteIcTesisatComponents() {
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    if (!pm) return;
    try {
        const sayaclar = (pm.components || []).filter(c => c.type === 'sayac');
        if (sayaclar.length === 0) return;
        const mod = await import('../plumbing_v2/interactions/plumbing-context-menu.js');
        mod.deleteIcTesisatForSayaclar?.(sayaclar, pm);
    } catch (e) { console.warn('İç tesisat silme başarısız:', e); }
}

// Servisten gelen abone listesini (form.birimler) projedeki sayaçlara yaz.
// Eşleme: sayac.birimTipi (KONUT→"D", TİCARİ→"DÜK") + birimNo → birimEtiketi.
// Bulunan kayıttan sayac.aboneAdi ve sayac.aboneNo doldurulur.
function _applyAboneListToProjectSayaclar(aboneList) {
    if (!Array.isArray(aboneList) || aboneList.length === 0) return;
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    if (!pm || !Array.isArray(pm.components)) return;
    let changed = 0;
    for (const c of pm.components) {
        if (c.type !== 'sayac') continue;
        const noStr = String(c.birimNo ?? '').trim();
        if (!noStr || !/^\d+$/.test(noStr)) continue;
        const tipi = String(c.birimTipi || 'KONUT').toUpperCase();
        let etiket = '';
        if (tipi === 'KONUT') etiket = 'D' + noStr;
        else if (tipi === 'TİCARİ' || tipi === 'TICARI') etiket = 'DÜK' + noStr;
        else continue;
        const match = aboneList.find(a => a.birimEtiketi === etiket);
        if (!match) continue;
        c.aboneAdi = match.aboneAdi || '';
        c.aboneNo  = String(match.aboneTuketimNo || '');
        changed++;
    }
    if (changed > 0) {
        try { pm.saveToState?.(); } catch {}
    }
}

// Projedeki anonim birim listesi — SADECE projede çizilen sayaç/BRANSMAN
// bileşenlerinden türetilir. ABYS'den (form.birimler / form.binaBilgi) gelen
// birim sayıları burada KULLANILMAZ; "projede çizilenler" tek kaynaktır.
function getProjectBirimler() {
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    if (!Array.isArray(pm?.components) || pm.components.length === 0) return [];
    const dSet = new Set(), dukSet = new Set();
    for (const c of pm.components) {
        const isAnchor = (c.type === 'sayac') ||
                         (c.type === 'vana' && c.vanaTipi === 'BRANSMAN');
        if (!isAnchor) continue;
        const no = String(c.birimNo ?? '').trim();
        if (!no || !/^\d+$/.test(no)) continue;
        const tipi = String(c.birimTipi || 'KONUT').toUpperCase();
        if (tipi === 'KONUT') dSet.add(parseInt(no, 10));
        else if (tipi === 'TİCARİ' || tipi === 'TICARI') dukSet.add(parseInt(no, 10));
    }
    const list = [];
    [...dSet].sort((a, b) => a - b).forEach(n => list.push({ key: `D${n}`,   label: `D${n}` }));
    [...dukSet].sort((a, b) => a - b).forEach(n => list.push({ key: `DUK${n}`, label: `DÜK${n}` }));
    return list;
}

// İç tesisat var altında, projede çizilen her birim için bağımsız tadilat switch.
// Kurallar:
//   - kolonTadilat=false iken birimlerde tadilat OLMAZ → switch'ler disable.
//   - Tek (1) birim varsa liste hiç gösterilmez (tadilat için listeleme anlamsız).
//   - 0 birim → "Projede henüz birim çizilmemiş." mesajı.
function renderBirimTadilatList() {
    const list = getProjectBirimler();
    // En az 2 birim olmalı — 0 veya 1 birim varken "Birim bazında tadilat"
    // bölümü tamamen gizli.
    if (list.length < 2) return '';
    const disabled = !form.kolonTadilat;
    const rows = list.map(b => {
        const checked = !!form.birimTadilat[b.key];
        return `
            <label class="tes-birim-row ${disabled ? 'is-disabled' : ''}">
                <span class="ob-switch">
                    <input type="checkbox" class="tes-birim-tadilat" data-birim-key="${escapeHtml(b.key)}"
                           ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
                    <span class="ob-switch-slider"></span>
                </span>
                <span class="tes-birim-label">${escapeHtml(b.label)}</span>
            </label>
        `;
    }).join('');
    const hint = disabled
        ? `<span class="tes-birim-hint">Kolon Tadilat açıkken ayarlanabilir</span>`
        : '';
    return `
        <div class="tes-birim-list">
            <div class="tes-birim-head">Birim bazında tadilat (${list.length}) ${hint}</div>
            ${rows}
        </div>
    `;
}

function renderKatlar() {
    // kolon=Hayır iken "tüm katların yüksekliği aynı" seçeneği yoktur;
    // tüm katlar her zaman alt alta listelenir (yükseklik + iç tesisat checkbox bir arada).
    const same = form.kolonVar && form.tumKatlarAyniYukseklik;
    const showList = !same; // kolonVar=false ise her zaman true
    let perFloorList = '';
    if (showList) {
        // Görüntüleme sırası kat sırasına göre (üstten alta):
        //   normal katlar (yüksekten alçağa) → ZEMİN → bodrumlar (1.BODRUM en üstte,
        //   en derin alttaki).
        const items = [];
        for (let i = form.normalKatSayisi - 1; i >= 0; i--) {
            const idxInArr = form.bodrumSayisi + 1 + i;
            items.push(floorItemHtml(`${i + 1}. KAT`, idxInArr));
        }
        items.push(floorItemHtml('ZEMİN', form.bodrumSayisi));
        for (let i = 0; i < form.bodrumSayisi; i++) {
            items.push(floorItemHtml(`${i + 1}. BODRUM`, i));
        }
        perFloorList = items.join('');
    }
    return `
        ${form.kolonVar ? `
        <section class="ob-section">
            <h2 class="ob-q-title">Servis kutusu tipi</h2>
            <div class="ob-cards" data-group="kutuTipi">
                <button type="button" class="ob-card ob-card-sm ${form.kutuTipi === 'duvar' ? 'ob-selected' : ''}" data-val="duvar">
                    <div class="ob-card-icon">${ICON.kutuDuvar}</div>
                    <div class="ob-card-title">Duvar tipi</div>
                </button>
                <button type="button" class="ob-card ob-card-sm ${form.kutuTipi === 'yer' ? 'ob-selected' : ''}" data-val="yer">
                    <div class="ob-card-icon">${ICON.kutuYer}</div>
                    <div class="ob-card-title">Yer tipi</div>
                </button>
            </div>
        </section>
        ` : ''}

        <section class="ob-section ob-section-list">
            <h2 class="ob-q-title">Katlar</h2>

            <div class="ob-group">
                <div class="ob-num-row">
                    <div class="ob-field">
                        <label class="ob-field-label">Kat yüksekliği</label>
                        <div class="ob-num-input-wrap" data-field="zeminKatYukseklik" data-step="10" data-min="180" data-max="500">
                            <button type="button" class="ob-num-btn" data-act="dec">−</button>
                            <input type="number" class="ob-num-input" value="${form.zeminKatYukseklik}" />
                            <span class="ob-num-unit">cm</span>
                            <button type="button" class="ob-num-btn" data-act="inc">+</button>
                        </div>
                    </div>
                    <div class="ob-field">
                        <label class="ob-field-label">Zemin dolgu seviyesi</label>
                        <div class="ob-num-input-wrap" data-field="zeminKat0Offset" data-step="5" data-min="-300" data-max="300">
                            <button type="button" class="ob-num-btn" data-act="dec">−</button>
                            <input type="number" class="ob-num-input" value="${form.zeminKat0Offset}" />
                            <span class="ob-num-unit">cm</span>
                            <button type="button" class="ob-num-btn" data-act="inc">+</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="ob-group">
                <div class="ob-num-row">
                    <div class="ob-field">
                        <label class="ob-field-label">Bodrum kat sayısı</label>
                        <div class="ob-num-input-wrap" data-field="bodrumSayisi" data-step="1" data-min="0" data-max="5">
                            <button type="button" class="ob-num-btn" data-act="dec">−</button>
                            <input type="number" class="ob-num-input" value="${form.bodrumSayisi}" />
                            <span class="ob-num-unit">kat</span>
                            <button type="button" class="ob-num-btn" data-act="inc">+</button>
                        </div>
                    </div>
                    <div class="ob-field">
                        <label class="ob-field-label">Normal kat sayısı</label>
                        <div class="ob-num-input-wrap" data-field="normalKatSayisi" data-step="1" data-min="0" data-max="20">
                            <button type="button" class="ob-num-btn" data-act="dec">−</button>
                            <input type="number" class="ob-num-input" value="${form.normalKatSayisi}" />
                            <span class="ob-num-unit">kat</span>
                            <button type="button" class="ob-num-btn" data-act="inc">+</button>
                        </div>
                    </div>
                </div>
                ${form.kolonVar ? `
                <label class="ob-switch-row ob-mt-10">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-same-height" ${same ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Tüm katların yüksekliği aynı</span>
                </label>
                ` : ''}
            </div>

            ${showList ? `
            <div class="ob-group ob-group-list">
                ${!form.kolonVar ? `<div class="ob-group-title">İç tesisatı yapılacak katlar</div>` : ''}
                <div class="ob-floor-list ob-visible">${perFloorList}</div>
            </div>
            ` : ''}
        </section>
    `;
}

function floorItemHtml(name, idx) {
    const h = form.katYukseklikleri[idx] ?? form.zeminKatYukseklik;
    // Kolon=Hayır iken her satırda iç tesisat (göster/gizle) checkbox'ı yer alır.
    // Pasif satırlar dim görüntülenir.
    const showCheck = !form.kolonVar;
    const active = !!form.katIcTesisatVar[idx];
    const checkHtml = showCheck ? `
            <input type="checkbox" class="ob-ict-check" data-ict-idx="${idx}" ${active ? 'checked' : ''}
                   title="${active ? 'Gizle (iç tesisat yok)' : 'Göster (iç tesisat var)'}" />
    ` : '';
    const itemCls = 'ob-floor-item' + (showCheck && !active ? ' ob-pasif' : '');
    return `
        <div class="${itemCls}">${checkHtml}
            <span class="ob-floor-item-name">${name}</span>
            <div class="ob-num-input-wrap" data-floor-idx="${idx}" data-step="10" data-min="180" data-max="500">
                <button type="button" class="ob-num-btn" data-act="dec">−</button>
                <input type="number" class="ob-num-input" value="${h}" />
                <span class="ob-num-unit">cm</span>
                <button type="button" class="ob-num-btn" data-act="inc">+</button>
            </div>
        </div>
    `;
}

// ── SORUMLU TAB ────────────────────────────────────────────────────
function renderSorumlu() {
    const s = form.sorumlu;
    return `
        <section class="ob-section">
            <h2 class="ob-q-title">Sorumlu kişiler</h2>
            <div class="ob-grid ob-grid-2">
                ${textField('Yetkili Firma', 'sorumlu.yetkiliFirma', s.yetkiliFirma)}
                ${textField('Yetkili Mühendis', 'sorumlu.yetkiliMuhendis', s.yetkiliMuhendis)}
                ${textField('Projeyi Çizen', 'sorumlu.projeyiCizen', s.projeyiCizen)}
                ${textField('Usta', 'sorumlu.usta', s.usta)}
            </div>
        </section>
    `;
}

// ── FIELD HELPERS ──────────────────────────────────────────────────
function textField(label, path, value) {
    return `
        <div class="ob-field">
            <label class="ob-field-label">${label}</label>
            <input type="text" class="ob-text" data-path="${path}" value="${escapeHtml(value ?? '')}" autocomplete="off" />
        </div>
    `;
}

function numField(label, path, value, step) {
    const v = (value === null || value === undefined || value === '') ? '' : value;
    return `
        <div class="ob-field">
            <label class="ob-field-label">${label}</label>
            <input type="number" class="ob-text" data-path="${path}" step="${step}" value="${v}" autocomplete="off" />
        </div>
    `;
}

// Cascading adres combobox'ları için. data-cascade ile listener'a bağlanır.
function selectField(label, cascadeKey, options, value, disabled) {
    const opts = options.map(o => `<option value="${escapeHtml(o.kod)}" ${o.kod === value ? 'selected' : ''}>${escapeHtml(o.ad)}</option>`).join('');
    return `
        <div class="ob-field">
            <label class="ob-field-label">${label}</label>
            <select class="ob-text ob-select" data-cascade="${cascadeKey}" ${disabled ? 'disabled' : ''}>
                <option value="" ${!value ? 'selected' : ''}>${disabled && options.length === 0 ? '—' : 'Seçin…'}</option>
                ${opts}
            </select>
        </div>
    `;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function setByPath(obj, path, value) {
    const keys = path.split('.');
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
    cur[keys[keys.length - 1]] = value;
}

// ── TAB LISTENERS ──────────────────────────────────────────────────
function attachTabListeners(tabId) {
    // Generic text / number / textarea fields with data-path
    overlay.querySelectorAll('[data-path]').forEach(el => {
        const path = el.dataset.path;
        el.addEventListener('input', () => {
            let v = el.value;
            if (el.type === 'number') {
                v = v === '' ? null : parseFloat(v);
                if (v !== null && !isFinite(v)) v = null;
            }
            setByPath(form, path, v);
            if (path === 'adres.lat' || path === 'adres.lng') syncMapToInputs();
            updateCTA();
        });
    });

    // Tesisat tab — Kolon var / Tadilat / İç tesisat var / Tadilat switch'leri
    // Kural: Kolon ve İç tesisat aynı anda kapatılamaz (en az biri açık olmalı).
    overlay.querySelector('#ob-kolon-var')?.addEventListener('change', e => {
        if (!e.target.checked && !form.icTesisatVar) {
            e.target.checked = true;
            return; // ikisi birden kapalı kalamaz
        }
        // Kapatılmak isteniyorsa ve projede servis kutusu (kolon işareti) varsa
        // önce kullanıcıya sor.
        if (!e.target.checked && _projectHasServisKutusu()) {
            const ok = confirm('Kolon silinip iç tesisatlar bırakılacaktır. Devam edilsin mi?');
            if (!ok) {
                e.target.checked = true;
                return;
            }
            _deleteKolonComponents();
        }
        form.kolonVar = e.target.checked;
        if (!form.kolonVar) {
            form.kolonTadilat = false;
            form.icTesisatTadilat = false;
            form.birimTadilat = {};
            form.tumKatlarAyniYukseklik = false;
            syncKatYukseklikleri();
        }
        syncProjectType();
        renderForm();
    });
    overlay.querySelector('#ob-kolon-tadilat')?.addEventListener('change', e => {
        form.kolonTadilat = e.target.checked;
        // Kolon Tadilat kapatılınca: İç tesisat Tadilat + birim bazlı tadilatlar
        // OTOMATİK temizlenir — Kolon Tadilat üst bağımlılıktır.
        if (!form.kolonTadilat) {
            form.icTesisatTadilat = false;
            form.birimTadilat = {};
        }
        syncProjectType();
        renderForm();
    });
    overlay.querySelector('#ob-ic-tesisat-var')?.addEventListener('change', e => {
        if (!e.target.checked && !form.kolonVar) {
            e.target.checked = true;
            return; // ikisi birden kapalı kalamaz
        }
        // Kapatılmak isteniyorsa ve projede iç tesisat (birim çapaları) varsa sor.
        if (!e.target.checked && _projectHasIcTesisat()) {
            const ok = confirm('İç tesisatlar silinip sadece kolon bırakılacaktır. Devam edilsin mi?');
            if (!ok) {
                e.target.checked = true;
                return;
            }
            _deleteIcTesisatComponents();
        }
        form.icTesisatVar = e.target.checked;
        if (!form.icTesisatVar) {
            form.icTesisatTadilat = false;
            form.birimTadilat = {};
        }
        syncProjectType();
        renderForm();
    });
    overlay.querySelector('#ob-ic-tesisat-tadilat')?.addEventListener('change', e => {
        form.icTesisatTadilat = e.target.checked;
        // Tüm birimleri otomatik aynı duruma getir: işaretlenince hepsi tadilat,
        // kaldırılınca hepsi temiz.
        const list = getProjectBirimler();
        if (form.icTesisatTadilat) {
            list.forEach(b => { form.birimTadilat[b.key] = true; });
        } else {
            list.forEach(b => { delete form.birimTadilat[b.key]; });
        }
        syncProjectType();
        renderForm();
    });
    // Birim bazında tadilat switch'leri
    overlay.querySelectorAll('.tes-birim-tadilat').forEach(el => {
        el.addEventListener('change', e => {
            const key = e.target.dataset.birimKey;
            if (!key) return;
            if (e.target.checked) form.birimTadilat[key] = true;
            else delete form.birimTadilat[key];
            syncIcTesisatTadilatFromBirims();
            syncProjectType();
            renderForm(); // İç tesisat Tadilat switch ve şerit güncellensin
        });
    });

    // Card groups (radio-like)
    overlay.querySelectorAll('.ob-cards').forEach(group => {
        const field = group.dataset.group;
        group.querySelectorAll('.ob-card').forEach(card => {
            card.addEventListener('click', () => {
                let val = card.dataset.val;
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                form[field] = val;
                // Kolon=Hayır: "tüm katlar aynı yükseklik" anahtarı gizlenir
                // ve liste her zaman gösterilir. Şematik & global state'in de
                // per-floor yüksekliği kullanması için bayrağı düşürüyoruz;
                // ayrıca en az bir kat aktif olmasını sync helper garanti etsin.
                if (field === 'kolonVar' && val === false) {
                    form.tumKatlarAyniYukseklik = false;
                    syncKatYukseklikleri();
                }
                renderForm();
                if (schematic) schematic.render();
                updateCTA();
            });
        });
    });

    // Radio groups (isinma)
    overlay.querySelectorAll('.ob-radio-row').forEach(group => {
        const field = group.dataset.group;
        group.querySelectorAll('input[type="radio"]').forEach(r => {
            r.addEventListener('change', () => {
                if (r.checked) {
                    form[field] = r.value;
                    updateCTA();
                }
            });
        });
    });

    // Number inputs (kat yüksekliği, bodrum sayısı etc.)
    overlay.querySelectorAll('.ob-num-input-wrap').forEach(wrap => {
        const field = wrap.dataset.field;
        const floorIdx = wrap.dataset.floorIdx !== undefined ? parseInt(wrap.dataset.floorIdx, 10) : null;
        const step = parseInt(wrap.dataset.step || '1', 10);
        const min = parseFloat(wrap.dataset.min);
        const max = parseFloat(wrap.dataset.max);
        const input = wrap.querySelector('.ob-num-input');
        const dec = wrap.querySelector('[data-act="dec"]');
        const inc = wrap.querySelector('[data-act="inc"]');

        const apply = (v) => {
            if (!isFinite(v)) return;
            v = Math.max(min, Math.min(max, v));
            input.value = v;
            if (floorIdx !== null) {
                const arr = form.katYukseklikleri.slice();
                arr[floorIdx] = v;
                form.katYukseklikleri = arr;
            } else {
                form[field] = v;
                if (field === 'bodrumSayisi' || field === 'normalKatSayisi') syncKatYukseklikleri();
            }
            renderForm();
            if (schematic) schematic.render();
            updateCTA();
        };
        dec.addEventListener('click', () => apply((parseFloat(input.value) || 0) - step));
        inc.addEventListener('click', () => apply((parseFloat(input.value) || 0) + step));
        input.addEventListener('change', () => apply(parseFloat(input.value)));
    });

    // Same-height switch
    const sw = overlay.querySelector('#ob-same-height');
    if (sw) {
        sw.addEventListener('change', () => {
            if (sw.checked) {
                // İşaretlenince: ortak kat yüksekliği tüm katlara atanır. Eğer
                // herhangi bir katın yüksekliği bu değerden farklıysa kullanıcıya
                // uyarı göster.
                const h = form.zeminKatYukseklik;
                const hasDiff = (form.katYukseklikleri || []).some(v => v !== h);
                if (hasDiff) {
                    const ok = confirm(`Tüm katların yüksekliği ${h} cm yapılacak. Devam edilsin mi?`);
                    if (!ok) {
                        sw.checked = false;
                        return;
                    }
                }
                form.tumKatlarAyniYukseklik = true;
            } else {
                // Kaldırılınca: o anki ortak kat yüksekliği her katın değerine
                // kopyalanır — kullanıcı dilediğini ayrı ayrı değiştirebilir.
                const h = form.zeminKatYukseklik;
                const total = (form.bodrumSayisi || 0) + 1 + (form.normalKatSayisi || 0);
                form.katYukseklikleri = Array.from({ length: total }, () => h);
                form.tumKatlarAyniYukseklik = false;
            }
            syncKatYukseklikleri();
            renderForm();
            if (schematic) schematic.render();
        });
    }

    // İç tesisat kat checkbox'ları (kolon=Hayır)
    overlay.querySelectorAll('.ob-ict-check').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = parseInt(cb.dataset.ictIdx, 10);
            if (!Number.isFinite(idx)) return;
            // Son aktif kat pasifleştirilemez — en az bir kat aktif olmalı.
            if (!cb.checked) {
                const activeCount = form.katIcTesisatVar.filter(Boolean).length;
                if (activeCount <= 1) {
                    cb.checked = true;
                    return;
                }
            }
            const arr = form.katIcTesisatVar.slice();
            arr[idx] = cb.checked;
            form.katIcTesisatVar = arr;
            renderForm();
            if (schematic) schematic.render();
        });
    });

    // Müstakil / Ön Proje switches — şerit canlı güncellensin
    const mst = overlay.querySelector('#ob-mustakil');
    if (mst) mst.addEventListener('change', () => { form.mustakilProje = mst.checked; renderSummaryBar(); });
    const op = overlay.querySelector('#ob-on-proje');
    if (op) op.addEventListener('change', () => { form.onProje = op.checked; renderSummaryBar(); });

    // Geocode button (adres tab)
    overlay.querySelector('#ob-geocode')?.addEventListener('click', () => runGeocode());

    // Adres mode segment (Servisten Al / Adres Seç)
    overlay.querySelector('#ob-adres-mode')?.addEventListener('click', e => {
        const btn = e.target.closest('.ob-seg-btn');
        if (!btn) return;
        const mode = btn.dataset.val;
        if (mode === form.adresMode) return;
        form.adresMode = mode;
        renderForm();
    });

    // Sıfırla butonları
    overlay.querySelector('#ob-reset-servis')?.addEventListener('click', () => {
        form.servis.binaTesisatNo = '';
        form.servis.aboneTuketimNo = '';
        form.servis.lastResult = null;
        form.birimler = [];
        form.binaBilgi = null;
        form.kutuBasinc = DEFAULT_FORM.kutuBasinc;
        form.isinmaTipi = DEFAULT_FORM.isinmaTipi;
        Object.assign(form.adres, deepClone(DEFAULT_FORM.adres));
        renderForm();
        syncMapToInputs();
    });
    overlay.querySelector('#ob-reset-adres')?.addEventListener('click', () => {
        // Servisten sorgu Sıfırla ile aynı: ADRES alanındaki her şeyi sıfırla.
        form.servis.binaTesisatNo = '';
        form.servis.aboneTuketimNo = '';
        form.servis.lastResult = null;
        form.birimler = [];
        form.binaBilgi = null;
        form.kutuBasinc = DEFAULT_FORM.kutuBasinc;
        form.isinmaTipi = DEFAULT_FORM.isinmaTipi;
        Object.assign(form.adres, deepClone(DEFAULT_FORM.adres));
        renderForm();
        syncMapToInputs();
    });

    // Birim kart kopyalama (D1 | Mehmet Demir | 3001)
    overlay.querySelectorAll('.adr-birim-copy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const text = btn.dataset.copy || '';
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                btn.classList.add('is-copied');
                setTimeout(() => btn.classList.remove('is-copied'), 800);
            } catch {}
        });
    });

    // Adres Seç: cascading select'ler
    overlay.querySelectorAll('select[data-cascade]').forEach(sel => {
        sel.addEventListener('change', () => onCascadeChange(sel.dataset.cascade, sel.value));
    });

    // Tek Sorgula butonu — hangi alanda metin varsa ona göre sorgular.
    overlay.querySelector('#ob-sorgula')?.addEventListener('click', () => {
        const bina = (form.servis.binaTesisatNo || '').trim();
        const abone = (form.servis.aboneTuketimNo || '').trim();
        if (bina) return runServisSorgu('bina');
        if (abone) return runServisSorgu('abone');
        setServisStatus('Bina Tesisat No veya Abone Tüketim No girin.', 'err');
    });

    // Servisten Al: input'lar değişince diğer input + tüm servis verisi sıfırlanır.
    const binaInput = overlay.querySelector('#ob-bina-tesisat-no');
    if (binaInput) {
        binaInput.addEventListener('input', () => onServisInputChanged('bina', binaInput.value));
        binaInput.addEventListener('keydown', e => { if (e.key === 'Enter') runServisSorgu('bina'); });
    }
    const aboneInput = overlay.querySelector('#ob-abone-tuketim-no');
    if (aboneInput) {
        aboneInput.addEventListener('input', () => onServisInputChanged('abone', aboneInput.value));
        aboneInput.addEventListener('keydown', e => { if (e.key === 'Enter') runServisSorgu('abone'); });
    }
}

// Bina veya Abone input'unda değişiklik olduğunda:
//   1) Yazılan input'u güncelle (yeni değer)
//   2) Karşı input'u tamamen boşalt (state + DOM)
//   3) Servisten gelen tüm veriyi defaultlara geri al (adres, birimler, özet,
//      isınma tipi, kat sayısı, lat/lng)
//   4) Tek bir renderForm ile tüm UI'ı tazele
//   5) Yazdığı input'a odağı + cursor pozisyonunu geri ver
function onServisInputChanged(source, newValue) {
    if (source === 'bina') {
        form.servis.binaTesisatNo = newValue;
        form.servis.aboneTuketimNo = '';
    } else {
        form.servis.aboneTuketimNo = newValue;
        form.servis.binaTesisatNo = '';
    }
    // Tüm servis verisini default'a indir
    Object.assign(form.adres, deepClone(DEFAULT_FORM.adres));
    form.binaBilgi = null;
    form.birimler = [];
    form.servis.lastResult = null;
    form.isinmaTipi = DEFAULT_FORM.isinmaTipi;
    form.kutuBasinc = DEFAULT_FORM.kutuBasinc;
    form.normalKatSayisi = DEFAULT_FORM.normalKatSayisi;
    syncKatYukseklikleri();

    // Odak + cursor koruması
    const ae = document.activeElement;
    const activeId = ae?.id || '';
    const cursor = (ae && ae.selectionStart != null) ? ae.selectionStart : null;

    renderForm();
    syncMapToInputs();

    if (activeId) {
        const el = overlay.querySelector('#' + activeId);
        if (el) {
            el.focus();
            if (cursor != null) {
                try { el.setSelectionRange(cursor, cursor); } catch {}
            }
        }
    }
}

// ── ADRES SEÇ — cascade ────────────────────────────────────────────
function onCascadeChange(key, value) {
    const a = form.adres;
    if (key === 'ilKod') {
        a.ilKod = value;
        a.ilceKod = '';
        a.mahalleKod = '';
        a.cadSokKod = '';
    } else if (key === 'ilceKod') {
        a.ilceKod = value;
        a.mahalleKod = '';
        a.cadSokKod = '';
    } else if (key === 'mahalleKod') {
        a.mahalleKod = value;
        a.cadSokKod = '';
    } else if (key === 'cadSokKod') {
        a.cadSokKod = value;
    }
    // Görünür adları kodlardan türet — applyAndClose state'e bunları yazacak.
    a.il      = adFromKod('il',      a);
    a.ilce    = adFromKod('ilce',    a);
    a.mahalle = adFromKod('mahalle', a);
    a.sokak   = adFromKod('cadsok',  a);
    renderForm();
}

// ── SERVİSTEN AL — sorgu ───────────────────────────────────────────
async function runServisSorgu(kaynak) {
    const status = overlay.querySelector('#ob-servis-status');
    if (!status) return;

    try {
        let bina = null;
        let abone = null;
        if (kaynak === 'bina') {
            const tno = (form.servis.binaTesisatNo || '').trim();
            if (!tno) { setServisStatus('Bina Tesisat No girin.', 'err'); return; }
            setServisStatus('Aranıyor…', 'info');
            bina = await fetchBinaByTesisatNo(tno);
        } else {
            const ano = (form.servis.aboneTuketimNo || '').trim();
            if (!ano) { setServisStatus('Abone Tüketim No girin.', 'err'); return; }
            setServisStatus('Aranıyor…', 'info');
            const res = await fetchBinaByAboneTuketimNo(ano);
            bina = res.bina;
            abone = res.abone;
        }
        applyServiceResult(bina, abone, kaynak);
        setServisStatus('Bilgiler alındı.', 'ok');
    } catch (e) {
        setServisStatus(e?.message || 'Servis hatası.', 'err');
    }
}

function setServisStatus(text, kind) {
    const status = overlay.querySelector('#ob-servis-status');
    if (!status) return;
    status.textContent = text;
    status.className = 'adr-status adr-status-' + (kind || 'info');
}

function applyServiceResult(bina, abone, kaynak) {
    if (!bina) return;
    // Adres bilgilerini form.adres'e yaz. Servisten gelen veri sadece metin
    // alanlarını içerir (kod yok); bu yüzden Adres Seç modundaki cascade kodları
    // boşa düşer — kullanıcı haritada bul ile devam edebilir.
    if (bina.adres) {
        Object.assign(form.adres, {
            ilKod:      '',
            ilceKod:    '',
            mahalleKod: '',
            cadSokKod:  '',
            il:         bina.adres.il      ?? form.adres.il,
            ilce:       bina.adres.ilce    ?? '',
            mahalle:    bina.adres.mahalle ?? '',
            sokak:      bina.adres.sokak   ?? '',
            binaNo:     bina.adres.binaNo  ?? '',
            lat:        bina.adres.lat     ?? form.adres.lat,
            lng:        bina.adres.lng     ?? form.adres.lng,
        });
    }
    // Bina özeti (Daire/Dükkan/Alan/Kapasite/Kat) — Adres tabındaki özet kutusu
    // ve Katlar tabına auto-fill için.
    form.binaBilgi = bina.bilgi ? { ...bina.bilgi } : null;
    if (bina.bilgi) {
        if (Number.isFinite(bina.bilgi.katSayisi)) {
            // ZEMİN dahil tüm katlar — normalKatSayisi = katSayisi - 1 (zemin hariç).
            const normal = Math.max(0, (bina.bilgi.katSayisi || 1) - 1);
            form.normalKatSayisi = normal;
            syncKatYukseklikleri();
        }
    }
    // Tesisat parametreleri (isınma tipini servis veriyor; kolon/kutu yok).
    if (bina.tesisat) {
        if (bina.tesisat.isinmaTipi) form.isinmaTipi = bina.tesisat.isinmaTipi;
        if (bina.tesisat.kutuBasinc) form.kutuBasinc = String(bina.tesisat.kutuBasinc);
    }
    // Sayaçlar (birimler)
    form.birimler = Array.isArray(bina.sayaclar) ? bina.sayaclar.slice() : [];

    // Abone sorgusu sonrası bina tesisat no input'unu da doldur — kullanıcı
    // panelin sol üstündeki "Bina Tesisat No" alanında da gelen değeri görsün.
    if (bina.binaTesisatNo) {
        form.servis.binaTesisatNo = String(bina.binaTesisatNo);
    }

    form.servis.lastResult = {
        binaTesisatNo: bina.binaTesisatNo,
        aboneAdi: abone?.aboneAdi || '',
        adresKisa: [bina.adres?.mahalle, bina.adres?.sokak, bina.adres?.binaNo].filter(Boolean).join(' '),
        birimSayisi: form.birimler.length,
        kaynak,
    };
    renderForm();
    syncMapToInputs();
    updateCTA();
}

// ── GEOCODE (Yandex Maps) ──────────────────────────────────────────
async function runGeocode() {
    const btn = overlay.querySelector('#ob-geocode');
    const status = overlay.querySelector('#ob-geocode-status');
    if (!btn || !status) return;

    const a = form.adres;
    const hasAny = [a.il, a.ilce, a.mahalle, a.sokak, a.binaNo].some(s => s && String(s).trim());
    if (!hasAny) {
        status.textContent = 'Önce en az bir adres alanı girin.';
        status.className = 'adr-status adr-status-err';
        return;
    }

    btn.disabled = true;
    status.textContent = 'Aranıyor…';
    status.className = 'adr-status adr-status-info';

    const binaNo = a.binaNo ? String(a.binaNo).trim() : '';
    // Adres verisinde sokak adları "TAŞKIN (Sokak)" / "ORTANCA (Cadde)" gibi
    // parantezli tip ile gelir. Parantezi tamamen silersek geocoder "TAŞKIN"i
    // sokak olarak tanıyamaz — tipi parantezden çıkarıp düz metin sufiksi
    // olarak geri ekliyoruz. Aynı şey mahalle/MAHALLESİ için de geçerli.
    const stripParens = s => String(s || '').replace(/\s*\([^)]+\)\s*$/u, '').trim();
    const extractParens = s => {
        const m = String(s || '').match(/\(([^)]+)\)\s*$/u);
        return m ? m[1].trim() : '';
    };
    const stripMahalleSuffix = s => String(s || '')
        .replace(/\s+(MAHALLESİ|MAHALLES|MAHALLESI|Mahallesi|Mah\.?|Mh\.?)\s*$/u, '')
        .trim();
    // Kısaltma sufiksleri — period KULLANMA (Yandex parserı period'u ayrı token
    // sayıp "TAŞKIN Sk." ile "TAŞKIN" sokağını eşleştirmiyor; düz "sk" çalışıyor).
    const TYPE_ABBR = { 'Sokak': 'sk', 'Cadde': 'cd', 'Bulvarı': 'blv', 'Bulvar': 'blv', 'Meydan': 'mey' };

    const sokakBase = stripParens(a.sokak);
    const sokakType = extractParens(a.sokak);                                    // "Sokak" / "Cadde" / ""
    const sokakFull = sokakBase ? `${sokakBase} ${sokakType || 'Sokak'}` : '';   // "TAŞKIN Sokak"
    const sokakAbbr = sokakBase ? `${sokakBase} ${TYPE_ABBR[sokakType] || 'sk'}` : ''; // "TAŞKIN sk"

    const mahalleBase = stripMahalleSuffix(a.mahalle);                            // "HAMİDİYE"
    const mahalleFull = mahalleBase ? `${mahalleBase} Mahallesi` : '';
    const mahalleMh   = mahalleBase ? `${mahalleBase} Mah.`      : '';

    // Bina no varyasyonları — "no:" prefix Yandex'in tanıdığı kritik biçim.
    const noPref  = binaNo ? `no:${binaNo}`  : '';   // "no:1"  ← kullanıcı browserda bunu kullanınca buluyor
    const noPref2 = binaNo ? `No:${binaNo}`  : '';   // "No:1"
    const noPref3 = binaNo ? `No: ${binaNo}` : '';   // "No: 1"

    // Turkish-aware title case
    const toTitle = s => String(s || '').toLocaleLowerCase('tr-TR')
        .replace(/(^|\s|\-)([\S])/g, (_, sep, c) => sep + c.toLocaleUpperCase('tr-TR'));
    const ilT      = toTitle(a.il);
    const ilceT    = toTitle(a.ilce);
    const mahT     = mahalleBase ? toTitle(mahalleBase) : '';
    const sokT     = sokakBase ? toTitle(sokakBase) : '';
    const sokTypeT = sokakType || 'Sokak';                                 // "Sokak" / "Cadde" / "Bulvar"

    // Doğal Türk adres formatı: SOKAK No:X, MAHALLE Mh., İLÇE/İL
    // Yandex web search bu sırayı en güvenilir tanıyor. Title Case + doğru
    // Türkçe noktalama. Çok az varyant — Yandex'i bombalama, doğru bir tanesini
    // ver.
    const queries = [];
    if (binaNo && sokT && mahT) {
        // 1. Doğal Türk address format (en güvenilir)
        queries.push(`${sokT} ${sokTypeT} No:${binaNo}, ${mahT} Mah., ${ilceT}/${ilT}`);
        // 2. Kullanıcının browser'da çalıştırdığı format
        queries.push(`${mahT} Mahallesi, ${ilceT}, ${ilT}, ${sokT.toLocaleLowerCase('tr-TR')} sk no:${binaNo}`);
        // 3. Sokak-first, kısa
        queries.push(`${sokT} ${sokTypeT} No:${binaNo}, ${mahT}, ${ilceT}, ${ilT}`);
    }
    if (binaNo && sokT) {
        // 4. Genel→özel, Türkiye prefixli (Nominatim'in sevdiği)
        queries.push([ilT, ilceT, mahT, `${sokT} ${sokTypeT}`, `No:${binaNo}`].filter(Boolean).join(', '));
    }
    // 5. Sokak seviyesinde fallback (bina no olmadan)
    if (sokT && (mahT || ilceT)) {
        queries.push(`${sokT} ${sokTypeT}, ${mahT}, ${ilceT}/${ilT}`);
    }
    // 6. Mahalle seviyesinde son fallback
    if (mahT && ilceT) {
        queries.push(`${mahT} Mah., ${ilceT}/${ilT}`);
    }

    // Geocode zinciri:
    //   0) Yandex JS API geocode (YANDEX_JS_API_KEY varsa) — ev seviyesinde sonuç
    //   1) Nominatim structured (OSM, sokak seviyesi)
    //   2) Photon (Komoot, OSM tabanlı)
    //   3) Nominatim free-text (son fallback)
    // İlk ev-seviyesi sonuçta durur; aksi takdirde en iyi sokak sonucu seçilir.
    let best = null; // { lat, lng, text, exactHouse }

    const yandexKinds = { house: 3, street: 2, district: 1, locality: 1 };

    // 0) Yandex JS API geocode — Türk binaları için ev seviyesinde sonuç döner.
    //    Key dashboard'da apikeyValid=false ise scriptError fırlar — ilk hatada
    //    sessizce çık ve OSM zincirine düş.
    if (YANDEX_JS_API_KEY) {
        try {
            const ymaps = await ensureYandexMaps();
            if (ymaps?.options?.get?.('apikeyValid') !== false) {
                let yandexScore = -1;
                for (const q of queries) {
                    try {
                        const res = await ymaps.geocode(q, { results: 5, lang: 'tr_TR' });
                        const arr = [];
                        res.geoObjects.each(o => arr.push(o));
                        for (const obj of arr) {
                            const kind = obj.properties.get('metaDataProperty.GeocoderMetaData.kind') || '';
                            const text = obj.properties.get('text') || obj.properties.get('name') || '';
                            const c = obj.geometry.getCoordinates();
                            const comps = obj.properties.get('metaDataProperty.GeocoderMetaData.Address.Components') || [];
                            const house = (comps.find(x => x.kind === 'house') || {}).name || '';
                            const score = yandexKinds[kind] ?? 0;
                            const isExact = kind === 'house' && (!binaNo || String(house).toLowerCase() === binaNo.toLowerCase());
                            if (score > yandexScore || (isExact && (!best || !best.exactHouse))) {
                                if (isFinite(c[0]) && isFinite(c[1])) {
                                    best = { lat: c[0], lng: c[1], text, exactHouse: isExact };
                                    yandexScore = score;
                                }
                            }
                        }
                        if (best?.exactHouse) break;
                    } catch {
                        // scriptError = key invalid; zinciri kır, OSM'ye düş.
                        break;
                    }
                }
            }
        } catch { /* JS API yüklenemedi — sessizce OSM'ye düş */ }
    }

    const pickFromNominatim = (data) => {
        if (!Array.isArray(data) || !data.length) return null;
        let pick = null;
        if (binaNo) {
            pick = data.find(h => String(h.address?.house_number || '').toLowerCase() === binaNo.toLowerCase());
        }
        if (!pick) pick = data[0];
        return {
            lat: parseFloat(pick.lat),
            lng: parseFloat(pick.lon),
            text: pick.display_name || '',
            exactHouse: !!(binaNo && pick.address?.house_number
                && String(pick.address.house_number).toLowerCase() === binaNo.toLowerCase()),
        };
    };

    const pickFromPhoton = (data) => {
        const feats = data?.features || [];
        if (!feats.length) return null;
        let pick = null;
        if (binaNo) {
            pick = feats.find(f => String(f.properties?.housenumber || '').toLowerCase() === binaNo.toLowerCase());
        }
        if (!pick) pick = feats[0];
        const [lng, lat] = pick.geometry?.coordinates || [];
        if (!isFinite(lat) || !isFinite(lng)) return null;
        const p = pick.properties || {};
        const text = [p.housenumber && p.street ? `${p.street} ${p.housenumber}` : (p.street || p.name), p.district, p.city, p.state].filter(Boolean).join(', ');
        return {
            lat, lng, text,
            exactHouse: !!(binaNo && p.housenumber
                && String(p.housenumber).toLowerCase() === binaNo.toLowerCase()),
        };
    };

    const isBetter = (cand, cur) => {
        if (!cand) return false;
        if (!cur) return true;
        if (cand.exactHouse && !cur.exactHouse) return true;
        return false;
    };

    // 1) Nominatim STRUCTURED — Türk address için house no eşleşmesi en iyi burada
    if ((!best || !best.exactHouse) && binaNo && sokakBase && (mahalleBase || a.ilce)) {
        const structured = new URLSearchParams({
            format: 'json', limit: '5', countrycodes: 'tr',
            addressdetails: '1', 'accept-language': 'tr',
        });
        if (a.il)   structured.set('state', toTitle(a.il));
        if (a.ilce) { structured.set('county', toTitle(a.ilce)); structured.set('city', toTitle(a.ilce)); }
        structured.set('street', `${binaNo} ${toTitle(sokakBase)} ${sokakType || 'Sokak'}`);
        try {
            const url = `https://nominatim.openstreetmap.org/search?${structured.toString()}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (res.ok) {
                const cand = pickFromNominatim(await res.json());
                if (isBetter(cand, best) || !best) best = cand || best;
            }
        } catch { /* ignore — Photon ve free-text fallback'leri devam etsin */ }
    }

    // 2) Photon (Komoot OSM geocoder) — sokak/no için iyi ranking, key yok
    if (!best || !best.exactHouse) {
        for (const q of queries) {
            try {
                const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=default&limit=10`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) continue;
                const cand = pickFromPhoton(await res.json());
                if (isBetter(cand, best) || !best) best = cand || best;
                if (best?.exactHouse) break;
            } catch { /* ignore */ }
        }
    }

    // 3) Nominatim FREE-TEXT — son fallback
    if (!best || !best.exactHouse) {
        for (const q of queries) {
            try {
                const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tr&addressdetails=1&accept-language=tr&q=${encodeURIComponent(q)}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) continue;
                const cand = pickFromNominatim(await res.json());
                if (isBetter(cand, best) || !best) best = cand || best;
                if (best?.exactHouse) break;
            } catch { /* ignore */ }
        }
    }

    if (!best) {
        status.textContent = 'Adres bulunamadı. Haritadan tıklayarak konum seçebilirsiniz.';
        status.className = 'adr-status adr-status-err';
        btn.disabled = false;
        return;
    }
    setCoord(best.lat, best.lng);
    syncMapToInputs();
    if (best.exactHouse) {
        status.textContent = `✓ Bulundu: ${best.text}`;
        status.className = 'adr-status adr-status-ok';
    } else if (binaNo) {
        // OSM verisinde ev numarası nadiren bulunur; sokak doğru ama bina için
        // kullanıcının haritadan tıklaması gerekiyor.
        status.textContent = `Sokak bulundu — Tam bina için haritadan binanızın üstüne tıklayın.`;
        status.className = 'adr-status adr-status-info';
    } else {
        status.textContent = `✓ ${best.text || 'Bulundu.'}`;
        status.className = 'adr-status adr-status-ok';
    }
    btn.disabled = false;
}

// ── MAP (Yandex Maps API 2.1) ──────────────────────────────────────
// Production'da api-maps URL'ine `&apikey=<KEY>` eklemek gerekir; dev için keysiz çalışır.
function ensureYandexMaps() {
    if (window.ymaps && window.ymaps.Map) return Promise.resolve(window.ymaps);
    if (ymapsLoadPromise) return ymapsLoadPromise;
    ymapsLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const keyParam = YANDEX_JS_API_KEY ? `apikey=${encodeURIComponent(YANDEX_JS_API_KEY)}&` : '';
        script.src = `https://api-maps.yandex.ru/2.1/?${keyParam}lang=tr_TR&load=Map,Placemark,geocode,control.ZoomControl,control.TypeSelector,control.FullscreenControl`;
        script.onload = () => {
            if (window.ymaps && window.ymaps.ready) {
                window.ymaps.ready(() => resolve(window.ymaps));
            } else {
                reject(new Error('Yandex Maps init failed'));
            }
        };
        script.onerror = () => {
            ymapsLoadPromise = null;
            reject(new Error('Yandex Maps load failed'));
        };
        document.head.appendChild(script);
    });
    return ymapsLoadPromise;
}

async function initMap() {
    const mapEl = overlay.querySelector('#ob-map');
    if (!mapEl) return;
    let ymaps;
    try {
        ymaps = await ensureYandexMaps();
    } catch (e) {
        const fb = overlay.querySelector('#ob-map-fallback');
        if (fb) fb.style.display = '';
        mapEl.style.display = 'none';
        return;
    }
    if (!overlay.contains(mapEl)) return;
    if (ymap) {
        try { ymap.destroy(); } catch {}
        ymap = null;
        ymark = null;
    }
    const hasPin = form.adres.lat != null && form.adres.lng != null;
    const lat = hasPin ? form.adres.lat : 39.0;
    const lng = hasPin ? form.adres.lng : 35.0; // Türkiye merkez
    const zoom = hasPin ? 17 : 6;
    ymap = new ymaps.Map(mapEl, {
        center: [lat, lng],
        zoom,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl'],
    }, { suppressMapOpenBlock: true });
    if (hasPin) addOrMoveMarker([lat, lng]);
    ymap.events.add('click', e => {
        const c = e.get('coords');
        addOrMoveMarker(c);
        setCoord(c[0], c[1]);
    });
    setTimeout(() => { try { ymap?.container.fitToViewport(); } catch {} }, 60);
}

function addOrMoveMarker(latlng) {
    if (!ymap || !window.ymaps) return;
    if (ymark) {
        ymark.geometry.setCoordinates(latlng);
    } else {
        ymark = new window.ymaps.Placemark(latlng, {}, { draggable: true, preset: 'islands#redIcon' });
        ymark.events.add('dragend', () => {
            const c = ymark.geometry.getCoordinates();
            setCoord(c[0], c[1]);
        });
        ymap.geoObjects.add(ymark);
    }
}

function setCoord(lat, lng) {
    form.adres.lat = +lat.toFixed(6);
    form.adres.lng = +lng.toFixed(6);
    const latInput = overlay.querySelector('input[data-path="adres.lat"]');
    const lngInput = overlay.querySelector('input[data-path="adres.lng"]');
    if (latInput) latInput.value = form.adres.lat;
    if (lngInput) lngInput.value = form.adres.lng;
}

function syncMapToInputs() {
    if (!ymap) return;
    const { lat, lng } = form.adres;
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return;
    addOrMoveMarker([lat, lng]);
    // Bina seviyesinde zoom — kullanıcı tek tıkla binayı işaretleyebilsin.
    // (Zaten daha yakındaysa kullanıcının zoom'unu indirme.)
    ymap.setCenter([lat, lng], Math.max(ymap.getZoom(), 18));
}

// ── HELPERS ────────────────────────────────────────────────────────
// kolonTadilat veya icTesisatTadilat true ise proje tipini 'tadilat' yap,
// aksi halde 'yeni'. Şerit chip'i ve CTA validasyonu bunu okur.
function syncProjectType() {
    const isTadilat = !!(form.kolonTadilat || (form.icTesisatVar && form.icTesisatTadilat));
    form.projectType = isTadilat ? 'tadilat' : 'yeni';
}

// Birim bazlı tadilatlardan icTesisatTadilat'ı türet:
//   - En az 1 birim tadilat işaretliyse → icTesisatTadilat = true
//   - Tüm birimler kapalıysa            → icTesisatTadilat = false
// Yalnızca liste UI'da görünüyorsa (2+ birim) çalışır.
function syncIcTesisatTadilatFromBirims() {
    const list = getProjectBirimler();
    if (list.length < 2) return; // liste gösterilmiyorsa kural devre dışı
    const anyTadilat = list.some(b => !!form.birimTadilat[b.key]);
    form.icTesisatTadilat = anyTadilat;
}

function syncKatYukseklikleri() {
    const total = (form.bodrumSayisi || 0) + 1 + (form.normalKatSayisi || 0);
    const arr = form.katYukseklikleri.slice(0, total);
    while (arr.length < total) arr.push(form.zeminKatYukseklik);
    form.katYukseklikleri = arr;
    // İç tesisat dizisini de katlarla aynı uzunlukta tut (yeni katlar default false).
    const arr2 = form.katIcTesisatVar.slice(0, total);
    while (arr2.length < total) arr2.push(false);
    // Kolon yok modunda en az bir kat aktif olmalıdır. Hiçbiri aktif değilse
    // varsayılan olarak ZEMİN katı (index = bodrumSayisi) aktif edilir.
    if (!form.kolonVar && arr2.length > 0 && !arr2.some(Boolean)) {
        const defaultActive = Math.min(form.bodrumSayisi || 0, arr2.length - 1);
        arr2[defaultActive] = true;
    }
    form.katIcTesisatVar = arr2;
}

function updateCTA() {
    if (!overlay) return;
    const cta = overlay.querySelector('#ob-start');
    let ok = form.projectName.trim().length > 0;
    const tadilatSebepEksik = form.projectType === 'tadilat' && !form.tadilatSebep.trim();
    if (tadilatSebepEksik) ok = false;
    cta.disabled = !ok;
    // Tadilat açıklaması alanı: zorunlu ama boşsa kırmızı çerçeve
    const tadilatField = overlay.querySelector('[data-path="tadilatSebep"]')?.closest('.ob-field');
    if (tadilatField) tadilatField.classList.toggle('is-invalid', tadilatSebepEksik);
    // Üst şerit form değişikliğine göre canlı güncellensin
    renderSummaryBar();
}

// ── APPLY TO GLOBAL STATE ──────────────────────────────────────────
function applyAndClose() {
    try { localStorage.setItem(LS_LAST_SETTINGS, JSON.stringify(form)); } catch {}

    const floors = buildGlobalFloors();
    const groundFloor = floors.find(f => f.name === 'ZEMİN');

    setState({
        floors,
        currentFloor: groundFloor,
        defaultFloorHeight: form.zeminKatYukseklik,
        isinmaTipi: form.isinmaTipi,
        projectMeta: {
            name: form.projectName,
            type: form.projectType,
            tadilatSebep: form.tadilatSebep,
            projeKapagiNotu: form.projeKapagiNotu,
            kolonVar: form.kolonVar,
            kutuTipi: form.kolonVar ? form.kutuTipi : null,
            kutuBasinc: form.kutuBasinc,
            zeminKat0Offset: form.zeminKat0Offset,
            mustakilProje: form.mustakilProje,
            onProje: form.onProje,
            adres: { ...form.adres },
            sorumlu: { ...form.sorumlu },
            binaTesisatNo: (form.servis?.binaTesisatNo || '').trim(),
            // ABYS sayaç listesi — sayacın birimTipi+birimNo'su girilince/atanınca
            // bu listeden abone adı + abone no otomatik dolar.
            aboneList: Array.isArray(form.birimler) ? form.birimler.slice() : [],
        },
    });

    // Uygula sonrası: projedeki sayaçlara servisten alınan abone bilgilerini
    // (aboneAdi + aboneTuketimNo) form.birimler içinden eşle.
    _applyAboneListToProjectSayaclar(form.birimler);

    if (form.projectName) document.title = `${form.projectName} — AAA CAD`;

    try { draw2D(); } catch (e) { console.warn('draw2D failed:', e); }
    try { renderMiniPanel(); } catch (e) { console.warn('renderMiniPanel failed:', e); }
    try { update3DScene(); } catch (e) { /* 3D may not be initialized */ }

    hideOnboardingPanel();
}

// ── EDIT MODE: STATE → FORM ────────────────────────────────────────
// Proje Detayları menüsünden açıldığında çağrılır; mevcut state.projectMeta,
// state.isinmaTipi ve state.floors'tan formu doldurur. Böylece kullanıcının
// projeye sonradan eklediği katlar / değişen yükseklikler / gizli katlar bu
// panelde de gerçeği yansıtır.
function buildFormFromState() {
    const meta = state.projectMeta || {};
    const out = deepClone(DEFAULT_FORM);

    // Proje üst düzey
    out.projectName    = meta.name           || (typeof window !== 'undefined' ? (document.getElementById('projectNameInput')?.value || '') : '') || '';
    out.projectType    = meta.type           || 'yeni';
    out.tadilatSebep   = meta.tadilatSebep   || '';
    out.projeKapagiNotu = meta.projeKapagiNotu || '';
    out.kolonVar       = (typeof meta.kolonVar === 'boolean') ? meta.kolonVar : true;
    // Projede CANLI HAT (servis kutusu yok) varsa kolonVar zorunlu FALSE.
    const pm = (typeof window !== 'undefined') ? window.plumbingManager : null;
    const hasComponents = Array.isArray(pm?.components) && pm.components.length > 0;
    const hasServisKutusu = hasComponents && pm.components.some(c => c.type === 'servis_kutusu');
    if (hasComponents && !hasServisKutusu) out.kolonVar = false;

    out.kutuTipi       = meta.kutuTipi       || 'duvar';
    out.kutuBasinc     = meta.kutuBasinc     || '21';
    out.zeminKat0Offset = Number.isFinite(meta.zeminKat0Offset) ? meta.zeminKat0Offset : 0;
    out.mustakilProje  = !!meta.mustakilProje;
    out.onProje        = !!meta.onProje;
    if (meta.adres)    Object.assign(out.adres, meta.adres);
    if (meta.sorumlu)  Object.assign(out.sorumlu, meta.sorumlu);

    out.isinmaTipi = state.isinmaTipi || 'bireysel';

    // Katlar — placeholder'lar çıkar, bottomElevation'a göre sırala
    const realFloors = (state.floors || [])
        .filter(f => !f.isPlaceholder)
        .slice()
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    const ground = realFloors.find(f => f.name === 'ZEMİN');
    const bodrums = realFloors.filter(f => /BODRUM/.test(f.name))
        .sort((a, b) => a.bottomElevation - b.bottomElevation); // deepest first
    const above = realFloors.filter(f => /\.KAT$/.test(f.name))
        .sort((a, b) => a.bottomElevation - b.bottomElevation); // 1.KAT (lowest) first

    out.bodrumSayisi = bodrums.length;
    out.normalKatSayisi = above.length;

    if (ground) {
        out.zeminKat0Offset = Math.round(ground.bottomElevation);
        out.zeminKatYukseklik = Math.max(180, Math.round(ground.topElevation - ground.bottomElevation));
    }

    // Form sırası: [1.BODRUM (en üst bodrum), ..., en derin BODRUM, ZEMİN, 1.KAT, ..., en üst KAT]
    // state.bodrums sırası: en derin → en sığ; ters çevirip 1.BODRUM'u başa koyuyoruz.
    const bodrumsTopFirst = bodrums.slice().reverse();

    const heights = [];
    const ict = [];

    bodrumsTopFirst.forEach(f => {
        heights.push(Math.max(180, Math.round(f.topElevation - f.bottomElevation)));
        ict.push(f.visible !== false);
    });
    if (ground) {
        heights.push(Math.max(180, Math.round(ground.topElevation - ground.bottomElevation)));
        ict.push(ground.visible !== false);
    }
    above.forEach(f => {
        heights.push(Math.max(180, Math.round(f.topElevation - f.bottomElevation)));
        ict.push(f.visible !== false);
    });

    out.katYukseklikleri = heights;
    out.katIcTesisatVar = ict;

    // Tüm yükseklikler eşitse "tüm katlar aynı yükseklik" anahtarını aktif et
    const allSame = heights.length > 0 && heights.every(h => h === heights[0]);
    out.tumKatlarAyniYukseklik = out.kolonVar ? allSame : false;

    return out;
}

// ── EDIT MODE: FORM → STATE (preserve walls/IDs) ───────────────────
// Mevcut katları sıralı pozisyona göre yeni form slotlarına eşler — id'ler ve
// dolayısıyla ona bağlı duvar/kapı/pencere/tesisat verileri korunur. Eksik
// slotlar için yeni floor objesi üretilir, fazla slotlar silinir.
function applyEditAndClose() {
    try { localStorage.setItem(LS_LAST_SETTINGS, JSON.stringify(form)); } catch {}

    const realFloors = (state.floors || [])
        .filter(f => !f.isPlaceholder)
        .slice()
        .sort((a, b) => a.bottomElevation - b.bottomElevation);

    const existingGround = realFloors.find(f => f.name === 'ZEMİN');
    const existingBodrums = realFloors.filter(f => /BODRUM/.test(f.name))
        .sort((a, b) => a.bottomElevation - b.bottomElevation); // deepest first
    const existingKatlar = realFloors.filter(f => /\.KAT$/.test(f.name))
        .sort((a, b) => a.bottomElevation - b.bottomElevation); // 1.KAT first

    const wantBodrums = form.bodrumSayisi || 0;
    const wantKatlar = form.normalKatSayisi || 0;

    const heightOf = (formIdx) => {
        if (form.tumKatlarAyniYukseklik) return form.zeminKatYukseklik;
        const v = form.katYukseklikleri[formIdx];
        return Number.isFinite(v) ? v : form.zeminKatYukseklik;
    };
    // kolonVar=true: tüm katlar iç tesisatlı + görünür state korunur.
    // kolonVar=false: checkbox iç tesisatı VE görünürlüğü belirler.
    const icTesisatOf = (formIdx) => form.kolonVar ? true : !!form.katIcTesisatVar[formIdx];

    const newFloors = [];

    // Bodrum slotları (form sırası: 0=1.BODRUM top, wantBodrums-1=deepest)
    // Elevations: 1.BODRUM top = zeminKat0Offset, growing downward.
    const bodrumSlots = [];
    let topCursor = form.zeminKat0Offset;
    for (let i = 0; i < wantBodrums; i++) {
        const h = heightOf(i);
        const top = topCursor;
        const bot = top - h;
        bodrumSlots.push({ formIdx: i, top, bot });
        topCursor = bot;
    }
    // Sorted asc by bottom: deepest first (index wantBodrums-1) → 1.BODRUM (index 0)
    // existingBodrums[k] (sorted asc) eşleşir slot pozisyon k (sorted asc) = wantBodrums-1-i
    for (let i = wantBodrums - 1; i >= 0; i--) {
        const slot = bodrumSlots[i];
        const sortedAscIdx = wantBodrums - 1 - i;
        const reuse = existingBodrums[sortedAscIdx];
        const f = reuse ? { ...reuse } : {
            id: `floor-bodrum-${i + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
        f.name = `${i + 1}.BODRUM`;
        f.bottomElevation = slot.bot;
        f.topElevation = slot.top;
        f.isPlaceholder = false;
        f.icTesisatVar = icTesisatOf(slot.formIdx);
        if (!form.kolonVar) {
            f.visible = !!form.katIcTesisatVar[slot.formIdx];
        } else if (!reuse) {
            // Yeni eklenen kat görünür gelsin — placeholder click ile aynı davranış.
            f.visible = true;
        }
        newFloors.push(f);
    }

    // ZEMİN
    const groundFormIdx = wantBodrums;
    const groundH = heightOf(groundFormIdx);
    const groundBot = form.zeminKat0Offset;
    const groundTop = groundBot + groundH;
    let ground;
    if (existingGround) {
        ground = { ...existingGround, name: 'ZEMİN', bottomElevation: groundBot, topElevation: groundTop, isPlaceholder: false };
    } else {
        ground = { id: 'floor-ground', name: 'ZEMİN', bottomElevation: groundBot, topElevation: groundTop, isPlaceholder: false };
    }
    ground.icTesisatVar = icTesisatOf(groundFormIdx);
    if (!form.kolonVar) ground.visible = !!form.katIcTesisatVar[groundFormIdx];
    else if (!existingGround) ground.visible = true;
    newFloors.push(ground);

    // Normal katlar (zemin üstü) — form sırası: 0=1.KAT (alt), ..., wantKatlar-1 (üst)
    let katCursor = ground.topElevation;
    for (let i = 0; i < wantKatlar; i++) {
        const formIdx = wantBodrums + 1 + i;
        const h = heightOf(formIdx);
        const bot = katCursor;
        const top = bot + h;
        const reuse = existingKatlar[i]; // sorted asc index = form index
        const f = reuse ? { ...reuse } : {
            id: `floor-kat-${i + 1}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        };
        f.name = `${i + 1}.KAT`;
        f.bottomElevation = bot;
        f.topElevation = top;
        f.isPlaceholder = false;
        f.icTesisatVar = icTesisatOf(formIdx);
        if (!form.kolonVar) f.visible = !!form.katIcTesisatVar[formIdx];
        else if (!reuse) f.visible = true; // Yeni eklenen kat görünür gelsin
        newFloors.push(f);
        katCursor = top;
    }

    // Placeholder'ları yeniden kur
    const firstBot = newFloors[0]?.bottomElevation ?? form.zeminKat0Offset;
    const lastTop  = newFloors[newFloors.length - 1]?.topElevation ?? (form.zeminKat0Offset + form.zeminKatYukseklik);
    const lowerPlaceholder = {
        id: 'floor-lower-placeholder',
        name: 'ALTA KAT EKLE',
        bottomElevation: firstBot - form.zeminKatYukseklik,
        topElevation: firstBot,
        visible: false, isPlaceholder: true, isBelow: true,
    };
    const upperPlaceholder = {
        id: 'floor-upper-placeholder',
        name: 'ÜSTE KAT EKLE',
        bottomElevation: lastTop,
        topElevation: lastTop + form.zeminKatYukseklik,
        visible: false, isPlaceholder: true, isBelow: false,
    };

    const finalFloors = [lowerPlaceholder, ...newFloors, upperPlaceholder];

    // Silinen katlardaki duvar/kapı referansları orphan olarak kalır — mevcut
    // deleteFloor davranışıyla tutarlı (orphans rendere katılmaz, kullanıcı
    // yeniden ekleyebilir). Burada zorla temizlemiyoruz.
    const keptFloorIds = new Set(finalFloors.filter(f => !f.isPlaceholder).map(f => f.id));

    // Mevcut currentFloor'u koru; silindiyse ZEMİN'e düş.
    let newCurrentFloor = state.currentFloor;
    if (!newCurrentFloor || !keptFloorIds.has(newCurrentFloor.id)) {
        newCurrentFloor = ground;
    } else {
        newCurrentFloor = finalFloors.find(f => f.id === newCurrentFloor.id) || ground;
    }

    setState({
        floors: finalFloors,
        currentFloor: newCurrentFloor,
        defaultFloorHeight: form.zeminKatYukseklik,
        isinmaTipi: form.isinmaTipi,
        projectMeta: {
            ...(state.projectMeta || {}),
            name: form.projectName,
            type: form.projectType,
            tadilatSebep: form.tadilatSebep,
            projeKapagiNotu: form.projeKapagiNotu,
            kolonVar: form.kolonVar,
            kutuTipi: form.kolonVar ? form.kutuTipi : null,
            kutuBasinc: form.kutuBasinc,
            zeminKat0Offset: form.zeminKat0Offset,
            mustakilProje: form.mustakilProje,
            onProje: form.onProje,
            adres: { ...form.adres },
            sorumlu: { ...form.sorumlu },
            binaTesisatNo: (form.servis?.binaTesisatNo || '').trim(),
            // ABYS sayaç listesi — sayacın birimTipi+birimNo'su girilince/atanınca
            // bu listeden abone adı + abone no otomatik dolar.
            aboneList: Array.isArray(form.birimler) ? form.birimler.slice() : [],
        },
    });

    // Uygula sonrası: projedeki sayaçlara servisten alınan abone bilgilerini
    // (aboneAdi + aboneTuketimNo) form.birimler içinden eşle.
    _applyAboneListToProjectSayaclar(form.birimler);

    if (form.projectName) {
        document.title = `${form.projectName} — AAA CAD`;
        const nameInput = document.getElementById('projectNameInput');
        if (nameInput) nameInput.value = form.projectName;
    }

    try { draw2D(); } catch (e) { console.warn('draw2D failed:', e); }
    try { renderMiniPanel(); } catch (e) { console.warn('renderMiniPanel failed:', e); }
    try { update3DScene(); } catch (e) { /* 3D may not be initialized */ }

    hideOnboardingPanel();
}

function buildGlobalFloors() {
    const out = [];
    // kolonVar=true durumunda tüm katlar varsayılan olarak iç tesisatlıdır;
    // kolonVar=false ise yalnızca kullanıcının işaretlediği katlar tesisatlıdır.
    const icTesisatOf = idx => form.kolonVar ? true : !!form.katIcTesisatVar[idx];
    let cursorBottom = form.zeminKat0Offset;
    for (let i = 0; i < form.bodrumSayisi; i++) {
        const h = form.tumKatlarAyniYukseklik ? form.zeminKatYukseklik
            : (form.katYukseklikleri[i] ?? form.zeminKatYukseklik);
        const top = cursorBottom;
        const bot = top - h;
        out.unshift({
            id: `floor-bodrum-${i + 1}`,
            name: `${i + 1}.BODRUM`,
            bottomElevation: bot,
            topElevation: top,
            visible: false,
            isPlaceholder: false,
            icTesisatVar: icTesisatOf(i),
        });
        cursorBottom = bot;
    }
    const lowerPlaceholder = {
        id: 'floor-lower-placeholder',
        name: 'ALTA KAT EKLE',
        bottomElevation: cursorBottom - form.zeminKatYukseklik,
        topElevation: cursorBottom,
        visible: false,
        isPlaceholder: true,
        isBelow: true,
    };

    const groundIdx = form.bodrumSayisi;
    const groundH = form.tumKatlarAyniYukseklik ? form.zeminKatYukseklik
        : (form.katYukseklikleri[groundIdx] ?? form.zeminKatYukseklik);
    const ground = {
        id: 'floor-ground',
        name: 'ZEMİN',
        bottomElevation: form.zeminKat0Offset,
        topElevation: form.zeminKat0Offset + groundH,
        visible: true,
        isPlaceholder: false,
        icTesisatVar: icTesisatOf(groundIdx),
    };

    const above = [];
    let cursorTop = ground.topElevation;
    for (let i = 0; i < form.normalKatSayisi; i++) {
        const idxInArr = groundIdx + 1 + i;
        const h = form.tumKatlarAyniYukseklik ? form.zeminKatYukseklik
            : (form.katYukseklikleri[idxInArr] ?? form.zeminKatYukseklik);
        const bot = cursorTop;
        const top = bot + h;
        above.push({
            id: `floor-kat-${i + 1}`,
            name: `${i + 1}.KAT`,
            bottomElevation: bot,
            topElevation: top,
            visible: false,
            isPlaceholder: false,
            icTesisatVar: icTesisatOf(idxInArr),
        });
        cursorTop = top;
    }
    const upperPlaceholder = {
        id: 'floor-upper-placeholder',
        name: 'ÜSTE KAT EKLE',
        bottomElevation: cursorTop,
        topElevation: cursorTop + form.zeminKatYukseklik,
        visible: false,
        isPlaceholder: true,
        isBelow: false,
    };

    return [lowerPlaceholder, ...out, ground, ...above, upperPlaceholder];
}

// ── ICONS (inline SVG) ─────────────────────────────────────────────
const ICON = {
    kolonVar: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="6" width="28" height="28"/><line x1="20" y1="6" x2="20" y2="34"/><line x1="6" y1="14" x2="34" y2="14"/><line x1="6" y1="22" x2="34" y2="22"/><line x1="6" y1="30" x2="34" y2="30"/></svg>`,
    kolonYok: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="6" y="6" width="28" height="28"/><line x1="6" y1="14" x2="34" y2="14"/><line x1="6" y1="22" x2="34" y2="22"/><line x1="6" y1="30" x2="34" y2="30"/></svg>`,
    kutuDuvar: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><line x1="4" y1="34" x2="36" y2="34"/><rect x="14" y="12" width="12" height="20" fill="rgba(245,197,66,0.3)"/><line x1="26" y1="28" x2="34" y2="28"/></svg>`,
    kutuYer: `<svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><line x1="4" y1="20" x2="36" y2="20"/><rect x="10" y="24" width="20" height="12" fill="rgba(245,197,66,0.3)"/><line x1="20" y1="22" x2="20" y2="16"/></svg>`,
};

// ── AUTO-SHOW ON STARTUP ───────────────────────────────────────────
function autoShowIfEnabled() {
    if (localStorage.getItem(LS_SHOW_AT_START) === 'false') return;
    if (state.walls && state.walls.length > 0) return;
    showOnboardingPanel();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(autoShowIfEnabled, 400));
} else {
    setTimeout(autoShowIfEnabled, 400);
}
