// text-annotation-popup.js
// Serbest metin notları için ekleme/düzenleme popup'ı.
// onConfirm({ text, size }) çağrılır; null geri çağrı = iptal.

import { TEXT_ANNOTATION_SIZES } from './text-annotation.js';

let popup = null;
let confirmCallback = null;
let cancelCallback = null;
let outsideClickListener = null;

function createPopup() {
    if (popup) return;
    popup = document.createElement('div');
    popup.id = 'text-annotation-popup';
    popup.style.cssText = `
        position: fixed; background: #2a2b2c; border: 1px solid #8ab4f8; border-radius: 8px;
        padding: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10001; display: none;
        min-width: 280px; font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif; color: #e7e6d0;
    `;

    const sizeOpts = Object.entries(TEXT_ANNOTATION_SIZES).map(([key, cfg]) =>
        `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 8px;border-radius:4px;background:#3a3b3c;">
            <input type="radio" name="ta-size" value="${key}" style="cursor:pointer;">
            <span style="font-size:12px;">${cfg.label}</span>
        </label>`
    ).join('');

    popup.innerHTML = `
        <div id="ta-popup-title" style="margin-bottom: 10px; font-size: 13px; font-weight: 500; color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 6px;">Projeye Metin Ekle</div>
        <textarea id="ta-popup-textarea" rows="4" placeholder="Metin..." style="width: 100%; padding: 6px 8px; background: #3a3b3c; color: #e7e6d0; border: 1px solid #4a4b4c; border-radius: 4px; font-size: 12px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
        <div style="margin-top: 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <span style="font-size: 11px; color: #b0b0b0;">Boyut:</span>
            ${sizeOpts}
        </div>
        <div style="margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px;">
            <button id="ta-popup-cancel" style="padding: 6px 12px; background: transparent; color: #b0b0b0; border: 1px solid #4a4b4c; border-radius: 4px; cursor: pointer; font-size: 12px;">İptal</button>
            <button id="ta-popup-ok" style="padding: 6px 12px; background: #8ab4f8; color: #1e1f20; border: 1px solid #8ab4f8; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">Tamam</button>
        </div>
    `;
    document.body.appendChild(popup);

    popup.addEventListener('mousedown', (e) => e.stopPropagation());
    popup.addEventListener('pointerdown', (e) => e.stopPropagation());

    popup.querySelector('#ta-popup-cancel').addEventListener('click', () => {
        const cb = cancelCallback;
        hideTextAnnotationPopup();
        if (cb) cb();
    });
    popup.querySelector('#ta-popup-ok').addEventListener('click', confirm);

    const ta = popup.querySelector('#ta-popup-textarea');
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            const cb = cancelCallback;
            hideTextAnnotationPopup();
            if (cb) cb();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            confirm();
        } else {
            e.stopPropagation();
        }
    });
}

function confirm() {
    const ta = popup.querySelector('#ta-popup-textarea');
    const sizeRadio = popup.querySelector('input[name="ta-size"]:checked');
    const text = ta.value;
    const size = sizeRadio ? sizeRadio.value : 'medium';
    const cb = confirmCallback;
    hideTextAnnotationPopup();
    if (cb) cb({ text, size });
}

/**
 * @param {object} opts - { title, initialText, initialSize, x, y, onConfirm, onCancel }
 */
export function showTextAnnotationPopup(opts) {
    if (!popup) createPopup();
    const { title = 'Projeye Metin Ekle', initialText = '', initialSize = 'medium', x, y, onConfirm, onCancel } = opts || {};

    confirmCallback = onConfirm || null;
    cancelCallback = onCancel || null;

    popup.querySelector('#ta-popup-title').textContent = title;
    const ta = popup.querySelector('#ta-popup-textarea');
    ta.value = initialText;
    const sizeRadios = popup.querySelectorAll('input[name="ta-size"]');
    sizeRadios.forEach(r => { r.checked = (r.value === initialSize); });

    // Pozisyon
    if (typeof x === 'number' && typeof y === 'number') {
        popup.style.left = `${x}px`;
        popup.style.top = `${y}px`;
    } else {
        popup.style.left = `${(window.innerWidth - 300) / 2}px`;
        popup.style.top = `${(window.innerHeight - 200) / 2}px`;
    }
    popup.style.display = 'block';

    setTimeout(() => {
        const rect = popup.getBoundingClientRect();
        if (rect.right > window.innerWidth) popup.style.left = `${window.innerWidth - rect.width - 10}px`;
        if (rect.bottom > window.innerHeight) popup.style.top = `${window.innerHeight - rect.height - 10}px`;
        ta.focus();
        ta.select();
    }, 0);

    outsideClickListener = (event) => {
        if (popup && !popup.contains(event.target)) {
            const cb = cancelCallback;
            hideTextAnnotationPopup();
            if (cb) cb();
        }
    };
    setTimeout(() => {
        window.addEventListener('pointerdown', outsideClickListener, { capture: true });
    }, 0);
}

export function hideTextAnnotationPopup() {
    if (!popup) return;
    popup.style.display = 'none';
    confirmCallback = null;
    cancelCallback = null;
    if (outsideClickListener) {
        window.removeEventListener('pointerdown', outsideClickListener, { capture: true });
        outsideClickListener = null;
    }
}

export function isTextAnnotationPopupOpen() {
    return !!(popup && popup.style.display === 'block');
}
