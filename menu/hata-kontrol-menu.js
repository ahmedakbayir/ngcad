// hata-kontrol-menu.js
// "Hesap ► Hata Kontrol" modali — UI katmanı.
//
// Mimari: errorCheckManager (plumbing_v2/error-check/error-check-manager.js)
// gerçek hata listesini üretir; bu modül sadece modal aç/kapat, sürükle, render,
// satır buton akışları ve toast gösterimi ile ilgilenir.

import { errorCheckManager } from '../plumbing_v2/error-check/error-check-manager.js';
import { ERROR_GROUPS, getGroupLabel, getGroupOrder } from '../plumbing_v2/error-check/error-types.js';
import { selectHatInProject, selectPathInProject } from './calc-table-helpers.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { draw2D } from '../draw/draw2d.js';
import { state } from '../general-files/main.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';

const MODAL_ID    = 'hata-kontrol-modal-overlay';
const BODY_ID     = 'hata-kontrol-modal-body';
const SUMMARY_ID  = 'hk-summary';
const RUN_BTN_ID  = 'hk-run-btn';
const CLOSE_ID    = 'hata-kontrol-modal-close';
const TRIGGER_ID  = 'menuHesapHataKontrol';
const DETAIL_POPUP_ID = 'hk-detail-popup';

// ─── Gruplandırma Dropdown State ve Mantığı (Yalnızca Düz Tekli Metin Seçimi) ───
let hkGroupingState = [
    { id: 'Genel', label: 'Genel', checked: true },
    { id: 'Kat', label: 'Kat', checked: false },
    { id: 'Birim', label: 'Birim', checked: false },
    { id: 'Cihaz', label: 'Cihaz', checked: false }
];

function injectHataKontrolGrouping() {
    const header = document.querySelector('.hk-modal-header');
    if (!header) return;

    // Tekrar eklenmesini önle
    if (document.getElementById('hk-grouping-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'hk-grouping-wrapper';
    wrapper.className = 'hk-grouping-container';
    
    wrapper.innerHTML = `
        <span class="hk-grouping-label">Gruplandır</span>
        <div class="hk-grouping-dropdown">
            <button id="hk-grouping-btn" class="hk-grouping-btn">
                <span id="hk-grouping-btn-text">Genel</span>
                <span class="hk-grouping-btn-arrow">▾</span>
            </button>
            <div id="hk-grouping-menu" class="hk-grouping-menu"></div>
        </div>
    `;

    // .hk-header-actions öğesinin (Yenile/Kapat butonları) hemen soluna yerleştirir
    const actions = header.querySelector('.hk-header-actions');
    if (actions) {
        header.insertBefore(wrapper, actions);
    } else {
        header.appendChild(wrapper);
    }

    const btn = document.getElementById('hk-grouping-btn');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            wrapper.classList.remove('open');
        }
    });

    renderGroupingMenu();
}

function renderGroupingMenu() {
    const wrapper = document.getElementById('hk-grouping-wrapper');
    const menu = document.getElementById('hk-grouping-menu');
    if (!menu) return;

    menu.innerHTML = '';

    hkGroupingState.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'hk-grouping-item' + (item.checked ? ' selected' : '');
        row.dataset.index = index;

        // Radio butonlar ve tüm ekstra işaretleyiciler/tutamaçlar tamamen kaldırıldı. Sadece yalın metin.
        row.innerHTML = `<span class="hk-grouping-item-label">${item.label}</span>`;

        // Satırın kendisine tıklandığında tekli seçim yapar ve menüyü kapatır
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Seçimi tekli olarak güncelle
            hkGroupingState.forEach(x => x.checked = (x.id === item.id));

            updateGroupingButtonText();
            renderGroupingMenu();
            
            // Seçim yapılınca dropdown listesini otomatik kapat
            if (wrapper) wrapper.classList.remove('open');

            runAndRender();
        });

        menu.appendChild(row);
    });

    updateGroupingButtonText();
}

function updateGroupingButtonText() {
    const btnText = document.getElementById('hk-grouping-btn-text');
    if (!btnText) return;

    const selectedItem = hkGroupingState.find(item => item.checked);
    btnText.textContent = selectedItem ? selectedItem.label : 'Seçiniz';
}

// ─── Modal aç/kapat ───────────────────────────────────────────────────────
function getOverlay() { return document.getElementById(MODAL_ID); }
function getBody()    { return document.getElementById(BODY_ID); }

function centerModal() {
    const overlay = getOverlay();
    if (!overlay) return;
    const modal = overlay.querySelector('.hk-modal');
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const left = Math.max(20, (window.innerWidth - rect.width) / 2);
    const top  = Math.max(20, Math.round(window.innerHeight * 0.10));
    modal.style.left = `${left}px`;
    modal.style.top  = `${top}px`;
}

export function showHataKontrolModal() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.style.display = 'block';
    centerModal();
    hideDetailPopup();
    
    // Açılış esnasında gruplandırma dropdown arayüzünü enjekte et
    injectHataKontrolGrouping();
    
    // Açılışta otomatik olarak kontrolü çalıştır.
    runAndRender();
}

function runAndRender() {
    errorCheckManager.runAll();
    renderResults();
}

function hideHataKontrolModal() {
    const overlay = getOverlay();
    if (overlay) overlay.style.display = 'none';
    hideDetailPopup();
}

function makeDraggable() {
    const overlay = getOverlay();
    if (!overlay) return;
    const modal  = overlay.querySelector('.hk-modal');
    const header = overlay.querySelector('.hk-modal-header');
    if (!modal || !header) return;

    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.hk-modal-close') || e.target.closest('.hk-grouping-container')) return;
        dragging = true;
        const rect = modal.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        modal.classList.add('dragging');
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        const rect = modal.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width;
        const maxTop  = window.innerHeight - rect.height;
        modal.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + dx))}px`;
        modal.style.top  = `${Math.max(0, Math.min(maxTop,  startTop  + dy))}px`;
    });
    document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; modal.classList.remove('dragging'); }
    });
}

// ─── Toast (mevcut #label-relayout-toast deseni) ──────────────────────────
let toastTimer = null;
function showToast(msg, duration = 1400) {
    const toast = document.getElementById('label-relayout-toast');
    const text  = document.getElementById('label-relayout-toast-text');
    if (!toast || !text) return;
    text.textContent = msg;
    toast.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; toastTimer = null; }, duration);
}

// ─── "Hataya git" yönlendiricisi ──────────────────────────────────────────
function navigateToTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
        showToast('Bu hata için bir konum tanımlanmamış');
        return;
    }
    const path = targets.find(t => t && t.type === 'path' && Array.isArray(t.hatNos) && t.hatNos.length);
    if (path) { selectPathInProject(path.hatNos); return; }

    const hat = targets.find(t => t && t.type === 'hat' && Number.isFinite(Number(t.no)));
    if (hat) { selectHatInProject(Number(hat.no)); return; }

    const compOrPipe = targets.find(t => t && (t.type === 'comp' || t.type === 'pipe') && t.id);
    if (compOrPipe) {
        selectByObjectId(compOrPipe.type, compOrPipe.id);
        return;
    }
    showToast('Hedef nesne çözümlenemedi');
}

function selectByObjectId(type, id) {
    const manager = window.plumbingManager?.interactionManager?.manager || window.plumbingManager || plumbingManager;
    if (!manager) return;
    const im = manager.interactionManager;
    if (!im) return;
    let obj = null;
    if (type === 'pipe') obj = (manager.pipes || []).find(p => p.id === id);
    else if (type === 'comp') obj = (manager.components || []).find(c => c.id === id);
    if (!obj) { showToast('Hedef bulunamadı'); return; }
    try {
        im.selectedObjects = [obj];
        im.lastSelectedObject = obj;
        draw2D();
    } catch (e) { console.warn('selectByObjectId failed:', e); }
}

// ─── Detay popup ──────────────────────────────────────────────────────────
function hideDetailPopup() {
    const p = document.getElementById(DETAIL_POPUP_ID);
    if (p) p.style.display = 'none';
}

function showDetailPopup(anchorEl, item) {
    const popup = document.getElementById(DETAIL_POPUP_ID);
    if (!popup) return;
    const srcEl  = document.getElementById('hk-detail-source');
    const textEl = document.getElementById('hk-detail-text');
    if (srcEl)  srcEl.textContent  = item.source || '—';
    if (textEl) textEl.textContent = item.detail || '—';

    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
    const rect = anchorEl.getBoundingClientRect();
    const pRect = popup.getBoundingClientRect();
    let left = rect.right + 8;
    let top  = rect.top - 4;
    if (left + pRect.width > window.innerWidth - 12) {
        left = Math.max(12, rect.left - pRect.width - 8);
    }
    if (top + pRect.height > window.innerHeight - 12) {
        top = Math.max(12, window.innerHeight - pRect.height - 12);
    }
    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;
    popup.style.visibility = 'visible';
}

document.addEventListener('mousedown', (e) => {
    const popup = document.getElementById(DETAIL_POPUP_ID);
    if (!popup || popup.style.display === 'none') return;
    if (e.target.closest('#hk-detail-popup')) return;
    if (e.target.closest('.hk-icon-btn.hk-detail-btn')) return;
    hideDetailPopup();
});

// ─── Render ───────────────────────────────────────────────────────────────
function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[c]));
}

function dairePrefixFromComp(comp) {
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

function getManager() {
    return window.plumbingManager?.interactionManager?.manager
        || window.plumbingManager
        || plumbingManager;
}

function findMeterUpstream(manager, pipeId) {
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

function floorNameById(floorId) {
    if (!floorId) return '';
    const f = (state.floors || []).find(x => x.id === floorId);
    return f?.name || '';
}

let _hatPipesCache = null;
function buildHatPipesMap(manager) {
    if (_hatPipesCache) return _hatPipesCache;
    const out = new Map();
    if (!manager?.pipes?.length) { _hatPipesCache = out; return out; }
    try {
        const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
        manager.pipes.forEach(p => {
            const hn = hatMap.get(p.id);
            if (hn == null) return;
            if (!out.has(hn)) out.set(hn, []);
            out.get(hn).push(p);
        });
    } catch (_) {}
    _hatPipesCache = out;
    return out;
}

function getLocationInfo(item) {
    if (!Array.isArray(item.targets) || item.targets.length === 0) return '';
    const manager = getManager();
    if (!manager) return '';

    let floorId = null;
    let birim = '';

    const t = item.targets[0];

    if (t.type === 'comp' && t.id) {
        const comp = (manager.components || []).find(c => c.id === t.id);
        if (comp) {
            floorId = comp.floorId || null;
            if (comp.type === 'sayac') {
                birim = dairePrefixFromComp(comp);
            } else if (comp.type === 'cihaz' || comp.type === 'vana' || comp.type === 'regulator') {
                const m = findMeterUpstream(manager, comp.fleksBaglanti?.boruId || comp.bagliBoruId);
                birim = dairePrefixFromComp(m);
            }
        }
    } else if (t.type === 'pipe' && t.id) {
        const pipe = (manager.pipes || []).find(p => p.id === t.id);
        if (pipe) {
            floorId = pipe.floorId || null;
            const m = findMeterUpstream(manager, pipe.id);
            birim = dairePrefixFromComp(m);
        }
    } else if (t.type === 'hat' && Number.isFinite(Number(t.no))) {
        const hatPipes = buildHatPipesMap(manager).get(Number(t.no)) || [];
        if (hatPipes.length) {
            floorId = hatPipes[0].floorId || null;
            const m = findMeterUpstream(manager, hatPipes[0].id);
            birim = dairePrefixFromComp(m);
        }
    } else if (t.type === 'path' && Array.isArray(t.hatNos) && t.hatNos.length) {
        const lastHat = t.hatNos[t.hatNos.length - 1];
        const hatPipes = buildHatPipesMap(manager).get(Number(lastHat)) || [];
        if (hatPipes.length) {
            floorId = hatPipes[0].floorId || null;
            const m = findMeterUpstream(manager, hatPipes[0].id);
            birim = dairePrefixFromComp(m);
        }
    }

    const onlyWithBirim = (item.group === 'BASINC_KAYIP' || item.group === 'TESISAT_HIZ');
    const fn = floorNameById(floorId);
    const parts = [];
    if (onlyWithBirim) {
        if (birim) {
            if (fn) parts.push(fn);
            parts.push(birim);
        }
    } else {
        if (fn) parts.push(fn);
        if (birim) parts.push(birim);
    }
    return parts.join(' • ');
}

function splitLimitSuffix(message) {
    const re = /\s*(\(\s*[≤≥<>=].*?olmalıdır\s*\))\s*$/;
    const m = String(message || '').match(re);
    if (!m) return { main: String(message || ''), limit: '' };
    return {
        main: String(message).slice(0, m.index).trimEnd(),
        limit: m[1],
    };
}

function splitFloorPrefix(item) {
    if (item.group !== 'MAHAL_TANIM') return { prefix: '', rest: String(item.message || '') };
    const m = String(item.message || '').match(/^([^:]+):\s*(.+)$/);
    if (!m) return { prefix: '', rest: String(item.message || '') };
    return { prefix: m[1].trim(), rest: m[2] };
}

function updateSummary(total) {
    const el = document.getElementById(SUMMARY_ID);
    if (!el) return;
    el.classList.remove('has-errors', 'clean');
    if (total === 0) {
        el.textContent = '✓ Temiz';
        el.classList.add('clean');
    } else {
        el.textContent = `${total} hata`;
        el.classList.add('has-errors');
    }
}

function renderResults() {
    const body = getBody();
    if (!body) return;

    _hatPipesCache = null;

    const grouped = errorCheckManager.getGroupedResults();
    const groupIds = Object.keys(grouped).sort((a, b) => getGroupOrder(a) - getGroupOrder(b));
    const total = errorCheckManager.getResults().length;

    updateSummary(total);

    if (total === 0) {
        body.innerHTML = `<div class="hk-empty hk-empty-clean">Tüm kontroller temiz ✓</div>`;
        return;
    }

    const html = groupIds.map(gid => {
        const items = grouped[gid];
        const fixable = items.some(it => it.fix && typeof it.fix.apply === 'function');
        const rows = items.map((it) => {
            const hasFix = !!(it.fix && typeof it.fix.apply === 'function');
            const loc = getLocationInfo(it);
            const { prefix: floorPrefix, rest: msgRest } = splitFloorPrefix(it);
            const { main, limit } = splitLimitSuffix(msgRest);
            const dimPrefix = loc || floorPrefix;
            const locHtml   = dimPrefix ? `<span class="hk-row-dim hk-row-loc">${escapeHtml(dimPrefix)}</span> ` : '';
            const mainHtml  = `<span class="hk-row-main">${escapeHtml(main)}</span>`;
            const limitHtml = limit ? ` <span class="hk-row-dim hk-row-limit">${escapeHtml(limit)}</span>` : '';
            return `
                <div class="hk-row" data-error-id="${escapeHtml(it.errorId)}">
                    <div class="hk-row-msg">${locHtml}${mainHtml}${limitHtml}</div>
                    <div class="hk-row-actions">
                        <button class="hk-icon-btn hk-goto-btn"   title="Hataya Git">⊙</button>
                        <button class="hk-icon-btn hk-fix-btn"    title="Çözüm Öner" ${hasFix ? '' : 'disabled'}>💡</button>
                        <button class="hk-icon-btn hk-detail-btn" title="Detay Göster">ℹ</button>
                    </div>
                </div>
            `;
        }).join('');
        return `
            <div class="hk-group" data-group="${escapeHtml(gid)}">
                <div class="hk-group-header">
                    <span class="hk-group-caret">▾</span>
                    <span class="hk-group-title">${escapeHtml(getGroupLabel(gid))}</span>
                    <span class="hk-group-count">${items.length}</span>
                    <button class="hk-group-fix-btn" title="Grup için tüm çözümleri uygula" ${fixable ? '' : 'disabled'}>⚡ Hepsini Çöz</button>
                </div>
                <div class="hk-group-rows">${rows}</div>
            </div>
        `;
    }).join('');

    body.innerHTML = html;
    attachRowHandlers();
}

function attachRowHandlers() {
    const body = getBody();
    if (!body) return;

    body.querySelectorAll('.hk-group-header').forEach(h => {
        h.addEventListener('click', (e) => {
            if (e.target.closest('.hk-group-fix-btn')) return;
            h.parentElement.classList.toggle('collapsed');
        });
    });

    body.querySelectorAll('.hk-group-fix-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const groupEl = btn.closest('.hk-group');
            const gid = groupEl?.dataset.group;
            if (!gid) return;
            const { applied, total } = errorCheckManager.applyGroupFixes(gid);
            if (applied > 0) {
                showToast(`✓ ${applied}/${total} çözüm uygulandı`);
                runAndRender();
            } else {
                showToast('Bu grupta uygulanabilir çözüm yok');
            }
        });
    });

    body.querySelectorAll('.hk-row').forEach(row => {
        row.addEventListener('dblclick', (e) => {
            if (e.target.closest('.hk-row-actions')) return;
            const id = row.dataset.errorId;
            const item = errorCheckManager.getResults().find(x => x.errorId === id);
            if (item) navigateToTargets(item.targets);
        });
    });

    body.querySelectorAll('.hk-goto-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.closest('.hk-row')?.dataset.errorId;
            const item = errorCheckManager.getResults().find(x => x.errorId === id);
            if (!item) return;
            navigateToTargets(item.targets);
        });
    });

    body.querySelectorAll('.hk-detail-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.closest('.hk-row')?.dataset.errorId;
            const item = errorCheckManager.getResults().find(x => x.errorId === id);
            if (!item) return;
            showDetailPopup(btn, item);
        });
    });

    body.querySelectorAll('.hk-fix-btn').forEach(btn => {
        if (btn.disabled) return;
        btn.addEventListener('click', () => {
            const row = btn.closest('.hk-row');
            if (!row) return;
            const existing = row.parentElement.querySelector(`.hk-fix-box[data-for="${row.dataset.errorId}"]`);
            if (existing) { existing.remove(); return; }
            const item = errorCheckManager.getResults().find(x => x.errorId === row.dataset.errorId);
            if (!item || !item.fix) return;
            const box = document.createElement('div');
            box.className = 'hk-fix-box';
            box.dataset.for = row.dataset.errorId;
            box.innerHTML = `
                <span class="hk-fix-text">💡 ${escapeHtml(item.fix.description || 'Çözüm uygulanacak')}</span>
                <button class="hk-fix-apply-btn">Çözümü Uygula</button>
            `;
            box.querySelector('.hk-fix-apply-btn').addEventListener('click', () => {
                const res = errorCheckManager.applyFix(row.dataset.errorId);
                if (res.ok) {
                    showToast('✓ ' + (res.message || 'Çözüm uygulandı'));
                    runAndRender();
                } else {
                    showToast('✕ ' + (res.message || 'Uygulama başarısız'));
                }
            });
            row.after(box);
        });
    });
}

// ─── Init ─────────────────────────────────────────────────────────────────
export function initHataKontrolMenu() {
    makeDraggable();

    const trigger  = document.getElementById(TRIGGER_ID);
    const closeBtn = document.getElementById(CLOSE_ID);
    const overlay  = getOverlay();
    const runBtn   = document.getElementById(RUN_BTN_ID);
    const mainMenu = document.getElementById('mainMenuContent');

    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement.classList.remove('show');
            showHataKontrolModal();
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideHataKontrolModal(); });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hideHataKontrolModal(); });
    }
    if (runBtn) {
        runBtn.addEventListener('click', () => runAndRender());
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') {
            const dp = document.getElementById(DETAIL_POPUP_ID);
            if (dp && dp.style.display !== 'none') { hideDetailPopup(); return; }
            hideHataKontrolModal();
        }
    });

    const iconBtn = document.getElementById('bHesapHataKontrol');
    if (iconBtn) {
        iconBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showHataKontrolModal();
        });
    }
}