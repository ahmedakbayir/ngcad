/**
 * Vertical Height Panel Handler
 * Düşey yükseklik paneli etkileşimlerini yönetir
 */

import { plumbingManager } from '../plumbing-manager.js';

/**
 * Düşey panel event listener'larını başlat
 */
export function initVerticalPanelListeners() {
    const panel = document.getElementById('vertical-height-panel');
    const input = document.getElementById('vertical-height-input');
    const minusBtn = document.getElementById('vertical-btn-minus');
    const plusBtn = document.getElementById('vertical-btn-plus');
    const quickBtns = document.querySelectorAll('.vertical-quick-btn');

    if (!panel || !input || !minusBtn || !plusBtn) {
        console.warn('Vertical panel elements not found');
        return;
    }

    // Ayarlardan hızlı değerleri yükle
    loadQuickValuesFromSettings();

    // + buton: 10 cm artır
    plusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentValue = parseFloat(input.value) || 0;
        const newValue = currentValue + 10;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // - buton: 10 cm azalt
    minusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentValue = parseFloat(input.value) || 0;
        const newValue = currentValue - 10;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // Input değişim
    input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value) || 0;
        updateInteractionManagerValue(value);
    });

    // Mouse wheel: Artır/azalt
    input.addEventListener('wheel', (e) => {
        e.preventDefault();
        const currentValue = parseFloat(input.value) || 0;
        const delta = e.deltaY > 0 ? -10 : 10; // Aşağı scroll = azalt, yukarı = artır
        const newValue = currentValue + delta;
        input.value = newValue;
        updateInteractionManagerValue(newValue);
    });

    // Hızlı değer butonları
    quickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = parseFloat(btn.getAttribute('data-value')) || 0;
            input.value = value;
            updateInteractionManagerValue(value);
        });
    });

    // Panel dışına tıklandığında kapat (opsiyonel - şimdilik yok)
    // document.addEventListener('click', (e) => {
    //     if (plumbingManager.interactionManager.verticalModeActive && !panel.contains(e.target)) {
    //         plumbingManager.interactionManager.closeVerticalPanel();
    //     }
    // });

    // Ayarlar menüsünden değer değişikliklerini dinle
    setupSettingsListeners();
}

/**
 * InteractionManager'daki değeri güncelle
 */
function updateInteractionManagerValue(value) {
    if (plumbingManager && plumbingManager.interactionManager) {
        plumbingManager.interactionManager.verticalHeightInput = value;
    }
}

/**
 * Hızlı değerleri güncelle (ayarlar menüsünden)
 */
export function updateQuickValues(values) {
    const quickBtns = document.querySelectorAll('.vertical-quick-btn');
    if (quickBtns.length !== 4 || values.length !== 4) {
        console.warn('Quick values mismatch');
        return;
    }

    quickBtns.forEach((btn, index) => {
        btn.setAttribute('data-value', values[index]);
        btn.textContent = values[index];
    });

    // InteractionManager'daki değerleri de güncelle
    if (plumbingManager && plumbingManager.interactionManager) {
        plumbingManager.interactionManager.verticalQuickValues = [...values];
    }
}

/**
 * Ayarlardan hızlı değerleri yükle
 */
function loadQuickValuesFromSettings() {
    const values = [
        parseInt(document.getElementById('vertical-quick-1')?.value) || 0,
        parseInt(document.getElementById('vertical-quick-2')?.value) || 100,
        parseInt(document.getElementById('vertical-quick-3')?.value) || 200,
        parseInt(document.getElementById('vertical-quick-4')?.value) || 300
    ];
    updateQuickValues(values);
}

/**
 * Ayarlar menüsü input'larına listener ekle
 */
function setupSettingsListeners() {
    for (let i = 1; i <= 4; i++) {
        const input = document.getElementById(`vertical-quick-${i}`);
        if (input) {
            input.addEventListener('change', () => {
                loadQuickValuesFromSettings();
            });
        }
    }
}
