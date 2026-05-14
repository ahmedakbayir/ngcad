// description-popup.js
// Kapı/Pencere gibi mimari nesneler için açıklama metnini düzenleyen ortak popup.
// (Duvar için wall-panel, oda için room-name-popup kullanılır.)

import { saveState } from '../general-files/history.js';
import { draw2D } from '../draw/draw2d.js';

let popup = null;
let currentTarget = null;
let originalDesc = '';
let outsideClickListener = null;

function createPopup() {
    if (popup) return;

    popup = document.createElement('div');
    popup.id = 'arch-description-popup';
    popup.style.cssText = `
        position: fixed; background: #2a2b2c; border: 1px solid #8ab4f8; border-radius: 8px;
        padding: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 10000; display: none;
        min-width: 240px; font-family: "Segoe UI", "Roboto", "Helvetica Neue", sans-serif; color: #e7e6d0;
    `;
    popup.innerHTML = `
        <div id="arch-desc-title" style="margin-bottom: 8px; font-size: 13px; font-weight: 500; color: #8ab4f8; border-bottom: 1px solid #3a3b3c; padding-bottom: 6px;">Açıklama</div>
        <textarea id="arch-desc-textarea" rows="4" placeholder="Açıklama — projede gösterilir" style="width: 100%; padding: 6px 8px; background: #3a3b3c; color: #e7e6d0; border: 1px solid #4a4b4c; border-radius: 4px; font-size: 12px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
    `;
    document.body.appendChild(popup);

    const ta = popup.querySelector('#arch-desc-textarea');
    ta.addEventListener('input', (e) => {
        if (currentTarget) {
            currentTarget.description = e.target.value;
            draw2D();
        }
    });
    ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); hideDescriptionPopup(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); hideDescriptionPopup(); }
        else { e.stopPropagation(); }
    });
    popup.addEventListener('mousedown', (e) => e.stopPropagation());
    popup.addEventListener('pointerdown', (e) => e.stopPropagation());
}

export function showDescriptionPopup(obj, label, x, y) {
    if (!popup) createPopup();
    currentTarget = obj;
    originalDesc = obj.description || '';

    popup.querySelector('#arch-desc-title').textContent = `${label} — Açıklama`;
    const ta = popup.querySelector('#arch-desc-textarea');
    ta.value = originalDesc;

    popup.style.left = `${x + 10}px`;
    popup.style.top = `${y + 10}px`;
    popup.style.display = 'block';

    // Ekran taşmasını düzelt
    setTimeout(() => {
        const rect = popup.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            popup.style.left = `${window.innerWidth - rect.width - 10}px`;
        }
        if (rect.bottom > window.innerHeight) {
            popup.style.top = `${window.innerHeight - rect.height - 10}px`;
        }
        ta.focus();
        ta.select();
    }, 0);

    // Dışarı tıklama dinleyicisi (popup içine tıklarsa kapanmasın)
    outsideClickListener = (event) => {
        if (popup && !popup.contains(event.target)) hideDescriptionPopup();
    };
    setTimeout(() => {
        window.addEventListener('pointerdown', outsideClickListener, { capture: true });
    }, 0);
}

export function hideDescriptionPopup() {
    if (!popup || popup.style.display === 'none') return;
    const ta = popup.querySelector('#arch-desc-textarea');
    const newDesc = ta ? ta.value : '';
    if (currentTarget && newDesc !== originalDesc) {
        currentTarget.description = newDesc;
        saveState();
    }
    popup.style.display = 'none';
    currentTarget = null;
    if (outsideClickListener) {
        window.removeEventListener('pointerdown', outsideClickListener, { capture: true });
        outsideClickListener = null;
    }
}
