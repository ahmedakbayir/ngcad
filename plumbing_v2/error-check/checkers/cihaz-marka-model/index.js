// cihaz-marka-model / index.js
// Kombi ve ocak cihazlarında marka ve model alanlarının eksik olup olmadığını
// kontrol eder.
//
// Mesajlar (PDF wording):
//   • "D3 biriminde 4 nolu hattaki Kombi markası girilmelidir."
//   • "D3 biriminde 4 nolu hattaki Kombi modeli girilmelidir."
//
// Otomatik düzeltme:
//   • Marka eksik   → katalogdan rastgele bir aktif marka atanır.
//   • Model eksik   → marka da boşsa önce rastgele marka seçilir, sonra o
//                     markanın aktif modellerinden biri atanır; ardından
//                     modelin kw kapasitesi cihazın kapasiteKW / kapasiteKcal
//                     alanlarına yazılır.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import {
    cihazAdBig,
    findMeterUpstream,
    hatNoForComp,
    birimHatPrefix,
    floorNameById,
} from '../../checker-utils.js';
import {
    getRandomMarka,
    getRandomModel,
    getModelKW,
} from '../../../properties/cihaz-katalog.js';
import { saveState } from '../../../../general-files/history.js';
import { draw2D } from '../../../../draw/draw2d.js';

const CIHAZ_TIPLERI_KONTROL = new Set(['KOMBI', 'OCAK', 'SOBA', 'SOFBEN', 'KAZAN', 'TICARI']);

function _prefixForCihaz(manager, cihaz) {
    const sayac = findMeterUpstream(
        manager,
        cihaz?.fleksBaglanti?.boruId || cihaz?.bagliBoruId,
    );
    const hatNo = hatNoForComp(manager, cihaz);
    const pre = birimHatPrefix(manager, { sayac, hatNo });
    const ad = cihazAdBig(cihaz?.cihazTipi);
    return pre ? `${pre} ${ad}` : ad;
}

function _applyKW(cihaz) {
    const kw = getModelKW(cihaz.cihazTipi, cihaz.marka, cihaz.model);
    if (Number.isFinite(kw)) {
        cihaz.kapasiteKW = kw;
        cihaz.kapasiteKcal = Math.round(kw * 860);
    }
}

function _fixMarka(manager, cihazId) {
    const cihaz = (manager.components || []).find(c => c.id === cihazId);
    if (!cihaz) return false;
    try { saveState(); } catch (_) {}
    const marka = getRandomMarka(cihaz.cihazTipi);
    if (!marka) return false;
    cihaz.marka = marka;
    // Marka değişti, eski model artık geçersiz olabilir → temizle
    if (cihaz.model) {
        const stillValid = !!getModelKW(cihaz.cihazTipi, marka, cihaz.model);
        if (!stillValid) cihaz.model = '';
    }
    try { window.plumbingManager?.saveToState?.(); } catch (_) {}
    try { draw2D(); } catch (_) {}
    return true;
}

function _fixModel(manager, cihazId) {
    const cihaz = (manager.components || []).find(c => c.id === cihazId);
    if (!cihaz) return false;
    try { saveState(); } catch (_) {}
    // Marka boşsa önce marka seç
    if (!cihaz.marka) {
        const m = getRandomMarka(cihaz.cihazTipi);
        if (!m) return false;
        cihaz.marka = m;
    }
    const model = getRandomModel(cihaz.cihazTipi, cihaz.marka);
    if (!model) return false;
    cihaz.model = model;
    _applyKW(cihaz);
    try { window.plumbingManager?.saveToState?.(); } catch (_) {}
    try { draw2D(); } catch (_) {}
    return true;
}

function cihazMarkaModelChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    for (const c of (manager.components || [])) {
        if (c.type !== 'cihaz') continue;
        const tip = String(c.cihazTipi || '').toUpperCase();
        if (!CIHAZ_TIPLERI_KONTROL.has(tip)) continue;

        const prefix = _prefixForCihaz(manager, c);
        const floorName = floorNameById(c.floorId);

        const markaBos = !c.marka || String(c.marka).trim() === '';
        const modelBos = !c.model || String(c.model).trim() === '';

        if (markaBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `cihaz-marka-${c.id}`,
                message:  `${prefix} markası girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   'Cihaz markası katalogdan seçilmelidir. Otomatik düzeltme rastgele bir marka atar; istenildiğinde panelden değiştirilebilir.',
                targets:  [{ type: 'comp', id: c.id }],
                fix: {
                    description: 'Cihaza katalogdan rastgele bir marka atanacak',
                    apply: () => _fixMarka(manager, c.id),
                },
            });
        }

        if (modelBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `cihaz-model-${c.id}`,
                message:  `${prefix} modeli girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   'Cihaz modeli katalogdan seçilmelidir. Otomatik düzeltme marka boşsa önce rastgele bir marka seçer, ardından o markanın modellerinden birini atar ve kapasite değerini günceller.',
                targets:  [{ type: 'comp', id: c.id }],
                fix: {
                    description: 'Cihaza katalogdan rastgele bir model atanacak (marka boşsa önce marka)',
                    apply: () => _fixModel(manager, c.id),
                },
            });
        }
    }
    return out;
}

errorCheckManager.register('cihaz-marka-model', cihazMarkaModelChecker);
