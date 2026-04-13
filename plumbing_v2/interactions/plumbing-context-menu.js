/**
 * plumbing-context-menu.js
 * Tesisat sağ tık bağlam menüsü
 */

import { saveState } from '../../general-files/history.js';
import { handlePipeCopy, handlePipeCut } from './keyboard-handler.js';
import { findBoruGovdeAt } from './finders.js';
import { Boru } from '../objects/pipe.js';
import { setMode, setDrawingMode, state } from '../../general-files/main.js';

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

// ─── Ghost mod başlatma: Sayaç ────────────────────────────────────────────

function autoPlaceSayac(interactionManager) {
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    interactionManager.manager.startPlacement('sayac');
    setMode("plumbingV2", true);
}

// ─── İniş + Ghost mod: Sayaç ─────────────────────────────────────────────

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
    manager.saveToState();

    // İniş eklendi, şimdi kullanıcı mouse ile sayacı yerleştirsin
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    manager.startPlacement('sayac');
    setMode("plumbingV2", true);
}

// ─── Ghost mod başlatma: Cihaz ────────────────────────────────────────────

function autoPlaceCihaz(interactionManager, cihazTipi) {
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    interactionManager.manager.startPlacement('cihaz', { cihazTipi });
    setMode("plumbingV2", true);
}

// ─── İniş + Ghost mod: Cihaz ─────────────────────────────────────────────

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
    manager.saveToState();

    // İniş eklendi, şimdi kullanıcı mouse ile cihazı yerleştirsin
    interactionManager.cancelCurrentAction();
    if (state.currentDrawingMode !== "KARMA") setDrawingMode("TESİSAT");
    manager.startPlacement('cihaz', { cihazTipi });
    setMode("plumbingV2", true);
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

    // ── Sayaç — ghost mod başlat ───────────────────────────────────────────
    document.getElementById('plumbing-sayac-DIREKT')?.addEventListener('click', () => {
        if (!menuState) return;
        autoPlaceSayac(menuState.interactionManager);
        hide();
    });

    // ── İniş + Sayaç — iniş ekle, sonra ghost mod ─────────────────────────
    document.getElementById('plumbing-inis-SAYAC')?.addEventListener('click', () => {
        if (!menuState) return;
        const pipe = getPipeTarget(menuState);
        if (pipe) placeInisVeSayac(menuState.interactionManager, pipe);
        hide();
    });

    // ── Cihaz — ghost mod başlat ───────────────────────────────────────────
    ['KOMBI', 'OCAK'].forEach(tip => {
        document.getElementById(`plumbing-cihaz-${tip}`)?.addEventListener('click', () => {
            if (!menuState) return;
            autoPlaceCihaz(menuState.interactionManager, tip);
            hide();
        });
    });

    // ── İniş + Cihaz — iniş ekle, sonra ghost mod ─────────────────────────
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

    const hasPipe = !!getPipeTarget(menuState);

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

        // Alt menülerin ekran dışına çıkmaması: menü sağ yarıdaysa solda aç
        const r2 = menuEl.getBoundingClientRect();
        if (r2.left + r2.width / 2 > window.innerWidth / 2) {
            menuEl.classList.add('submenu-flip-left');
        } else {
            menuEl.classList.remove('submenu-flip-left');
        }
    });

    // click-outside: once:true kullanmıyoruz; menü içi tıklamalarda listener kaybolmasın
    if (clickOutsideListener) {
        window.removeEventListener('pointerdown', clickOutsideListener, { capture: true });
    }
    setTimeout(() => {
        clickOutsideListener = (ev) => {
            if (menuEl && !menuEl.contains(ev.target)) hide();
        };
        window.addEventListener('pointerdown', clickOutsideListener, { capture: true });
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
