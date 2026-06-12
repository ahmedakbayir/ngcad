// proje-status-bar.js
// 2D çizim ekranının altına ortalı, ince durum çubuğu.
// Onboarding panelinin tepesindeki özet bilgileri (kolon/iç tesisat, tip, ısınma,
// basınç, müstakil, ön proje) state.projectMeta + state'ten okuyup gösterir.

import { state } from '../general-files/main.js';

let elem = null;

function chip(text, empty) {
    const cls = empty ? 'ps-chip is-empty' : 'ps-chip';
    return `<span class="${cls}">${text}</span>`;
}

export function renderProjeStatusBar() {
    if (!elem) elem = document.getElementById('proje-status-bar');
    if (!elem) return;

    const meta = state?.projectMeta || {};
    const kolonVar = !!meta.kolonVar;
    const hasIcTesisat = (state?.floors || []).some(f => !f.isPlaceholder && f.icTesisatVar);
    const type = meta.type || 'yeni';
    const isinma = state?.isinmaTipi || 'bireysel';
    const basinc = String(meta.kutuBasinc || '').trim();
    const mustakil = !!meta.mustakilProje;
    const onProje = !!meta.onProje;

    const parts = [];
    if (kolonVar && hasIcTesisat) parts.push(chip('KOLON + İÇ TESİSAT'));
    else if (kolonVar)            parts.push(chip('KOLON'));
    else if (hasIcTesisat)        parts.push(chip('İÇ TESİSAT'));
    else                          parts.push(chip('-', true));

    parts.push(chip(type === 'tadilat' ? 'TADİLAT' : 'YENİ'));

    parts.push(chip(
        isinma === 'merkezi'  ? 'MERKEZİ' :
        isinma === 'boylerli' ? 'MERKEZİ BOYLERLİ' :
                                'BİREYSEL'
    ));

    parts.push(basinc ? chip(`${basinc} MBAR`) : chip('-', true));
    parts.push(mustakil ? chip('MÜSTAKİL')  : chip('-', true));
    parts.push(onProje  ? chip('ÖN PROJE')  : chip('-', true));

    elem.innerHTML = parts.join('<span class="ps-sep">·</span>');
}

export function initProjeStatusBar() {
    elem = document.getElementById('proje-status-bar');
    renderProjeStatusBar();
}
