// hata-kontrol-menu.js
// "Hesap ► Hata Kontrol" modali — UI katmanı.
//
// Mimari: errorCheckManager (plumbing_v2/error-check/error-check-manager.js)
// gerçek hata listesini üretir; bu modül sadece modal aç/kapat, sürükle, render,
// satır buton akışları ve toast gösterimi ile ilgilenir.

import { errorCheckManager } from '../plumbing_v2/error-check/error-check-manager.js';
import { ERROR_GROUPS, ERROR_GROUP_IDS, getGroupLabel, getGroupOrder } from '../plumbing_v2/error-check/error-types.js';
import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { draw2D } from '../draw/draw2d.js';
import { state, setState, dom } from '../general-files/main.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { runAutoCapForErrors } from './auto-cap-menu.js';

const MODAL_ID    = 'hata-kontrol-modal-overlay';
const BODY_ID     = 'hata-kontrol-modal-body';
const SUMMARY_ID  = 'hk-summary';
const RUN_BTN_ID  = 'hk-run-btn';
const CLOSE_ID    = 'hata-kontrol-modal-close';
const TRIGGER_ID  = 'menuHesapHataKontrol';
const DETAIL_POPUP_ID = 'hk-detail-popup';
const FILTER_BAR_ID   = 'hk-filter-bar';
const FILTER_INPUT_ID = 'hk-filter-input';

// Aktif seçili row (errorId) — CTRL+C ile kopyalama için
let hkSelectedErrorId = null;
// Aktif metin filtresi (lower-case)
let hkFilterText = '';

// ─── Gruplandırma Dropdown State ve Mantığı (Yalnızca Düz Tekli Metin Seçimi) ───
let hkGroupingState = [
    { id: 'Genel', label: 'Genel', checked: true },
    { id: 'Kat', label: 'Kat', checked: false },
    { id: 'Birim', label: 'Birim', checked: false },
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
    closeFilterBar(true);
    hkSelectedErrorId = null;
}

function fallbackCopy(text) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    } catch (_) { /* yoksay */ }
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
// "Tıklandığında Gidilecek": hedef nesneleri çöz → katına geç → ekrana
// odakla (~%50 alan kapla) → seç → paneli kapat.
function navigateToTargets(targets) {
    if (!Array.isArray(targets) || targets.length === 0) {
        showToast('Bu hata için bir konum tanımlanmamış');
        return;
    }
    const { manager } = getInteractionManager();
    if (!manager) return;

    // Hedef nesneleri (pipes + components) topla
    const pipes = [];
    const comps = [];
    let floorId = null;

    for (const t of targets) {
        if (!t) continue;
        if (t.type === 'path' && Array.isArray(t.hatNos) && t.hatNos.length) {
            const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
            const set = new Set(t.hatNos.map(n => Number(n)));
            (manager.pipes || []).forEach(p => {
                if (set.has(hatMap.get(p.id))) pipes.push(p);
            });
        } else if (t.type === 'hat' && Number.isFinite(Number(t.no))) {
            const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
            const no = Number(t.no);
            (manager.pipes || []).forEach(p => {
                if (hatMap.get(p.id) === no) pipes.push(p);
            });
        } else if (t.type === 'pipe' && t.id) {
            const p = (manager.pipes || []).find(x => x.id === t.id);
            if (p) pipes.push(p);
        } else if (t.type === 'comp' && t.id) {
            const c = (manager.components || []).find(x => x.id === t.id);
            if (c) comps.push(c);
        } else if (t.type === 'floor' && t.id) {
            floorId = t.id;
        } else if (t.type === 'room' && t.id) {
            const room = (state.rooms || []).find(r => r.id === t.id);
            if (room) floorId = room.floorId ?? null;
        }
    }

    // Hedef katı belirle — pipes/comps ile aynı katlardan ilki, yoksa floorId
    if (floorId == null) {
        const allFloorIds = [
            ...pipes.map(p => p.floorId),
            ...comps.map(c => c.floorId),
        ].filter(Boolean);
        if (allFloorIds.length) floorId = allFloorIds[0];
    }

    // 1) Kat geçişi (gerekiyorsa)
    if (floorId && state.currentFloor?.id !== floorId) {
        switchToFloor(floorId);
    }

    // 2) Nesneleri seç
    selectObjects(pipes, comps);

    // 3) Ekrana odakla — bbox merkezi ekranın ortasına, %50 oran
    if (pipes.length || comps.length) {
        fitObjectsToScreen(pipes, comps);
    } else if (floorId) {
        // Floor target için sadece kat geçişi yeterli
    } else {
        showToast('Hedef nesne çözümlenemedi');
        return;
    }

    // 4) Panel kapanır
    hideHataKontrolModal();
}

function getInteractionManager() {
    const manager = window.plumbingManager?.interactionManager?.manager
        || window.plumbingManager
        || plumbingManager;
    return { manager, im: manager?.interactionManager || null };
}

function switchToFloor(floorId) {
    const floor = (state.floors || []).find(f => f.id === floorId);
    if (!floor) return;
    setState({ currentFloor: floor });
    // Mini panel + 3D sahne update
    try {
        import('../floor/floor-panel.js').then(mod => mod.renderMiniPanel?.()).catch(() => {});
    } catch (_) {}
    try {
        import('../scene3d/scene3d-update.js').then(mod => mod.update3DScene?.()).catch(() => {});
    } catch (_) {}
}

function selectObjects(pipes, comps) {
    const { manager, im } = getInteractionManager();
    if (!manager || !im) return;
    const all = [...pipes, ...comps];
    if (!all.length) return;
    try {
        // isSelected flag (renderer'lar bunu kullanır)
        (manager.pipes || []).forEach(p => { p.isSelected = false; });
        (manager.components || []).forEach(c => { c.isSelected = false; });
        all.forEach(o => { o.isSelected = true; });
        im.selectedObjects = all;
        im.lastSelectedObject = all[all.length - 1];
        // Path için renderer extra seçim
        if (pipes.length) {
            im.selectedHatPipes = pipes;
            window._selectedPipePath = null;
        }
    } catch (e) { console.warn('selectObjects failed:', e); }
}

// Backwards compat — eski fix.js çağrıları için
function selectByObjectId(type, id) {
    const { manager } = getInteractionManager();
    if (!manager) return;
    if (type === 'pipe') {
        const p = (manager.pipes || []).find(x => x.id === id);
        if (p) selectObjects([p], []);
    } else if (type === 'comp') {
        const c = (manager.components || []).find(x => x.id === id);
        if (c) selectObjects([], [c]);
    }
    draw2D();
}

// Hedef nesneleri ekranın ~%50'sini kaplayacak şekilde odakla.
// İzometri/Persp aktifse iso koordinatlarına dönüştürür.
function fitObjectsToScreen(pipes, comps) {
    const c = dom?.c2d;
    if (!c) { draw2D(); return; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pad = 50; // küçük nesneler için minimum boyut (cm)

    for (const p of pipes) {
        if (!p?.p1 || !p?.p2) continue;
        minX = Math.min(minX, p.p1.x, p.p2.x);
        minY = Math.min(minY, p.p1.y, p.p2.y);
        maxX = Math.max(maxX, p.p1.x, p.p2.x);
        maxY = Math.max(maxY, p.p1.y, p.p2.y);
    }
    for (const co of comps) {
        if (co?.x == null || co?.y == null) continue;
        minX = Math.min(minX, co.x - pad);
        minY = Math.min(minY, co.y - pad);
        maxX = Math.max(maxX, co.x + pad);
        maxY = Math.max(maxY, co.y + pad);
    }

    if (!isFinite(minX) || !isFinite(maxX)) { draw2D(); return; }

    // Minimum bbox — tek nokta için 200 cm
    const MIN_SIZE = 200;
    let w = Math.max(maxX - minX, MIN_SIZE);
    let h = Math.max(maxY - minY, MIN_SIZE);
    let cx = (minX + maxX) / 2;
    let cy = (minY + maxY) / 2;

    // İzometri/Persp aktifse merkezi izo koordinatlarına dönüştür
    let centerX = cx, centerY = cy;
    if (state.is3DPerspectiveActive) {
        const ang = Math.PI / 6;
        const cos30 = Math.cos(ang);
        const sin30 = Math.sin(ang);
        centerX = (cx + cy) * cos30;
        centerY = (cy - cx) * sin30;
        // izometride bbox açılı projeksiyonda
        const x1 = (minX + minY) * cos30, y1 = (minY - minX) * sin30;
        const x2 = (maxX + maxY) * cos30, y2 = (maxY - maxX) * sin30;
        const x3 = (minX + maxY) * cos30, y3 = (maxY - minX) * sin30;
        const x4 = (maxX + minY) * cos30, y4 = (minY - maxX) * sin30;
        const ixs = [x1, x2, x3, x4];
        const iys = [y1, y2, y3, y4];
        w = Math.max(...ixs) - Math.min(...ixs);
        h = Math.max(...iys) - Math.min(...iys);
    }

    // ~%50 oran: nesne ekranın yarısını kaplasın → kullanılabilir alan = ekran/2
    const targetW = c.width / 2;
    const targetH = c.height / 2;
    const zoomX = w > 0 ? targetW / w : 1;
    const zoomY = h > 0 ? targetH / h : 1;
    const newZoom = Math.max(0.05, Math.min(zoomX, zoomY, 5));

    const newPanX = c.width / 2 - centerX * newZoom;
    const newPanY = c.height / 2 - centerY * newZoom;

    // İzometri/persp aktifse iso state'ini, aksi halde 2D state'ini güncelle
    if (state.is3DPerspectiveActive) {
        setState({ isoZoom: newZoom, isoPanOffset: { x: newPanX, y: newPanY } });
    } else {
        setState({ zoom: newZoom, panOffset: { x: newPanX, y: newPanY } });
    }
    draw2D();
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

// Birim no'su girilmemiş ama bir birime ait olan hatalar için yer tutucu.
// (UI gruplamasında "××× birimi" grubu altında toplanır.)
const BIRIM_PLACEHOLDER = '×××';

// Bir comp sayaç buldu ise birim sahibi sayılır; daire no boşsa placeholder ile
// doldurulur. Sayaç bulunamadıysa "" döner (kolon kabul edilir).
function birimFromMeter(meter) {
    if (!meter) return '';
    return dairePrefixFromComp(meter) || BIRIM_PLACEHOLDER;
}

// Item için ham konum bilgisi: floorId/birim raw. Hem getLocationInfo() hem de
// Kat/Birim gruplaması ortak kullanır.
function computeRowDescriptor(item) {
    if (!Array.isArray(item.targets) || item.targets.length === 0) {
        return { floorId: null, floorName: '', birim: '' };
    }
    const manager = getManager();
    if (!manager) return { floorId: null, floorName: '', birim: '' };

    let floorId = null;
    let birim = '';
    const t = item.targets[0];

    if (t.type === 'comp' && t.id) {
        const comp = (manager.components || []).find(c => c.id === t.id);
        if (comp) {
            floorId = comp.floorId || null;
            if (comp.type === 'sayac') {
                // Sayaç her zaman bir birime aittir; daire no boşsa placeholder
                birim = dairePrefixFromComp(comp) || BIRIM_PLACEHOLDER;
            } else if (comp.type === 'vana' && comp.vanaTipi === 'BRANSMAN') {
                // Branşman vanası birim çapasıdır
                birim = dairePrefixFromComp(comp) || BIRIM_PLACEHOLDER;
            } else if (comp.type === 'cihaz' || comp.type === 'vana' || comp.type === 'regulator') {
                const m = findMeterUpstream(manager, comp.fleksBaglanti?.boruId || comp.bagliBoruId);
                birim = birimFromMeter(m);
            }
        }
    } else if (t.type === 'pipe' && t.id) {
        const pipe = (manager.pipes || []).find(p => p.id === t.id);
        if (pipe) {
            floorId = pipe.floorId || null;
            const m = findMeterUpstream(manager, pipe.id);
            birim = birimFromMeter(m);
        }
    } else if (t.type === 'hat' && Number.isFinite(Number(t.no))) {
        const hatPipes = buildHatPipesMap(manager).get(Number(t.no)) || [];
        if (hatPipes.length) {
            floorId = hatPipes[0].floorId || null;
            const m = findMeterUpstream(manager, hatPipes[0].id);
            birim = birimFromMeter(m);
        }
    } else if (t.type === 'path' && Array.isArray(t.hatNos) && t.hatNos.length) {
        const lastHat = t.hatNos[t.hatNos.length - 1];
        const hatPipes = buildHatPipesMap(manager).get(Number(lastHat)) || [];
        if (hatPipes.length) {
            floorId = hatPipes[0].floorId || null;
            const m = findMeterUpstream(manager, hatPipes[0].id);
            birim = birimFromMeter(m);
        }
    } else if (t.type === 'floor') {
        floorId = t.id ?? null;
    } else if (t.type === 'room' && t.id) {
        const room = (state.rooms || []).find(r => r.id === t.id);
        if (room) floorId = room.floorId ?? null;
    }

    return { floorId, floorName: floorNameById(floorId), birim };
}

function splitLimitSuffix(message) {
    // Mesaj sonundaki parantez içi (varsa) — opsiyonel nokta ile birlikte.
    // PDF örnekleri:
    //   "...basınç kaybı yüksek (1.246 mbar > 1.0 mbar)"
    //   "...hız yüksek. (18 m/s > 15 m/s)"
    //   "...kullanılamaz. (Ocak debi: 1.6 m³/h < Sayaç alt okuma sınırı: 1.8 m³/h)"
    const re = /\s*(\([^()]+\))\s*\.?\s*$/;
    const m = String(message || '').match(re);
    if (!m) return { main: String(message || ''), limit: '' };
    return {
        main: String(message).slice(0, m.index).trimEnd(),
        limit: m[1],
    };
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

// ─── Row selection ───────────────────────────────────────────────────────
function selectRow(errorId) {
    hkSelectedErrorId = errorId || null;
    applySelectionToDom();
}
function applySelectionToDom() {
    const body = getBody();
    if (!body) return;
    body.querySelectorAll('.hk-row.selected').forEach(r => r.classList.remove('selected'));
    if (!hkSelectedErrorId) return;
    const target = body.querySelector(`.hk-row[data-error-id="${CSS.escape(hkSelectedErrorId)}"]`);
    if (target) target.classList.add('selected');
}

// ─── Filtre ──────────────────────────────────────────────────────────────
function openFilterBar() {
    const bar = document.getElementById(FILTER_BAR_ID);
    if (!bar) return;
    bar.classList.add('open');
    const input = document.getElementById(FILTER_INPUT_ID);
    if (input) {
        input.value = hkFilterText;
        input.focus();
        input.select();
    }
}
function closeFilterBar(reset = true) {
    const bar = document.getElementById(FILTER_BAR_ID);
    if (!bar) return;
    bar.classList.remove('open');
    if (reset && hkFilterText) {
        hkFilterText = '';
        renderResults();
    }
}

function getActiveGroupingMode() {
    return hkGroupingState.find(x => x.checked)?.id || 'Genel';
}

// Floor sıralama indeksi — state.floors içindeki bottomElevation tabanlı sıra
function floorOrderIndex(floorId) {
    const floors = state.floors || [];
    const sorted = [...floors]
        .filter(f => !f.isPlaceholder)
        .sort((a, b) => (a.bottomElevation || 0) - (b.bottomElevation || 0));
    const i = sorted.findIndex(f => f.id === floorId);
    return i === -1 ? 9999 : i;
}

// Birim için sıralama: D1, D2, ... Ofis1, Dük1 vs. Önce tipi sonra numarayı kullan
function birimOrderKey(label) {
    if (!label) return [99, 9999];
    const m = String(label).match(/^([A-Za-zÇĞİÖŞÜçğıöşü\s]+)\s*(\d+)?/);
    const kind = m ? m[1].trim().toUpperCase() : label.toUpperCase();
    const num  = m && m[2] ? Number(m[2]) : 0;
    const kindOrder = { 'D': 1, 'KD': 2, 'OFİS': 3, 'DÜK': 4 };
    return [kindOrder[kind] || 50, num];
}

function compareBirim(a, b) {
    const [ka, na] = birimOrderKey(a);
    const [kb, nb] = birimOrderKey(b);
    return (ka - kb) || (na - nb);
}

// Hata listesini seçili moda göre gruplandırır.
// Dönüş: [{ key, label, order, items }]
function buildGroupsForMode(items, mode) {
    if (mode === 'Kat') {
        const map = new Map();
        items.forEach(it => {
            const d = computeRowDescriptor(it);
            const key = d.floorId ?? '__nofloor__';
            const label = d.floorName || '(Kat belirsiz)';
            if (!map.has(key)) map.set(key, { key, label, order: floorOrderIndex(d.floorId), items: [] });
            map.get(key).items.push(it);
        });
        return [...map.values()].sort((a, b) => a.order - b.order);
    }
    if (mode === 'Birim') {
        const map = new Map();
        items.forEach(it => {
            const d = computeRowDescriptor(it);
            const key = d.birim || '__kolon__';
            // Birim no girilmemiş ama bir birime ait → "××× birimi"
            // Hiç birim sahibi olmayan (kolon nesneleri) → "(Kolon)"
            let label;
            if (d.birim === BIRIM_PLACEHOLDER) label = '××× birimi';
            else if (d.birim) label = d.birim;
            else label = '(Kolon)';
            if (!map.has(key)) map.set(key, { key, label, items: [] });
            map.get(key).items.push(it);
        });
        const arr = [...map.values()];
        arr.sort((a, b) => {
            if (a.key === '__kolon__') return 1;
            if (b.key === '__kolon__') return -1;
            // ××× birimi en sona (gerçek birim no'lardan sonra)
            if (a.key === BIRIM_PLACEHOLDER) return 1;
            if (b.key === BIRIM_PLACEHOLDER) return -1;
            return compareBirim(a.label, b.label);
        });
        return arr;
    }
    // Genel
    const map = new Map();
    items.forEach(it => {
        const gid = it.group || 'OTHER';
        if (!map.has(gid)) map.set(gid, { key: gid, label: getGroupLabel(gid), order: getGroupOrder(gid), items: [] });
        map.get(gid).items.push(it);
    });
    return [...map.values()].sort((a, b) => a.order - b.order);
}

function renderResults() {
    const body = getBody();
    if (!body) return;

    _hatPipesCache = null;

    const mode = getActiveGroupingMode();
    let allItems = errorCheckManager.getResults();
    const total = allItems.length;

    // CTRL+F filtresi — mesajda case-insensitive substring eşleşmesi
    if (hkFilterText) {
        const q = hkFilterText;
        allItems = allItems.filter(it => String(it.message || '').toLowerCase().includes(q));
    }
    const groups = buildGroupsForMode(allItems, mode);

    updateSummary(total);

    if (total === 0) {
        body.innerHTML = `<div class="hk-empty hk-empty-clean">Tüm kontroller temiz ✓</div>`;
        return;
    }
    if (allItems.length === 0) {
        body.innerHTML = `<div class="hk-empty">Filtreyle eşleşen hata yok</div>`;
        return;
    }

    const html = groups.map(g => {
        const gid = g.key;
        const items = g.items;
        const fixable = items.some(it => it.fix && typeof it.fix.apply === 'function');
        const rows = items.map((it) => {
            const hasFix = !!(it.fix && typeof it.fix.apply === 'function');
            const { main, limit } = splitLimitSuffix(String(it.message || ''));
            // Mesaj içinde checker-utils.gri(...) ile işaretlenmiş parçalar
            // (\x01 ... \x02 sentinel'ları) gri span'lere dönüşür.
            const applyInlineGri = (escaped) => escaped
                .replace(//g, '<span class="hk-row-dim">')
                .replace(//g, '</span>');
            const mainHtml  = `<span class="hk-row-main">${applyInlineGri(escapeHtml(main))}</span>`;
            const limitHtml = limit ? ` <span class="hk-row-dim hk-row-limit">${applyInlineGri(escapeHtml(limit))}</span>` : '';
            // Kat ismi mesaj sonunda gri olarak gösterilir (ErrorItem.floorName)
            const floorHtml = it.floorName
                ? ` <span class="hk-row-dim hk-row-floor">${escapeHtml(it.floorName)}</span>`
                : '';
            const sevClass = it.severity === 'warning' ? ' hk-row--warning' : '';
            return `
                <div class="hk-row${sevClass}" data-error-id="${escapeHtml(it.errorId)}">
                    <div class="hk-row-msg">${mainHtml}${limitHtml}${floorHtml}</div>
                    <div class="hk-row-actions">
                        <button class="hk-icon-btn hk-goto-btn"   title="Hataya Git">⊙</button>
                        <button class="hk-icon-btn hk-fix-btn"    title="Çözüm Öner" ${hasFix ? '' : 'disabled'}>💡</button>
                        <button class="hk-icon-btn hk-detail-btn" title="Detay Göster">ℹ</button>
                    </div>
                </div>
            `;
        }).join('');
        const fixableIds = items
            .filter(it => it.fix && typeof it.fix.apply === 'function')
            .map(it => it.errorId)
            .join(',');
        return `
            <div class="hk-group" data-group="${escapeHtml(gid)}" data-fix-ids="${escapeHtml(fixableIds)}">
                <div class="hk-group-header">
                    <span class="hk-group-caret">▾</span>
                    <span class="hk-group-title">${escapeHtml(g.label)}</span>
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
            const idsAttr = groupEl?.dataset.fixIds || '';
            const ids = idsAttr.split(',').filter(Boolean);

            // BASINÇ ve HIZ hataları toplu çözümde otomatik boru çapı hesabını
            // çağırır — tek tek fix iterasyonu yerine bir kez autoSize yeterli.
            const results = errorCheckManager.getResults();
            const idSet = new Set(ids);
            const groupItems = results.filter(r => idSet.has(r.errorId));
            const autoCapGroups = new Set([
                ERROR_GROUP_IDS.BASINC_KAYIP,
                ERROR_GROUP_IDS.TESISAT_HIZ,
            ]);
            const autoCapItems = groupItems.filter(it => autoCapGroups.has(it.group));
            const otherFixIds  = groupItems
                .filter(it => !autoCapGroups.has(it.group))
                .map(it => it.errorId);

            if (!ids.length && autoCapItems.length === 0) {
                showToast('Bu grupta uygulanabilir çözüm yok');
                return;
            }

            let applied = 0;
            if (autoCapItems.length > 0) {
                try { runAutoCapForErrors(); applied += autoCapItems.length; }
                catch (_) { /* yoksay */ }
            }
            for (const id of otherFixIds) {
                const res = errorCheckManager.applyFix(id);
                if (res.ok) applied++;
            }

            if (applied > 0) {
                const total = autoCapItems.length + otherFixIds.length;
                showToast(`✓ ${applied}/${total} çözüm uygulandı`);
                runAndRender();
            } else {
                showToast('Bu grupta uygulanabilir çözüm yok');
            }
        });
    });

    body.querySelectorAll('.hk-row').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.hk-row-actions')) return;
            selectRow(row.dataset.errorId);
        });
        row.addEventListener('dblclick', (e) => {
            if (e.target.closest('.hk-row-actions')) return;
            const id = row.dataset.errorId;
            const item = errorCheckManager.getResults().find(x => x.errorId === id);
            if (item) navigateToTargets(item.targets);
        });
    });

    // Selection state'i DOM'a yansıt
    applySelectionToDom();

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
    // Filtre — input handler + kapat butonu
    const fInput = document.getElementById(FILTER_INPUT_ID);
    if (fInput) {
        fInput.addEventListener('input', (e) => {
            hkFilterText = String(e.target.value || '').toLowerCase();
            renderResults();
        });
        fInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); closeFilterBar(true); }
        });
    }
    const fClose = document.getElementById('hk-filter-close');
    if (fClose) {
        fClose.addEventListener('click', () => closeFilterBar(true));
    }

    document.addEventListener('keydown', (e) => {
        // Modal kapalıyken klavye kısayolu çalışmaz
        if (!overlay || overlay.style.display === 'none') return;

        // ESC: önce detay popup, sonra filtre çubuğu, sonra modal
        if (e.key === 'Escape') {
            const dp = document.getElementById(DETAIL_POPUP_ID);
            if (dp && dp.style.display !== 'none') { hideDetailPopup(); return; }
            const bar = document.getElementById(FILTER_BAR_ID);
            if (bar && bar.classList.contains('open')) { closeFilterBar(true); return; }
            hideHataKontrolModal();
            return;
        }

        // CTRL+F → filtre çubuğunu aç + odakla
        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            e.preventDefault();
            openFilterBar();
            return;
        }

        // CTRL+C → seçili row mesajını panoya kopyala
        if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
            // Eğer kullanıcı zaten metin seçmişse (selection) tarayıcının default
            // kopyalamasını engelleme.
            const sel = window.getSelection?.();
            if (sel && String(sel).trim().length > 0) return;
            if (!hkSelectedErrorId) return;
            const item = errorCheckManager.getResults().find(x => x.errorId === hkSelectedErrorId);
            if (!item) return;
            e.preventDefault();
            const text = String(item.message || '');
            const done = () => showToast('✓ Hata metni kopyalandı');
            if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(() => {
                    // Fallback
                    fallbackCopy(text); done();
                });
            } else {
                fallbackCopy(text); done();
            }
            return;
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