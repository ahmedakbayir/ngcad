/**
 * Floor Sync
 * Boru/cihaz/sayaç/vana/servis kutusu için Z koordinatına göre floorId yeniden atar.
 * Gerekiyorsa eksik katları otomatik oluşturur (placeholder → gerçek kat).
 */

import { getFloorAtElevation } from '../floor/floor-handler.js';
import { ensureFloorForElevation } from '../floor/floor-panel.js';

function _floorIdForZ(z) {
    const f = getFloorAtElevation(z || 0);
    return f ? f.id : null;
}

/**
 * Tüm tesisat nesnelerinin floorId'sini Z'ye göre senkronlar.
 * Önce her nesnenin Z'si için ensureFloorForElevation çağrılır
 * (sürükleme sonucu yeni Z aralığına geçilmişse kat oluşur).
 * Sonra floorId yeniden atanır.
 *
 * Borular için: cross-floor riser olabileceğinden alt uç'un katı seçilir
 * (renderer slicePipeAcrossFloors ile her katta kendi dilimini gösterir).
 */
export function syncAllFloorAssignments(manager) {
    if (!manager) return;

    // 1) Eksik katları oluştur — tüm Z değerleri için
    for (const p of (manager.pipes || [])) {
        ensureFloorForElevation(p.p1?.z || 0);
        ensureFloorForElevation(p.p2?.z || 0);
    }
    for (const c of (manager.components || [])) {
        ensureFloorForElevation(c.z || 0);
    }

    // 2) floorId atamasını güncelle
    for (const p of (manager.pipes || [])) {
        const z1 = p.p1?.z || 0;
        const z2 = p.p2?.z || 0;
        const lowerZ = Math.min(z1, z2);
        const newFid = _floorIdForZ(lowerZ);
        if (newFid && p.floorId !== newFid) p.floorId = newFid;
    }

    for (const c of (manager.components || [])) {
        const newFid = _floorIdForZ(c.z || 0);
        if (newFid && c.floorId !== newFid) c.floorId = newFid;
    }
}
