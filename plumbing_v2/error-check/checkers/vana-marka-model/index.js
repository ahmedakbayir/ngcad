// vana-marka-model / index.js
// Selenoid vana (vanaTipi='SELENOID') ve Sismik vana (vanaTipi='SISMIK')
// için marka ve model alanlarının dolu olup olmadığını kontrol eder.
//
// Mesaj örnekleri:
//   • "5 nolu hattaki Selenoid markası girilmelidir."
//   • "5 nolu hattaki Sismik Vana modeli girilmelidir."
//
// Otomatik düzeltme:
//   • Marka eksik → ilgili katalogdan rastgele aktif marka atanır.
//   • Model eksik → marka da boşsa önce rastgele marka, sonra model atanır.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { vanaHatLabel, floorNameById } from '../../checker-utils.js';
import { getRandomMarka, getRandomModel } from '../../../properties/cihaz-katalog.js';
import { saveState } from '../../../../general-files/history.js';
import { draw2D } from '../../../../draw/draw2d.js';

const TIPLER_KONTROL = {
    SELENOID: 'SOLENOID',     // katalog tip
    SISMIK:   'SISMIK_VANA',
};

function _fixMarka(manager, vanaId, katalogTip) {
    const vana = (manager.components || []).find(c => c.id === vanaId);
    if (!vana) return false;
    try { saveState(); } catch (_) {}
    const marka = getRandomMarka(katalogTip);
    if (!marka) return false;
    vana.marka = marka;
    // Marka değişti, eski model artık geçersiz olabilir → temizle
    if (vana.model) vana.model = '';
    try { window.plumbingManager?.saveToState?.(); } catch (_) {}
    try { draw2D(); } catch (_) {}
    return true;
}

function _fixModel(manager, vanaId, katalogTip) {
    const vana = (manager.components || []).find(c => c.id === vanaId);
    if (!vana) return false;
    try { saveState(); } catch (_) {}
    if (!vana.marka) {
        const m = getRandomMarka(katalogTip);
        if (!m) return false;
        vana.marka = m;
    }
    const model = getRandomModel(katalogTip, vana.marka);
    if (!model) return false;
    vana.model = model;
    try { window.plumbingManager?.saveToState?.(); } catch (_) {}
    try { draw2D(); } catch (_) {}
    return true;
}

function vanaMarkaModelChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    for (const c of (manager.components || [])) {
        if (c.type !== 'vana') continue;
        const katalogTip = TIPLER_KONTROL[String(c.vanaTipi || '').toUpperCase()];
        if (!katalogTip) continue;

        const label = vanaHatLabel(manager, c);
        const floorName = floorNameById(c.floorId);

        const markaBos = !c.marka || String(c.marka).trim() === '';
        const modelBos = !c.model || String(c.model).trim() === '';

        if (markaBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `vana-marka-${c.id}`,
                message:  `${label} markası girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   'Vana markası katalogdan seçilmelidir. Otomatik düzeltme rastgele bir marka atar; istenildiğinde panelden değiştirilebilir.',
                targets:  [{ type: 'comp', id: c.id }],
                fix: {
                    description: 'Vanaya katalogdan rastgele bir marka atanacak',
                    apply: () => _fixMarka(manager, c.id, katalogTip),
                },
            });
        }

        if (modelBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `vana-model-${c.id}`,
                message:  `${label} modeli girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   'Vana modeli katalogdan seçilmelidir. Otomatik düzeltme marka boşsa önce rastgele marka seçer, ardından o markanın modellerinden birini atar.',
                targets:  [{ type: 'comp', id: c.id }],
                fix: {
                    description: 'Vanaya katalogdan rastgele bir model atanacak (marka boşsa önce marka)',
                    apply: () => _fixModel(manager, c.id, katalogTip),
                },
            });
        }
    }
    return out;
}

errorCheckManager.register('vana-marka-model', vanaMarkaModelChecker);
