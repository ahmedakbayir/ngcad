// proje-status-bar.js
// 2D çizim ekranının altına ortalı, ince durum çubuğu.
// Onboarding panelinin tepesindeki özet bilgileri (kolon/iç tesisat, tip, ısınma,
// basınç, müstakil, ön proje) state.projectMeta + state'ten okuyup gösterir.

import { state } from '../general-files/main.js';

let elem = null;

function chip(text, empty, tab) {
    const cls = empty ? 'ps-chip is-empty' : 'ps-chip';
    const tabAttr = tab ? ` data-ps-tab="${tab}"` : '';
    return `<span class="${cls}"${tabAttr} role="button" tabindex="0">${text}</span>`;
}

export function renderProjeStatusBar() {
    if (!elem) elem = document.getElementById('proje-status-bar');
    if (!elem) return;

    const meta = state?.projectMeta || {};
    const realFloors = (state?.floors || []).filter(f => !f.isPlaceholder);
    // Varsayılan: KOLON + İÇ TESİSAT, 21 mbar.
    // Yalnızca açıkça aksini belirten state varsa varsayılan ezilir:
    //  - meta.kolonVar === false  → KOLON çıkar
    //  - en az 1 gerçek katın icTesisatVar === false olarak işaretliyse + meta'da
    //    icTesisatVar açıkça false olarak yazılmışsa → İÇ TESİSAT çıkar
    //  - meta.kutuBasinc '21' dışı bir değer içeriyorsa → onu göster
    const kolonVar = (meta.kolonVar === false) ? false : true;
    const icTesisatExplicitFalse =
        meta.icTesisatVar === false ||
        (realFloors.length > 0 && realFloors.every(f => f.icTesisatVar === false));
    const hasIcTesisat = !icTesisatExplicitFalse;
    const type = meta.type || 'yeni';
    const isinma = state?.isinmaTipi || 'bireysel';
    const basincRaw = String(meta.kutuBasinc || '').trim();
    const basinc = basincRaw || '21';
    const mustakil = !!meta.mustakilProje;
    const onProje = !!meta.onProje;

    const parts = [];
    if (kolonVar && hasIcTesisat) parts.push(chip('KOLON + İÇ TESİSAT', false, 'tesisat'));
    else if (kolonVar)            parts.push(chip('KOLON',              false, 'tesisat'));
    else if (hasIcTesisat)        parts.push(chip('İÇ TESİSAT',         false, 'tesisat'));
    else                          parts.push(chip('-', true, 'tesisat'));

    parts.push(chip(type === 'tadilat' ? 'TADİLAT' : 'YENİ', false, 'tesisat'));

    parts.push(chip(
        isinma === 'merkezi'  ? 'MERKEZİ' :
        isinma === 'boylerli' ? 'MERKEZİ BOYLERLİ' :
                                'BİREYSEL',
        false, 'sorumlu'
    ));

    parts.push(basinc ? chip(`${basinc} MBAR`, false, 'tesisat') : chip('-', true, 'tesisat'));
    // Müstakil ve Ruhsat boşsa hiç gösterme.
    if (mustakil) parts.push(chip('MÜSTAKİL', false, 'sorumlu'));
    if (onProje)  parts.push(chip('ÖN PROJE', false, 'sorumlu'));

    elem.innerHTML = parts.join('<span class="ps-sep">·</span>');
}

export function initProjeStatusBar() {
    elem = document.getElementById('proje-status-bar');
    if (elem && !elem._psWired) {
        elem._psWired = true;
        elem.addEventListener('click', e => {
            const ch = e.target.closest('[data-ps-tab]');
            if (!ch) return;
            const tab = ch.dataset.psTab;
            if (typeof window !== 'undefined' && typeof window.__showOnboarding === 'function') {
                window.__showOnboarding(true, 'edit', tab);
            }
        });
        elem.addEventListener('keydown', e => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const ch = e.target.closest('[data-ps-tab]');
            if (!ch) return;
            e.preventDefault();
            const tab = ch.dataset.psTab;
            if (typeof window !== 'undefined' && typeof window.__showOnboarding === 'function') {
                window.__showOnboarding(true, 'edit', tab);
            }
        });
    }
    renderProjeStatusBar();
}
