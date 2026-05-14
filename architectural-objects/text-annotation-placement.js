// text-annotation-placement.js
// "Projeye metin ekle" akışı:
//   1) Popup açılır → metin + boyut alınır.
//   2) Onaylanırsa sahnede yerleştirme moduna geçilir (mouse imleci ile takip).
//   3) Sol tık ile yerleştirilir; ESC ile iptal edilir.

import { showTextAnnotationPopup } from './text-annotation-popup.js';
import { createTextAnnotation } from './text-annotation.js';
import { state, setState, dom } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { draw2D } from '../draw/draw2d.js';
import { screenToWorld } from '../draw/geometry.js';

let pending = null; // { text, size } — yerleştirme bekleyen metin
let mouseMoveHandler = null;
let clickHandler = null;
let keyHandler = null;

export function isTextPlacementActive() {
    return !!pending;
}

export function getPendingTextAnnotation() {
    return pending;
}

export function startTextAnnotationPlacement() {
    showTextAnnotationPopup({
        title: 'Projeye Metin Ekle',
        initialText: '',
        initialSize: 'medium',
        onConfirm: ({ text, size }) => {
            const trimmed = (text || '').trim();
            if (!trimmed) return;
            beginPlacement({ text, size });
        }
    });
}

function beginPlacement(opts) {
    cancelPlacement();
    pending = { text: opts.text, size: opts.size };
    state._textPlacementPending = pending;
    setState({ isPlacingText: true });

    const c2d = dom.c2d;
    if (!c2d) return;

    mouseMoveHandler = (e) => {
        const rect = c2d.getBoundingClientRect();
        const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        setState({ textPlacementGhost: { x: pos.x, y: pos.y } });
        draw2D();
    };

    // pointerdown'u capture phase'de yakala — diğer handler'lardan önce işlesin
    clickHandler = (e) => {
        if (e.button !== 0) return; // sadece sol tık
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const rect = c2d.getBoundingClientRect();
        const pos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        const ann = createTextAnnotation(pos.x, pos.y, pending.text, pending.size);
        if (!state.textAnnotations) state.textAnnotations = [];
        state.textAnnotations.push(ann);
        saveState();
        cancelPlacement();
        draw2D();
    };

    keyHandler = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelPlacement();
            draw2D();
        }
    };

    c2d.addEventListener('mousemove', mouseMoveHandler);
    c2d.addEventListener('pointerdown', clickHandler, { capture: true });
    c2d.addEventListener('contextmenu', preventContext, { capture: true });
    window.addEventListener('keydown', keyHandler);
    c2d.style.cursor = 'crosshair';
}

function preventContext(e) {
    // Yerleştirme sırasında sağ tıklamanın menü açmasını engelle (ESC ile iptal edilir)
    e.preventDefault();
    e.stopPropagation();
}

export function cancelPlacement() {
    if (!pending) return;
    const c2d = dom.c2d;
    if (c2d) {
        if (mouseMoveHandler) c2d.removeEventListener('mousemove', mouseMoveHandler);
        if (clickHandler) c2d.removeEventListener('pointerdown', clickHandler, { capture: true });
        c2d.removeEventListener('contextmenu', preventContext, { capture: true });
        c2d.style.cursor = '';
    }
    if (keyHandler) window.removeEventListener('keydown', keyHandler);
    mouseMoveHandler = null;
    clickHandler = null;
    keyHandler = null;
    pending = null;
    state._textPlacementPending = null;
    setState({ textPlacementGhost: null, isPlacingText: false });
}
