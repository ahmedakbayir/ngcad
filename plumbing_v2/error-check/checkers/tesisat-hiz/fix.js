// fix.js (tesisat-hiz)
// Tek bir hattaki tüm boruların çapını bir kademe yükseltir.
// Esnek tesisat ise sadece esnek DN listesi (DN15..DN32) içinde ilerler.

import { DN_LIST, ESNEK_DN_LIST } from '../../../../menu/boru-cap-menu.js';
import { computeHatGroups } from '../../../renderer/renderer-utils.js';
import { draw2D } from '../../../../draw/draw2d.js';

function nextDn(currentDn, isEsnek) {
    const list = isEsnek ? ESNEK_DN_LIST : DN_LIST;
    const idx = list.indexOf(currentDn);
    if (idx === -1 || idx >= list.length - 1) return null;
    return list[idx + 1];
}

function isHatEsnek(manager, pipeIds) {
    const idSet = new Set(pipeIds);
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });
    for (const meter of (manager.components || [])) {
        if (meter.type !== 'sayac' || !meter.cikisBagliBoruId) continue;
        if (meter.birimBoruTipi !== 'ESNEK') continue;
        const seen = new Set();
        const queue = [meter.cikisBagliBoruId];
        while (queue.length) {
            const id = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            if (idSet.has(id)) return true;
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    }
    return false;
}

/**
 * Verilen hat numarasındaki tüm boruları bir kademe yükseltir.
 * @returns {boolean} en az bir boru yükseltildiyse true
 */
export function upgradeHat(manager, hatNo) {
    if (!manager?.pipes?.length || hatNo == null) return false;
    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const pipes = manager.pipes.filter(p => hatMap.get(p.id) === hatNo);
    if (!pipes.length) return false;

    const isEsnek = isHatEsnek(manager, pipes.map(p => p.id));

    // Hat içindeki en küçük çap üzerinden tek seferde tüm hattı eşitleyerek yükselt
    let smallestIdx = Infinity;
    let smallestDn = null;
    const list = isEsnek ? ESNEK_DN_LIST : DN_LIST;
    pipes.forEach(p => {
        const dn = p.boruCap || 'DN25';
        const idx = list.indexOf(dn);
        if (idx === -1) return;
        if (idx < smallestIdx) { smallestIdx = idx; smallestDn = dn; }
    });
    if (smallestIdx === Infinity) return false;
    const newDn = nextDn(smallestDn, isEsnek);
    if (!newDn) return false;

    let changed = false;
    pipes.forEach(p => {
        if ((p.boruCap || 'DN25') !== smallestDn) return;
        p.boruCap = newDn;
        changed = true;
        (manager.components || []).forEach(c => {
            if (c.type === 'vana' && c.bagliBoruId === p.id) c.vanaCap = newDn;
        });
    });

    if (changed) {
        manager.saveToState?.();
        try { draw2D(); } catch (_) {}
    }
    return changed;
}
