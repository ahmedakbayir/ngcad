/**
 * Boru çizim modu artık Görünüm Ayarları > "Geometriye Uy" checkbox'ından sürülür.
 * Global state: window.cizimModu = 'serbest' | 'geometri'
 *  - 'serbest'  : nokta-tıkla doğrusal çizim
 *  - 'geometri' : iki nokta arasında engelleri (kolon/duvar) dolanan rota
 *
 * Eski sol-alt "Çizim Modu" radyo paneli kaldırıldı; ui.js setupVisibilityPanel
 * checkbox kurulduktan sonra ve değişimlerde syncCizimModuFromVisibility() çağırır.
 */

import { state } from '../general-files/main.js';

export function syncCizimModuFromVisibility() {
    if (typeof window === 'undefined') return;
    const useGeometri = state?.tempVisibility?.snapToGeometry !== false;
    const next = useGeometri ? 'geometri' : 'serbest';
    if (window.cizimModu === next) return;
    window.cizimModu = next;
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('cizim-modu-degisti', {
            detail: { mode: window.cizimModu }
        }));
    }
}
