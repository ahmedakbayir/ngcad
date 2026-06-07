// onboarding-panel.js
// Welcome / new-project onboarding panel.
// Compact layout: project name on top, 3 tabs (Adres | Tesisat | Sorumlu),
// schematic preview only visible on Tesisat tab.

import { state, setState } from '../general-files/main.js';
import { draw2D } from '../draw/draw2d.js';
import { renderMiniPanel } from '../floor/floor-panel.js';
import { update3DScene } from '../scene3d/scene3d-update.js';
import { OnboardingSchematic } from './onboarding-schematic.js';

const LS_SHOW_AT_START = 'onboarding_show_at_start';
const LS_LAST_SETTINGS = 'onboarding_last_settings';

const DEFAULT_FORM = {
    projectName: '',

    // Adres
    adres: {
        il: '',
        ilce: '',
        mahalle: '',
        sokak: '',
        binaNo: '',
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
let leafletMap = null;
let leafletMarker = null;
let leafletLoadPromise = null;

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
    if (leafletMap) {
        try { leafletMap.remove(); } catch {}
        leafletMap = null;
        leafletMarker = null;
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
    if (currentTab === 'adres' && leafletMap) {
        try { leafletMap.remove(); } catch {}
        leafletMap = null;
        leafletMarker = null;
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
    if (currentTab === 'adres') initMap();
    updateCTA();
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
    const a = form.adres;
    return `
        <section class="ob-section">
            <div class="ob-section-head">
                <h2 class="ob-q-title">Bina adres bilgileri</h2>
                <button type="button" class="ob-mini-btn" id="ob-geocode" title="Adresi haritada bul">
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><line x1="10.3" y1="10.3" x2="13.5" y2="13.5"/></svg>
                    Haritada Bul
                </button>
            </div>
            <div class="ob-grid ob-grid-2">
                ${textField('İl', 'adres.il', a.il)}
                ${textField('İlçe', 'adres.ilce', a.ilce)}
                ${textField('Mahalle', 'adres.mahalle', a.mahalle)}
                ${textField('Sokak / Cadde', 'adres.sokak', a.sokak)}
                ${textField('Bina No', 'adres.binaNo', a.binaNo)}
                ${textField('Posta Kodu', 'adres.postaKodu', a.postaKodu)}
            </div>
            <div class="ob-geocode-status" id="ob-geocode-status"></div>
        </section>

        <section class="ob-section">
            <h2 class="ob-q-title">Binanın koordinatları</h2>
            <div class="ob-map-wrap">
                <div class="ob-map" id="ob-map"></div>
                <div class="ob-map-fallback" id="ob-map-fallback" style="display:none">
                    Harita yüklenemedi. Konumu aşağıdan elle girin.
                </div>
            </div>
            <div class="ob-grid ob-grid-2 ob-mt-10">
                ${numField('Enlem (lat)', 'adres.lat', a.lat, 'any')}
                ${numField('Boylam (lng)', 'adres.lng', a.lng, 'any')}
            </div>
        </section>

        <section class="ob-section">
            <h2 class="ob-q-title">Binadaki birimler</h2>
            <div class="ob-placeholder">Bu bölüm sonra eklenecek.</div>
        </section>
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
    const same = form.tumKatlarAyniYukseklik;
    let perFloorList = '';
    if (!same) {
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

        <section class="ob-section">
            <h2 class="ob-q-title">Katlar</h2>
            <div class="ob-num-row">
            <div class="ob-field">
                <label class="ob-field-label">Zemin kat yüksekliği</label>
                <div class="ob-num-input-wrap" data-field="zeminKatYukseklik" data-step="10" data-min="180" data-max="500">
                    <button type="button" class="ob-num-btn" data-act="dec">−</button>
                    <input type="number" class="ob-num-input" value="${form.zeminKatYukseklik}" />
                    <span class="ob-num-unit">cm</span>
                    <button type="button" class="ob-num-btn" data-act="inc">+</button>
                </div>
            </div>
            <div class="ob-field">
                <label class="ob-field-label">Zemin kat seviyesinin yere göre yüksekliği</label>
                <div class="ob-num-input-wrap" data-field="zeminKat0Offset" data-step="5" data-min="-300" data-max="300">
                    <button type="button" class="ob-num-btn" data-act="dec">−</button>
                    <input type="number" class="ob-num-input" value="${form.zeminKat0Offset}" />
                    <span class="ob-num-unit">cm</span>
                    <button type="button" class="ob-num-btn" data-act="inc">+</button>
                </div>
            </div>
        </div>
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
                <label class="ob-field-label">Zemin üstü kat sayısı</label>
                <div class="ob-num-input-wrap" data-field="normalKatSayisi" data-step="1" data-min="0" data-max="20">
                    <button type="button" class="ob-num-btn" data-act="dec">−</button>
                    <input type="number" class="ob-num-input" value="${form.normalKatSayisi}" />
                    <span class="ob-num-unit">kat</span>
                    <button type="button" class="ob-num-btn" data-act="inc">+</button>
                </div>
            </div>
        </div>
        <label class="ob-switch-row">
            <span class="ob-switch">
                <input type="checkbox" id="ob-same-height" ${same ? 'checked' : ''} />
                <span class="ob-switch-slider"></span>
            </span>
            <span class="ob-switch-label">Tüm katların yüksekliği aynı</span>
        </label>
        <div class="ob-floor-list ${!same ? 'ob-visible' : ''}">${perFloorList}</div>
        </section>
    `;
}

function floorItemHtml(name, idx) {
    const h = form.katYukseklikleri[idx] ?? form.zeminKatYukseklik;
    return `
        <div class="ob-floor-item">
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

    // Müstakil / Ön Proje switches
    const mst = overlay.querySelector('#ob-mustakil');
    if (mst) mst.addEventListener('change', () => { form.mustakilProje = mst.checked; });
    const op = overlay.querySelector('#ob-on-proje');
    if (op) op.addEventListener('change', () => { form.onProje = op.checked; });

    // Geocode button (adres tab)
    overlay.querySelector('#ob-geocode')?.addEventListener('click', () => runGeocode());
}

// ── GEOCODE (Nominatim) ────────────────────────────────────────────
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
    const wantedHouseNo = binaNo.toLowerCase();
    const urls = [];

    // 1) Structured query — house number first in "street"
    if (a.sokak || binaNo) {
        const structured = new URLSearchParams({ format: 'json', limit: '5', countrycodes: 'tr', addressdetails: '1' });
        const street = [binaNo, a.sokak].filter(Boolean).join(' ').trim();
        if (street)      structured.set('street', street);
        if (a.ilce)      structured.set('city', a.ilce);
        if (a.il)        structured.set('state', a.il);
        if (a.postaKodu) structured.set('postalcode', a.postaKodu);
        urls.push(`https://nominatim.openstreetmap.org/search?${structured.toString()}`);
    }

    // 2) Turkish convention free-form: "Sokak No: X, Mahalle Mh., İlçe, İl, PK"
    {
        const turkishStreet =
            (a.sokak && binaNo) ? `${a.sokak} No: ${binaNo}` :
            a.sokak              ? a.sokak :
            binaNo               ? `No: ${binaNo}` : '';
        const parts = [
            turkishStreet,
            a.mahalle ? `${a.mahalle} Mahallesi` : '',
            a.ilce, a.il, a.postaKodu,
        ].filter(s => s && String(s).trim());
        if (parts.length) {
            const q = parts.join(', ') + ', Türkiye';
            urls.push(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tr&addressdetails=1&q=${encodeURIComponent(q)}`);
        }
    }

    // 3) Plain "binaNo sokak, ilçe, il" simple variant
    {
        const street = [binaNo, a.sokak].filter(Boolean).join(' ').trim();
        const parts = [street, a.ilce, a.il].filter(s => s && String(s).trim());
        if (parts.length) {
            const q = parts.join(', ') + ', Türkiye';
            urls.push(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tr&addressdetails=1&q=${encodeURIComponent(q)}`);
        }
    }

    try {
        let bestHit = null;
        let bestScore = -1;
        for (const url of urls) {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) continue;
            const data = await res.json();
            if (!Array.isArray(data)) continue;
            for (const hit of data) {
                let score = 0;
                const hn = hit.address?.house_number ? String(hit.address.house_number).toLowerCase() : '';
                if (wantedHouseNo && hn && hn === wantedHouseNo) score += 100;
                else if (wantedHouseNo && hn) score -= 5;
                if (hit.address?.road) score += 5;
                if (hit.address?.suburb || hit.address?.neighbourhood) score += 2;
                if (score > bestScore) { bestScore = score; bestHit = hit; }
            }
            if (bestScore >= 100) break;     // exact house-number hit, stop early
        }
        if (!bestHit) {
            status.textContent = 'Adres bulunamadı. Haritadan tıklayarak konum seçebilirsiniz.';
            status.className = 'ob-geocode-status ob-err';
            return;
        }
        setCoord(parseFloat(bestHit.lat), parseFloat(bestHit.lon));
        syncMapToInputs();
        const matchedHouseNo = bestHit.address?.house_number;
        const note = (wantedHouseNo && matchedHouseNo && String(matchedHouseNo).toLowerCase() === wantedHouseNo)
            ? ''
            : (wantedHouseNo ? ' (bina no eşleşmedi, sokak seviyesi)' : '');
        status.textContent = (bestHit.display_name ? `Bulundu: ${bestHit.display_name}` : 'Bulundu.') + note;
        status.className = 'ob-geocode-status ' + (note ? 'ob-info' : 'ob-ok');
    } catch (e) {
        console.warn('Geocode failed:', e);
        status.textContent = 'Konum servisi yanıt vermedi. Daha sonra tekrar deneyin veya elle girin.';
        status.className = 'ob-geocode-status ob-err';
    } finally {
        btn.disabled = false;
    }
}

// ── MAP (Leaflet) ──────────────────────────────────────────────────
function ensureLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletLoadPromise) return leafletLoadPromise;
    leafletLoadPromise = new Promise((resolve, reject) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => resolve(window.L);
        script.onerror = () => reject(new Error('Leaflet load failed'));
        document.head.appendChild(script);
    });
    return leafletLoadPromise;
}

async function initMap() {
    const mapEl = overlay.querySelector('#ob-map');
    if (!mapEl) return;
    let L;
    try {
        L = await ensureLeaflet();
    } catch (e) {
        const fb = overlay.querySelector('#ob-map-fallback');
        if (fb) fb.style.display = '';
        mapEl.style.display = 'none';
        return;
    }
    // Ensure container is still in DOM (tab might have switched mid-load)
    if (!overlay.contains(mapEl)) return;
    if (leafletMap) {
        try { leafletMap.remove(); } catch {}
        leafletMap = null;
        leafletMarker = null;
    }
    const hasPin = form.adres.lat != null && form.adres.lng != null;
    const lat = hasPin ? form.adres.lat : 39.0;
    const lng = hasPin ? form.adres.lng : 35.0; // Türkiye merkez
    const zoom = hasPin ? 17 : 6;
    leafletMap = L.map(mapEl).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
    }).addTo(leafletMap);
    if (hasPin) addOrMoveMarker(L, [lat, lng]);
    leafletMap.on('click', e => {
        addOrMoveMarker(L, [e.latlng.lat, e.latlng.lng]);
        setCoord(e.latlng.lat, e.latlng.lng);
    });
    setTimeout(() => { try { leafletMap?.invalidateSize(); } catch {} }, 60);
}

function addOrMoveMarker(L, latlng) {
    if (leafletMarker) {
        leafletMarker.setLatLng(latlng);
    } else {
        leafletMarker = L.marker(latlng, { draggable: true }).addTo(leafletMap);
        leafletMarker.on('dragend', () => {
            const p = leafletMarker.getLatLng();
            setCoord(p.lat, p.lng);
        });
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
    if (!leafletMap || !window.L) return;
    const { lat, lng } = form.adres;
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return;
    addOrMoveMarker(window.L, [lat, lng]);
    leafletMap.setView([lat, lng], Math.max(leafletMap.getZoom(), 15));
}

// ── HELPERS ────────────────────────────────────────────────────────
function syncKatYukseklikleri() {
    const total = (form.bodrumSayisi || 0) + 1 + (form.normalKatSayisi || 0);
    const arr = form.katYukseklikleri.slice(0, total);
    while (arr.length < total) arr.push(form.zeminKatYukseklik);
    form.katYukseklikleri = arr;
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
