// alarm-marka-model / index.js
// Mahal alarm cihazları (Gaz / CO / Sismik alarm) için marka ve model
// alanlarının dolu olup olmadığını kontrol eder.
//
// Mesaj örnekleri:
//   • "Gaz Alarm Cihazı markası girilmelidir."
//   • "CO Algılama Cihazı modeli girilmelidir."
//   • "Sismik Alarm Cihazı markası girilmelidir."
//
// Otomatik düzeltme:
//   • Marka eksik → ilgili katalogdan rastgele aktif marka atanır.
//   • Model eksik → marka da boşsa önce rastgele marka, sonra model atanır.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { floorNameById } from '../../checker-utils.js';
import { getRandomMarka, getRandomModel } from '../../../properties/cihaz-katalog.js';
import { ARCH_DEVICE_KINDS, ARCH_DEVICE_NAMES } from '../../../../architectural-objects/arch-devices.js';
import { state } from '../../../../general-files/main.js';
import { saveState } from '../../../../general-files/history.js';
import { draw2D } from '../../../../draw/draw2d.js';

const KIND_TO_KATALOG = {
    [ARCH_DEVICE_KINDS.GAS_ALARM]:  'GAZ_ALARM',
    [ARCH_DEVICE_KINDS.CO_ALARM]:   'CO_ALARM',
    [ARCH_DEVICE_KINDS.EARTHQUAKE]: 'SISMIK_ALARM',
};

function _findDevice(deviceRef) {
    return (state.archDevices || []).find(d => d === deviceRef) || null;
}

function _fixMarka(deviceRef, katalogTip) {
    const dev = _findDevice(deviceRef);
    if (!dev) return false;
    try { saveState(); } catch (_) {}
    const marka = getRandomMarka(katalogTip);
    if (!marka) return false;
    dev.marka = marka;
    if (dev.model) dev.model = '';
    try { draw2D(); } catch (_) {}
    return true;
}

function _fixModel(deviceRef, katalogTip) {
    const dev = _findDevice(deviceRef);
    if (!dev) return false;
    try { saveState(); } catch (_) {}
    if (!dev.marka) {
        const m = getRandomMarka(katalogTip);
        if (!m) return false;
        dev.marka = m;
    }
    const model = getRandomModel(katalogTip, dev.marka);
    if (!model) return false;
    dev.model = model;
    try { draw2D(); } catch (_) {}
    return true;
}

function alarmMarkaModelChecker(/* { manager } */) {
    const out = [];
    const devices = state.archDevices || [];
    let idx = 0;
    for (const dev of devices) {
        idx++;
        const katalogTip = KIND_TO_KATALOG[dev?.kind];
        if (!katalogTip) continue;

        const ad = ARCH_DEVICE_NAMES[dev.kind] || 'Mahal Cihazı';
        const floorName = floorNameById(dev.floorId);

        const markaBos = !dev.marka || String(dev.marka).trim() === '';
        const modelBos = !dev.model || String(dev.model).trim() === '';

        const keyId = `${dev.kind}-${idx}`;
        const targets = dev.floorId ? [{ type: 'floor', id: dev.floorId }] : [];

        if (markaBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `alarm-marka-${keyId}`,
                message:  `${ad} markası girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   `${ad} markası katalogdan seçilmelidir. Otomatik düzeltme rastgele bir marka atar; istenildiğinde panelden değiştirilebilir.`,
                targets,
                fix: {
                    description: 'Cihaza katalogdan rastgele bir marka atanacak',
                    apply: () => _fixMarka(dev, katalogTip),
                },
            });
        }

        if (modelBos) {
            out.push({
                group:    ERROR_GROUP_IDS.MARKA_MODEL_HATA,
                errorId:  `alarm-model-${keyId}`,
                message:  `${ad} modeli girilmelidir.`,
                floorName,
                source:   'proje gereği',
                detail:   `${ad} modeli katalogdan seçilmelidir. Otomatik düzeltme marka boşsa önce rastgele marka seçer, ardından o markanın modellerinden birini atar.`,
                targets,
                fix: {
                    description: 'Cihaza katalogdan rastgele bir model atanacak (marka boşsa önce marka)',
                    apply: () => _fixModel(dev, katalogTip),
                },
            });
        }
    }
    return out;
}

errorCheckManager.register('alarm-marka-model', alarmMarkaModelChecker);
