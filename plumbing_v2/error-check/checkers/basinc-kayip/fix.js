// fix.js (basinc-kayip)
// Bir veya birden çok hat için "çapı bir kademe yükselt" çözümü.
// Esnek borularda DN15..DN32 ile sınırlıdır.

import { DN_LIST, ESNEK_DN_LIST } from '../../../../menu/boru-cap-menu.js';
import { computeHatGroups } from '../../../renderer/renderer-utils.js';
import { draw2D } from '../../../../draw/draw2d.js';

// Sıralı DN listesi içinde, ESNEK boru ise sadece esnek DN'leri kullan.
function nextDn(currentDn, isEsnek) {
    const list = isEsnek ? ESNEK_DN_LIST : DN_LIST;
    const idx = list.indexOf(currentDn);
    if (idx === -1) return null;
    if (idx >= list.length - 1) return null;
    return list[idx + 1];
}

/**
 * Verilen hat numaralarındaki en küçük çaplı boruları bir kademe yükseltir.
 * @returns {boolean} en az bir boru yükseltildiyse true
 */
export function upgradeBottleneckInHats(manager, hatNos) {
    if (!manager?.pipes?.length || !Array.isArray(hatNos) || !hatNos.length) return false;

    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const set = new Set(hatNos.map(n => Number(n)));
    const pathPipes = manager.pipes.filter(p => set.has(hatMap.get(p.id)));
    if (!pathPipes.length) return false;

    // Esnek tesisat tespiti — yoldaki herhangi bir borunun bağlı olduğu sayaçta ESNEK?
    // Daha basit yaklaşım: borunun kendi 'boruTipi' alanına bakmıyoruz; yoldaki bir boru
    // sayaç sonrası ve ilgili sayaç ESNEK ise o boruları sınırlı listeye sok.
    // Önce en küçük DN'i bul.
    let smallestIdx = Infinity;
    let smallestDn = null;
    pathPipes.forEach(p => {
        const dn = p.boruCap || 'DN25';
        const idx = DN_LIST.indexOf(dn);
        if (idx === -1) return;
        if (idx < smallestIdx) { smallestIdx = idx; smallestDn = dn; }
    });
    if (smallestIdx === Infinity) return false;

    // Yükseltme — en küçük DN'e sahip her boruyu bir kademe büyüt.
    let changed = false;
    pathPipes.forEach(p => {
        if ((p.boruCap || 'DN25') !== smallestDn) return;
        // Borunun esnek olup olmadığını sayaç üzerinden tespit (basit yaklaşım).
        const isEsnek = isPipeEsnek(manager, p);
        const newDn = nextDn(smallestDn, isEsnek);
        if (!newDn) return;
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

// Borunun ait olduğu sayacın birimBoruTipi ESNEK mi?
function isPipeEsnek(manager, pipe) {
    // Sayaçtan sonra zincir takip ederek hangi sayaca bağlı olduğunu bulmak
    // boru-cap-menu.js'de yapılan iş; burada yaklaşık: bu boru downstream of any meter?
    const comps = manager.components || [];
    // Çocuk haritası
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });
    for (const meter of comps) {
        if (meter.type !== 'sayac' || !meter.cikisBagliBoruId) continue;
        if (meter.birimBoruTipi !== 'ESNEK') continue;
        // BFS
        const seen = new Set();
        const queue = [meter.cikisBagliBoruId];
        while (queue.length) {
            const id = queue.shift();
            if (seen.has(id)) continue;
            seen.add(id);
            if (id === pipe.id) return true;
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    }
    return false;
}
