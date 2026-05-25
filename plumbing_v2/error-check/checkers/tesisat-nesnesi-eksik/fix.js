// tesisat-nesnesi-eksik / fix.js
// Topraklama eksik ve AKV muhafaza için otomatik düzeltmeler.

import { createPipeFitting } from '../../../objects/pipe-fitting.js';
import { draw2D } from '../../../../draw/draw2d.js';
import {
    findFirstRisingPipe,
    findAkvInChain,
    AKV_TARGET_Z,
} from '../vana-eksik/fix.js';

// Topraklama, AKV'nin 50 cm altına yerleştirilir.
const TOPRAKLAMA_BELOW_AKV_CM = 50;

function pipeLengthCm(p) {
    if (!p?.p1 || !p?.p2) return 0;
    return Math.hypot(
        p.p2.x - p.p1.x,
        p.p2.y - p.p1.y,
        (p.p2.z || 0) - (p.p1.z || 0),
    );
}

function placeTopraklamaOnPipe(manager, pipe, t) {
    if (!pipe) return null;
    const clampedT = Math.max(0, Math.min(1, t));
    const midX = pipe.p1.x + clampedT * (pipe.p2.x - pipe.p1.x);
    const midY = pipe.p1.y + clampedT * (pipe.p2.y - pipe.p1.y);
    const midZ = (pipe.p1.z || 0) + clampedT * ((pipe.p2.z || 0) - (pipe.p1.z || 0));

    const fitting = createPipeFitting('topraklama', midX, midY, {
        z: midZ,
        floorId: pipe.floorId || null,
        bagliBoruId: pipe.id,
        boruPozisyonu: clampedT,
    });

    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const isVertical = Math.hypot(dx, dy) < 2 || Math.abs(dz) > Math.hypot(dx, dy);
    fitting.rotation = isVertical ? -45 : (pipe.aciDerece ?? (Math.atan2(dy, dx) * 180 / Math.PI));

    manager.components.push(fitting);
    return fitting;
}

/**
 * Servis kutusunun kolonuna bir topraklama ekler.
 *   • Zincirde AKV varsa → AKV'nin 50 cm altına (z = akv.z - 50)
 *   • Yoksa → AKV hedef yüksekliğinin (185) 50 cm altına (z = 135)
 *   • Hedef z, ilk yükselen borunun z aralığında ise oraya;
 *     değilse ilk kök borunun ortasına yerleştirilir.
 */
export function ensureTopraklama(manager, serviceBoxId) {
    if (!manager || !serviceBoxId) return false;

    // Zaten topraklama varsa idempotent
    const roots = manager.pipes?.filter(p =>
        p.baslangicBaglanti?.tip === 'servis_kutusu' &&
        p.baslangicBaglanti.hedefId === serviceBoxId
    ) || [];
    if (!roots.length) return false;

    // Hedef z: AKV varsa onun 50cm altı; yoksa AKV_TARGET_Z - 50 (135 cm)
    const akv = findAkvInChain(manager, serviceBoxId);
    const targetZ = (akv?.z != null ? akv.z : AKV_TARGET_Z) - TOPRAKLAMA_BELOW_AKV_CM;

    // İlk yükselen borunun z-aralığında targetZ varsa orada
    const rising = findFirstRisingPipe(manager, serviceBoxId);
    if (rising) {
        const z1 = rising.p1.z || 0;
        const z2 = rising.p2.z || 0;
        const dz = z2 - z1;
        if (Math.abs(dz) >= 0.01) {
            const zMin = Math.min(z1, z2);
            const zMax = Math.max(z1, z2);
            const clampedZ = Math.max(zMin, Math.min(zMax, targetZ));
            const t = (clampedZ - z1) / dz;
            // Yükselen boruda zaten topraklama varsa atla
            const exists = (manager.components || []).some(c =>
                c.type === 'topraklama' && c.bagliBoruId === rising.id
            );
            if (exists) return true;
            const f = placeTopraklamaOnPipe(manager, rising, t);
            if (f) {
                manager.saveToState?.();
                try { draw2D(); } catch (_) {}
                return true;
            }
        }
    }

    // Fallback: ilk kök borunun ortasına
    const root = roots[0];
    const exists = (manager.components || []).some(c =>
        c.type === 'topraklama' && c.bagliBoruId === root.id
    );
    if (exists) return true;
    if (pipeLengthCm(root) <= 0) return false;
    const f = placeTopraklamaOnPipe(manager, root, 0.5);
    if (!f) return false;
    manager.saveToState?.();
    try { draw2D(); } catch (_) {}
    return true;
}

/**
 * Verilen bileşenin muhafaza alanını true yapar.
 * (vana/sayaç/cihaz/regülatör/manometre — atmosfere açık ekipmanlar)
 */
export function ensureMuhafaza(manager, compId) {
    if (!manager || !compId) return false;
    const c = (manager.components || []).find(c => c.id === compId);
    if (!c) return false;
    const SUPPORTED = new Set(['vana', 'sayac', 'cihaz', 'regulator', 'manometre',
                                'filtre', 'izolasyon_flansi', 'kompansator']);
    if (!SUPPORTED.has(c.type)) return false;
    if (c.muhafaza === true) return true;
    c.muhafaza = true;
    manager.saveToState?.();
    try { draw2D(); } catch (_) {}
    return true;
}
