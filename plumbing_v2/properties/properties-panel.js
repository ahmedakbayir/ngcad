/**
 * Özellikler Paneli
 * - Sağ üste sabit (viewing-mode-selector'ın hemen altında)
 * - SPACE tuşu veya "Özellikler" butonu ile aç/kapat
 * - ESC veya × ile kapat
 */

import { getPropertiesForObject, getObjectLabel, PROPERTY_DEFS } from './property-definitions.js';
import { draw2D } from '../../draw/draw2d.js';

// ─── DURUM ───────────────────────────────────────────────────────────────────

let panelEl = null;
let _currentObj = null;
let _currentManager = null;
let _isPinned = true;
let _rafId = null;
let _liveProps = null; // readonly props with readonlyFn — rAF döngüsünde güncellenir

// ─── PANEL YARAT ─────────────────────────────────────────────────────────────

function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.id = 'properties-panel';
    panelEl.className = 'props-panel';
    document.body.appendChild(panelEl);

    panelEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            _isPinned = false; // ESC her zaman kapatır, pin'i de sıfırlar
            closePropertiesPanel();
            e.stopPropagation();
        }
        if (e.key === ' ') e.stopPropagation();
    });
}

// ─── AÇMA / KAPAMA ───────────────────────────────────────────────────────────

export function openPropertiesPanel(obj, manager) {
    if (!panelEl) createPanel();
    _currentObj = obj;
    _currentManager = manager;
    _initDefaults(obj, manager);
    renderPanel(obj, manager);
    panelEl.classList.add('visible');
    updatePropertiesBtn(true);
    _startLiveRefresh();
}

export function closePropertiesPanel() {
    _stopLiveRefresh();
    if (panelEl) panelEl.classList.remove('visible');
    _currentObj = null;
    updatePropertiesBtn(false);
}

/** Nesnede tanımlı default değerler yoksa atar — nesne oluşturulurken de çağrılabilir */
export function initObjectDefaults(obj, manager) {
    _initDefaults(obj, manager);
}

function _initDefaults(obj, manager) {
    const props = getPropertiesForObject(obj);
    props.forEach(p => {
        if (p.key && p.default !== undefined && obj[p.key] === undefined) {
            obj[p.key] = p.default;
        }
    });
    void manager; // manager ileride kullanılabilir
}

/** rAF döngüsü: tüm alanları anlık günceller (readonly, select, text, toggle, bar) */
function _startLiveRefresh() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    function tick() {
        if (!panelEl?.classList.contains('visible') || !_currentObj) {
            _rafId = null;
            return;
        }
        // readonly / bar alanları (hesaplanan değerler)
        if (_liveProps) {
            _liveProps.forEach(prop => {
                const el = panelEl.querySelector(`[data-prop-id="${prop.id}"]`);
                if (!el) return;
                if (prop.type === 'bar') {
                    const val = prop.barFn(_currentObj, _currentManager);
                    if (el.innerHTML !== val) el.innerHTML = val;
                } else {
                    const val = prop.readonlyFn(_currentObj, _currentManager);
                    if (el.innerHTML !== val) el.innerHTML = val;
                }
            });
        }
        // select alanları: obj değeri değiştiyse güncelle
        panelEl.querySelectorAll('select[data-prop-key]').forEach(el => {
            const key = el.dataset.propKey;
            if (!key) return;
            const objVal = String(_currentObj[key] ?? '');
            if (el.value !== objVal) el.value = objVal;
        });
        // text / number alanları: odakta değilse güncelle
        panelEl.querySelectorAll('input[data-prop-key]').forEach(el => {
            if (document.activeElement === el) return;
            const key = el.dataset.propKey;
            if (!key) return;
            const objVal = String(_currentObj[key] ?? '');
            if (el.value !== objVal) el.value = objVal;
        });
        _rafId = requestAnimationFrame(tick);
    }
    _rafId = requestAnimationFrame(tick);
}

function _stopLiveRefresh() {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
    _liveProps = null;
}

// Seçim kaldırıldığında çağrılır: sabitlendiyse paneli kapatma
export function onDeselect() {
    if (_isPinned) return;
    closePropertiesPanel();
}

export function togglePropertiesPanel(obj, manager) {
    if (panelEl && panelEl.classList.contains('visible') && _currentObj === obj) {
        closePropertiesPanel();
    } else {
        openPropertiesPanel(obj, manager);
    }
}

export function isPanelOpen() {
    return panelEl && panelEl.classList.contains('visible');
}

export function isPinned() {
    return _isPinned;
}

function updatePropertiesBtn(active) {
    const btn = document.getElementById('btn-properties');
    if (!btn) return;
    btn.classList.toggle('active', active);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

function renderPanel(obj, manager) {
    const props = getPropertiesForObject(obj);
    const typeLabel = getObjectLabel(obj);
    // rAF döngüsü için dinamik prop'ları sakla (readonly + bar)
    _liveProps = props.filter(p =>
        (p.type === 'readonly' && p.readonlyFn) ||
        (p.type === 'bar'      && p.barFn)
    );

    panelEl.innerHTML = `
        <div class="props-header">
            <span class="props-title">${typeLabel} Özellikleri</span>
            <div class="props-header-actions">
                <button class="props-btn-pin ${_isPinned ? 'pinned' : ''}" id="props-pin-btn" title="${_isPinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}">
                    ${pinSvg(_isPinned)}
                </button>
                <button class="props-btn-close" title="Kapat (ESC)" id="props-close-btn">×</button>
            </div>
        </div>
        <div class="props-body">
            ${props.length === 0
                ? '<div class="props-empty">Bu nesne için tanımlı özellik yok.</div>'
                : props.map(prop => renderProperty(prop, obj, manager)).join('')
            }
        </div>
    `;

    panelEl.querySelector('#props-close-btn').addEventListener('click', closePropertiesPanel);
    panelEl.querySelector('#props-pin-btn').addEventListener('click', () => {
        _isPinned = !_isPinned;
        const btn = panelEl.querySelector('#props-pin-btn');
        btn.classList.toggle('pinned', _isPinned);
        btn.title = _isPinned ? 'Sabitlemeyi Kaldır' : 'Sabitle';
        btn.innerHTML = pinSvg(_isPinned);
    });
    bindInputEvents(panelEl, props, obj, manager);

    // İçerik 50vh'yi geçiyorsa paneli tam boy aç
    requestAnimationFrame(() => {
        const body = panelEl.querySelector('.props-body');
        if (!body) return;
        const halfVh = window.innerHeight * 0.5;
        const bodyH = body.scrollHeight;
        panelEl.classList.toggle('full-height', bodyH > halfVh);
    });
}

function renderProperty(prop, obj, manager) {
    // visibleFn false ise alan ve section header'ı gizle
    if (prop.visibleFn && !prop.visibleFn(obj, manager)) return '';

    if (prop.type === 'section') {
        return `<div class="props-section-header">${prop.label}</div>`;
    }

    if (prop.type === 'readonly') {
        const value = prop.readonlyFn ? prop.readonlyFn(obj, manager) : (obj[prop.key] ?? '—');
        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <span class="props-value-readonly" data-prop-id="${prop.id}">${value}</span>
            </div>`;
    }

    if (prop.type === 'select') {
        const rawOpts = typeof prop.options === 'function' ? prop.options(obj, manager) : prop.options;
        const current = String(obj[prop.key] ?? prop.default ?? '');
        const isDisabled = prop.disabled === true || (prop.disabledFn && prop.disabledFn(obj, manager));
        let optionsHtml = '';
        if (prop.placeholder) {
            optionsHtml += `<option value="" ${!current ? 'selected' : ''}>${prop.placeholder}</option>`;
        }
        if (prop.optionsAreObjects) {
            optionsHtml += rawOpts.map(o =>
                `<option value="${o.value}" ${current === String(o.value) ? 'selected' : ''}>${o.label}</option>`
            ).join('');
        } else {
            optionsHtml += rawOpts.map(o =>
                `<option value="${o}" ${current === String(o) ? 'selected' : ''}>${o}</option>`
            ).join('');
        }
        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <select class="props-select" data-prop-key="${prop.key}" data-prop-id="${prop.id}" ${isDisabled ? 'disabled' : ''}>
                    ${optionsHtml}
                </select>
            </div>`;
    }

    if (prop.type === 'text') {
        const current = obj[prop.key] ?? prop.default ?? '';
        const placeholder = prop.placeholder || '';
        const isDisabled = prop.disabled === true || (prop.disabledFn && prop.disabledFn(obj, manager));
        const itype = prop.inputType || 'text';
        const extraAttrs = [
            prop.step != null ? `step="${prop.step}"` : '',
            prop.min  != null ? `min="${prop.min}"`   : '',
            prop.max  != null ? `max="${prop.max}"`   : '',
        ].filter(Boolean).join(' ');
        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <input class="props-input" type="${itype}"
                    data-prop-key="${prop.key}"
                    value="${escHtml(String(current))}"
                    placeholder="${escHtml(placeholder)}"
                    ${extraAttrs}
                    ${isDisabled ? 'disabled' : ''}>
            </div>`;
    }

    if (prop.type === 'bar') {
        const html = prop.barFn ? prop.barFn(obj, manager) : '';
        return `<div class="props-bar-row" data-prop-id="${prop.id}">${html}</div>`;
    }

    if (prop.type === 'toggle') {
        const current = obj[prop.key] ?? prop.default ?? false;
        const uid = `tgl_${prop.key}`;
        const isDisabled = prop.disabled === true || (prop.disabledFn && prop.disabledFn(obj, manager));
        // Disabled iken her zaman kapalı görünsün
        const isChecked = current && !isDisabled;

        // İsteğe bağlı inline grup ikon butonu
        let groupBtnHtml = '';
        if (prop.groupBtn) {
            const gKey  = prop.groupBtn;
            const gVal  = obj[gKey] !== false; // default: true
            const vis   = isChecked ? '' : 'visibility:hidden';
            groupBtnHtml = `
                <button class="props-group-btn${gVal ? ' props-group-btn--active' : ''}"
                        data-group-key="${gKey}"
                        title="Grupla"
                        style="${vis}">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <!-- Dışarıdaki birleşik grup kutusu (kesikli) -->
                        <rect x="0.75" y="2.5" width="14.5" height="11" rx="1.5" stroke-width="1.1" stroke-dasharray="2 1.2"/>
                        <!-- İki iç nesne -->
                        <rect x="2.5" y="5" width="4" height="6" rx="0.8" stroke-width="1.3"/>
                        <rect x="9.5" y="5" width="4" height="6" rx="0.8" stroke-width="1.3"/>
                    </svg>
                </button>`;
        }

        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <div class="props-toggle-inline">
                    <label class="props-toggle${isDisabled ? ' props-toggle-disabled' : ''}">
                        <input type="checkbox" id="${uid}" data-prop-key="${prop.key}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                        <span class="props-toggle-track">
                            <span class="props-toggle-thumb"></span>
                        </span>
                    </label>
                    ${groupBtnHtml}
                </div>
            </div>`;
    }

    return '';
}

// ─── INPUT OLAYLARI ──────────────────────────────────────────────────────────

function bindInputEvents(panelEl, props, obj, manager) {
    // Text ve Number input'lar
    panelEl.querySelectorAll('input[type="text"][data-prop-key], input[type="number"][data-prop-key]').forEach(el => {
        // input event: anlık güncelleme (afterChange tetikler, kaydetmez)
        el.addEventListener('input', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.value;
            const prop = props.find(p => p.key === key);
            if (prop?.afterChange) prop.afterChange(obj, manager, panelEl);
        });
        // change event: kalıcı kayıt
        el.addEventListener('change', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.value;
            if (key === 'boruCap') syncVanaCapOnPipe(obj, manager, e.target.value);
            const prop = props.find(p => p.key === key);
            if (prop?.afterChange) prop.afterChange(obj, manager, panelEl);
            persist();
        });
    });

    // Select'ler
    panelEl.querySelectorAll('select[data-prop-key]').forEach(el => {
        el.addEventListener('change', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.value;
            if (key === 'birimBoruTipi') refreshEsnekMarkaDurum(panelEl, obj);
            // vanaTipi değişince visibleFn'ler yeniden değerlendirsin
            if (key === 'vanaTipi') { persist(); renderPanel(obj, manager); return; }
            // boruCap değişince üzerindeki vananın çapını güncelle
            if (key === 'boruCap') syncVanaCapOnPipe(obj, manager, e.target.value);
            const prop = props.find(p => p.key === key);
            if (prop?.afterChange) prop.afterChange(obj, manager, panelEl);
            persist();
        });
    });

    panelEl.querySelectorAll('input[type="checkbox"][data-prop-key]').forEach(el => {
        el.addEventListener('change', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.checked;
            // Toggle'ın groupBtn'ı varsa görünürlüğünü güncelle
            const groupBtn = e.target.closest('.props-toggle-inline')?.querySelector('.props-group-btn');
            if (groupBtn) groupBtn.style.visibility = e.target.checked ? '' : 'hidden';
            persist();
        });
    });

    // Grup ikon butonu — muhafazaGrupla state'ini toggle eder
    panelEl.querySelectorAll('.props-group-btn[data-group-key]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const key = btn.dataset.groupKey;
            if (!key) return;
            const current = obj[key] !== false; // default true
            obj[key] = !current;
            btn.classList.toggle('props-group-btn--active', obj[key]);
            persist();
        });
    });
}

/** Borunun çapı değişince üzerindeki vananın çapını da günceller */
function syncVanaCapOnPipe(pipe, manager, newCap) {
    if (!manager) return;
    manager.components.forEach(c => {
        if (c.type === 'vana' && c.bagliBoruId === pipe.id) {
            c.vanaCap = newCap;
        }
    });
}

function refreshEsnekMarkaDurum(panelEl, obj) {
    const select = panelEl.querySelector('select[data-prop-key="esnekMarka"]');
    if (!select) return;
    const isEsnek = obj.birimBoruTipi === 'ESNEK';
    select.disabled = !isEsnek;
    if (!isEsnek) {
        select.value = '';
        obj.esnekMarka = '';
    }
}

function persist() {
    if (window.plumbingManager?.saveToState) window.plumbingManager.saveToState();
    draw2D();
}

// ─── YARDIMCI ────────────────────────────────────────────────────────────────

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pinSvg() {
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="17" x2="12" y2="22"/>
        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
    </svg>`;
}

// ─── BUTON BAĞLAMA (uygulama başladığında çağrılır) ──────────────────────────

export function initPropertiesButton(manager) {
    const btn = document.getElementById('btn-properties');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (isPanelOpen()) {
            closePropertiesPanel();
        } else {
            const im = manager?.interactionManager;
            const sel = im?.selectedObject || im?.selectedValve?.vana;
            if (sel && ['boru', 'sayac', 'vana', 'servis_kutusu', 'cihaz'].includes(sel.type)) {
                openPropertiesPanel(sel, manager);
            }
        }
    });
}

// refreshPanelPosition artık gerekli değil (panel sabit), ama import edenler için boş bırak
export function refreshPanelPosition() {}
