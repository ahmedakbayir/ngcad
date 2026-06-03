/**
 * Regülatör Aksesuarları
 *
 * Regülatör eklendiğinde otomatik olarak şu nesneler eklenir:
 *   • giriş manometresi  — giriş tarafı borusunda, regülatörden 25 cm geride
 *   • giriş emniyet vanası — giriş tarafı borusunda, regülatörden 40 cm geride
 *   • çıkış manometresi  — çıkış tarafı borusunda, regülatörden 25 cm ileride
 *   • çıkış emniyet vanası — çıkış tarafı borusunda, regülatörden 40 cm ileride
 *
 * Kullanıcı özellik panelinden bu 4 toggle'dan birini kapatırsa ilgili
 * nesne silinir; tekrar açarsa yeniden eklenir. Default tüm toggle'lar true.
 */

import { createVana } from './valve.js';
import { createPipeFitting } from './pipe-fitting.js';
import { getFloorIdForZ } from '../../floor/floor-handler.js';
import { initObjectDefaults } from '../properties/properties-panel.js';

// Regülatör merkezinden mesafeler (cm) — giriş ve çıkış için ayrı
const GIRIS_MANOMETRE_DISTANCE = 16;
const GIRIS_VANA_DISTANCE      = 23;
const CIKIS_MANOMETRE_DISTANCE = 10;
const CIKIS_VANA_DISTANCE      = 17;

// 'in' tarafı = regülatörün GİRİŞ ucundaki boru (bagliBoruId, fromEnd='p2')
// 'out' tarafı = regülatörün ÇIKIŞ ucundaki boru (cikisNoktasi'ndan bulunur)
const ACCESSORY_DEFS = {
    girisVana:      { kind: 'vana',      distance: GIRIS_VANA_DISTANCE,      side: 'in',  refKey: 'iliskiliGirisVanaId' },
    girisManometre: { kind: 'manometre', distance: GIRIS_MANOMETRE_DISTANCE, side: 'in',  refKey: 'iliskiliGirisManometreId' },
    cikisManometre: { kind: 'manometre', distance: CIKIS_MANOMETRE_DISTANCE, side: 'out', refKey: 'iliskiliCikisManometreId' },
    cikisVana:      { kind: 'vana',      distance: CIKIS_VANA_DISTANCE,      side: 'out', refKey: 'iliskiliCikisVanaId' },
};

function _pipe3DLength(pipe) {
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    return Math.hypot(dx, dy, dz);
}

function _pipeRotationAt(pipe) {
    const dx = pipe.p2.x - pipe.p1.x;
    const dy = pipe.p2.y - pipe.p1.y;
    const dz = (pipe.p2.z || 0) - (pipe.p1.z || 0);
    const len2d = Math.hypot(dx, dy);
    const isVertical = len2d < 2.0 || Math.abs(dz) > len2d;
    return isVertical ? -45 : pipe.aciDerece;
}

/**
 * Bir noktanın yakınında, verilen id'den farklı bir borunun ucunu bulur.
 * Dönüş: { pipe, endpoint: 'p1'|'p2' } veya null.
 */
function _findPipeAtPoint(manager, point, excludePipeId = null, tol = 1.5) {
    if (!manager || !point) return null;
    const pipes = manager.pipes || [];
    for (const pipe of pipes) {
        if (excludePipeId && pipe.id === excludePipeId) continue;
        const d1 = Math.hypot(point.x - pipe.p1.x, point.y - pipe.p1.y, (point.z || 0) - (pipe.p1.z || 0));
        if (d1 < tol) return { pipe, endpoint: 'p1' };
        const d2 = Math.hypot(point.x - pipe.p2.x, point.y - pipe.p2.y, (point.z || 0) - (pipe.p2.z || 0));
        if (d2 < tol) return { pipe, endpoint: 'p2' };
    }
    return null;
}

/**
 * Regülatörün giriş/çıkış tarafındaki boruyu çöz.
 * 'in' → bagliBoruId, fromEnd='p2' (regülatöre yakın uç)
 * 'out' → cikisNoktasi yakınında olan başka bir boru
 */
function _resolveSidePipe(manager, regulator, side) {
    if (side === 'in') {
        const pipe = manager.findPipeById(regulator.bagliBoruId);
        if (!pipe) return null;
        const fromEnd = regulator.fromEnd === 'p1' ? 'p1' : 'p2';
        return { pipe, fromEnd };
    }
    const cikis = regulator.getCikisNoktasi();
    const found = _findPipeAtPoint(manager, cikis, regulator.bagliBoruId, 1.5);
    if (!found) return null;
    return { pipe: found.pipe, fromEnd: found.endpoint };
}

/**
 * Aksesuar nesnesini oluşturup ekler. Borunun uzunluğu yetersizse null döner.
 */
function _createAccessory(manager, regulator, key) {
    const def = ACCESSORY_DEFS[key];
    if (!def) return null;

    const resolved = _resolveSidePipe(manager, regulator, def.side);
    if (!resolved) return null;
    const { pipe, fromEnd } = resolved;

    const length3D = _pipe3DLength(pipe);
    if (length3D < def.distance + 1) return null;

    const fixedDistance = def.distance;
    const t = fromEnd === 'p1'
        ? Math.min(fixedDistance / length3D, 0.95)
        : Math.max(1 - fixedDistance / length3D, 0.05);
    const pos = pipe.getPointAt(t);

    let obj;
    const baseOpts = {
        floorId: regulator.floorId,
        bagliBoruId: pipe.id,
        boruPozisyonu: t,
        fromEnd,
        fixedDistance,
    };

    if (def.kind === 'vana') {
        obj = createVana(pos.x, pos.y, 'EMNIYET', baseOpts);
    } else {
        obj = createPipeFitting('manometre', pos.x, pos.y, baseOpts);
    }
    obj.z = pos.z;
    obj.rotation = _pipeRotationAt(pipe);
    obj.floorId = getFloorIdForZ ? (getFloorIdForZ(pos.z) || regulator.floorId) : regulator.floorId;

    // fixedDistance üzerinden konumu kesinleştir
    if (typeof obj.updatePositionFromPipe === 'function') {
        obj.updatePositionFromPipe(pipe);
    }

    initObjectDefaults(obj, manager);
    manager.components.push(obj);

    if (obj.type === 'vana' && typeof obj.updateEndCapStatus === 'function') {
        obj.updateEndCapStatus(manager);
    }
    return obj;
}

function _removeAccessory(manager, regulator, key) {
    const def = ACCESSORY_DEFS[key];
    if (!def) return;
    const id = regulator[def.refKey];
    if (!id) return;
    const idx = manager.components.findIndex(c => c.id === id);
    if (idx !== -1) manager.components.splice(idx, 1);
    regulator[def.refKey] = null;
}

/**
 * Regülatörün toggle alanlarına göre aksesuarları senkronize eder:
 *   - flag true ve nesne yoksa  → ekle
 *   - flag false ve nesne varsa → sil
 *   - id stale (silinmiş) ise   → flag true ise yeniden ekle
 */
export function ensureRegulatorAccessories(manager, regulator) {
    if (!manager || !regulator || regulator.type !== 'regulator') return;
    for (const key of Object.keys(ACCESSORY_DEFS)) {
        const def = ACCESSORY_DEFS[key];
        const wantOn = regulator[key] !== false; // default true
        const existing = regulator[def.refKey]
            ? manager.components.find(c => c.id === regulator[def.refKey])
            : null;

        if (wantOn && !existing) {
            const created = _createAccessory(manager, regulator, key);
            regulator[def.refKey] = created ? created.id : null;
        } else if (!wantOn && existing) {
            _removeAccessory(manager, regulator, key);
        } else if (!wantOn && !existing && regulator[def.refKey]) {
            // ref stale — temizle
            regulator[def.refKey] = null;
        }
    }
}

/**
 * Regülatör silinirken / bu modüle ait kalan referansları kopart.
 * (Şimdilik sadece id alanlarını null'lar; nesneleri silmez — silme
 * akışı zaten manager üzerinde işliyor.)
 */
export function clearRegulatorAccessoryRefs(regulator) {
    if (!regulator) return;
    for (const key of Object.keys(ACCESSORY_DEFS)) {
        regulator[ACCESSORY_DEFS[key].refKey] = null;
    }
}
