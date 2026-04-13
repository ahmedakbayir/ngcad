/**
 * plumbing-context-menu.js
 * Tesisat sağ tık bağlam menüsü
 */

import { saveState } from '../../general-files/history.js';
import { handlePipeCopy, handlePipeCut } from './keyboard-handler.js';
import { findBoruGovdeAt } from './finders.js';
import { Boru } from '../objects/pipe.js';
import { createSayac } from '../objects/meter.js';
import { createCihaz } from '../objects/device.js';

let menuEl = null;
let menuState = null; // { worldPos, pipe, nokta, t, interactionManager }
let clickOutsideListener = null;

// ─── Yardımcı: borudaki t parametresini hesapla ───────────────────────────

function calcT(pipe, nokta) {
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return 0;
    const px = nokta.x - pipe.p1.x;
    const py = nokta.y - pipe.p1.y;
    const pz = (nokta.z || 0) - (pipe.p1.z || 0);
    return Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (len * len)));
}

// ─── Yardımcı: hedef boruyu döndür (sağ tıklanan veya seçili) ─────────────

function getPipeTarget(menuState) {
    if (menuState.pipe) return menuState.pipe;
    const sel = menuState.interactionManager?.selectedObject;
    if (sel && sel.type === 'boru') return sel;
    return null;
}

// ─── Yardımcı: boru yönü ve dikini hesapla ────────────────────────────────

function getPipeDir(pipe) {
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const len2d = Math.hypot(dx, dy);
    if (len2d < 0.01) {
        // Düşey boru: varsayılan perpendicular X yönünde
        return { nx: 1, ny: 0, perpX: 0, perpY: -1 };
    }
    const nx = dx / len2d;
    const ny = dy / len2d;
    return { nx, ny, perpX: -ny, perpY: nx };
}

// ─── Otomatik Yerleştirme: Sayaç ──────────────────────────────────────────

function autoPlaceSayac(interactionManager, pipe) {
    saveState();
    const manager = interactionManager.manager;
    const p2 = pipe.p2;
    const { perpX, perpY } = getPipeDir(pipe);
    const FLEKS = 15; // cm

    const sayac = createSayac(
        p2.x + perpX * FLEKS,
        p2.y + perpY * FLEKS,
        { z: p2.z || 0, floorId: pipe.floorId }
    );
    sayac.ghostConnectionInfo = {
        boruUcu: { boruId: pipe.id, uc: 'p2', nokta: p2, boru: pipe },
        girisNoktasi: p2
    };
    sayac.z = p2.z || 0;
    sayac.rotation = pipe.aciDerece || 0;

    const success = interactionManager.handleSayacEndPlacement(sayac);
    if (success) manager.saveToState();
}

// ─── Otomatik Yerleştirme: İniş + Sayaç ──────────────────────────────────

function placeInisVeSayac(interactionManager, pipe) {
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

    // İniş borusunun ucuna sayaç ekle (X yönünde ofset — düşey boru)
    const inisP2 = inisBoru.p2;
    const FLEKS = 15;
    const sayac = createSayac(
        inisP2.x + FLEKS,
        inisP2.y,
        { z: inisP2.z || 0, floorId: pipe.floorId }
    );
    sayac.ghostConnectionInfo = {
        boruUcu: { boruId: inisBoru.id, uc: 'p2', nokta: inisP2, boru: inisBoru },
        girisNoktasi: inisP2
    };
    sayac.z = inisP2.z || 0;

    const success = interactionManager.handleSayacEndPlacement(sayac);
    if (success) manager.saveToState();
}

// ─── Otomatik Yerleştirme: Cihaz ──────────────────────────────────────────

function autoPlaceCihaz(interactionManager, pipe, cihazTipi) {
    const p2 = pipe.p2;
    const { perpX, perpY } = getPipeDir(pipe);
    const OFFSET = 20; // cm

    const cihaz = createCihaz(
        p2.x + perpX * OFFSET,
        p2.y + perpY * OFFSET,
        cihazTipi,
        { z: p2.z || 0, floorId: pipe.floorId }
    );
    cihaz.ghostConnectionInfo = {
        boruUcu: { boruId: pipe.id, uc: 'p2', nokta: p2, boru: pipe },
        girisNoktasi: p2
    };
    cihaz.z = p2.z || 0;

    interactionManager.handleCihazEkleme(cihaz);
}

// ─── Otomatik Yerleştirme: İniş + Cihaz ──────────────────────────────────

function placeInisVeCihaz(interactionManager, pipe, cihazTipi) {
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

    // İniş borusunun ucuna cihaz ekle (X yönünde ofset — düşey boru)
    const inisP2 = inisBoru.p2;
    const OFFSET = 20;
    const cihaz = createCihaz(
        inisP2.x + OFFSET,
        inisP2.y,
        cihazTipi,
        { z: inisP2.z || 0, floorId: pipe.floorId }
    );
    cihaz.ghostConnectionInfo = {
        boruUcu: { boruId: inisBoru.id, uc: 'p2', nokta: inisP2, boru: inisBoru },
        girisNoktasi: inisP2
    };
    cihaz.z = inisP2.z || 0;

    interactionManager.handleCihazEkleme(cihaz);
}

// ─── Menü init ─────────────────────────────────────────────────────────────

function initMenu() {
    menuEl = document.getElementById('plumbing-context-menu');
    if (!menuEl) return;

    // ── Kes ────────────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-cut').addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.selectedObject = pipe;
            handlePipeCut.call(interactionManager);
        }
        hide();
    });

    // ── Kopyala ────────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-copy').addEventListener('click', () => {
        if (!menuState) return;
        const { interactionManager } = menuState;
        const pipe = getPipeTarget(menuState);
        if (pipe) {
            interactionManager.selectedObject = pipe;
            handlePipeCopy.call(interactionManager);
        }
        hide();
    });

    // ── Yapıştır ───────────────────────────────────────────────────────────
    // worldPos'a (sağ tık noktasına) yapıştır
    document.getElementById('plumbing-btn-paste').addEventListener('click', () => {
        if (!menuState) return;
        const { worldPos, interactionManager } = menuState;
        interactionManager._pasteSnapOverride = worldPos;
        interactionManager.handlePipePaste();
        interactionManager._pasteSnapOverride = null;
        hide();
    });

    // ── Hattı Böl ──────────────────────────────────────────────────────────
    document.getElementById('plumbing-btn-split').addEventListener('click', () => {
        if (!menuState) return;
        const { pipe, nokta, interactionManager } = menuState;
        if (pipe && nokta) interactionManager.handlePipeSplit(pipe, nokta, false);
        hide();
    });

    // ── Vana: AKV / EMNIYET / CIHAZ / SELENOID — tıklanan noktaya ─────────
    ['AKV', 'EMNIYET', 'CIHAZ', 'SELENOID'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const { pipe, nokta, t, interactionManager } = menuState;
            if (pipe && nokta) interactionManager.handleVanaPlacement({ pipe, point: nokta, t, vanaTipi: tip });
            hide();
        });
    });

    // ── Vana: BRANSMAN / YANBINA — hattın P2 ucuna ────────────────────────
    ['BRANSMAN', 'YANBINA'].forEach(tip => {
        document.getElementById(`plumbing-vana-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const pipe = getPipeTarget(menuState);
            if (pipe) menuState.interactionManager.handleVanaPlacement({ pipe, point: pipe.p2, t: 1.0, vanaTipi: tip });
            hide();
        });
    });

    // ── Sayaç — P2 ucuna otomatik ekle ────────────────────────────────────
    document.getElementById('plumbing-sayac-DIREKT')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) autoPlaceSayac(menuState.interactionManager, pipe);
        hide();
    });

    // ── İniş + Sayaç — P2 ucuna iniş + sayaç otomatik ekle ───────────────
    document.getElementById('plumbing-inis-SAYAC')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) placeInisVeSayac(menuState.interactionManager, pipe);
        hide();
    });

    // ── Cihaz — P2 ucuna otomatik ekle ────────────────────────────────────
    ['KOMBI', 'OCAK'].forEach(tip => {
        document.getElementById(`plumbing-cihaz-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const pipe = getPipeTarget(menuState);
            if (pipe) autoPlaceCihaz(menuState.interactionManager, pipe, tip);
            hide();
        });
    });

    // ── İniş + Cihaz — P2 ucuna iniş + cihaz otomatik ekle ───────────────
    ['KOMBI', 'OCAK'].forEach(tip => {
        document.getElementById(`plumbing-inis-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            const pipe = getPipeTarget(menuState);
            if (pipe) placeInisVeCihaz(menuState.interactionManager, pipe, tip);
            hide();
        });
    });
}

// ─── Göster / Gizle ────────────────────────────────────────────────────────

export function showPlumbingContextMenu(screenX, screenY, worldPos, interactionManager) {
    if (!menuEl) initMenu();
    if (!menuEl) return;

    const manager = interactionManager.manager;

    const hitResult = findBoruGovdeAt(manager, worldPos, 8);
    const pipe = hitResult ? manager.findPipeById(hitResult.boruId) : null;
    const nokta = hitResult ? hitResult.nokta : null;
    const t = (pipe && nokta) ? calcT(pipe, nokta) : 0;

    menuState = { worldPos, pipe, nokta, t, interactionManager };

    const hasPaste = !!(interactionManager.copiedPipes || interactionManager.cutPipes);
    const hasPipe = !!getPipeTarget(menuState);

    document.getElementById('plumbing-btn-paste').disabled = !hasPaste;
    document.getElementById('plumbing-btn-cut').disabled = !hasPipe;
    document.getElementById('plumbing-btn-copy').disabled = !hasPipe;
    document.getElementById('plumbing-btn-split').disabled = !pipe; // Böl sadece gövdeye tıklanınca

    menuEl.style.left = `${screenX + 5}px`;
    menuEl.style.top  = `${screenY + 5}px`;
    menuEl.style.display = 'block';

    requestAnimationFrame(() => {
        if (!menuEl) return;
        const r = menuEl.getBoundingClientRect();
        if (r.right  > window.innerWidth  - 8) menuEl.style.left = `${window.innerWidth  - r.width  - 8}px`;
        if (r.bottom > window.innerHeight - 8) menuEl.style.top  = `${window.innerHeight - r.height - 8}px`;
    });

    setTimeout(() => {
        clickOutsideListener = (ev) => {
            if (menuEl && !menuEl.contains(ev.target)) hide();
        };
        window.addEventListener('pointerdown', clickOutsideListener, { capture: true, once: true });
    }, 0);
}

function hide() {
    if (menuEl) menuEl.style.display = 'none';
    if (clickOutsideListener) {
        window.removeEventListener('pointerdown', clickOutsideListener, { capture: true });
        clickOutsideListener = null;
    }
    menuState = null;
}

export function hidePlumbingContextMenu() {
    hide();
}
