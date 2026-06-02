/**
 * Quick Add Palette
 * Boru ucunda yüzen küçük "+" tetikleyici; CLICK ile açılır (hover ile değil).
 *
 * Düz (gruplu olmayan) tek bir grid — kullanıcı paneli yatay yeniden boyutlandırarak
 * yan yana 1–5 ikona kadar daraltıp genişletebilir. Çizim slotu her zaman en üstte
 * sabit durur; kullanıcı silemez/taşıyamaz.
 *
 * Görünürlük modları:
 *  - 'pipe'    — bir boru seçildiğinde, anchor = pipe.p2
 *  - 'drawing' — aktif çizim sırasında, anchor = boruBaslangic.nokta
 *
 * Slot click → ilgili nesne pipe ucuna yerleştirilir. terminal=true olan
 * kindler (cihazlar, branşman, iniş+cihaz, iniş+sayaç değil) yerleştirme
 * sonrası çizimi durdurur.
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
let _mode = 'pipe';
let _drawingAnchor = null;
let _initialized = false;
let _panelOpen = false;
let _dragState = null;        // { kindId, fromIndex }
const LS_KEY = 'plumbing.quickAddPalette.v4';
const LS_KEY_LEGACY_V3 = 'plumbing.quickAddPalette.v3';
const LS_KEY_LEGACY_V2 = 'plumbing.quickAddPalette.v2';
const LS_KEY_WIDTH = 'plumbing.quickAddPalette.width';

// ─── SVG ikon kütüphanesi ───────────────────────────────────────────────────

const SVG_SAYAC = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="4" y="6" width="16" height="16" rx="2" stroke-width="1.6"/><text x="12" y="17" text-anchor="middle" font-size="8" font-weight="bold" stroke="none" fill="currentColor">G4</text><path d="M 9 5 L 9 2 M 9 2 L 6 2" stroke-width="2" stroke-linecap="round"/><path d="M 15 5 L 15 2 M 15 2 L 18 2" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_VANA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M 12 12 l-5-4 v8 Z"/><path d="M 12 12 l5-4 v8 Z"/></svg>`;
const SVG_KOMBI = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><circle cx="12" cy="12" r="11" stroke-width="1.5"/><circle cx="12" cy="12" r="8" stroke-width="1.5"/><text x="12" y="15" text-anchor="middle" font-size="10" font-weight="bold" stroke="none" fill="currentColor">G</text></svg>`;
const SVG_OCAK = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke-width="1.5"/><circle cx="9" cy="9" r="2" stroke-width="1"/><circle cx="15" cy="9" r="2" stroke-width="1"/><circle cx="9" cy="15" r="2" stroke-width="1"/><circle cx="15" cy="15" r="2" stroke-width="1"/></svg>`;
const SVG_SOBA = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.2"><rect x="2" y="8" width="20" height="9"/><line x1="6" y1="8" x2="6" y2="17" stroke-width="1.6"/><line x1="10" y1="8" x2="10" y2="17" stroke-width="1.6"/><line x1="14" y1="8" x2="14" y2="17" stroke-width="1.6"/><line x1="18" y1="8" x2="18" y2="17" stroke-width="1.6"/></svg>`;
const SVG_SOFBEN = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.2"><circle cx="12" cy="12" r="8"/><text x="12" y="16" text-anchor="middle" font-size="12" font-weight="bold" stroke="none" fill="currentColor">G</text></svg>`;
const SVG_KAZAN = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.2"><rect x="2" y="9" width="3" height="6" stroke-width="1.8"/><rect x="6" y="6" width="16" height="12"/><rect x="8.5" y="8.5" width="11" height="7" stroke-width="1.2"/></svg>`;
const SVG_TICARI = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2.2"><rect x="2" y="5" width="20" height="14"/><rect x="5" y="8" width="3" height="3" stroke-width="1.4"/><rect x="10" y="8" width="3" height="3" stroke-width="1.4"/><rect x="15" y="8" width="3" height="3" stroke-width="1.4"/><rect x="5" y="13" width="3" height="3" stroke-width="1.4"/><rect x="10" y="13" width="3" height="3" stroke-width="1.4"/><rect x="15" y="13" width="3" height="3" stroke-width="1.4"/></svg>`;
const SVG_REGULATOR = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="0" y1="12" x2="3" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="24" y2="12" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="9" stroke-width="1.6"/><path d="M 16 12 L 9 8 L 9 16 Z" fill="currentColor" stroke="none"/></svg>`;
const SVG_TOPRAKLAMA = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="2" y1="18" x2="22" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="18" x2="13" y2="10" stroke-width="1.6" stroke-linecap="round"/><line x1="13" y1="10" x2="9" y2="10" stroke-width="1.6" stroke-linecap="round"/><line x1="9" y1="14" x2="9" y2="6" stroke-width="1.6" stroke-linecap="round"/><line x1="7" y1="12" x2="7" y2="8" stroke-width="1.4" stroke-linecap="round"/><line x1="5" y1="11" x2="5" y2="9" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const SVG_IZOLASYON = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="12" y1="2" x2="12" y2="8" stroke-width="2"/><line x1="12" y1="16" x2="12" y2="22" stroke-width="2"/><line x1="6" y1="10" x2="18" y2="10" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="14" x2="18" y2="14" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_FILTRE = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="2" y1="12" x2="7" y2="12" stroke-width="2"/><line x1="17" y1="12" x2="22" y2="12" stroke-width="2"/><rect x="6" y="6" width="12" height="12" stroke-width="1.4" fill="currentColor" fill-opacity="0.15"/><circle cx="9" cy="9" r="0.7" fill="currentColor"/><circle cx="12" cy="9" r="0.7" fill="currentColor"/><circle cx="15" cy="9" r="0.7" fill="currentColor"/><circle cx="9" cy="12" r="0.7" fill="currentColor"/><circle cx="12" cy="12" r="0.7" fill="currentColor"/><circle cx="15" cy="12" r="0.7" fill="currentColor"/><circle cx="9" cy="15" r="0.7" fill="currentColor"/><circle cx="12" cy="15" r="0.7" fill="currentColor"/><circle cx="15" cy="15" r="0.7" fill="currentColor"/></svg>`;
const SVG_MANOMETRE = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="8" y1="20" x2="16" y2="20" stroke-width="1"/><line x1="12" y1="20" x2="12" y2="13" stroke-width="1.6"/><circle cx="12" cy="9" r="4" stroke-width="1.2"/><line x1="12" y1="9" x2="14.2" y2="7" stroke-width="1.2" stroke-linecap="round"/></svg>`;
const SVG_KOMPANSATOR = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><line x1="1" y1="12" x2="3" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="23" y2="12" stroke-width="2" stroke-linecap="round"/><line x1="6" y1="12" x2="9" y2="6" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="6" x2="13" y2="18" stroke-width="2" stroke-linecap="round"/><line x1="13" y1="18" x2="17" y2="12" stroke-width="2" stroke-linecap="round"/></svg>`;
const SVG_INIS_OK = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><path d="M12 3v15M12 18l-4-5M12 18l4-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_BORU = `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none"><rect x="3" y="9" width="18" height="6" rx="1" stroke-width="1.6"/><line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 2" stroke-width="1"/></svg>`;

function _inisCombosSvg(innerSvg) {
    return `<span class="qap-combo">
        <span class="qap-combo-top">${SVG_INIS_OK}</span>
        <span class="qap-combo-bot">${innerSvg}</span>
    </span>`;
}

// ─── Kind kayıtları ─────────────────────────────────────────────────────────
// category sadece picker'da görsel gruplama içindir.

const KIND_REGISTRY = {
    sayac: {
        label: 'Sayaç', category: 'meter', html: SVG_SAYAC,
        terminal: false, hasOutput: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeMeterAtOpenEnd({ pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    inis_sayac: {
        label: 'İniş + Sayaç', category: 'meter', html: _inisCombosSvg(SVG_SAYAC),
        terminal: false, hasOutput: true,
        place(im, pipe, end = 'p2') { _placeInisVeSayacAtEnd(im, pipe, end); },
    },
    vana_akv: {
        label: 'AKV', chip: 'AKV', category: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleVanaPlacement({ pipe, point: pipe[end], vanaTipi: 'AKV' }); },
    },
    vana_bransman: {
        label: 'Branşman', chip: 'BR', category: 'meter', html: SVG_VANA,
        terminal: true,
        place(im, pipe, end = 'p2') { im.handleVanaPlacement({ pipe, point: pipe[end], vanaTipi: 'BRANSMAN' }); },
    },
    vana_emniyet: {
        label: 'Emniyet', chip: 'EMN', category: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleVanaPlacement({ pipe, point: pipe[end], vanaTipi: 'EMNIYET' }); },
    },
    vana_selenoid: {
        label: 'Selenoid', chip: 'SL', category: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleVanaPlacement({ pipe, point: pipe[end], vanaTipi: 'SELENOID' }); },
    },
    vana_sismik: {
        label: 'Sismik', chip: 'SS', category: 'meter', html: SVG_VANA,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleVanaPlacement({ pipe, point: pipe[end], vanaTipi: 'SISMIK' }); },
    },

    ocak: {
        label: 'Ocak', category: 'device', html: SVG_OCAK,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('OCAK', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    kombi: {
        label: 'Kombi', category: 'device', html: SVG_KOMBI,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('KOMBI', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    inis_ocak: {
        label: 'İniş + Ocak', category: 'device', html: _inisCombosSvg(SVG_OCAK),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'OCAK', end); },
    },
    inis_kombi: {
        label: 'İniş + Kombi', category: 'device', html: _inisCombosSvg(SVG_KOMBI),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'KOMBI', end); },
    },

    // ─── DİĞER YAKICI CİHAZLAR ──────────────────────────────────────────────
    soba: {
        label: 'Soba', category: 'fuel_device', html: SVG_SOBA,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('SOBA', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    sofben: {
        label: 'Şofben', category: 'fuel_device', html: SVG_SOFBEN,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('SOFBEN', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    kazan: {
        label: 'Kazan', category: 'fuel_device', html: SVG_KAZAN,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('KAZAN', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    ticari: {
        label: 'Ticari Cihaz', category: 'fuel_device', html: SVG_TICARI,
        terminal: true,
        place(im, pipe, end = 'p2') {
            saveState();
            im.manager.placeDeviceAtOpenEnd('TICARI', { pipe, end, point: pipe[end] });
            im.manager.saveToState();
        },
    },
    inis_soba: {
        label: 'İniş + Soba', category: 'fuel_device', html: _inisCombosSvg(SVG_SOBA),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'SOBA', end); },
    },
    inis_sofben: {
        label: 'İniş + Şofben', category: 'fuel_device', html: _inisCombosSvg(SVG_SOFBEN),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'SOFBEN', end); },
    },
    inis_kazan: {
        label: 'İniş + Kazan', category: 'fuel_device', html: _inisCombosSvg(SVG_KAZAN),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'KAZAN', end); },
    },
    inis_ticari: {
        label: 'İniş + Ticari', category: 'fuel_device', html: _inisCombosSvg(SVG_TICARI),
        terminal: true,
        place(im, pipe, end = 'p2') { _placeInisVeCihazAtEnd(im, pipe, 'TICARI', end); },
    },

    topraklama: {
        label: 'Topraklama', category: 'fitting', html: SVG_TOPRAKLAMA,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleFittingPlacement({ pipe, point: pipe[end], fittingType: 'topraklama' }); },
    },
    izolasyon_flansi: {
        label: 'İzolasyon Flanşı', category: 'fitting', html: SVG_IZOLASYON,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleFittingPlacement({ pipe, point: pipe[end], fittingType: 'izolasyon_flansi' }); },
    },
    regulator: {
        label: 'Regülatör', chip: 'R', category: 'fitting', html: SVG_REGULATOR,
        midPipe: true,
        place(im, pipe, end = 'p2') {
            const point = _offsetFromEnd(pipe, end, 25);
            im.handleRegulatorPlacement({ pipe, point }, { addAccessories: false });
        },
    },
    regulator_grup: {
        label: 'Reg. Grubu', chip: 'RG', category: 'fitting', html: SVG_REGULATOR,
        midPipe: true,
        place(im, pipe, end = 'p2') {
            const point = _offsetFromEnd(pipe, end, 25);
            im.handleRegulatorPlacement({ pipe, point }, { addAccessories: true });
        },
    },
    filtre: {
        label: 'Filtre', category: 'fitting', html: SVG_FILTRE,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleFittingPlacement({ pipe, point: pipe[end], fittingType: 'filtre' }); },
    },
    manometre: {
        label: 'Manometre', category: 'fitting', html: SVG_MANOMETRE,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleFittingPlacement({ pipe, point: pipe[end], fittingType: 'manometre' }); },
    },
    kompansator: {
        label: 'Kompansatör', category: 'fitting', html: SVG_KOMPANSATOR,
        midPipe: true,
        place(im, pipe, end = 'p2') { im.handleFittingPlacement({ pipe, point: pipe[end], fittingType: 'kompansator' }); },
    },
};

// Çizim slotu — config dışında, hep en üstte
const DRAW_KIND = { label: 'Çizim', html: SVG_BORU };

const CATEGORY_LABELS = {
    meter: 'Sayaç & Vana',
    device: 'Cihaz',
    fuel_device: 'Diğer Yakıcı Cihazlar',
    fitting: 'Tesisat'
};
const CATEGORY_ORDER = ['meter', 'device', 'fuel_device', 'fitting'];

const MAX_ITEMS = 32;
const DEFAULT_ITEMS = [
    'sayac', 'inis_sayac', 'vana_akv', 'vana_bransman', 'vana_emniyet',
    'ocak', 'kombi', 'inis_ocak', 'inis_kombi',
    'soba', 'sofben', 'kazan', 'ticari',
    'topraklama', 'izolasyon_flansi', 'regulator', 'regulator_grup',
];

// Panel genişliği sınırları (px). 1–5 ikon arası ayarlanabilir.
const SLOT_PX = 38;     // CSS .qap-slot width + gap için tahmini hücre
const PAD_PX = 12;      // panel iç padding + border
const MIN_PANEL_W = SLOT_PX + PAD_PX;            // ~50
const MAX_PANEL_W = SLOT_PX * 5 + PAD_PX;        // ~202
const DEFAULT_PANEL_W = SLOT_PX * 3 + PAD_PX;    // 3 ikon yan yana

// ─── Yardımcı: bir borunun ucundan iç tarafa offset noktası ─────────────────
function _offsetFromEnd(pipe, end, cm) {
    const e = (end === 'p1') ? 'p1' : 'p2';
    const o = (e === 'p1') ? 'p2' : 'p1';
    const dx = pipe[o].x - pipe[e].x;
    const dy = pipe[o].y - pipe[e].y;
    const dz = (pipe[o].z || 0) - (pipe[e].z || 0);
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return { x: pipe[e].x, y: pipe[e].y, z: pipe[e].z || 0 };
    const k = Math.min(cm, len * 0.5) / len;
    return {
        x: pipe[e].x + dx * k,
        y: pipe[e].y + dy * k,
        z: (pipe[e].z || 0) + dz * k,
    };
}

// ─── Kombo placement helper'ları ─────────────────────────────────────────────

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

function _cleanItems(arr) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const k of arr) {
        if (k === 'cizim') continue;             // eski rezerve isim
        if (!KIND_REGISTRY[k]) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(k);
        if (out.length >= MAX_ITEMS) break;
    }
    return out;
}

function _migrateLegacyV3(parsed) {
    if (!Array.isArray(parsed)) return null;
    const flat = [];
    for (const g of parsed) {
        if (Array.isArray(g?.items)) flat.push(...g.items);
    }
    return _cleanItems(flat);
}

function _migrateLegacyV2(parsed) {
    if (!parsed || typeof parsed !== 'object') return null;
    const flat = [
        ...(Array.isArray(parsed.meter) ? parsed.meter : []),
        ...(Array.isArray(parsed.device) ? parsed.device : []),
        ...(Array.isArray(parsed.fitting) ? parsed.fitting : []),
    ];
    return _cleanItems(flat);
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const cleaned = _cleanItems(parsed);
            if (cleaned.length) return cleaned;
        }
        const v3Raw = localStorage.getItem(LS_KEY_LEGACY_V3);
        if (v3Raw) {
            const migrated = _migrateLegacyV3(JSON.parse(v3Raw));
            if (migrated && migrated.length) {
                try { localStorage.setItem(LS_KEY, JSON.stringify(migrated)); } catch { /* sessiz */ }
                return migrated;
            }
        }
        const v2Raw = localStorage.getItem(LS_KEY_LEGACY_V2);
        if (v2Raw) {
            const migrated = _migrateLegacyV2(JSON.parse(v2Raw));
            if (migrated && migrated.length) {
                try { localStorage.setItem(LS_KEY, JSON.stringify(migrated)); } catch { /* sessiz */ }
                return migrated;
            }
        }
    } catch { /* fallthrough */ }
    return [...DEFAULT_ITEMS];
}

function saveConfig(items) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* sessiz */ }
}

let _config = null;
function getConfig() {
    if (!_config) _config = loadConfig();
    return _config;
}

function _loadSavedWidth() {
    try {
        const raw = localStorage.getItem(LS_KEY_WIDTH);
        const v = raw ? parseFloat(raw) : NaN;
        if (isFinite(v) && v >= MIN_PANEL_W && v <= MAX_PANEL_W) return v;
    } catch { /* sessiz */ }
    return DEFAULT_PANEL_W;
}

function _saveWidth(w) {
    try { localStorage.setItem(LS_KEY_WIDTH, String(Math.round(w))); } catch { /* sessiz */ }
}

// ─── DOM yardımcıları ───────────────────────────────────────────────────────

function _btnEl() { if (_btn) return _btn; _btn = document.getElementById('plumbing-quick-add-objects'); return _btn; }
function _panelEl() { if (_panel) return _panel; _panel = document.getElementById('plumbing-quick-add-palette'); return _panel; }

function _openPanel() {
    const p = _panelEl();
    if (!p) return;
    _panelOpen = true;
    p.style.display = 'block';
    if (!p.style.width) p.style.width = `${_loadSavedWidth()}px`;
    renderPalette();
    updateQuickAddPalettePosition();
}

function _closePanel() {
    const p = _panelEl();
    if (p) p.style.display = 'none';
    _panelOpen = false;
    _closePicker();
}

function _togglePanel() {
    if (_panelOpen) _closePanel();
    else _openPanel();
}

// ─── Render ─────────────────────────────────────────────────────────────────

function _escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _slotInnerHtml(kind) {
    const chip = kind.chip ? `<span class="qap-chip">${kind.chip}</span>` : '';
    return `${kind.html}${chip}<span class="qap-label">${kind.label}</span>`;
}

function renderPalette() {
    const panel = _panelEl();
    if (!panel) return;
    const items = getConfig();

    // Çizim en üstte sabit
    const drawHtml = `<div class="qap-slot qap-action" data-action="draw" title="${DRAW_KIND.label}">${DRAW_KIND.html}</div>`;

    let gridHtml = '';
    for (let i = 0; i < items.length; i++) {
        const kindId = items[i];
        const kind = KIND_REGISTRY[kindId];
        if (!kind) continue;
        gridHtml += `<div class="qap-slot" draggable="true" data-kind="${kindId}" data-index="${i}" title="${_escapeAttr(kind.label)}">${_slotInnerHtml(kind)}</div>`;
    }
    // + butonu (her zaman, MAX_ITEMS dolu değilse)
    if (items.length < MAX_ITEMS) {
        gridHtml += `<div class="qap-add" data-action="add" title="Nesne ekle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg></div>`;
    }

    panel.innerHTML = `<div class="qap-action-row">${drawHtml}</div><div class="qap-grid">${gridHtml}</div>`;
}

// ─── Picker (+ tıklayınca açılan seçici) ────────────────────────────────────

function _ensurePicker() {
    if (_pickerEl) return _pickerEl;
    _pickerEl = document.createElement('div');
    _pickerEl.id = 'plumbing-quick-add-picker';
    _pickerEl.className = 'plumbing-quick-picker';
    _pickerEl.style.display = 'none';
    _pickerEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = e.target.closest('.qap-pick-item');
        if (!item) return;
        const kindId = item.dataset.kind;
        if (!kindId) return;
        const items = getConfig();
        const idx = items.indexOf(kindId);
        if (idx !== -1) {
            // Toggle off — listeden kaldır
            items.splice(idx, 1);
        } else {
            if (items.length >= MAX_ITEMS) return;
            items.push(kindId);
        }
        saveConfig(items);
        renderPalette();
        // Picker'ı kapatma — kullanıcı birden fazla toggle yapabilsin
        _refreshPicker();
    });
    document.body.appendChild(_pickerEl);
    return _pickerEl;
}

function _renderPickerContent(el) {
    const inUse = new Set(getConfig());
    const sections = CATEGORY_ORDER.map(cat => {
        const items = Object.entries(KIND_REGISTRY)
            .filter(([, k]) => k.category === cat)
            .map(([id, k]) => {
                const active = inUse.has(id);
                return `<div class="qap-pick-item${active ? ' qap-pick-active' : ''}" data-kind="${id}" title="${_escapeAttr(k.label)}${active ? ' — kaldırmak için tıkla' : ''}">${_slotInnerHtml(k)}</div>`;
            }).join('');
        return `<div class="qap-pick-section"><div class="qap-pick-section-head">${CATEGORY_LABELS[cat]}</div><div class="qap-pick-grid">${items}</div></div>`;
    }).join('');
    el.innerHTML = `<div class="qap-pick-head">Nesne Ekle / Kaldır</div>${sections}`;
}

function _refreshPicker() {
    if (!_pickerEl || _pickerEl.style.display === 'none') return;
    _renderPickerContent(_pickerEl);
}

function _openPicker(anchorEl) {
    const el = _ensurePicker();
    _renderPickerContent(el);
    el.style.display = 'block';

    const r = anchorEl.getBoundingClientRect();
    const pw = el.offsetWidth || 240;
    const ph = el.offsetHeight || 260;
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

// ─── Drag & Drop (düz liste reorder) ────────────────────────────────────────

function _clearDragMarkers() {
    const panel = _panelEl();
    if (!panel) return;
    panel.querySelectorAll('.qap-drop-before, .qap-drop-after, .qap-dragging').forEach(el => {
        el.classList.remove('qap-drop-before', 'qap-drop-after', 'qap-dragging');
    });
    // Drag/drop sonrası odak bazı tarayıcılarda yeşil/mavi outline bırakıyor
    try { document.activeElement?.blur?.(); } catch { /* sessiz */ }
}

function _handleDragStart(e) {
    const slot = e.target.closest('.qap-slot');
    if (!slot || slot.classList.contains('qap-action')) return;
    const kindId = slot.dataset.kind;
    const index = parseInt(slot.dataset.index, 10);
    if (!kindId || !Number.isFinite(index)) return;
    _dragState = { kindId, fromIndex: index };
    try { e.dataTransfer.setData('text/plain', kindId); } catch { /* sessiz */ }
    e.dataTransfer.effectAllowed = 'move';
    slot.classList.add('qap-dragging');
}

function _handleDragEnd(e) {
    const slot = e.target.closest('.qap-slot');
    if (slot) slot.classList.remove('qap-dragging');
    _clearDragMarkers();
    _dragState = null;
}

function _handleDragOver(e) {
    if (!_dragState) return;
    const slot = e.target.closest('.qap-slot:not(.qap-action)');
    if (!slot) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    _clearDragMarkers();
    const r = slot.getBoundingClientRect();
    const after = (e.clientX - r.left) > r.width / 2;
    slot.classList.add(after ? 'qap-drop-after' : 'qap-drop-before');
}

function _handleDrop(e) {
    if (!_dragState) return;
    e.preventDefault();
    e.stopPropagation();

    const targetSlot = e.target.closest('.qap-slot:not(.qap-action)');
    if (!targetSlot) { _clearDragMarkers(); _dragState = null; return; }

    const items = getConfig();
    const fromIdx = _dragState.fromIndex;
    let dstIndex = parseInt(targetSlot.dataset.index, 10);
    const r = targetSlot.getBoundingClientRect();
    const after = (e.clientX - r.left) > r.width / 2;
    if (after) dstIndex += 1;
    if (dstIndex > fromIdx) dstIndex -= 1;
    if (dstIndex === fromIdx) { _clearDragMarkers(); _dragState = null; return; }

    const [moved] = items.splice(fromIdx, 1);
    items.splice(Math.max(0, Math.min(items.length, dstIndex)), 0, moved);
    saveConfig(items);
    renderPalette();
    _clearDragMarkers();
    _dragState = null;
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
    btn.addEventListener('click', (e) => { e.stopPropagation(); _togglePanel(); });

    panel.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    panel.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); });

    panel.addEventListener('click', (e) => {
        e.stopPropagation();

        // + → picker
        const adder = e.target.closest('.qap-add');
        if (adder) { _openPicker(adder); return; }

        // Slot → yerleştir veya çizim aksiyonu
        const slot = e.target.closest('.qap-slot');
        if (!slot) return;
        if (slot.dataset.action === 'draw') { _activateDrawingFromAnchor(); return; }
        const kindId = slot.dataset.kind;
        const kind = KIND_REGISTRY[kindId];
        if (!kind) return;
        _placeKind(kind);
    });

    // Drag&drop
    panel.addEventListener('dragstart', _handleDragStart);
    panel.addEventListener('dragend', _handleDragEnd);
    panel.addEventListener('dragover', _handleDragOver);
    panel.addEventListener('drop', _handleDrop);
    panel.addEventListener('dragleave', (e) => {
        if (e.target === panel) _clearDragMarkers();
    });

    // Manuel resize'ı persist et
    if (typeof ResizeObserver !== 'undefined') {
        let lastW = null;
        const ro = new ResizeObserver(entries => {
            for (const ent of entries) {
                const w = ent.contentRect.width;
                if (lastW !== null && Math.abs(w - lastW) > 0.5) _saveWidth(panel.offsetWidth);
                lastW = w;
            }
        });
        ro.observe(panel);
    }

    // Dış tık panel/picker'ı kapatsın
    document.addEventListener('click', (e) => {
        if (!_panelOpen && (!_pickerEl || _pickerEl.style.display === 'none')) return;
        if (panel.contains(e.target)) return;
        if (_pickerEl && _pickerEl.contains(e.target)) return;
        if (btn.contains(e.target)) return;
        _closePanel();
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

    const wasDrawing = !!im.boruCizimAktif;
    const resumeInfo = (wasDrawing && kind.midPipe) ? { pipe: anchor.pipe, point: anchor.point } : null;

    try {
        kind.place(im, anchor.pipe, anchor.end);
    } catch (err) {
        console.warn('[quick-add-palette] yerleştirme hatası:', err);
    }

    if (kind.terminal) {
        try { im.cancelCurrentAction?.(); } catch { /* sessiz */ }
        setMode('select', true);
        hideQuickAddPalette();
        return;
    }

    if (resumeInfo) _resumeDrawingFromOpenEnd(im, resumeInfo);

    _closePanel();
    if (!im.boruCizimAktif) hideQuickAddPalette();
}

// ─── Çizim aksiyonu ─────────────────────────────────────────────────────────

function _activateDrawingFromAnchor() {
    const im = _interactionManager;
    if (!im) return;
    const anchor = _resolveAnchorPipe();
    if (!anchor) { hideQuickAddPalette(); return; }
    _resumeDrawingFromOpenEnd(im, { pipe: anchor.pipe, point: anchor.point });
    hideQuickAddPalette();
}

// ─── Public API ─────────────────────────────────────────────────────────────

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
    if (btn) btn.style.display = 'none';
    _closePanel();
    _anchorPipeId = null;
    _drawingAnchor = null;
}

export function updateQuickAddPalettePosition() {
    _updateTriggerPosition();
    if (_panelOpen) _positionPanel();
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
    if (perpY < 0) { perpX = -perpX; perpY = -perpY; }

    const FWD = -50;
    const SIDE = 20;
    const bw = btn.offsetWidth || 22;
    const bh = btn.offsetHeight || 22;
    const cx = baseClientX + dirX * FWD + perpX * SIDE;
    const cy = baseClientY + dirY * FWD + perpY * SIDE;
    btn.style.left = `${cx - bw / 2}px`;
    btn.style.top  = `${cy - bh / 2}px`;
}

function _positionPanel() {
    const btn = _btnEl();
    const panel = _panelEl();
    if (!btn || !panel) return;
    if (panel.style.display === 'none') return;
    const br = btn.getBoundingClientRect();
    const pw = panel.offsetWidth || 200;
    const ph = panel.offsetHeight || 200;
    let left = br.right + 6;
    let top = br.top - 4;
    if (left + pw > window.innerWidth - 8) left = br.left - pw - 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    if (top < 8) top = 8;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
}
