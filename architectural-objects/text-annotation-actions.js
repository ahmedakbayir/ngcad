// text-annotation-actions.js
// Metin notu için düzenleme, silme, sağ tık context menü işlemleri

import { showTextAnnotationPopup } from './text-annotation-popup.js';
import { state, setState } from '../general-files/main.js';
import { saveState } from '../general-files/history.js';
import { draw2D } from '../draw/draw2d.js';

let contextMenuEl = null;
let contextMenuOutsideListener = null;

export function openTextAnnotationEditor(annotation, x, y) {
    if (!annotation) return;
    showTextAnnotationPopup({
        title: 'Metni Düzenle',
        initialText: annotation.text || '',
        initialSize: annotation.size || 'medium',
        x: x,
        y: y,
        onConfirm: ({ text, size }) => {
            const trimmed = (text || '').trim();
            if (!trimmed) {
                // Boş metin → sil
                deleteTextAnnotation(annotation);
            } else {
                annotation.text = text;
                annotation.size = size;
                saveState();
                draw2D();
            }
        }
    });
}

export function deleteTextAnnotation(annotation) {
    if (!annotation) return;
    const idx = (state.textAnnotations || []).indexOf(annotation);
    if (idx === -1) return;
    state.textAnnotations.splice(idx, 1);
    if (state.selectedObject?.type === 'textAnnotation' && state.selectedObject.object === annotation) {
        setState({ selectedObject: null });
    }
    saveState();
    draw2D();
}

function hideContextMenu() {
    if (contextMenuEl) {
        contextMenuEl.style.display = 'none';
    }
    if (contextMenuOutsideListener) {
        window.removeEventListener('pointerdown', contextMenuOutsideListener, { capture: true });
        contextMenuOutsideListener = null;
    }
}

function createContextMenu() {
    if (contextMenuEl) return;
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'text-annotation-context-menu';
    contextMenuEl.style.cssText = `
        position: fixed; display: none; background: #2a2b2c; color: #e7e6d0;
        border: 1px solid #5f6368; border-radius: 6px; padding: 4px 0;
        box-shadow: 0 4px 14px rgba(0,0,0,0.4); z-index: 10002; min-width: 160px;
        font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif;
    `;
    document.body.appendChild(contextMenuEl);
}

export function showTextAnnotationContextMenu(annotation, x, y) {
    if (!contextMenuEl) createContextMenu();

    const items = [
        { label: '✏ Düzenle', onClick: () => openTextAnnotationEditor(annotation, x, y) },
        { label: '🗑 Sil', onClick: () => deleteTextAnnotation(annotation), danger: true }
    ];

    contextMenuEl.innerHTML = items.map((it, i) =>
        `<div class="ta-ctx-item" data-i="${i}" style="padding: 8px 14px; cursor: pointer; font-size: 12px; ${it.danger ? 'color: #e74c3c;' : ''}">${it.label}</div>`
    ).join('');

    contextMenuEl.querySelectorAll('.ta-ctx-item').forEach(el => {
        el.addEventListener('mouseenter', () => { el.style.background = '#3a3b3c'; });
        el.addEventListener('mouseleave', () => { el.style.background = 'transparent'; });
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(el.dataset.i, 10);
            hideContextMenu();
            items[idx].onClick();
        });
    });

    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.style.display = 'block';

    setTimeout(() => {
        const rect = contextMenuEl.getBoundingClientRect();
        if (rect.right > window.innerWidth) contextMenuEl.style.left = `${window.innerWidth - rect.width - 5}px`;
        if (rect.bottom > window.innerHeight) contextMenuEl.style.top = `${window.innerHeight - rect.height - 5}px`;
    }, 0);

    contextMenuOutsideListener = (event) => {
        if (contextMenuEl && !contextMenuEl.contains(event.target)) hideContextMenu();
    };
    setTimeout(() => {
        window.addEventListener('pointerdown', contextMenuOutsideListener, { capture: true });
    }, 0);
}
