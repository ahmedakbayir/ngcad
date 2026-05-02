/**
 * Özellikler Paneli
 * - Sağ üste sabit (viewing-mode-selector'ın hemen altında)
 * - SPACE tuşu veya "Özellikler" butonu ile aç/kapat
 * - ESC veya × ile kapat
 */

import { getPropertiesForObject, getObjectLabel, PROPERTY_DEFS } from './property-definitions.js';
import { draw2D } from '../../draw/draw2d.js';
import { state, setState } from '../../general-files/main.js';
import { syncBirimState } from '../../draw/draw-birim-labels.js';
import { processWalls } from '../../wall/wall-processor.js';
import { saveState } from '../../general-files/history.js';
import { update3DScene } from '../../scene3d/scene3d-update.js';
import { setLabelOffsetsJSON, relayoutAllLabels } from '../renderer/renderer-labels.js';


export const PANEL_MODES = {
    MANUAL: 0, // 👆 Sadece SPACE veya Özellikler butonu ile açılır
    AUTO: 1,   // 🎯 Nesne seçince açılır, seçimi bırakınca kapanır
    ALWAYS: 2  // 📌 Her zaman açık kalır, boşta "Nesne Seçilmedi" yazar
};
export let currentPanelMode = PANEL_MODES.ALWAYS; // Varsayılan mod Daima olsun

// ─── DURUM ───────────────────────────────────────────────────────────────────

let panelEl = null;
let _currentObj = null;
let _currentManager = null;
let _rafId = null;
let _liveProps = null; // readonly props with readonlyFn — rAF döngüsünde güncellenir

// --- MOD BUTONU İÇİN YARDIMCI FONKSİYON ---
function getModeBtnUI(mode) {
    if (mode === PANEL_MODES.MANUAL) return { icon: '🔘', title: 'Manuel (Sadece Buton/SPACE ile açılır)', color: '#888' };
    if (mode === PANEL_MODES.AUTO) return { icon: '⚡', title: 'Otomatik (Seçimde açılır, boşta kapanır)', color: '#fff' };
    return { icon: '📌', title: 'Sabit (Her zaman açık kalır)', color: '#00bffa' };
}

//Sahnede hiçbir şey seçili değilken "Her Zaman Açık" modunda çalışacak şık bir boş ekran fonksiyonu :
export function openEmptyPanel() {
    if (!panelEl) createPanel();

    panelEl.style.display = 'flex';
    panelEl.classList.add('visible', 'full-height');
    const modeUI = getModeBtnUI(currentPanelMode);

    panelEl.innerHTML = `
        <div class="props-header">
            <span class="props-title">Özellikler</span>
            <div class="props-header-actions">
                <button class="props-btn-pin" id="props-pin-btn" title="${modeUI.title}" style="color: ${modeUI.color}; opacity: 1;">
                    ${modeUI.icon}
                </button>
                <button class="props-btn-close" title="Kapat (ESC)" id="props-close-btn">×</button>
            </div>
        </div>
        <div class="props-body" style="display: flex; flex-direction: column; align-items: center; justify-content: center;
                height: calc(100vh - 48px); color: #888; text-align: center; padding: 20px;">
            <div style="font-size: 32px; margin-bottom: 10px; opacity: 0.5;">🖱️</div>
            <div style="font-size: 14px; font-weight: bold; color: #aaa;">Nesne Seçilmedi</div>
            <div style="font-size: 12px; margin-top: 5px; opacity: 0.7;">Özelliklerini görmek için sahnede bir nesneye tıklayın.</div>
            <button id="props-relabel-all-btn"
                style="margin-top:24px;padding:8px 14px;background:rgba(0,191,250,0.12);border:1px solid rgba(0,191,250,0.5);color:#7fd9ff;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;letter-spacing:0.3px">
                🏷 Etiketleri yeniden yerleştir
            </button>
        </div>
    `;

    // Boş ekrandaki butonları bağla
    panelEl.querySelector('#props-close-btn').addEventListener('click', () => closePropertiesPanel(true));
    panelEl.querySelector('#props-pin-btn').addEventListener('click', () => {
        togglePanelMode();
        const btn = panelEl.querySelector('#props-pin-btn');
        const newUI = getModeBtnUI(currentPanelMode);
        btn.innerHTML = newUI.icon;
        btn.title = newUI.title;
        btn.style.color = newUI.color;
    });
    panelEl.querySelector('#props-relabel-all-btn')?.addEventListener('click', _resetAllLabelOffsets);
}

/** Tüm etiketleri otomatik yerleşim algoritmasıyla yeniden yerleştirir */
async function _resetAllLabelOffsets() {
    const manager = window.plumbingManager;
    const toast = document.getElementById('label-relayout-toast');
    const toastText = document.getElementById('label-relayout-toast-text');
    const showToast = (msg) => { if (toast && toastText) { toastText.textContent = msg; toast.style.display = 'block'; } };
    const hideToast = () => { if (toast) toast.style.display = 'none'; };

    try {
        try { saveState(); } catch (e) { console.error(e); }
        // Mevcut manuel offsetleri temizle ki algoritma sıfırdan yerleştirsin
        setLabelOffsetsJSON({});
        if (!manager) {
            draw2D();
            return;
        }
        showToast('Etiketler yerleştiriliyor…');
        await new Promise(res => requestAnimationFrame(() => res()));
        draw2D();
        await relayoutAllLabels(manager, 'pipes-last');
        manager.saveToState?.();
        draw2D();
        showToast('Etiketler yerleştirildi');
        setTimeout(hideToast, 800);
    } catch (e) {
        console.error('Etiket yerleşimi hatası:', e);
        hideToast();
    }
}

// ─── PANEL YARAT ─────────────────────────────────────────────────────────────

function createPanel() {
    if (panelEl) return;

    panelEl = document.createElement('div');
    panelEl.id = 'properties-panel';
    panelEl.className = 'props-panel';
    document.body.appendChild(panelEl);

    panelEl.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePropertiesPanel();
            e.stopPropagation();
        }
        if (e.key === ' ') {
            // Eğer kullanıcı bir input'a yazı yazmıyorsa paneli kapat
            if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                closePropertiesPanel();
                e.stopPropagation();
            }
        }
    });
}

// ─── AÇMA / KAPAMA ───────────────────────────────────────────────────────────
export function openPropertiesPanel(obj, manager) {
    if (!panelEl) createPanel();
    // Panel açılmadan önce sayaç↔mahal birim no senkronizasyonu garantiye alınmalı
    syncBirimState();
    _currentObj = obj;
    _currentManager = manager;
    _initDefaults(obj, manager);
    renderPanel(obj, manager);

    // BURASI ÖNEMLİ: Panel açılırken visible ile birlikte full-height da eklenir
    panelEl.classList.add('visible', 'full-height');
    panelEl.style.display = 'flex';

    updatePropertiesBtn(true);
    _startLiveRefresh();
}

export function closePropertiesPanel(forceClose = false) {
    // Sabit moddaysak ve "Özellikler" butonuna/ESC'ye ZORLA basılmadıysa paneli kapatma, sadece boşalt
    if (currentPanelMode === PANEL_MODES.ALWAYS && !forceClose) {
        openEmptyPanel();
        return;
    }

    if (panelEl) {
        panelEl.classList.remove('visible');
        panelEl.style.display = 'none';
    }
    updatePropertiesBtn(false);
}

/** Nesnede tanımlı default değerler yoksa atar — nesne oluşturulurken de çağrılabilir */
export function initObjectDefaults(obj, manager) {
    _initDefaults(obj, manager);
}

function _initDefaults(obj, manager) {
    const props = getPropertiesForObject(obj);

    // İlk geçiş: normal defaults + dual fields + relatedFields
    props.forEach(p => {
        if (p.type === 'dual' && p.fields) {
            p.fields.forEach(f => {
                if (f.key && f.default !== undefined && obj[f.key] === undefined) {
                    obj[f.key] = f.default;
                }
            });
            return;
        }
        if (p.relatedFields) {
            p.relatedFields.forEach(rf => {
                if (rf.key && rf.default !== undefined && obj[rf.key] === undefined) {
                    obj[rf.key] = rf.default;
                }
            });
        }
        if (p.key && p.default !== undefined && obj[p.key] === undefined) {
            obj[p.key] = p.default;
        }
    });

    // İkinci geçiş: valueFn ile hesaplanan sanal anahtarlar (gerçek alanlar hazır olmalı)
    props.forEach(p => {
        if (p.valueFn && p.key) obj[p.key] = p.valueFn(obj);
    });

    // Yeni nesne (description hiç set edilmemiş) → alwaysAdd şablonlarını uygula
    if (obj.description === undefined) {
        const tplObj = _tplsForType(obj.type || '');
        const alwaysTexts = Object.values(tplObj)
            .filter(v => v.alwaysAdd).map(v => v.text).filter(Boolean);
        obj.description = alwaysTexts.join('\n');
    }
    void manager;
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
                } else if (prop.type === 'table') {
                    const data = prop.tableFn(_currentObj, _currentManager);
                    const val = _renderTableBody(data);
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
            const raw = _currentObj[key] ?? '';
            const prec = el.dataset.precision != null ? parseInt(el.dataset.precision) : null;
            const objVal = _formatNumeric(raw, prec);
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

// Seçim kaldırıldığında çağrılır: nesne seçiminden çıkılınca panel her zaman kapanır
export function onDeselect() {
    if (currentPanelMode === PANEL_MODES.ALWAYS) {
        openEmptyPanel(); // Sabitse boş ekran göster
    } else if (currentPanelMode === PANEL_MODES.AUTO) {
        closePropertiesPanel(); // Otomatikse kapat
    }
    // Manuel moddaysa zaten kendimiz kapatana kadar durur
}


export function togglePropertiesPanel(obj, manager) {
    if (panelEl && panelEl.classList.contains('visible') && _currentObj === obj && panelEl.querySelector('.props-empty') === null) {
        // Eğer aynı nesneye tıklandıysa ve panel ZATEN boş ekran değilse kapat
        closePropertiesPanel();
    } else {
        openPropertiesPanel(obj, manager);
    }
}

export function isPanelOpen() {
    return panelEl && panelEl.classList.contains('visible');
}

export function isPinned() {
    // Manuel (0) modunda false döner -> Sistem otomatik panel açmaz
    // Auto (1) ve Sabit (2) modunda true döner -> Sistem nesne seçilince paneli günceller
    return currentPanelMode === PANEL_MODES.AUTO || currentPanelMode === PANEL_MODES.ALWAYS;
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
        (p.type === 'bar' && p.barFn) ||
        (p.type === 'table' && p.tableFn)
    );

    const hasDesc = true; // tüm nesnelerde açıklama alanı göster
    const modeUI = getModeBtnUI(currentPanelMode);

    panelEl.innerHTML = `
        <div class="props-header">
            <span class="props-title">${typeLabel} Özellikleri</span>
            <div class="props-header-actions">
                <button class="props-btn-pin" id="props-pin-btn" title="${modeUI.title}" style="color: ${modeUI.color}; opacity: 1;">
                    ${modeUI.icon}
                </button>
                <button class="props-btn-close" title="Kapat (ESC)" id="props-close-btn">×</button>
            </div>
        </div>
        <div class="props-body" style="min-height: calc(100vh - 48px);">
            ${props.length === 0
            ? '<div class="props-empty">Bu nesne için tanımlı özellik yok.</div>'
            : props.map(prop => renderProperty(prop, obj, manager)).join('')
        }
            ${renderConnectedObjectsSection(obj, manager)}
            ${hasDesc ? renderDescriptionsSection(obj) : ''}
            <div class="props-delete-row" style="padding:12px 8px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
                <button id="props-delete-current-btn" class="props-delete-current-btn"
                    style="width:100%;padding:8px 12px;background:rgba(220,50,50,0.15);border:1px solid rgba(220,50,50,0.5);color:#ff7070;border-radius:4px;cursor:pointer;font-weight:600;font-size:12px;letter-spacing:0.5px">
                    🗑 SİL
                </button>
            </div>
        </div>
    `;

    // afterChange callback'lerinin paneli yeniden render edebilmesi için
    panelEl._refresh = () => { renderPanel(obj, manager); };

    panelEl.querySelector('#props-close-btn').addEventListener('click', () => closePropertiesPanel(true)); // X basınca ZORLA kapat
    panelEl.querySelector('#props-pin-btn').addEventListener('click', () => {
        togglePanelMode();
        const btn = panelEl.querySelector('#props-pin-btn');
        const newUI = getModeBtnUI(currentPanelMode);
        btn.innerHTML = newUI.icon;
        btn.title = newUI.title;
        btn.style.color = newUI.color;
    });

    bindInputEvents(panelEl, props, obj, manager);
    bindConnectedObjectsEvents(panelEl, obj, manager);
    if (hasDesc) bindDescriptionEvents(panelEl, obj);
    _initCollapsibleSections(panelEl);

    panelEl.querySelector('#props-delete-current-btn')?.addEventListener('click', () => {
        _deleteCurrentPanelObject();
    });



}

function renderDualField(field, obj, manager) {
    if (field.type === 'select') {
        const rawOpts = typeof field.options === 'function' ? field.options(obj, manager) : (field.options || []);
        const current = field.valueFn ? String(field.valueFn(obj)) : String(obj[field.key] ?? field.default ?? '');
        const isDisabled = field.disabled === true || (field.disabledFn && field.disabledFn(obj, manager));
        let optHtml = '';
        if (field.placeholder) {
            optHtml += `<option value="" ${!current ? 'selected' : ''}>${field.placeholder}</option>`;
        }
        if (field.optionsAreObjects) {
            optHtml += rawOpts.map(o =>
                `<option value="${o.value}" ${current === String(o.value) ? 'selected' : ''}>${o.label}</option>`
            ).join('');
        } else {
            optHtml += rawOpts.map(o =>
                `<option value="${o}" ${current === String(o) ? 'selected' : ''}>${o}</option>`
            ).join('');
        }
        const flexStyle = field.flex ? ` style="flex:${field.flex}"` : '';
        return `<select class="props-select props-dual-field" data-prop-key="${field.key}"${flexStyle} ${isDisabled ? 'disabled' : ''}>${optHtml}</select>`;
    }
    if (field.type === 'text') {
        const raw = obj[field.key] ?? field.default ?? '';
        const current = _formatNumeric(raw, field.precision);
        const placeholder = field.placeholder || '';
        const isDisabled = field.disabled === true || (field.disabledFn && field.disabledFn(obj, manager));
        const flexStyle = field.flex ? ` style="flex:${field.flex}"` : '';
        const precAttr = field.precision != null ? ` data-precision="${field.precision}"` : '';
        return `<input class="props-input props-dual-field" type="text"
            data-prop-key="${field.key}"${precAttr}
            value="${escHtml(String(current))}"
            placeholder="${escHtml(placeholder)}"${flexStyle}
            ${isDisabled ? 'disabled' : ''}>`;
    }
    return '';
}

function _renderTableBody(data) {
    const { showUnit, rows } = data || { showUnit: false, rows: [] };
    const head = showUnit
        ? `<thead><tr><th></th><th>Mahal</th><th>Birim</th></tr></thead>`
        : `<thead><tr><th></th><th>Mahal</th></tr></thead>`;
    const body = rows.map(([label, roomVal, unitVal]) => showUnit
        ? `<tr><td class="props-table-label">${label}</td><td>${roomVal}</td><td>${unitVal ?? roomVal}</td></tr>`
        : `<tr><td class="props-table-label">${label}</td><td>${roomVal}</td></tr>`
    ).join('');
    return `<table class="props-table">${head}<tbody>${body}</tbody></table>`;
}

function renderProperty(prop, obj, manager) {
    // visibleFn false ise alan ve section header'ı gizle
    if (prop.visibleFn && !prop.visibleFn(obj, manager)) return '';

    if (prop.type === 'section') {
        return `<div class="props-section-header">${prop.label}</div>`;
    }

    if (prop.type === 'dual') {
        const fieldsHtml = (prop.fields || []).map(f => renderDualField(f, obj, manager)).join('');
        if (prop.noLabel) {
            return `
                <div class="props-row props-dual-row props-dual-row--nolabel">
                    <div class="props-dual-controls">${fieldsHtml}</div>
                </div>`;
        }
        return `
            <div class="props-row props-dual-row">
                <label class="props-label">${prop.label || ''}</label>
                <div class="props-dual-controls">${fieldsHtml}</div>
            </div>`;
    }

    if (prop.type === 'readonly') {
        const value = prop.readonlyFn ? prop.readonlyFn(obj, manager) : (obj[prop.key] ?? '—');
        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <span class="props-value-readonly" data-prop-id="${prop.id}">${value}</span>
            </div>`;
    }

    if (prop.type === 'table') {
        const data = prop.tableFn ? prop.tableFn(obj, manager) : { showUnit: false, rows: [] };
        return `
            <div class="props-row props-table-row">
                <div class="props-table-wrap" data-prop-id="${prop.id}">${_renderTableBody(data)}</div>
            </div>`;
    }

    if (prop.type === 'select') {
        const rawOpts = typeof prop.options === 'function' ? prop.options(obj, manager) : prop.options;
        const current = prop.valueFn ? String(prop.valueFn(obj)) : String(obj[prop.key] ?? prop.default ?? '');
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
        const raw = obj[prop.key] ?? prop.default ?? '';
        const current = _formatNumeric(raw, prop.precision);
        const placeholder = prop.placeholder || '';
        const isDisabled = prop.disabled === true || (prop.disabledFn && prop.disabledFn(obj, manager));
        const itype = prop.inputType || 'text';
        const extraAttrs = [
            prop.step != null ? `step="${prop.step}"` : '',
            prop.min != null ? `min="${prop.min}"` : '',
            prop.max != null ? `max="${prop.max}"` : '',
        ].filter(Boolean).join(' ');
        const precAttr = prop.precision != null ? ` data-precision="${prop.precision}"` : '';
        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <input class="props-input" type="${itype}"
                    data-prop-key="${prop.key}"${precAttr}
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

    if (prop.type === 'actions') {
        const btns = (prop.buttons || []).map((b, i) => {
            const disabled = (b.disabledFn && b.disabledFn(obj, manager)) || b.disabled === true;
            return `<button class="props-action-btn" data-action-idx="${i}" ${disabled ? 'disabled' : ''}>${escHtml(b.label)}</button>`;
        }).join('');
        if (prop.noLabel) {
            return `<div class="props-row props-actions-row props-actions-row--nolabel" data-prop-id="${prop.id}"><div class="props-actions-list">${btns}</div></div>`;
        }
        return `<div class="props-row props-actions-row" data-prop-id="${prop.id}"><label class="props-label">${prop.label || ''}</label><div class="props-actions-list">${btns}</div></div>`;
    }

    if (prop.type === 'toggle') {
        const current = obj[prop.key] ?? prop.default ?? false;
        const uid = `tgl_${prop.key}`;
        const isDisabled = prop.disabled === true || (prop.disabledFn && prop.disabledFn(obj, manager));
        // Disabled iken her zaman kapalı görünsün
        const isChecked = current && !isDisabled;

        // İsteğe bağlı inline action butonu (örn. yay ters çevir)
        let inlineActionHtml = '';
        if (prop.inlineAction) {
            const ia = prop.inlineAction;
            const vis = (!ia.visibleFn || ia.visibleFn(obj, manager)) ? '' : 'display:none';
            inlineActionHtml = `<button class="props-inline-action-btn" data-inline-action="1" title="${escHtml(ia.title || '')}" style="${vis}">${escHtml(ia.label || '↻')}</button>`;
        }

        // İsteğe bağlı inline grup ikon butonu
        let groupBtnHtml = '';
        if (prop.groupBtn) {
            const gKey = prop.groupBtn;
            const gVal = obj[gKey] !== false; // default: true
            const vis = isChecked ? '' : 'visibility:hidden';
            groupBtnHtml = `
                <button class="props-group-btn${gVal ? ' props-group-btn--active' : ''}"
                        data-group-key="${gKey}"
                        title="Grupla"
                        style="${vis}">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <rect x="0.75" y="2.5" width="14.5" height="11" rx="1.5" stroke-width="1.1" stroke-dasharray="2 1.2"/>
                        <rect x="2.5" y="5" width="4" height="6" rx="0.8" stroke-width="1.3"/>
                        <rect x="9.5" y="5" width="4" height="6" rx="0.8" stroke-width="1.3"/>
                    </svg>
                </button>`;
        }

        return `
            <div class="props-row">
                <label class="props-label">${prop.label}</label>
                <div class="props-toggle-inline" data-prop-id="${prop.id}">
                    <label class="props-toggle${isDisabled ? ' props-toggle-disabled' : ''}">
                        <input type="checkbox" id="${uid}" data-prop-key="${prop.key}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''}>
                        <span class="props-toggle-track">
                            <span class="props-toggle-thumb"></span>
                        </span>
                    </label>
                    ${inlineActionHtml}
                    ${groupBtnHtml}
                </div>
            </div>`;
    }

    return '';
}

// ─── BAĞLI NESNELER ──────────────────────────────────────────────────────────

const CONNECTED_SECTION_LABEL = 'Bağlı Nesneler';

// Bağlı nesneleri hiyerarşik (flat + depth) olarak döndürür.
// Oda → Duvar (depth 0) → Kapı/Pencere/Menfez (depth 1)
// Duvar → Kapı/Pencere/Menfez (depth 0)
// Boru  → Vana (depth 0)
function _getConnectedObjects(obj, manager) {
    if (!obj) return [];
    if (obj.type === 'boru' && manager) {
        return manager.components
            .filter(c => c.type === 'vana' && c.bagliBoruId === obj.id)
            .map(item => ({ item, depth: 0 }));
    }
    if (obj.type === 'wall') {
        const doors = (state.doors || []).filter(d => d.wall === obj);
        const windows = obj.windows || [];
        const vents = obj.vents || [];
        return [...doors, ...windows, ...vents].map(item => ({ item, depth: 0 }));
    }
    if (obj.type === 'room') {
        const coords = obj?.polygon?.geometry?.coordinates?.[0];
        if (!Array.isArray(coords) || coords.length < 2) return [];
        const TOL = 2;
        const walls = [];
        const allWalls = (state.walls || []).filter(w => !obj.floorId || !w.floorId || w.floorId === obj.floorId);
        for (let i = 0; i < coords.length - 1; i++) {
            const [ax, ay] = coords[i];
            const [bx, by] = coords[i + 1];
            for (const w of allWalls) {
                if (!w.p1 || !w.p2 || walls.includes(w)) continue;
                const d1 = Math.hypot(w.p1.x - ax, w.p1.y - ay) + Math.hypot(w.p2.x - bx, w.p2.y - by);
                const d2 = Math.hypot(w.p1.x - bx, w.p1.y - by) + Math.hypot(w.p2.x - ax, w.p2.y - ay);
                if (Math.min(d1, d2) < TOL) { walls.push(w); break; }
            }
        }
        const result = [];
        for (const w of walls) {
            result.push({ item: w, depth: 0 });
            const wDoors = (state.doors || []).filter(d => d.wall === w);
            const wWindows = w.windows || [];
            const wVents = w.vents || [];
            for (const child of [...wDoors, ...wWindows, ...wVents]) {
                result.push({ item: child, depth: 1 });
            }
        }
        return result;
    }
    return [];
}

function _connectedItemLabel(item) {
    if (item.type === 'vana') {
        const tip = item.vanaTipi || '—';
        const cap = item.vanaCap || '';
        return `Vana · ${tip}${cap ? ' · ' + cap : ''}`;
    }
    if (item.type === 'door') {
        const w = item.width != null ? `${Math.round(item.width)}×${Math.round(item.height || 0)} cm` : '';
        return `Kapı${w ? ' · ' + w : ''}`;
    }
    if (item.type === 'window') {
        const w = item.width != null ? `${Math.round(item.width)}×${Math.round(item.height || 0)} cm` : '';
        return `Pencere${w ? ' · ' + w : ''}`;
    }
    if (item.type === 'vent') {
        const d = item.width != null ? `Ø${Math.round(item.width)} cm` : '';
        return `Menfez${d ? ' · ' + d : ''}`;
    }
    if (item.type === 'wall') {
        const len = (item.p1 && item.p2) ? Math.round(Math.hypot(item.p2.x - item.p1.x, item.p2.y - item.p1.y)) : 0;
        const thk = item.thickness != null ? Math.round(item.thickness) : null;
        return `Duvar${len ? ' · ' + len + ' cm' : ''}${thk != null ? ' · ' + thk + ' cm kal.' : ''}`;
    }
    return item.type || '—';
}

function renderConnectedObjectsSection(obj, manager) {
    const list = _getConnectedObjects(obj, manager);
    if (!list.length) return '';
    if (!_sectionCollapsed.has(CONNECTED_SECTION_LABEL)) {
        _sectionCollapsed.set(CONNECTED_SECTION_LABEL, true); // default closed
    }
    const itemsHtml = list.map((entry, i) => {
        const lbl = escHtml(_connectedItemLabel(entry.item));
        const pad = 8 + (entry.depth || 0) * 16;
        return `<div class="props-connected-item" data-conn-idx="${i}" style="padding-left:${pad}px;display:flex;align-items:center;justify-content:space-between;gap:6px">
            <span class="props-conn-label" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${lbl}</span>
            <button class="props-conn-delete-btn" data-conn-del-idx="${i}" title="Bağlı nesneyi sil"
                style="flex-shrink:0;background:transparent;border:1px solid rgba(255,80,80,0.35);color:#ff7070;border-radius:3px;padding:0 6px;cursor:pointer;font-size:12px;line-height:18px">×</button>
        </div>`;
    }).join('');
    return `<div class="props-section-header" data-section-key="${CONNECTED_SECTION_LABEL}">${CONNECTED_SECTION_LABEL} (${list.length})</div>${itemsHtml}`;
}

// ─── SİLME YARDIMCILARI ───────────────────────────────────────────────────────
function _deleteArbitraryObject(obj) {
    if (!obj || !obj.type) return { deleted: false, skipSave: false };
    const t = obj.type;

    // Plumbing v2: interactionManager.deleteSelectedObject bağlantı iyileştirmelerini
    // (heal, bağlı cihaz/baca/vana temizliği, servis kutusu BFS vs.) yönetir.
    if (['pipe', 'boru', 'servis_kutusu', 'sayac', 'vana', 'cihaz', 'baca'].includes(t)) {
        const im = window.plumbingManager?.interactionManager;
        if (!im) return { deleted: false, skipSave: false };
        const prevSel = im.selectedObject;
        const prevValve = im.selectedValve;
        im.selectedValve = null;
        // deleteSelectedObject düz nesne bekliyor (wrapper değil)
        im.selectedObject = obj;
        try { im.deleteSelectedObject(); } catch (e) { console.error(e); }
        // deleteSelectedObject parent boru seçmiş olabilir; biz silme çağrısıydık, eski seçimi geri yüklemeyelim
        if (im.selectedObject === obj) im.selectedObject = null;
        // state.selectedObject'i de temizle (referans kalmasın)
        if (state.selectedObject && state.selectedObject.object === obj) {
            setState({ selectedObject: null, selectedGroup: [] });
        }
        void prevSel; void prevValve;
        return { deleted: true, skipSave: true }; // v2 zaten saveToState / saveState çağırıyor
    }

    let deleted = false;
    if (t === 'column') { state.columns = state.columns.filter(x => x !== obj); deleted = true; }
    else if (t === 'beam') { state.beams = state.beams.filter(x => x !== obj); deleted = true; }
    else if (t === 'stairs') { state.stairs = state.stairs.filter(x => x !== obj); deleted = true; }
    else if (t === 'door') { state.doors = state.doors.filter(x => x !== obj); deleted = true; }
    else if (t === 'guide') { state.guides = (state.guides || []).filter(x => x !== obj); deleted = true; }
    else if (t === 'room') { state.rooms = state.rooms.filter(x => x !== obj); deleted = true; }
    else if (t === 'wall') {
        state.walls = state.walls.filter(x => x !== obj);
        state.doors = state.doors.filter(d => d.wall !== obj);
        deleted = true;
    }
    else if (t === 'window' || t === 'vent') {
        const listKey = t === 'window' ? 'windows' : 'vents';
        for (const w of (state.walls || [])) {
            if (Array.isArray(w[listKey]) && w[listKey].includes(obj)) {
                w[listKey] = w[listKey].filter(x => x !== obj);
                deleted = true;
                break;
            }
        }
    }
    else if (t === 'valve') {
        const pipes = (window.plumbingManager?.pipes) || state.plumbingPipes || [];
        for (const p of pipes) {
            if (Array.isArray(p.valves) && p.valves.includes(obj)) {
                p.valves = p.valves.filter(x => x !== obj);
                deleted = true;
                break;
            }
        }
    }
    else if (t === 'plumbingBlock') { state.plumbingBlocks = (state.plumbingBlocks || []).filter(x => x !== obj); deleted = true; }
    else if (t === 'plumbingPipe') { state.plumbingPipes = (state.plumbingPipes || []).filter(x => x !== obj); deleted = true; }

    return { deleted, skipSave: false };
}

function _postDeleteRefresh(skipSave) {
    try { processWalls(); } catch (e) { console.error(e); }
    if (!skipSave) { try { saveState(); } catch (e) { console.error(e); } }
    try { update3DScene(); } catch (e) { console.error(e); }
    draw2D();
}

function _deleteCurrentPanelObject() {
    const obj = _currentObj;
    if (!obj) return;
    const label = getObjectLabel(obj) || 'nesne';
    if (!confirm(`Bu ${label.toLowerCase()} silinecek. Emin misiniz?`)) return;
    const res = _deleteArbitraryObject(obj);
    if (!res.deleted) return;
    _postDeleteRefresh(res.skipSave);
    // Seçimleri temizle
    if (state.selectedObject && (state.selectedObject.object === obj || state.selectedObject === obj)) {
        setState({ selectedObject: null, selectedGroup: [] });
    }
    if (state.selectedRoom === obj) setState({ selectedRoom: null });
    closePropertiesPanel(true);
}

function _selectConnectedTarget(target) {
    if (!target) return;
    const ARCH_WRAPPED = ['wall', 'door', 'window', 'vent', 'column', 'beam', 'stairs'];
    if (target.type === 'room') {
        setState({ selectedRoom: target, selectedObject: null, selectedGroup: [] });
    } else if (ARCH_WRAPPED.includes(target.type)) {
        setState({ selectedObject: { type: target.type, object: target }, selectedRoom: null, selectedGroup: [] });
    } else {
        // Plumbing veya bilinmeyen tipler — clickedObject benzeri wrapper
        setState({ selectedObject: { type: target.type, object: target }, selectedRoom: null, selectedGroup: [] });
    }
    draw2D();
}

function bindConnectedObjectsEvents(panelEl, obj, manager) {
    const list = _getConnectedObjects(obj, manager);
    if (!list.length) return;
    panelEl.querySelectorAll('.props-connected-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.detail > 1) return;
            // Sil butonuna tıklama satır seçimine dönüşmesin
            if (e.target && e.target.closest('.props-conn-delete-btn')) return;
            const idx = parseInt(el.dataset.connIdx);
            _selectConnectedTarget(list[idx]?.item);
        });
        el.addEventListener('dblclick', (e) => {
            if (e.target && e.target.closest('.props-conn-delete-btn')) return;
            const idx = parseInt(el.dataset.connIdx);
            const target = list[idx]?.item;
            if (!target) return;
            _selectConnectedTarget(target);
            openPropertiesPanel(target, manager);
        });
    });
    panelEl.querySelectorAll('.props-conn-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.connDelIdx);
            const target = list[idx]?.item;
            if (!target) return;
            const lbl = _connectedItemLabel(target);
            if (!confirm(`"${lbl}" silinecek. Emin misiniz?`)) return;
            const res = _deleteArbitraryObject(target);
            if (!res.deleted) return;
            _postDeleteRefresh(res.skipSave);
            if (panelEl._refresh) panelEl._refresh();
        });
    });
}

// ─── COLLAPSIBLE SECTIONS ────────────────────────────────────────────────────

const _sectionCollapsed = new Map(); // section label → bool (persistent across renders)

// ─── AÇIKLAMA ŞABLONLARI — nesne tipine göre ayrı key-value store ────────────
// Yapı: { [objType]: { [key]: {text, alwaysAdd} } }
const TPLS_KEY = 'aangcad_desc_tpls_v2';
function _loadTplStore() {
    try { const raw = localStorage.getItem(TPLS_KEY); return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
}
function _saveTplStore() {
    try { localStorage.setItem(TPLS_KEY, JSON.stringify(_tplStore)); } catch { }
}
const _tplStore = _loadTplStore();
/** Belirli nesne tipi için şablon nesnesini döndür (yoksa oluştur) */
function _tplsForType(objType) {
    if (!_tplStore[objType]) _tplStore[objType] = {};
    return _tplStore[objType]; // { [key]: {text, alwaysAdd} }
}

function _initCollapsibleSections(panelEl) {
    const body = panelEl.querySelector('.props-body');
    if (!body) return;

    // Sadece .props-body'nin doğrudan çocuk section başlıklarını işle.
    // :scope > selector ile iç içe geçmiş başlıklar (örn. .desc-section içindeki) atlanır.
    const directHeaders = [...body.querySelectorAll(':scope > .props-section-header')];
    _applyCollapsible(directHeaders);

    // .desc-section kendi içindeki başlığı ayrıca işle
    const descSection = body.querySelector('.desc-section');
    if (descSection) {
        const descHeaders = [...descSection.querySelectorAll(':scope > .props-section-header')];
        _applyCollapsible(descHeaders);
    }
}

function _applyCollapsible(headers) {
    headers.forEach((header, hIdx) => {
        const nextHeader = headers[hIdx + 1];
        const siblings = [];
        let el = header.nextElementSibling;
        // desc-section'da dur — o kendi başına işlenir
        while (el && el !== nextHeader && !el.classList.contains('desc-section')) {
            siblings.push(el);
            el = el.nextElementSibling;
        }
        if (!siblings.length) return;

        const key = header.dataset.sectionKey || header.textContent.trim();
        const wrapper = document.createElement('div');
        wrapper.className = 'section-content';
        const collapsed = _sectionCollapsed.get(key) || false;
        if (collapsed) wrapper.classList.add('sec-collapsed');

        header.insertAdjacentElement('afterend', wrapper);
        siblings.forEach(s => wrapper.appendChild(s));

        const arrow = document.createElement('span');
        arrow.className = 'section-arrow';
        arrow.textContent = collapsed ? '›' : '▾';
        header.appendChild(arrow);
        header.classList.add('collapsible');

        header.addEventListener('click', () => {
            const nowCollapsed = !wrapper.classList.contains('sec-collapsed');
            wrapper.classList.toggle('sec-collapsed', nowCollapsed);
            arrow.textContent = nowCollapsed ? '›' : '▾';
            _sectionCollapsed.set(key, nowCollapsed);
        });
    });
}

// ─── AÇIKLAMALAR ─────────────────────────────────────────────────────────────

function renderDescriptionsSection(obj) {
    const safeDesc = escHtml(obj.description || '');
    const objType = obj.type || '';
    const tplObj = _tplsForType(objType);
    const tplEntries = Object.entries(tplObj);

    const tplItemsHtml = tplEntries.map(([key, val]) => {
        const sk = escHtml(key);
        const sv = escHtml(val.text);
        const chk = val.alwaysAdd ? 'checked' : '';
        const starCls = val.alwaysAdd ? 'desc-tpl-star desc-tpl-star--on' : 'desc-tpl-star';
        const starChar = val.alwaysAdd ? '★' : '☆';
        return `
        <div class="desc-tpl-item" data-key="${sk}">
            <div class="desc-tpl-row">
                <button class="desc-tpl-apply-btn" title="${sv}">${sk}</button>
                <span class="${starCls}" title="Her zaman ekle">${starChar}</span>
                <button class="desc-tpl-edit-btn">···</button>
            </div>
            <div class="desc-tpl-edit-panel" style="display:none">
                <label class="desc-opt-lbl">
                    <input type="checkbox" class="desc-tpl-always-chk" ${chk}>
                    <span>Her zaman ekle</span>
                </label>
                <textarea class="desc-tpl-edit-ta" rows="3">${sv}</textarea>
                <div class="desc-tpl-edit-btns">
                    <button class="desc-tpl-edit-ok">✓ Kaydet</button>
                    <button class="desc-tpl-edit-cancel">✕</button>
                    <button class="desc-tpl-delete-btn">Sil</button>
                </div>
            </div>
        </div>`;
    }).join('');

    return `
    <div class="desc-section">
        <div class="props-section-header">Açıklama</div>
        <div class="desc-body">
            <textarea class="desc-main-ta" rows="4" placeholder="Nesne açıklaması — etikete aynen yansır">${safeDesc}</textarea>
            <div class="desc-actions">
                <button class="desc-save-tpl-btn">Sakla…</button>
            </div>
            <div class="desc-save-key-row" style="display:none">
                <input class="desc-key-input" type="text" placeholder="Şablon adı">
                <button class="desc-key-ok">✓</button>
                <button class="desc-key-cancel">✕</button>
            </div>
            ${tplEntries.length > 0 ? `
            <div class="desc-tpl-header">Kaydedilmiş Şablonlar</div>
            <div class="desc-tpl-list">${tplItemsHtml}</div>` : ''}
        </div>
    </div>`;
}

function bindDescriptionEvents(panelEl, obj) {
    const section = panelEl.querySelector('.desc-section');
    if (!section) return;
    const objType = obj.type || '';

    function refresh() {
        const old = panelEl.querySelector('.desc-section');
        if (!old) return;
        const tmp = document.createElement('div');
        tmp.innerHTML = renderDescriptionsSection(obj);
        old.replaceWith(tmp.firstElementChild);
        draw2D();
        bindDescriptionEvents(panelEl, obj);
        _initCollapsibleSections(panelEl);
    }

    // Ana açıklama textarea — değişiklik anlık etikete yansır
    const mainTa = section.querySelector('.desc-main-ta');
    if (mainTa) {
        mainTa.addEventListener('input', () => { obj.description = mainTa.value; draw2D(); });
        mainTa.addEventListener('keydown', e => e.stopPropagation());
    }

    // Sakla… butonu
    const saveTplBtn = section.querySelector('.desc-save-tpl-btn');
    const saveKeyRow = section.querySelector('.desc-save-key-row');
    const keyInput = section.querySelector('.desc-key-input');
    const keyOk = section.querySelector('.desc-key-ok');
    const keyCancel = section.querySelector('.desc-key-cancel');

    function confirmSave() {
        const key = (keyInput?.value || '').trim();
        if (key) {
            const tplObj = _tplsForType(objType);
            tplObj[key] = { text: mainTa ? mainTa.value : '', alwaysAdd: tplObj[key]?.alwaysAdd || false };
            _saveTplStore();
            refresh();
            return;
        }
        if (saveKeyRow) saveKeyRow.style.display = 'none';
    }

    saveTplBtn?.addEventListener('click', () => {
        if (!saveKeyRow) return;
        saveKeyRow.style.display = '';
        if (keyInput) { keyInput.value = ''; keyInput.focus(); }
    });
    keyOk?.addEventListener('click', confirmSave);
    keyCancel?.addEventListener('click', () => { if (saveKeyRow) saveKeyRow.style.display = 'none'; });
    keyInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { confirmSave(); e.preventDefault(); }
        if (e.key === 'Escape') { if (saveKeyRow) saveKeyRow.style.display = 'none'; e.preventDefault(); }
        e.stopPropagation();
    });

    // Şablon öğeleri
    section.querySelectorAll('.desc-tpl-item').forEach(item => {
        const key = item.dataset.key;
        if (!key) return;
        const editPanel = item.querySelector('.desc-tpl-edit-panel');

        // Şablonu textarea'ya ekle
        item.querySelector('.desc-tpl-apply-btn')?.addEventListener('click', () => {
            const tpl = _tplsForType(objType)[key];
            if (!tpl || !mainTa) return;
            mainTa.value = mainTa.value ? mainTa.value + '\n' + tpl.text : tpl.text;
            obj.description = mainTa.value;
            draw2D();
        });

        // Düzenle paneli aç/kapat
        item.querySelector('.desc-tpl-edit-btn')?.addEventListener('click', () => {
            const isOpen = editPanel?.style.display !== 'none';
            section.querySelectorAll('.desc-tpl-edit-panel').forEach(p => { p.style.display = 'none'; });
            if (!isOpen && editPanel) editPanel.style.display = '';
        });

        // Her zaman ekle — yıldızı DOM'da anlık güncelle
        item.querySelector('.desc-tpl-always-chk')?.addEventListener('change', e => {
            const tplObj = _tplsForType(objType);
            if (tplObj[key]) {
                tplObj[key].alwaysAdd = e.target.checked;
                _saveTplStore();
                const starEl = item.querySelector('.desc-tpl-star');
                if (starEl) {
                    starEl.textContent = e.target.checked ? '★' : '☆';
                    starEl.classList.toggle('desc-tpl-star--on', e.target.checked);
                }
            }
        });

        // Şablon sil
        item.querySelector('.desc-tpl-delete-btn')?.addEventListener('click', () => {
            const tplObj = _tplsForType(objType);
            delete tplObj[key];
            _saveTplStore();
            refresh();
        });

        // Şablon düzenle
        const editTa = item.querySelector('.desc-tpl-edit-ta');
        editTa?.addEventListener('keydown', e => e.stopPropagation());
        item.querySelector('.desc-tpl-edit-ok')?.addEventListener('click', () => {
            const tplObj = _tplsForType(objType);
            if (tplObj[key] && editTa) { tplObj[key].text = editTa.value; _saveTplStore(); }
            if (editPanel) editPanel.style.display = 'none';
        });
        item.querySelector('.desc-tpl-edit-cancel')?.addEventListener('click', () => {
            if (editPanel) editPanel.style.display = 'none';
        });
    });
}

// ─── INPUT OLAYLARI ──────────────────────────────────────────────────────────

/** Prop listesinde key'e göre prop veya dual field tanımını bul */
function _findPropByKey(props, key) {
    for (const p of props) {
        if (p.key === key) return p;
        if (p.type === 'dual' && p.fields) {
            const f = p.fields.find(f => f.key === key);
            if (f) return f;
        }
    }
    return null;
}

function bindInputEvents(panelEl, props, obj, manager) {
    // Text ve Number input'lar
    panelEl.querySelectorAll('input[type="text"][data-prop-key], input[type="number"][data-prop-key]').forEach(el => {
        // input event: anlık güncelleme (afterChange tetikler, kaydetmez)
        el.addEventListener('input', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.value;
            const prop = _findPropByKey(props, key);
            if (prop?.afterChange) prop.afterChange(obj, manager, panelEl);
        });
        // change event: kalıcı kayıt
        el.addEventListener('change', (e) => {
            const key = e.target.dataset.propKey;
            if (!key) return;
            obj[key] = e.target.value;
            if (key === 'boruCap') syncVanaCapOnPipe(obj, manager, e.target.value);
            const prop = _findPropByKey(props, key);
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
            const prop = _findPropByKey(props, key);
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
            // Toggle'ın inline action butonu varsa görünürlüğünü güncelle
            const inlineBtn = e.target.closest('.props-toggle-inline')?.querySelector('.props-inline-action-btn');
            const prop = _findPropByKey(props, key);
            if (inlineBtn && prop?.inlineAction?.visibleFn) {
                inlineBtn.style.display = prop.inlineAction.visibleFn(obj, manager) ? '' : 'none';
            }
            if (prop?.afterChange) prop.afterChange(obj, manager, panelEl);
            persist();
        });
    });

    // Toggle inline action butonları (örn. yay ters çevir)
    panelEl.querySelectorAll('.props-inline-action-btn[data-inline-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const wrap = btn.closest('.props-toggle-inline');
            const propId = wrap?.dataset.propId;
            const prop = props.find(p => p.id === propId);
            if (prop?.inlineAction?.onClick) {
                prop.inlineAction.onClick(obj, manager, panelEl);
                persist();
            }
        });
    });

    // Action butonları
    panelEl.querySelectorAll('.props-action-btn[data-action-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.props-actions-row');
            const propId = row?.dataset.propId;
            const prop = props.find(p => p.id === propId);
            const idx = parseInt(btn.dataset.actionIdx);
            const action = prop?.buttons?.[idx];
            if (action?.onClick) {
                action.onClick(obj, manager, panelEl);
                persist();
                if (panelEl._refresh) panelEl._refresh();
            }
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

/** Sayısal değeri verilen precision'a göre biçimlendir. precision null/undefined ise dokunma. */
function _formatNumeric(val, precision) {
    if (precision == null) return String(val ?? '');
    if (val === '' || val == null) return String(val ?? '');
    const n = parseFloat(val);
    if (!isFinite(n)) return String(val);
    return n.toFixed(precision);
}

// ─── BUTON BAĞLAMA (uygulama başladığında çağrılır) ──────────────────────────

export function initPropertiesButton(manager) {
    const btn = document.getElementById('btn-properties');
    if (!btn) return;

    btn.addEventListener('click', () => {
        if (isPanelOpen()) {
            // Panel açıksa ZORLA kapat (forceClose = true)
            closePropertiesPanel(true);
        } else {
            // Panel kapalıysa AÇ
            const im = manager?.interactionManager;
            let sel = im?.selectedObject || im?.selectedValve?.vana;
            if (!sel && window.state?.selectedObject) sel = window.state.selectedObject.object;
            if (!sel && window.state?.selectedRoom) sel = window.state.selectedRoom;

            // Eğer seçili nesne varsa onunla aç, yoksa boş ekranı fırlat
            if (sel) {
                openPropertiesPanel(sel, manager);
            } else {
                openEmptyPanel();
            }
        }
    });
}

export function togglePanelMode() {
    currentPanelMode = (currentPanelMode + 1) % 3; // 0 -> 1 -> 2 -> 0 diye döner

    // Panel Header'ındaki butonun görünümünü güncelle (Eğer panel henüz açılmamışsa çalışmaz)
    const btn = document.getElementById('props-pin-btn');
    if (btn) {
        const newUI = getModeBtnUI(currentPanelMode);
        btn.innerHTML = newUI.icon;
        btn.title = newUI.title;
        btn.style.color = newUI.color;
    }

    // Moda geçer geçmez anlık tepki ver:
    if (currentPanelMode === PANEL_MODES.ALWAYS && !isPanelOpen()) {
        openEmptyPanel();
    } else if ((currentPanelMode === PANEL_MODES.AUTO || currentPanelMode === PANEL_MODES.MANUAL) && isPanelOpen()) {
        // Eğer sahnede bir seçim yoksa paneli gizle
        const selObj = window.state?.selectedObject || window.plumbingManager?.interactionManager?.selectedObject;
        if (!selObj) closePropertiesPanel(true);
    }
}

// refreshPanelPosition artık gerekli değil (panel sabit), ama import edenler için boş bırak
export function refreshPanelPosition() { }