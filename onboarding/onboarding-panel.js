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
    projectName: '',

    // Adres
    // Mod seçimi: 'servis' = Bina Tesisat No / Abone Tüketim No ile çek,
    //             'sec'    = İl/İlçe/Mahalle/Cadde-Sokak combobox + Kapı No
    adresMode: 'sec',
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
        postaKodu: '',
        lat: null,
        lng: null,
    },
    birimler: [],

    // Tesisat
    projectType: 'yeni',           // 'yeni' | 'tadilat'
    tadilatSebep: '',
    projeKapagiNotu: '',
    kolonVar: true,
    kutuTipi: 'duvar',             // 'duvar' | 'yer'
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

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

// ── PUBLIC API ─────────────────────────────────────────────────────
export function showOnboardingPanel(force = false) {
    if (!force) {
        const pref = localStorage.getItem(LS_SHOW_AT_START);
        if (pref === 'false') return;
    }
    if (!overlay) buildOverlay();
    form = deepClone(DEFAULT_FORM);
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

    overlay.querySelector('#ob-start').addEventListener('click', () => applyAndClose());

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
    renderTabs();
    renderForm();
    updateSchematicVisibility();
    updateCTA();
}

function renderTopBar() {
    overlay.querySelector('#ob-project-name').value = form.projectName;
}

function renderTabs() {
    const root = overlay.querySelector('#ob-tabs');
    root.innerHTML = `
        <div class="ob-tabs-title">YENİ PROJE</div>
        ${TAB_IDS.map(id => {
            const isActive = id === currentTab;
            return `<div class="ob-tab ${isActive ? 'ob-tab-active' : ''}" data-tab="${id}">
                        <span class="ob-tab-label">${TAB_META[id].label}</span>
                    </div>`;
        }).join('')}
    `;
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
    updateCTA();
}

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
        loadStreets(ilceKod)
            .then(() => { if (currentTab === 'adres') renderForm(); })
            .catch(err => {
                console.warn('Sokak verisi yüklenemedi:', err);
                if (currentTab === 'adres') renderForm();
            });
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
function renderAdres() {
    return `
        <section class="ob-section">
            <h2 class="ob-q-title">Bina adres bilgileri</h2>
            <div class="ob-seg ob-seg-block" id="ob-adres-mode">
                <button type="button" class="ob-seg-btn ${form.adresMode === 'servis' ? 'ob-active' : ''}" data-val="servis">Servisten Al</button>
                <button type="button" class="ob-seg-btn ${form.adresMode === 'sec' ? 'ob-active' : ''}" data-val="sec">Adres Seç</button>
            </div>
            <div class="ob-mt-12">
                ${form.adresMode === 'servis' ? renderAdresServis() : renderAdresSec()}
            </div>
        </section>

        <section class="ob-section">
            <div class="ob-section-head">
                <h2 class="ob-q-title">Binanın koordinatları</h2>
                <div class="ob-section-actions">
                    <button type="button" class="ob-mini-btn" id="ob-yandex-open" title="Adresi Yandex Haritada yeni sekmede aç">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8 a 6 6 0 0 1 12 0 a 6 6 0 0 1 -12 0"/><path d="M8 2 v 12 M2 8 h 12"/></svg>
                        Yandex'te Aç
                    </button>
                    <button type="button" class="ob-mini-btn" id="ob-geocode" title="Adresi OSM ile haritada bul">
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><line x1="10.3" y1="10.3" x2="13.5" y2="13.5"/></svg>
                        Haritada Bul
                    </button>
                </div>
            </div>
            <div class="ob-geocode-status" id="ob-geocode-status"></div>
            <div class="ob-map-wrap">
                <div class="ob-map" id="ob-map"></div>
                <div class="ob-map-fallback" id="ob-map-fallback" style="display:none">
                    Harita yüklenemedi. Konumu aşağıdan elle girin.
                </div>
            </div>
            <div class="ob-grid ob-grid-2 ob-mt-10">
                ${numField('Enlem (lat)', 'adres.lat', form.adres.lat, 'any')}
                ${numField('Boylam (lng)', 'adres.lng', form.adres.lng, 'any')}
            </div>
        </section>
    `;
}

// "Servisten Al" — Bina Tesisat No ve/veya Abone Tüketim No ile sorgu.
function renderAdresServis() {
    const s = form.servis;
    const result = s.lastResult;
    return `
        <div class="ob-grid ob-grid-2">
            <div class="ob-field">
                <label class="ob-field-label">Bina Tesisat No</label>
                <div class="ob-input-with-btn">
                    <input type="text" class="ob-text" id="ob-bina-tesisat-no"
                           value="${escapeHtml(s.binaTesisatNo)}" autocomplete="off"
                           placeholder="Örn. 1234567" />
                    <button type="button" class="ob-mini-btn" id="ob-sorgula-bina">Sorgula</button>
                </div>
            </div>
            <div class="ob-field">
                <label class="ob-field-label">Abone Tüketim No</label>
                <div class="ob-input-with-btn">
                    <input type="text" class="ob-text" id="ob-abone-tuketim-no"
                           value="${escapeHtml(s.aboneTuketimNo)}" autocomplete="off"
                           placeholder="Örn. A001" />
                    <button type="button" class="ob-mini-btn" id="ob-sorgula-abone">Sorgula</button>
                </div>
            </div>
        </div>
        <div class="ob-servis-status" id="ob-servis-status"></div>
        ${result ? `
            <div class="ob-servis-result ob-mt-10">
                <div class="ob-servis-result-head">Servisten gelen bilgiler</div>
                <div class="ob-servis-result-body">
                    <div><span class="ob-kv-k">Bina Tesisat No</span><span class="ob-kv-v">${escapeHtml(result.binaTesisatNo)}</span></div>
                    ${result.aboneAdi   ? `<div><span class="ob-kv-k">Abone</span><span class="ob-kv-v">${escapeHtml(result.aboneAdi)}</span></div>` : ''}
                    ${result.adresKisa  ? `<div><span class="ob-kv-k">Adres</span><span class="ob-kv-v">${escapeHtml(result.adresKisa)}</span></div>` : ''}
                    <div><span class="ob-kv-k">Sayaç</span><span class="ob-kv-v">${result.birimSayisi} birim</span></div>
                </div>
            </div>
        ` : ''}
    `;
}

// "Adres Seç" — cascading 4 combobox + Kapı No (free text).
function renderAdresSec() {
    const a = form.adres;
    const indexLoaded = isIndexLoaded();
    const streetsLoading = !!(a.ilceKod && !isStreetsLoaded(a.ilceKod));
    const iller      = getIller();
    const ilceler    = getIlceler(a.ilKod);
    const mahalleler = getMahalleler(a.ilKod, a.ilceKod);
    const cadSoklar  = getCaddeSokaklar(a.ilKod, a.ilceKod, a.mahalleKod);

    let statusMsg = '';
    if (!indexLoaded)         statusMsg = 'Adres verileri yükleniyor…';
    else if (streetsLoading)  statusMsg = 'Cadde / sokak listesi yükleniyor…';

    return `
        <div class="ob-grid ob-grid-2">
            ${selectField('İl',           'ilKod',      iller,       a.ilKod,      !indexLoaded || iller.length === 0)}
            ${selectField('İlçe',         'ilceKod',    ilceler,     a.ilceKod,    !indexLoaded || !a.ilKod || ilceler.length === 0)}
            ${selectField('Mahalle',      'mahalleKod', mahalleler,  a.mahalleKod, !a.ilceKod || mahalleler.length === 0)}
            ${selectField('Cadde / Sokak','cadSokKod',  cadSoklar,   a.cadSokKod,  !a.mahalleKod || streetsLoading || cadSoklar.length === 0)}
            ${textField('Kapı No',  'adres.binaNo',  a.binaNo)}
            ${textField('Posta Kodu','adres.postaKodu', a.postaKodu)}
        </div>
        ${statusMsg ? `<div class="ob-geocode-status ob-info ob-mt-10">${statusMsg}</div>` : ''}
    `;
}

// ── TESISAT TAB ────────────────────────────────────────────────────
function renderTesisat() {
    return `
        <section class="ob-section">
            <h2 class="ob-q-title">Proje türü</h2>
            <div class="ob-seg ob-seg-block" id="ob-project-type">
                <button type="button" class="ob-seg-btn ${form.projectType === 'yeni' ? 'ob-active' : ''}" data-val="yeni">Yeni</button>
                <button type="button" class="ob-seg-btn ${form.projectType === 'tadilat' ? 'ob-active' : ''}" data-val="tadilat">Tadilat</button>
            </div>
            ${form.projectType === 'tadilat' ? `
                <div class="ob-field ob-mt-10">
                    <label class="ob-field-label">Tadilat açıklaması</label>
                    <textarea class="ob-text" data-path="tadilatSebep" rows="2"
                              placeholder="Hangi tadilat yapılıyor?">${escapeHtml(form.tadilatSebep)}</textarea>
                </div>
            ` : ''}
            <div class="ob-field ob-mt-10">
                <label class="ob-field-label">Proje kapağı notu</label>
                <textarea class="ob-text" data-path="projeKapagiNotu" rows="2"
                          placeholder="Proje kapağında görünecek not...">${escapeHtml(form.projeKapagiNotu)}</textarea>
            </div>
        </section>

        <section class="ob-section">
            <h2 class="ob-q-title">Isınma tipi</h2>
            <div class="ob-radio-row" data-group="isinmaTipi">
                <label class="ob-radio">
                    <input type="radio" name="isinmaTipi" value="bireysel" ${form.isinmaTipi === 'bireysel' ? 'checked' : ''} />
                    <span>Bireysel</span>
                </label>
                <label class="ob-radio">
                    <input type="radio" name="isinmaTipi" value="merkezi" ${form.isinmaTipi === 'merkezi' ? 'checked' : ''} />
                    <span>Merkezi</span>
                </label>
                <label class="ob-radio">
                    <input type="radio" name="isinmaTipi" value="boylerli" ${form.isinmaTipi === 'boylerli' ? 'checked' : ''} />
                    <span>Merkezi (Boylerli)</span>
                </label>
            </div>
            <div class="ob-switch-stack">
                <label class="ob-switch-row">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-mustakil" ${form.mustakilProje ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Müstakil proje</span>
                </label>
                <label class="ob-switch-row">
                    <span class="ob-switch">
                        <input type="checkbox" id="ob-on-proje" ${form.onProje ? 'checked' : ''} />
                        <span class="ob-switch-slider"></span>
                    </span>
                    <span class="ob-switch-label">Ön Proje</span>
                </label>
            </div>
        </section>
    `;
}

function renderKatlar() {
    // kolon=Hayır iken "tüm katların yüksekliği aynı" seçeneği yoktur;
    // tüm katlar her zaman alt alta listelenir (yükseklik + iç tesisat checkbox bir arada).
    const same = form.kolonVar && form.tumKatlarAyniYukseklik;
    const showList = !same; // kolonVar=false ise her zaman true
    let perFloorList = '';
    if (showList) {
        const items = [];
        let idx = 0;
        for (let i = 0; i < form.bodrumSayisi; i++) {
            items.push(floorItemHtml(`${i + 1}. BODRUM`, idx)); idx++;
        }
        items.push(floorItemHtml('ZEMİN', idx)); idx++;
        for (let i = 0; i < form.normalKatSayisi; i++) {
            items.push(floorItemHtml(`${i + 1}. KAT`, idx)); idx++;
        }
        perFloorList = items.join('');
    }
    return `
        <section class="ob-section">
            <h2 class="ob-q-title">Kolon olacak mı?</h2>
            <div class="ob-cards" data-group="kolonVar">
                <button type="button" class="ob-card ob-card-sm ${form.kolonVar ? 'ob-selected' : ''}" data-val="true">
                    <div class="ob-card-icon">${ICON.kolonVar}</div>
                    <div class="ob-card-title">Evet</div>
                </button>
                <button type="button" class="ob-card ob-card-sm ${!form.kolonVar ? 'ob-selected' : ''}" data-val="false">
                    <div class="ob-card-icon">${ICON.kolonYok}</div>
                    <div class="ob-card-title">Hayır</div>
                </button>
            </div>
        </section>

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

    // Project type segmented buttons (tesisat tab)
    overlay.querySelector('#ob-project-type')?.addEventListener('click', e => {
        const btn = e.target.closest('.ob-seg-btn');
        if (!btn) return;
        form.projectType = btn.dataset.val;
        renderForm();
        updateCTA();
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
            form.tumKatlarAyniYukseklik = sw.checked;
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

    // Müstakil / Ön Proje switches
    const mst = overlay.querySelector('#ob-mustakil');
    if (mst) mst.addEventListener('change', () => { form.mustakilProje = mst.checked; });
    const op = overlay.querySelector('#ob-on-proje');
    if (op) op.addEventListener('change', () => { form.onProje = op.checked; });

    // Geocode button (adres tab)
    overlay.querySelector('#ob-geocode')?.addEventListener('click', () => runGeocode());

    // Yandex'te Aç — yandex.com/maps web frontend'i (API key yok, proprietary
    // bina verisini kullanır). Razor snippet formatı:
    //   "{mahalle MAHALLESİ} {sokak Tipi} No: {bina_no} {ilçe} {il}"
    // — parantezdeki "(Sokak)" / "(Cadde)" tipini düz metin yapar, MAHALLESİ
    // suffix'ini KORUR (sileme — Yandex web'in tanıdığı formattır).
    overlay.querySelector('#ob-yandex-open')?.addEventListener('click', () => {
        const a = form.adres;
        const stripParens = s => String(s || '').replace(/\s*\([^)]+\)\s*$/u, '').trim();
        const extractType = s => {
            const m = String(s || '').match(/\(([^)]+)\)\s*$/u);
            return m ? m[1].trim() : '';
        };
        const sokakName = stripParens(a.sokak);
        const sokakType = extractType(a.sokak) || 'Sokak';
        const sokakFull = sokakName ? `${sokakName} ${sokakType}` : '';

        const parts = [];
        if (a.mahalle) parts.push(a.mahalle);             // "ARMAĞANEVLER MAHALLESİ"
        if (sokakFull) parts.push(sokakFull);             // "ORTANCA Sokak"
        if (a.binaNo)  parts.push(`No: ${a.binaNo}`);     // "No: 26"
        if (a.ilce)    parts.push(a.ilce);                // "ÜMRANİYE"
        if (a.il)      parts.push(a.il);                  // "İSTANBUL"
        const text = parts.join(' ').trim();

        if (!text) {
            const status = overlay.querySelector('#ob-geocode-status');
            if (status) { status.textContent = 'Önce adres alanlarını doldurun.'; status.className = 'ob-geocode-status ob-err'; }
            return;
        }
        const url = `https://yandex.com/maps/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Adres mode segment (Servisten Al / Adres Seç)
    overlay.querySelector('#ob-adres-mode')?.addEventListener('click', e => {
        const btn = e.target.closest('.ob-seg-btn');
        if (!btn) return;
        const mode = btn.dataset.val;
        if (mode === form.adresMode) return;
        form.adresMode = mode;
        renderForm();
    });

    // Adres Seç: cascading select'ler
    overlay.querySelectorAll('select[data-cascade]').forEach(sel => {
        sel.addEventListener('change', () => onCascadeChange(sel.dataset.cascade, sel.value));
    });

    // Servisten Al: sorgu butonları
    overlay.querySelector('#ob-sorgula-bina')?.addEventListener('click', () => runServisSorgu('bina'));
    overlay.querySelector('#ob-sorgula-abone')?.addEventListener('click', () => runServisSorgu('abone'));

    // Servisten Al: input'lar form'a yansısın (Enter ile sorgu)
    const binaInput = overlay.querySelector('#ob-bina-tesisat-no');
    if (binaInput) {
        binaInput.addEventListener('input', () => { form.servis.binaTesisatNo = binaInput.value; });
        binaInput.addEventListener('keydown', e => { if (e.key === 'Enter') runServisSorgu('bina'); });
    }
    const aboneInput = overlay.querySelector('#ob-abone-tuketim-no');
    if (aboneInput) {
        aboneInput.addEventListener('input', () => { form.servis.aboneTuketimNo = aboneInput.value; });
        aboneInput.addEventListener('keydown', e => { if (e.key === 'Enter') runServisSorgu('abone'); });
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
    status.className = 'ob-servis-status ob-' + (kind || 'info');
}

function applyServiceResult(bina, abone, kaynak) {
    if (!bina) return;
    // Adres bilgilerini form.adres'e yaz (her iki mod ile uyumlu kalsın)
    if (bina.adres) {
        Object.assign(form.adres, {
            ilKod:      bina.adres.ilKod      ?? form.adres.ilKod,
            ilceKod:    bina.adres.ilceKod    ?? '',
            mahalleKod: bina.adres.mahalleKod ?? '',
            cadSokKod:  bina.adres.cadSokKod  ?? '',
            il:         bina.adres.il         ?? form.adres.il,
            ilce:       bina.adres.ilce       ?? '',
            mahalle:    bina.adres.mahalle    ?? '',
            sokak:      bina.adres.sokak      ?? '',
            binaNo:     bina.adres.binaNo     ?? '',
            postaKodu:  bina.adres.postaKodu  ?? '',
            lat:        bina.adres.lat        ?? form.adres.lat,
            lng:        bina.adres.lng        ?? form.adres.lng,
        });
    }
    // Tesisat parametreleri (Tesisat / Katlar tab'larında kullanılır)
    if (bina.tesisat) {
        if (typeof bina.tesisat.kolonVar    === 'boolean') form.kolonVar    = bina.tesisat.kolonVar;
        if (bina.tesisat.kutuTipi)                          form.kutuTipi    = bina.tesisat.kutuTipi;
        if (bina.tesisat.isinmaTipi)                        form.isinmaTipi  = bina.tesisat.isinmaTipi;
    }
    // Sayaçlar
    form.birimler = Array.isArray(bina.sayaclar) ? bina.sayaclar.slice() : [];

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
    const hasAny = [a.il, a.ilce, a.mahalle, a.sokak, a.binaNo, a.postaKodu].some(s => s && String(s).trim());
    if (!hasAny) {
        status.textContent = 'Önce en az bir adres alanı girin.';
        status.className = 'ob-geocode-status ob-err';
        return;
    }

    btn.disabled = true;
    status.textContent = 'Aranıyor…';
    status.className = 'ob-geocode-status ob-info';

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
        status.className = 'ob-geocode-status ob-err';
        btn.disabled = false;
        return;
    }
    setCoord(best.lat, best.lng);
    syncMapToInputs();
    if (best.exactHouse) {
        status.textContent = `✓ Bulundu: ${best.text}`;
        status.className = 'ob-geocode-status ob-ok';
    } else if (binaNo) {
        // OSM verisinde ev numarası nadiren bulunur; sokak doğru ama bina için
        // kullanıcının haritadan tıklaması gerekiyor.
        status.textContent = `Sokak bulundu — Tam bina için haritadan binanızın üstüne tıklayın.`;
        status.className = 'ob-geocode-status ob-info';
    } else {
        status.textContent = `✓ ${best.text || 'Bulundu.'}`;
        status.className = 'ob-geocode-status ob-ok';
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
    if (form.projectType === 'tadilat' && !form.tadilatSebep.trim()) ok = false;
    cta.disabled = !ok;
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
            zeminKat0Offset: form.zeminKat0Offset,
            mustakilProje: form.mustakilProje,
            onProje: form.onProje,
            adres: { ...form.adres },
            sorumlu: { ...form.sorumlu },
        },
    });

    if (form.projectName) document.title = `${form.projectName} — AAA CAD`;

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
