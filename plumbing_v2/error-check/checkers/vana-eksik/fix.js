// vana-eksik / fix.js
// 4 vana eksik kuralı için otomatik vana ekleyici yardımcılar.
//
//   1. Kolonda AKV     — servis kutusu sonrası ilk borunun sonuna yakın AKV
//   2. Cihaz vanası    — cihazın inlet borusunda, cihaz girişine 50cm kala
//   3. Sayaç emniyet   — sayacın inlet borusunda, sayaç girişine 100cm kala
//   4. Ticari selenoid — sayaç çıkış borusunda, sayaç çıkışına yakın
//
// Boru yönelimi:  flow her boru için p1 → p2'dir; cihaz/sayaç giriş borusu
// "p2 ucunda" duruyorsa vana p2'ye fixedDistance ile yerleştirilir.

import { createVana } from '../../../objects/valve.js';
import { recomputeAllPressures } from '../../../utils/pressure-recompute.js';
import { draw2D } from '../../../../draw/draw2d.js';

const VANA_GENISLIGI = 8;     // cm
// Hattın sonuna ("uca yakın") yerleşim için sabit mesafe — component-placement.js
// içindeki sonlanma vanası mantığıyla aynı (~5 cm); sonlanma tiplerinde 1 cm'e
// indirilir.
const FIXED_DISTANCE_END_ARA = VANA_GENISLIGI / 2;   // 4 cm
const FIXED_DISTANCE_END_SONLANMA = 1;               // cm

// AKV için hedef yükseklik: 180-190 cm aralığının ortası.
export const AKV_TARGET_Z = 185;

function pipeLength3D(p) {
    if (!p?.p1 || !p?.p2) return 0;
    return Math.hypot(
        p.p2.x - p.p1.x,
        p.p2.y - p.p1.y,
        (p.p2.z || 0) - (p.p1.z || 0),
    );
}

// Servis kutusu zincirinde downstream BFS — ilk yükselen (pozitif dz, dikey
// baskın) boruyu döner. Yoksa null.
export function findFirstRisingPipe(manager, serviceBoxId) {
    if (!manager || !serviceBoxId) return null;
    const roots = manager.pipes?.filter(p =>
        p.baslangicBaglanti?.tip === 'servis_kutusu' &&
        p.baslangicBaglanti.hedefId === serviceBoxId
    ) || [];
    if (!roots.length) return null;

    const seen = new Set();
    const queue = [...roots];
    while (queue.length) {
        const p = queue.shift();
        if (!p || seen.has(p.id)) continue;
        seen.add(p.id);
        const dx = p.p2.x - p.p1.x;
        const dy = p.p2.y - p.p1.y;
        const dz = (p.p2.z || 0) - (p.p1.z || 0);
        const horiz = Math.hypot(dx, dy);
        if (dz > 1 && (horiz < 5 || Math.abs(dz) > horiz)) return p;
        const children = manager.pipes.filter(c =>
            c.baslangicBaglanti?.tip === 'boru' &&
            c.baslangicBaglanti.hedefId === p.id
        );
        children.forEach(c => queue.push(c));
    }
    return null;
}

// Servis kutusu zincirinde mevcut bir AKV vanası varsa döner.
export function findAkvInChain(manager, serviceBoxId) {
    if (!manager || !serviceBoxId) return null;
    const pipeIds = collectChainPipeIds(manager, serviceBoxId);
    return (manager.components || []).find(c =>
        c.type === 'vana' && c.vanaTipi === 'AKV' && pipeIds.has(c.bagliBoruId)
    ) || null;
}

function collectChainPipeIds(manager, serviceBoxId) {
    const ids = new Set();
    const childrenOf = new Map();
    (manager.pipes || []).forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });
    const roots = (manager.pipes || []).filter(p =>
        p.baslangicBaglanti?.tip === 'servis_kutusu' &&
        p.baslangicBaglanti.hedefId === serviceBoxId
    ).map(r => r.id);
    const queue = [...roots];
    while (queue.length) {
        const id = queue.shift();
        if (ids.has(id)) continue;
        ids.add(id);
        (childrenOf.get(id) || []).forEach(c => queue.push(c));
    }
    return ids;
}

// Aynı tipte vana borunun verilen ucuna ≤ maxCm yakınlıkta mevcut mu?
function hasValveAtPipeEnd(manager, pipeId, vanaTipi, fromEnd, maxCm) {
    const pipe = manager.pipes?.find(p => p.id === pipeId);
    if (!pipe) return false;
    const len = pipeLength3D(pipe);
    if (len <= 0) return false;
    return (manager.components || []).some(c => {
        if (c.type !== 'vana' || c.vanaTipi !== vanaTipi) return false;
        if (c.bagliBoruId !== pipeId) return false;
        const t = c.boruPozisyonu;
        if (t == null) return true;
        const dist = fromEnd === 'p1' ? t * len : (1 - t) * len;
        return dist <= maxCm;
    });
}

// Boru üzerinde verilen tip+uç+mesafe ile vana oluşturup manager'a ekler.
// fixedDistance verilmezse hattın sonuna yakın (~5 cm; sonlanma tiplerinde 1 cm)
// yerleştirilir — bu, kullanıcı elle yerleştirirken kullanılan kuraldır.
function placeValveOnPipe(manager, pipe, vanaTipi, { fromEnd, fixedDistance }) {
    const len = pipeLength3D(pipe);
    if (len <= 0) return null;

    // Mesafe verilmemişse "hattın sonuna" varsayılan değer.
    if (fixedDistance == null) fixedDistance = FIXED_DISTANCE_END_ARA;
    // Boru çok kısaysa mesafeyi sığacak şekilde kısıt.
    fixedDistance = Math.max(0, Math.min(fixedDistance, len - 0.5));

    // t hesabı (0..1)
    let t;
    if (fromEnd === 'p2') {
        t = Math.max(0, (len - fixedDistance) / len);
    } else { // 'p1'
        t = Math.min(1, fixedDistance / len);
    }

    const x = pipe.p1.x + t * (pipe.p2.x - pipe.p1.x);
    const y = pipe.p1.y + t * (pipe.p2.y - pipe.p1.y);
    const z = (pipe.p1.z || 0) + t * ((pipe.p2.z || 0) - (pipe.p1.z || 0));

    const vana = createVana(x, y, vanaTipi, {
        bagliBoruId: pipe.id,
        boruPozisyonu: t,
        fromEnd,
        fixedDistance,
        floorId: pipe.floorId || null,
        z,
    });

    // Sonlanma vanaları (CIHAZ/EMNIYET/SELENOID gibi) boru ucuna daha da yakın.
    if (typeof vana.isSonlanma === 'function' && vana.isSonlanma()) {
        vana.fixedDistance = FIXED_DISTANCE_END_SONLANMA;
        // t'yi de yeniden hesapla
        const d = vana.fixedDistance;
        const newT = fromEnd === 'p2'
            ? Math.max(0, (len - d) / len)
            : Math.min(1, d / len);
        vana.boruPozisyonu = newT;
        vana.x = pipe.p1.x + newT * (pipe.p2.x - pipe.p1.x);
        vana.y = pipe.p1.y + newT * (pipe.p2.y - pipe.p1.y);
        vana.z = (pipe.p1.z || 0) + newT * ((pipe.p2.z || 0) - (pipe.p1.z || 0));
    }

    // Rotasyon: düşey boruda -45, yataykta borunun açısı
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const len2d = Math.hypot(dx, dy);
    const isVertical = len2d < 2 || Math.abs(dz) > len2d;
    vana.rotation = isVertical
        ? -45
        : (typeof pipe.aciDerece === 'number' ? pipe.aciDerece : (Math.atan2(dy, dx) * 180 / Math.PI));

    manager.components.push(vana);
    if (typeof vana.updateEndCapStatus === 'function') {
        vana.updateEndCapStatus(manager);
    }
    return vana;
}

function commit(manager) {
    try { recomputeAllPressures(manager); } catch (_) {}
    manager.saveToState?.();
    try { draw2D(); } catch (_) {}
}

// Belirli bir z yüksekliğine düşey/eğik bir boru üzerinde vana yerleştir.
// Boru yatay ise null döner (z'ye göre konumlama anlamsız).
function placeValveAtZ(manager, pipe, vanaTipi, targetZ) {
    if (!pipe) return null;
    const z1 = pipe.p1.z || 0;
    const z2 = pipe.p2.z || 0;
    const dz = z2 - z1;
    if (Math.abs(dz) < 0.01) return null;

    const len = pipeLength3D(pipe);
    if (len <= 0) return null;

    const zMin = Math.min(z1, z2);
    const zMax = Math.max(z1, z2);
    const clampedZ = Math.max(zMin, Math.min(zMax, targetZ));
    const t = (clampedZ - z1) / dz;          // 0..1, dz işaretinden bağımsız
    const fixedDistance = Math.max(0, Math.min(t * len, len - 0.5));

    return placeValveOnPipe(manager, pipe, vanaTipi, {
        fromEnd: 'p1',
        fixedDistance,
    });
}

// ─── 1) Kolonda AKV ───────────────────────────────────────────────────────
// Servis kutusundan downstream BFS ile ilk yükselen boruyu bul; AKV'yi
// orada 180-190 cm seviyesine yerleştir. Yükselen yoksa, ilk kök borunun
// sonuna düş.
export function addKolonAkv(manager, serviceBoxId) {
    if (!manager || !serviceBoxId) return false;

    // Zincirde zaten AKV varsa idempotent ol.
    const existing = findAkvInChain(manager, serviceBoxId);
    if (existing) return true;

    const risingPipe = findFirstRisingPipe(manager, serviceBoxId);
    if (risingPipe) {
        const vana = placeValveAtZ(manager, risingPipe, 'AKV', AKV_TARGET_Z);
        if (vana) { commit(manager); return true; }
    }

    // Fallback: ilk kök borunun p2 ucuna yakın
    const root = manager.pipes?.find(p =>
        p.baslangicBaglanti?.tip === 'servis_kutusu' &&
        p.baslangicBaglanti.hedefId === serviceBoxId
    );
    if (!root) return false;
    const vana = placeValveOnPipe(manager, root, 'AKV', { fromEnd: 'p2' });
    if (!vana) return false;
    commit(manager);
    return true;
}

// ─── 2) Cihaz vanası ──────────────────────────────────────────────────────
// Cihazın fleksBaglanti.boruId'sine, cihaz tarafı uca yakın CIHAZ vana ekle.
// Geride başka bir CIHAZ vana olsa bile uca yenisi konulur.
export function addCihazValve(manager, cihazId) {
    if (!manager || !cihazId) return false;
    const cihaz = (manager.components || []).find(c => c.id === cihazId);
    if (!cihaz?.fleksBaglanti?.boruId || !cihaz.fleksBaglanti?.endpoint) return false;
    const pipe = manager.pipes.find(p => p.id === cihaz.fleksBaglanti.boruId);
    if (!pipe) return false;

    const fromEnd = cihaz.fleksBaglanti.endpoint === 'p1' ? 'p1' : 'p2';
    // Uçta zaten varsa idempotent
    if (hasValveAtPipeEnd(manager, pipe.id, 'CIHAZ', fromEnd, 10)) return true;

    const vana = placeValveOnPipe(manager, pipe, 'CIHAZ', { fromEnd });
    if (!vana) return false;
    commit(manager);
    return true;
}

// ─── 3) Sayaç emniyet vanası ──────────────────────────────────────────────
// Sayacın bağlı olduğu boruda sayaç tarafı uca yakın EMNIYET vana ekle.
export function addSayacEmniyet(manager, sayacId) {
    if (!manager || !sayacId) return false;
    const sayac = (manager.components || []).find(c => c.id === sayacId);
    if (!sayac?.fleksBaglanti?.boruId || !sayac.fleksBaglanti?.endpoint) return false;
    const pipe = manager.pipes.find(p => p.id === sayac.fleksBaglanti.boruId);
    if (!pipe) return false;

    const fromEnd = sayac.fleksBaglanti.endpoint === 'p1' ? 'p1' : 'p2';
    if (hasValveAtPipeEnd(manager, pipe.id, 'EMNIYET', fromEnd, 10)) return true;
    if (pipeLength3D(pipe) < VANA_GENISLIGI) return false;

    const vana = placeValveOnPipe(manager, pipe, 'EMNIYET', { fromEnd });
    if (!vana) return false;
    commit(manager);
    return true;
}

// ─── 4) Ticari sayaç sonrası selenoid ────────────────────────────────────
// Sayaç çıkış borusunun başına (p1 tarafı = sayaç çıkışı) SELENOID vana ekle.
export function addTicariSelenoid(manager, sayacId) {
    if (!manager || !sayacId) return false;
    const sayac = (manager.components || []).find(c => c.id === sayacId);
    if (!sayac?.cikisBagliBoruId) return false;
    const pipe = manager.pipes.find(p => p.id === sayac.cikisBagliBoruId);
    if (!pipe) return false;

    if (hasValveAtPipeEnd(manager, pipe.id, 'SELENOID', 'p1', 10)) return true;
    if (pipeLength3D(pipe) < VANA_GENISLIGI) return false;

    const vana = placeValveOnPipe(manager, pipe, 'SELENOID', { fromEnd: 'p1' });
    if (!vana) return false;
    commit(manager);
    return true;
}
