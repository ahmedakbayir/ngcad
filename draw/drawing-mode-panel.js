/**
 * Sol alt köşedeki "Çizim Modu" panelini (geçici) yönetir.
 * Global state: window.cizimModu = 'serbest' | 'geometri'
 *  - 'serbest'  : mevcut nokta-tıkla doğrusal çizim (default)
 *  - 'geometri' : iki nokta arasında engelleri (kolon/duvar) etrafından dolanan rota
 */

export function initCizimModuPaneli() {
    if (typeof window === 'undefined') return;
    if (window.cizimModu === undefined) window.cizimModu = 'serbest';

    const panel = document.getElementById('cizim-modu-paneli');
    if (!panel) return;

    const radios = panel.querySelectorAll('input[name="cizim-modu"]');

    radios.forEach(r => {
        if (r.value === window.cizimModu) r.checked = true;
        r.addEventListener('change', () => {
            if (r.checked) {
                window.cizimModu = r.value;
                document.dispatchEvent(new CustomEvent('cizim-modu-degisti', {
                    detail: { mode: window.cizimModu }
                }));
            }
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCizimModuPaneli);
} else {
    initCizimModuPaneli();
}
