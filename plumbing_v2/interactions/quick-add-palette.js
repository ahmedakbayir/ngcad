/**
 * Quick Add Palette
 * Boru ucunda yüzen küçük "+" tetikleyici; üzerine gelinince/click'lenince
 * 3 dikey grup açar (sayaç+vana / cihaz / tesisat nesnesi).
 *
 * Görünürlük modları:
 *  - 'pipe'    — bir boru seçildiğinde, anchor = pipe.p2 (iniş çıkış butonunun
 *                tam tersi tarafa konumlanır)
 *  - 'drawing' — aktif çizim sırasında, anchor = boruBaslangic.nokta (çizim ucu)
 *
 * Slot yönetimi: palet üstündeki "+" ile picker açılır, oradan sayfaya eklenir;
 * her slotun sağ üstündeki "×" ile kaldırılır. localStorage'da global saklanır.
 *
 * Slot click → ilgili nesne pipe ucuna yerleştirilir. Aktif çizim sırasında
 * mid-pipe nesneler (vana, fitting, regülatör) eklendiğinde çizim AYNI uçtan
 * devam eder; sayaç/cihaz terminal davranışını korur.
 *
 * Çizim kısayolu: paletin üstündeki "Boru" düğmesi anchor'dan yeni hat çizimi
 * başlatır (selection modunda) ya da kaldığı yerden devam ettirir.
 */

import { dom, state, setMode, setDrawingMode } from '../../general-files/main.js';
import { saveState } from '../../general-files/history.js';
import { worldToScreen } from '../../draw/geometry.js';
import { Boru, BAGLANTI_TIPLERI } from '../objects/pipe.js';

// ─── DOM refs ────────────────────────────────────────────────────────────────
let _btn = null;
let _panel = null;
let _pickerEl = null;
let _interactionManager = null;
let _anchorPipeId = null;
let _mode = 'pipe';             // 'pipe' | 'drawing'
let _drawingAnchor = null;      // {x,y,z} — drawing modu anchor noktası
let _anchorWorld = null;        // {x,y} — iniş çıkış butonuyla aynı anchor (click point / drawing tip)
let _initialized = false;
let _hoverOpen = false;
let _hideHoverTimer = null;
const LS_KEY = 'plumbing.quickAddPalette.v2';

// ─── Slot kayıtları ──────────────────────────────────────────────────────────
// SVG'ler yan menüdeki ikon işaretlemeleriyle birebir aynı (yeni ikon üretilmedi).
// Vana varyantları aynı SVG'yi paylaşır; ayrım badge (chip) ile yapılır.

const SVG_SAYAC = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="4" y="6" width="16" height="16" rx="2" stroke-width="1.6"/><text x="12" y="17" text-anchor="middle" font-size="8" font-weight="bold" stroke="none" fill="currentColor">G4</text><path d="M 9 5 L 9 2 M 9 2 L 6 2" stroke-width="2" stroke-linecap="round"/><path d="M 15 5 L 15 2 M 15 2 L 18 2" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_VANA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M 12 12 l-5-4 v8 Z"/><path d="M 12 12 l5-4 v8 Z"/></svg>`;
const SVG_KOMBI = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><circle cx="12" cy="12" r="11" stroke-width="1.5"/><circle cx="12" cy="12" r="8" stroke-width="1.5"/><text x="12" y="15" text-anchor="middle" font-size="10" font-weight="bold" stroke="none" fill="currentColor">G</text></svg>`;
const SVG_OCAK = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.5"/><circle cx="9" cy="9" r="2" stroke-width="1"/><circle cx="15" cy="9" r="2" stroke-width="1"/><circle cx="9" cy="15" r="2" stroke-width="1"/><circle cx="15" cy="15" r="2" stroke-width="1"/></svg>`;
const SVG_REGULATOR = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="0" y1="12" x2="3" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="24" y2="12" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke-width="1.6"/><path d="M 16 12 L 9 8 L 9 16 Z" fill="currentColor" stroke="none"/></svg>`;
const SVG_TOPRAKLAMA = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="2" y1="18" x2="22" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="18" x2="13" y2="10" stroke-width="1.6" stroke-linecap="round"/><line x1="13" y1="10" x2="9" y2="10" stroke-width="1.6" stroke-linecap="round"/><line x1="9" y1="14" x2="9" y2="6" stroke-width="1.6" stroke-linecap="round"/><line x1="7" y1="12" x2="7" y2="8" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="11" x2="5" y2="9" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const SVG_IZOLASYON = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="12" y1="2" x2="12" y2="8" stroke-width="2"/><line x1="12" y1="16" x2="12" y2="22" stroke-width="2"/><line x1="6" y1="10" x2="18" y2="10" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="14" x2="18" y2="14" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_FILTRE = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="2" y1="12" x2="7" y2="12" stroke-width="2"/><line x1="17" y1="12" x2="22" y2="12" stroke-width="2"/><rect x="6" y="6" width="12" height="12" stroke-width="1.4" fill="currentColor" fill-opacity="0.15"/><circle cx="9" cy="9" r="0.7" fill="currentColor"/><circle cx="12" cy="9" r="0.7" fill="currentColor"/><circle cx="15" cy="9" r="0.7" fill="currentColor"/><circle cx="9" cy="12" r="0.7" fill="currentColor"/><circle cx="12" cy="12" r="0.7" fill="currentColor"/><circle cx="15" cy="12" r="0.7" fill="currentColor"/><circle cx="9" cy="15" r="0.7" fill="currentColor"/><circle cx="12" cy="15" r="0.7" fill="currentColor"/><circle cx="15" cy="15" r="0.7" fill="currentColor"/></svg>`;
const SVG_MANOMETRE = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="8" y1="20" x2="16" y2="20" stroke-width="1"/><line x1="12" y1="20" x2="12" y2="13" stroke-width="1.6"/><circle cx="12" cy="9" r="4" stroke-width="1.2"/><line x1="12" y1="9" x2="14.2" y2="7" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const SVG_KOMPANSATOR = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="1" y1="12" x2="3" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="23" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="12" x2="9" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="6" x2="13" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="18" x2="17" y2="12" stroke-width="2" stroke-linecap="round"/></svg>`;
// İniş oku (iniş+sayaç / iniş+ocak / iniş+kombi badge'i): paletin tetik
// butonu için kullanılan iniş çıkış sembolünün üst yarısı.
const SVG_INIS_OK = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><path d="M12 3v15M12 18l-4-5M12 18l4-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_BORU = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="3" y="9" width="18" height="6" rx="1" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2" stroke-width="1"/></svg>`;

// İniş + nesne kombolarının ikonu: küçük iniş-ok + altta sembol.
// Vana varyantları (AKV/EMN/BRŞ/SEL) aynı SVG'yi paylaşır — slot altındaki
// etiket adı kendisi ayırt edici (chip overlay'i çift bilgi olmasın diye yok).
function _inisCombosSvg(innerSvg) {
    return `<span class="qap-combo">
        <span class="qap-combo-top">${SVG_INIS_OK}</span>
        <span class="qap-combo-bot">${innerSvg}</span>
    </span>`;
}

const KIND_REGISTRY = {
    // ── Sayaç / Vana Grubu (meter) ─────────────────────────────────────────
    sayac: {
        label: 'Sayaç', group: 'meter', html: SVG_SAYAC,
        terminal: false, hasOutput: true,
        place(im, pipe) { saveState(); im.manager.placeMeterAtOpenEnd({ pipe, end: 'p2', point: pipe.p2 }); im.manager.saveToState(); },
    },
    inis_sayac: {
        label: 'İniş + Sayaç', group: 'meter', html: _inisCombosSvg(SVG_SAYAC),
        terminal: false, hasOutput: true,
        place(im, pipe) { _placeInisVeSayac(im, pipe); },
    },
    vana_akv: {
        label: 'AKV', group: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe) { im.handleVanaPlacement({ pipe, point: pipe.p2, vanaTipi: 'AKV' }); },
    },
    vana_bransman: {
        // Branşman sonlanma vanası — hat burada biter, çizim devam ettirilmez.
        label: 'Branşman', group: 'meter', html: SVG_VANA,
        terminal: true,
        place(im, pipe) { im.handleVanaPlacement({ pipe, point: pipe.p2, vanaTipi: 'BRANSMAN' }); },
    },
    vana_emniyet: {
        label: 'Emniyet', group: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe) { im.handleVanaPlacement({ pipe, point: pipe.p2, vanaTipi: 'EMNIYET' }); },
    },
    vana_selenoid: {
        label: 'Selenoid', group: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe) { im.handleVanaPlacement({ pipe, point: pipe.p2, vanaTipi: 'SELENOID' }); },
    },

    // ── Cihaz Grubu (device) ───────────────────────────────────────────────
    ocak: {
        label: 'Ocak', group: 'device', html: SVG_OCAK,
        terminal: true,
        place(im, pipe) { saveState(); im.manager.placeDeviceAtOpenEnd('OCAK', { pipe, end: 'p2', point: pipe.p2 }); im.manager.saveToState(); },
    },
    kombi: {
        label: 'Kombi', group: 'device', html: SVG_KOMBI,
        terminal: true,
        place(im, pipe) { saveState(); im.manager.placeDeviceAtOpenEnd('KOMBI', { pipe, end: 'p2', point: pipe.p2 }); im.manager.saveToState(); },
    },
    inis_ocak: {
        label: 'İniş + Ocak', group: 'device', html: _inisCombosSvg(SVG_OCAK),
        terminal: true,
        place(im, pipe) { _placeInisVeCihaz(im, pipe, 'OCAK'); },
    },
    inis_kombi: {
        label: 'İniş + Kombi', group: 'device', html: _inisCombosSvg(SVG_KOMBI),
        terminal: true,
        place(im, pipe) { _placeInisVeCihaz(im, pipe, 'KOMBI'); },
    },

    // ── Tesisat Nesne Grubu (fitting) ──────────────────────────────────────
    topraklama: {
        label: 'Topraklama', group: 'fitting', html: SVG_TOPRAKLAMA,
        midPipe: true,
        place(im, pipe) { im.handleFittingPlacement({ pipe, point: pipe.p2, fittingType: 'topraklama' }); },
    },
    izolasyon_flansi: {
        label: 'İzolasyon Flanşı', group: 'fitting', html: SVG_IZOLASYON,
        midPipe: true,
        place(im, pipe) { im.handleFittingPlacement({ pipe, point: pipe.p2, fittingType: 'izolasyon_flansi' }); },
    },
    regulator: {
        label: 'Regülatör', group: 'fitting', html: SVG_REGULATOR,
        midPipe: true,
        place(im, pipe) { im.handleRegulatorPlacement({ pipe, point: pipe.p2 }, { addAccessories: false }); },
    },
    regulator_grup: {
        label: 'Reg. Grubu', group: 'fitting', html: SVG_REGULATOR,
        midPipe: true,
        place(im, pipe) { im.handleRegulatorPlacement({ pipe, point: pipe.p2 }, { addAccessories: true }); },
    },
    filtre: {
        label: 'Filtre', group: 'fitting', html: SVG_FILTRE,
        midPipe: true,
        place(im, pipe) { im.handleFittingPlacement({ pipe, point: pipe.p2, fittingType: 'filtre' }); },
    },
    manometre: {
        label: 'Manometre', group: 'fitting', html: SVG_MANOMETRE,
        midPipe: true,
        place(im, pipe) { im.handleFittingPlacement({ pipe, point: pipe.p2, fittingType: 'manometre' }); },
    },
    kompansator: {
        label: 'Kompansatör', group: 'fitting', html: SVG_KOMPANSATOR,
        midPipe: true,
        place(im, pipe) { im.handleFittingPlacement({ pipe, point: pipe.p2, fittingType: 'kompansator' }); },
    },
};

const GROUP_LABELS = { meter: 'Sayaç-Vana', device: 'Cihaz', fitting: 'Tesisat' };
const GROUPS = ['meter', 'device', 'fitting'];
const MAX_PER_GROUP = 8;

const DEFAULT_CONFIG = {
    meter:   ['sayac', 'inis_sayac', 'vana_akv', 'vana_bransman', 'vana_emniyet'],
    device:  ['ocak', 'kombi', 'inis_ocak', 'inis_kombi'],
    fitting: ['topraklama', 'izolasyon_flansi', 'regulator', 'regulator_grup'],
};

// ─── Kombo placement helper'ları ─────────────────────────────────────────────
// plumbing-context-menu.js'deki internal placeInisVeSayac / placeInisVeCihaz
// ile aynı sözleşmeyi sürdürür (oradakiler export değil).

function _placeInisVeSayac(interactionManager, pipe) {
    saveState();
    const manager = interactionManager.manager;
    const INIS_CM = 30;
    const junctionNode = pipe.p2;
    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();
    manager.placeMeterAtOpenEnd({ pipe: inisBoru, end: 'p2', point: inisBoru.p2 });
    manager.saveToState();
    if (state.currentDrawingMode !== 'KARMA') setDrawingMode('TESİSAT');
    setMode('plumbingV2', true);
}

function _placeInisVeCihaz(interactionManager, pipe, cihazTipi) {
    saveState();
    const manager = interactionManager.manager;
    const INIS_CM = 100;
    const junctionNode = pipe.p2;
    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();
    manager.placeDeviceAtOpenEnd(cihazTipi, { pipe: inisBoru, end: 'p2', point: inisBoru.p2 });
    manager.saveToState();
}

// Aktif çizimde son çizilmiş açık ucu döndür (lastDrawnOpenEnd benzeri)
function _activeDrawingOpenEnd(im) {
    if (!im || !im.boruCizimAktif || !im.boruBaslangic) return null;
    const { kaynakTip, kaynakId, nokta } = im.boruBaslangic;
    if (kaynakTip !== BAGLANTI_TIPLERI.BORU || !kaynakId || !nokta) return null;
    const pipe = im.manager.pipes.find(p => p.id === kaynakId);
    if (!pipe) return null;
    const d1 = Math.hypot(pipe.p1.x - nokta.x, pipe.p1.y - nokta.y, (pipe.p1.z || 0) - (nokta.z || 0));
    const d2 = Math.hypot(pipe.p2.x - nokta.x, pipe.p2.y - nokta.y, (pipe.p2.z || 0) - (nokta.z || 0));
    const end = d1 < d2 ? 'p1' : 'p2';
    return { pipe, end, point: pipe[end] };
}

function _resumeDrawingFromOpenEnd(im, openEnd) {
    if (!im || !openEnd?.pipe || !openEnd.point) return;
    if (state.currentDrawingMode !== 'KARMA') setDrawingMode('TESİSAT');
    im.startBoruCizim(
        { x: openEnd.point.x, y: openEnd.point.y, z: openEnd.point.z || 0 },
        openEnd.pipe.id,
        BAGLANTI_TIPLERI.BORU,
        openEnd.pipe.colorGroup || 'YELLOW'
    );
    im.manager.activeTool = 'boru';
    setMode('plumbingV2', true);
}

// ─── Konfigürasyon ──────────────────────────────────────────────────────────

function _cloneDefaults() {
    const out = {};
    for (const g of GROUPS) out[g] = [...DEFAULT_CONFIG[g]];
    return out;
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return _cloneDefaults();
        const parsed = JSON.parse(raw);
        const out = {};
        for (const g of GROUPS) {
            const arr = Array.isArray(parsed?.[g]) ? parsed[g] : DEFAULT_CONFIG[g];
            out[g] = arr.filter(k => KIND_REGISTRY[k] && KIND_REGISTRY[k].group === g).slice(0, MAX_PER_GROUP);
        }
        return out;
    } catch {
        return _cloneDefaults();
    }
}

function saveConfig(cfg) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch { /* sessiz */ }
}

let _config = null;
function getConfig() {
    if (!_config) _config = loadConfig();
    return _config;
}

// ─── DOM yardımcıları ───────────────────────────────────────────────────────

function _btnEl() { if (_btn) return _btn; _btn = document.getElementById('plumbing-quick-add-objects'); return _btn; }
function _panelEl() { if (_panel) return _panel; _panel = document.getElementById('plumbing-quick-add-palette'); return _panel; }

function _scheduleHide() {
    clearTimeout(_hideHoverTimer);
    _hideHoverTimer = setTimeout(() => {
        if (!_hoverOpen) return;
        if (_pickerEl && _pickerEl.style.display !== 'none') return; // picker açıkken kapatma
        _hoverOpen = false;
        const p = _panelEl();
        if (p) p.style.display = 'none';
        _closePicker();
    }, 220);
}

function _cancelScheduledHide() { clearTimeout(_hideHoverTimer); }

function _openPanel() {
    _cancelScheduledHide();
    const p = _panelEl();
    if (!p) return;
    _hoverOpen = true;
    p.style.display = 'flex';
    renderPalette();
    updateQuickAddPalettePosition();
}

// ─── Render ─────────────────────────────────────────────────────────────────

function _slotInnerHtml(kind) {
    return `${kind.html}<span class="qap-label">${kind.label}</span>`;
}

function renderPalette() {
    const panel = _panelEl();
    if (!panel) return;
    const cfg = getConfig();
    for (const group of GROUPS) {
        const col = panel.querySelector(`.qap-col[data-group="${group}"]`);
        if (!col) continue;
        const head = col.querySelector('.qap-col-label');
        if (head) head.textContent = GROUP_LABELS[group] || group;
        const slots = col.querySelector('.qap-slots');
        slots.innerHTML = '';
        const list = cfg[group];
        for (let i = 0; i < list.length; i++) {
            const kindId = list[i];
            const kind = KIND_REGISTRY[kindId];
            if (!kind) continue;
            const slot = document.createElement('div');
            slot.className = 'qap-slot';
            slot.title = kind.label;
            slot.dataset.kind = kindId;
            slot.dataset.group = group;
            slot.dataset.index = String(i);
            slot.innerHTML = _slotInnerHtml(kind) + `<button class="qap-remove" title="Kaldır" aria-label="Kaldır">×</button>`;
            slots.appendChild(slot);
        }
        if (list.length < MAX_PER_GROUP) {
            const adder = document.createElement('div');
            adder.className = 'qap-add';
            adder.dataset.group = group;
            adder.title = 'Bu gruba nesne ekle';
            adder.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>`;
            slots.appendChild(adder);
        }
    }
}

// ─── Picker (+ tıklayınca açılan seçici) ────────────────────────────────────

function _ensurePicker() {
    if (_pickerEl) return _pickerEl;
    _pickerEl = document.createElement('div');
    _pickerEl.id = 'plumbing-quick-add-picker';
    _pickerEl.className = 'plumbing-quick-picker';
    _pickerEl.style.display = 'none';
    _pickerEl.addEventListener('mouseenter', _cancelScheduledHide);
    _pickerEl.addEventListener('mouseleave', _scheduleHide);
    _pickerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.qap-pick-item');
        if (!item || item.classList.contains('qap-pick-disabled')) return;
        const kindId = item.dataset.kind;
        const group = item.dataset.group;
        if (!kindId || !group) return;
        const cfg = getConfig();
        if (cfg[group].length >= MAX_PER_GROUP) { _closePicker(); return; }
        if (!cfg[group].includes(kindId)) cfg[group].push(kindId);
        saveConfig(cfg);
        renderPalette();
        _closePicker();
    });
    document.body.appendChild(_pickerEl);
    return _pickerEl;
}

function _openPicker(group, anchorEl) {
    const el = _ensurePicker();
    const cfg = getConfig();
    const inUse = new Set(cfg[group] || []);
    const items = Object.entries(KIND_REGISTRY)
        .filter(([, k]) => k.group === group)
        .map(([id, k]) => {
            const disabled = inUse.has(id);
            return `<div class="qap-pick-item${disabled ? ' qap-pick-disabled' : ''}" data-kind="${id}" data-group="${group}" title="${k.label}${disabled ? ' (zaten ekli)' : ''}">${_slotInnerHtml(k)}</div>`;
        }).join('');
    el.innerHTML = `<div class="qap-pick-head">${GROUP_LABELS[group] || group} — Ekle</div><div class="qap-pick-grid">${items}</div>`;
    el.style.display = 'block';
    // Konumlandır: adder butonun sağına; ekran taşıyorsa soluna
    const r = anchorEl.getBoundingClientRect();
    const pw = el.offsetWidth || 260;
    const ph = el.offsetHeight || 200;
    let left = r.right + 8;
    let top = r.top - 8;
    if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    if (top < 8) top = 8;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function _closePicker() {
    if (_pickerEl) _pickerEl.style.display = 'none';
}

// ─── Init ───────────────────────────────────────────────────────────────────

function _initOnce(interactionManager) {
    _interactionManager = interactionManager;
    if (_initialized) return;
    const btn = _btnEl();
    const panel = _panelEl();
    if (!btn || !panel) return;
    _initialized = true;

    btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    btn.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });
    btn.addEventListener('mouseenter', _openPanel);
    btn.addEventListener('mouseleave', _scheduleHide);
    btn.addEventListener('click', (e) => { e.stopPropagation(); _openPanel(); });

    panel.addEventListener('mouseenter', () => { _cancelScheduledHide(); _hoverOpen = true; });
    panel.addEventListener('mouseleave', _scheduleHide);
    panel.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    panel.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

    panel.addEventListener('click', (e) => {
        e.stopPropagation();

        // "Boru" çizim kısayolu
        if (e.target.closest('.qap-draw-shortcut')) {
            _activateDrawingFromAnchor();
            return;
        }

        // "+" → picker
        const adder = e.target.closest('.qap-add');
        if (adder) {
            _openPicker(adder.dataset.group, adder);
            return;
        }

        // "×" → kaldır
        const removeBtn = e.target.closest('.qap-remove');
        if (removeBtn) {
            const slot = removeBtn.closest('.qap-slot');
            if (!slot) return;
            const group = slot.dataset.group;
            const idx = parseInt(slot.dataset.index, 10);
            const cfg = getConfig();
            if (Number.isFinite(idx) && cfg[group]) {
                cfg[group].splice(idx, 1);
                saveConfig(cfg);
                renderPalette();
            }
            return;
        }

        // Slot → yerleştir
        const slot = e.target.closest('.qap-slot');
        if (!slot) return;
        const kindId = slot.dataset.kind;
        const kind = KIND_REGISTRY[kindId];
        if (!kind) return;
        _placeKind(kind);
    });

    // Dış tık picker'ı kapatsın
    document.addEventListener('click', (e) => {
        if (!_pickerEl || _pickerEl.style.display === 'none') return;
        if (_pickerEl.contains(e.target)) return;
        if (panel.contains(e.target)) return;
        _closePicker();
    }, true);
}

// ─── Yerleştirme orkestrasyonu ──────────────────────────────────────────────

function _resolveAnchorPipe() {
    const im = _interactionManager;
    if (!im) return null;
    if (_mode === 'drawing') {
        const open = _activeDrawingOpenEnd(im);
        if (open) return { pipe: open.pipe, end: open.end, point: open.point };
        return null;
    }
    const pipe = _anchorPipeId ? im.manager?.findPipeById(_anchorPipeId) : null;
    if (!pipe) return null;
    return { pipe, end: 'p2', point: pipe.p2 };
}

function _placeKind(kind) {
    const im = _interactionManager;
    if (!im || !kind) return;
    const anchor = _resolveAnchorPipe();
    if (!anchor) { hideQuickAddPalette(); return; }

    // Drawing modunda mid-pipe nesne sonrası çizimi aynı uçtan sürdürmek için
    // anchor bilgisini önceden saklıyoruz; place() handlerları cancelCurrentAction
    // çağırıyor.
    const wasDrawing = !!im.boruCizimAktif;
    const resumeInfo = (wasDrawing && kind.midPipe) ? { pipe: anchor.pipe, point: anchor.point } : null;

    try {
        // Kind içindeki place() pipe.p2'yi anchor olarak alıyor; drawing modunda
        // anchor uç p1 ise pipe.p2 yanlış olur. Çağrıdan önce yerel bir pipe
        // proxy'si oluşturmak yerine, yalnızca p2 uç için olan default akışta
        // anchor.end zaten 'p2' (selection veya drawing'in son segmenti).
        // Drawing'de son segmentin nokta'sı boruBaslangic.nokta; lastDrawnOpenEnd
        // bunu uca map'liyor. Eğer end='p1' ise bunu place() içinde özellikle
        // çağırmak için handler sözleşmesini bozmadan: yer değiştir.
        if (anchor.end === 'p1') {
            // place() fonksiyonları pipe.p2 baz alıyor; p1 ucu hedef ise
            // geçici olarak pipe.p1/p2'yi swap'lamak yerine, doğrudan
            // handler'ları manuel çağıralım.
            _placeKindAtP1(kind, anchor);
        } else {
            kind.place(im, anchor.pipe);
        }
    } catch (err) {
        console.warn('[quick-add-palette] yerleştirme hatası:', err);
    }

    // Mid-pipe ise çizimi aynı uçtan sürdür. Sayaç (sayac/inis_sayac) yerleştirmesi
    // placeMeterAtOpenEnd içinde sayaç ÇIKIŞINDAN otomatik startBoruCizim yapıyor
    // → boruCizimAktif true kalır; o durumda palette'i kapatma, çünkü
    // showQuickAddPaletteForDrawing tetik butonunu yeni anchor'a taşıyor.
    // Cihaz / branşman / iniş+cihaz (terminal) ise boruCizimAktif=false olur ve
    // burada paleti gizleriz.
    if (resumeInfo) {
        _resumeDrawingFromOpenEnd(im, resumeInfo);
    } else if (!im.boruCizimAktif) {
        hideQuickAddPalette();
    }
}

// p1 ucu hedef olduğunda yerleştirme (drawing son segmenti p1 yönünde bittiyse).
// Handler sözleşmeleri 'p2' point'iyle aynı; sadece point parametresini değiştirip
// uygun varyantı seç.
function _placeKindAtP1(kind, anchor) {
    const im = _interactionManager;
    const pipe = anchor.pipe;
    const point = anchor.point; // = pipe.p1
    const id = Object.entries(KIND_REGISTRY).find(([, v]) => v === kind)?.[0];
    if (!id) return;

    switch (id) {
        case 'sayac':
            saveState();
            im.manager.placeMeterAtOpenEnd({ pipe, end: 'p1', point });
            im.manager.saveToState();
            return;
        case 'ocak':
        case 'kombi':
            saveState();
            im.manager.placeDeviceAtOpenEnd(id.toUpperCase(), { pipe, end: 'p1', point });
            im.manager.saveToState();
            return;
        case 'inis_sayac':
            _placeInisVeSayacAtEnd(im, pipe, 'p1');
            return;
        case 'inis_ocak':
            _placeInisVeCihazAtEnd(im, pipe, 'OCAK', 'p1');
            return;
        case 'inis_kombi':
            _placeInisVeCihazAtEnd(im, pipe, 'KOMBI', 'p1');
            return;
        case 'vana_akv':
            im.handleVanaPlacement({ pipe, point, vanaTipi: 'AKV' });
            return;
        case 'vana_bransman':
            im.handleVanaPlacement({ pipe, point, vanaTipi: 'BRANSMAN' });
            return;
        case 'vana_emniyet':
            im.handleVanaPlacement({ pipe, point, vanaTipi: 'EMNIYET' });
            return;
        case 'vana_selenoid':
            im.handleVanaPlacement({ pipe, point, vanaTipi: 'SELENOID' });
            return;
        case 'topraklama':
        case 'izolasyon_flansi':
        case 'filtre':
        case 'manometre':
        case 'kompansator':
            im.handleFittingPlacement({ pipe, point, fittingType: id });
            return;
        case 'regulator':
            im.handleRegulatorPlacement({ pipe, point }, { addAccessories: false });
            return;
        case 'regulator_grup':
            im.handleRegulatorPlacement({ pipe, point }, { addAccessories: true });
            return;
    }
}

function _placeInisVeSayacAtEnd(im, pipe, end) {
    saveState();
    const manager = im.manager;
    const INIS_CM = 30;
    const junctionNode = pipe[end];
    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    if (end === 'p1') pipe.baslangicBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    else pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();
    manager.placeMeterAtOpenEnd({ pipe: inisBoru, end: 'p2', point: inisBoru.p2 });
    manager.saveToState();
    if (state.currentDrawingMode !== 'KARMA') setDrawingMode('TESİSAT');
    setMode('plumbingV2', true);
}

function _placeInisVeCihazAtEnd(im, pipe, cihazTipi, end) {
    saveState();
    const manager = im.manager;
    const INIS_CM = 100;
    const junctionNode = pipe[end];
    const inisBoru = new Boru(
        junctionNode,
        { x: junctionNode.x, y: junctionNode.y, z: (junctionNode.z || 0) - INIS_CM },
        pipe.boruTipi || 'STANDART'
    );
    inisBoru.colorGroup = pipe.colorGroup || 'YELLOW';
    inisBoru.floorId = pipe.floorId;
    manager.pipes.push(inisBoru);
    manager.registerPipeNodes(inisBoru);
    inisBoru.baslangicBaglanti = { tip: 'boru', hedefId: pipe.id };
    if (end === 'p1') pipe.baslangicBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    else pipe.bitisBaglanti = { tip: 'boru', hedefId: inisBoru.id };
    manager.recomputePipeParents();
    manager.placeDeviceAtOpenEnd(cihazTipi, { pipe: inisBoru, end: 'p2', point: inisBoru.p2 });
    manager.saveToState();
}

// ─── Çizim kısayolu ─────────────────────────────────────────────────────────
// Selection modunda anchor pipe.p2'den yeni hat başlatır; drawing modunda
// son uç noktadan tekrar başlatır (branch için).

function _activateDrawingFromAnchor() {
    const im = _interactionManager;
    if (!im) return;
    const anchor = _resolveAnchorPipe();
    if (!anchor) { hideQuickAddPalette(); return; }
    _resumeDrawingFromOpenEnd(im, { pipe: anchor.pipe, point: anchor.point });
    hideQuickAddPalette();
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Selection modu — boru seçilince çağır.
 */
export function maybeShowQuickAddPalette(interactionManager, worldPoint, pipe) {
    if (!interactionManager) return;
    _initOnce(interactionManager);
    const btn = _btnEl();
    if (!btn) return;

    const manager = interactionManager.manager;
    if (!manager || manager.activeTool || interactionManager.boruCizimAktif) {
        hideQuickAddPalette();
        return;
    }
    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickAddPalette(); return; }
    if (!pipe) { hideQuickAddPalette(); return; }

    _mode = 'pipe';
    _anchorPipeId = pipe.id;
    _drawingAnchor = null;
    btn.style.display = 'flex';
    _updateTriggerPosition();
}

/**
 * Drawing modu — aktif çizim sırasında, çizim ucuna yerleştirilir.
 */
export function showQuickAddPaletteForDrawing(interactionManager) {
    if (!interactionManager) return;
    _initOnce(interactionManager);
    const btn = _btnEl();
    if (!btn) return;
    const im = interactionManager;
    if (!im.boruCizimAktif || !im.boruBaslangic?.nokta) {
        hideQuickAddPalette();
        return;
    }
    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickAddPalette(); return; }

    _mode = 'drawing';
    _anchorPipeId = null;
    _drawingAnchor = { x: im.boruBaslangic.nokta.x, y: im.boruBaslangic.nokta.y };
    btn.style.display = 'flex';
    _updateTriggerPosition();
}

export function hideQuickAddPalette() {
    const btn = _btnEl();
    const panel = _panelEl();
    if (btn) btn.style.display = 'none';
    if (panel) panel.style.display = 'none';
    _closePicker();
    _anchorPipeId = null;
    _drawingAnchor = null;
    _hoverOpen = false;
}

export function updateQuickAddPalettePosition() {
    _updateTriggerPosition();
    if (_hoverOpen) _positionPanel();
}

// ─── Konumlandırma ──────────────────────────────────────────────────────────

function _updateTriggerPosition() {
    const btn = _btnEl();
    if (!btn) return;
    if (btn.style.display === 'none') return;

    const im = _interactionManager;
    if (!im) return;
    if (im.verticalModeActive) { hideQuickAddPalette(); return; }
    const t = (typeof state.viewBlendFactor === 'number') ? state.viewBlendFactor : 0;
    if (t > 0.01) { hideQuickAddPalette(); return; }

    let anchorWorld = null;
    let dirX = 0.7071, dirY = 0.7071;

    if (_mode === 'drawing') {
        if (!im.boruCizimAktif || !im.boruBaslangic?.nokta) { hideQuickAddPalette(); return; }
        _drawingAnchor = { x: im.boruBaslangic.nokta.x, y: im.boruBaslangic.nokta.y };
        anchorWorld = _drawingAnchor;
        // Drawing modunda iniş çıkış butonu kaynak boru gerisine (p1 yönü) konuyor.
        // Bu palet İLERİ tarafa — son boru p2 yönünün UZAGINA — konsun.
        const kaynakId = im.boruBaslangic?.kaynakId;
        const prevPipe = kaynakId ? im.manager?.findPipeById(kaynakId) : null;
        if (prevPipe && prevPipe.p1 && prevPipe.p2) {
            const d1 = Math.hypot(prevPipe.p1.x - anchorWorld.x, prevPipe.p1.y - anchorWorld.y);
            const d2 = Math.hypot(prevPipe.p2.x - anchorWorld.x, prevPipe.p2.y - anchorWorld.y);
            const nearEnd = d1 < d2 ? prevPipe.p1 : prevPipe.p2;
            const farEnd  = d1 < d2 ? prevPipe.p2 : prevPipe.p1;
            const bdx = nearEnd.x - farEnd.x;
            const bdy = nearEnd.y - farEnd.y;
            const blen = Math.hypot(bdx, bdy);
            if (blen > 0.5) { dirX = bdx / blen; dirY = bdy / blen; }
        }
    } else {
        if (im.manager?.activeTool || im.boruCizimAktif) { hideQuickAddPalette(); return; }
        const pipe = im.manager?.findPipeById(_anchorPipeId);
        if (!pipe) { hideQuickAddPalette(); return; }
        const curFloorId = state.currentFloor?.id;
        if (curFloorId && pipe.floorId && pipe.floorId !== curFloorId) { hideQuickAddPalette(); return; }
        anchorWorld = { x: pipe.p2.x, y: pipe.p2.y };
        const pdx = pipe.p2.x - pipe.p1.x;
        const pdy = pipe.p2.y - pipe.p1.y;
        const plen = Math.hypot(pdx, pdy);
        if (plen > 0.5) { dirX = pdx / plen; dirY = pdy / plen; }
    }

    const screen = worldToScreen(anchorWorld.x, anchorWorld.y);
    const rect = dom.c2d.getBoundingClientRect();
    const baseClientX = screen.x + rect.left;
    const baseClientY = screen.y + rect.top;

    let perpX = -dirY;
    let perpY = dirX;
    if (perpY > 0) { perpX = -perpX; perpY = -perpY; }

    const FWD = -50;
    const SIDE = -30;
    const bw = btn.offsetWidth || 22;
    const bh = btn.offsetHeight || 22;
    btn.style.left = `${baseClientX + dirX * FWD + perpX * SIDE - bw / 2}px`;
    btn.style.top  = `${baseClientY + dirY * FWD + perpY * SIDE - bh / 2}px`;
}

function _positionPanel() {
    const btn = _btnEl();
    const panel = _panelEl();
    if (!btn || !panel) return;
    if (panel.style.display === 'none') return;
    const br = btn.getBoundingClientRect();
    const pw = panel.offsetWidth || 260;
    const ph = panel.offsetHeight || 360;
    let left = br.right + 6;
    let top = br.top - 4;
    if (left + pw > window.innerWidth - 8) left = br.left - pw - 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    if (top < 8) top = 8;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}
