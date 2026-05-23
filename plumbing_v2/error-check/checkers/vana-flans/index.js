// vana-flans / index.js
// PDF "Tasarım Hatası" — DN65 ve üzeri vanalar flanşlı olmalı.
//
// Kural: Md:5.1.27
//   "...anma çapı 50 mm'ye kadar (50 mm dahil) TS EN 331'e uygun küresel,
//   anma çapı 50 mm'den büyük çaplarda TS 9809'a uygun flanşlı ve tam
//   geçişli vanalar kullanılmalıdır..."
//
// Kontrol: vanaCap parseInt(replace('DN','')) >= 65 ise vana.flans true olmalı.
// Çözüm: vana.flans = true (otomatik işaretle).

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { draw2D } from '../../../../draw/draw2d.js';
import {
    daireLabel,
    findMeterUpstream,
    locInBirim,
    hatNoForComp,
} from '../../checker-utils.js';

const VANA_AD = {
    AKV: 'AKV',
    EMNIYET: 'Emn.V',
    CIHAZ: 'Cihaz vanası',
    SELENOID: 'Selenoid',
    BRANSMAN: 'Branşman vanası',
};

function vanaCapNum(cap) {
    return parseInt(String(cap || '').replace('DN', '') || '0', 10);
}

function vanaFlansChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    (manager.components || []).forEach(v => {
        if (v.type !== 'vana') return;
        const n = vanaCapNum(v.vanaCap);
        if (!isFinite(n) || n < 65) return;
        if (v.flans === true) return;

        const ad = VANA_AD[v.vanaTipi] || 'Vana';
        // Vana kolonda ise hat numarasıyla, birimde ise kat+birim ile prefix oluştur
        // PDF:
        //   "1 nolu kolon hattında bulunan DN65 çaplı AKV flanşlı olmalıdır."
        //   "Zemin Kat, D2 biriminde bulunan DN65 çaplı Emn.V flanşlı olmalıdır"
        const isKolonVana = v.vanaTipi === 'AKV' || v.vanaTipi === 'BRANSMAN';
        let prefix;
        if (isKolonVana) {
            const hatNo = hatNoForComp(manager, v);
            prefix = hatNo != null
                ? `${hatNo} nolu kolon hattında bulunan`
                : '';
        } else {
            const sayac = findMeterUpstream(manager, v.bagliBoruId);
            const loc = locInBirim(v.floorId, daireLabel(sayac));
            prefix = loc ? `${loc} bulunan` : '';
        }
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `vana-flans-${v.id}`,
            message: `${prefix ? prefix + ' ' : ''}${v.vanaCap} çaplı ${ad} flanşlı olmalıdır`,
            source:  'TS7363 Md:5.1.27',
            detail:  'Anma çapı 50 mm\'ye kadar (50 mm dahil) TS EN 331\'e uygun küresel, anma çapı 50 mm\'den büyük çaplarda TS 9809\'a uygun flanşlı ve tam geçişli vanalar kullanılmalıdır.',
            targets: [{ type: 'comp', id: v.id }],
            fix: {
                description: 'Vanada flanş özelliği işaretlenecek',
                apply: () => {
                    v.flans = true;
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
    return out;
}

errorCheckManager.register('vana-flans', vanaFlansChecker);
