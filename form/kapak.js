// form/kapak.js
// İGDAŞ proje kapağı — sadece görünüm + birkaç format helper.
// Bütün veriler doğrudan projede:
//   • state.projectMeta (sorumlu, adres, binaBilgi, projeBilgi, kutuBasinc, kutuTipi,
//                        binaTesisatNo, tadilatSebep, projeKapagiNotu, name)
//   • state.floors / state.rooms
//   • window.plumbingManager.components / .pipes
// "PDF Oluştur" tarayıcının yazdır → PDF'e kaydet akışını kullanır.

import { state } from '../general-files/main.js';

let overlay = null;

// ── KÜÇÜK YARDIMCILAR ─────────────────────────────────────────────
const SEPARATOR_NAMES = new Set(['SAHANLIK', 'AÇIK SAHANLIK', 'BAHÇE']);
const BIRIM_DISI = new Set([
    'MAHAL', 'ASANSÖR', 'YAN BİNA', 'DEPO', 'AYDINLIK', 'GARAJ', 'BODRUM',
    'AÇIK OTOPARK', 'KAPALI OTOPARK', 'BACA', 'TEKNİK HACİM', 'AÇIK AYDINLIK',
    'ÇATI ARASI', 'YANGIN MERDİVENİ', 'TESİSAT ŞAFTI', 'BACA ŞAFTI',
    'SAYAÇ ODASI', 'SAYAÇ ŞAFTI', 'KURANGLEZ', 'SIĞINAK', 'HAVALANDIRMA',
    'TOPRAK DOLGU', 'KÖMÜRLÜK', 'ORTAK ALAN'
]);
const _isBirimRoom = r => {
    if (!r) return false;
    const nm = (r.name || '').toUpperCase().trim();
    return !SEPARATOR_NAMES.has(nm) && !BIRIM_DISI.has(nm);
};

const _esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const _pm  = () => (typeof window !== 'undefined') ? window.plumbingManager : null;
const _today = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
};

// ── PROJEDEN ÇIKARILAN ÖZEL FORMATLAR ─────────────────────────────
// "G4X1 + G6X2" gibi sayaç tipi-adedi listesi (ilk eleman ana, kalanı yan).
function _sayacTipleri() {
    const counts = new Map();
    for (const c of (_pm()?.components || [])) {
        if (c.type !== 'sayac') continue;
        const t = String(c.sayacTipi || '').trim();
        if (!t) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].map(([t, n]) => `${t}X${n}`);
}

// "0+1+7" → bodrum+zemin+normal kat sayısı.
function _katSayisi() {
    const floors = (state.floors || []).filter(f => !f.isPlaceholder);
    const bodrum = floors.filter(f => /BODRUM/.test(f.name)).length;
    const normal = floors.filter(f => /\.KAT$/.test(f.name)).length;
    const zemin  = floors.some(f => f.name === 'ZEMİN') ? 1 : 0;
    return `${bodrum}+${zemin}+${normal}`;
}

// "3-1" → konut sayısı - ticari sayısı.
function _daireDukkan() {
    const m = state.projectMeta?.projeBilgi || {};
    let d = 0, t = 0;
    for (const c of (_pm()?.components || [])) {
        if (c.type !== 'sayac') continue;
        const tipi = String(c.birimTipi || 'KONUT').toUpperCase();
        if (tipi === 'KONUT') d++;
        else if (tipi === 'TİCARİ' || tipi === 'TICARI') t++;
    }
    if (m.daire  != null) d = Number(m.daire)  || d;
    if (m.dukkan != null) t = Number(m.dukkan) || t;
    return `${d}-${t}`;
}

// Mahallerin (ortak alan/separator hariç) alan toplamı (m²).
function _toplamAlan() {
    const pb = state.projectMeta?.projeBilgi?.alan;
    if (pb != null) return Number(pb);
    let sum = 0;
    for (const r of (state.rooms || [])) {
        if (!_isBirimRoom(r)) continue;
        const a = Number(r.area);
        if (Number.isFinite(a) && a > 0) sum += a;
    }
    if (sum > 0) return sum;
    const abys = Number(state.projectMeta?.binaBilgi?.alan);
    return Number.isFinite(abys) && abys > 0 ? abys : null;
}

// Servis kutusu sonrası ilk hattın debisi (m³/h).
function _toplamKapasite() {
    const pb = state.projectMeta?.projeBilgi?.kapasite;
    if (pb != null) return Number(pb);
    const pm = _pm();
    const kutu = (pm?.components || []).find(c => c.type === 'servis_kutusu');
    if (kutu) {
        const p = (pm?.pipes || []).find(p => p.baslangicBaglanti?.hedefId === kutu.id);
        const d = Number(p?.debi);
        if (Number.isFinite(d) && d > 0) return d;
    }
    const abys = Number(state.projectMeta?.binaBilgi?.kapasite);
    return Number.isFinite(abys) && abys > 0 ? abys : null;
}

// "Kolon + D1, D2, Dük1..." — gaz alan birimler listesi.
function _gazAlanDaire() {
    const seen = new Map();
    for (const c of (_pm()?.components || [])) {
        if (c.type !== 'sayac') continue;
        const no = String(c.birimNo ?? '').trim();
        if (!no) continue;
        const t = String(c.birimTipi || 'KONUT').toUpperCase();
        seen.set((t === 'KONUT') ? `D${no}` : `Dük${no}`, true);
    }
    const list = [...seen.keys()].join(', ');
    const kolonVar = !!state.projectMeta?.kolonVar;
    return (kolonVar ? 'Kolon' : '') + (list ? (kolonVar ? ' + ' : '') + list : '');
}

// ── LOGO (basit inline SVG yaklaşımı) ─────────────────────────────
const ICON_LOGO = `
    <svg viewBox="0 0 220 60" xmlns="http://www.w3.org/2000/svg" aria-label="İGDAŞ">
        <g transform="translate(8,8)" fill="#1ea4d6">
            <rect x="20" y="0"  width="6" height="44"/>
            <rect x="0"  y="20" width="46" height="6"/>
            <g transform="translate(23,23) rotate(45)">
                <rect x="-3" y="-22" width="6" height="44"/>
                <rect x="-23" y="-3" width="46" height="6"/>
            </g>
        </g>
        <text x="68" y="42" font-family="Arial, sans-serif" font-weight="900" font-size="36" fill="#0d2a59" letter-spacing="-0.5">iGDAŞ</text>
    </svg>
`;

// ── OVERLAY / TOOLBAR ─────────────────────────────────────────────
function _buildOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'kapak-overlay';
    overlay.innerHTML = `
        <div class="kapak-toolbar">
            <button class="kapak-tb-btn" id="kapakClose" type="button" title="Kapat">✕</button>
            <span class="kapak-tb-title">PROJE KAPAĞI</span>
            <button class="kapak-tb-btn kapak-tb-primary" id="kapakPdf" type="button">PDF Oluştur</button>
        </div>
        <div class="kapak-scroll">
            <div class="kapak-page" id="kapakPage"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#kapakClose')?.addEventListener('click', hideKapak);
    overlay.addEventListener('click', e => { if (e.target === overlay) hideKapak(); });
    overlay.querySelector('#kapakPdf')?.addEventListener('click', () => {
        document.body.classList.add('kapak-printing');
        window.print();
        setTimeout(() => document.body.classList.remove('kapak-printing'), 500);
    });
}

// ── RENDER ────────────────────────────────────────────────────────
function _renderPage() {
    const meta    = state.projectMeta || {};
    const sorumlu = meta.sorumlu      || {};
    const adres   = meta.adres        || {};
    const projeAdi = meta.name || document.getElementById('projectNameInput')?.value || '';

    // Kırmızı (proje değişkeni) span helper.
    const r = (v) => `<span class="kp-var">${_esc(v ?? '')}</span>`;

    const basinc = String(meta.kutuBasinc || '21');
    const kutuTipi = meta.kutuTipi === 'yer' ? 'Yer tipi'
                   : meta.kutuTipi === 'duvar' ? 'Duvar tipi'
                   : '';
    const sayacTipleri = _sayacTipleri();
    const alan = _toplamAlan();
    const kapasite = _toplamKapasite();
    const tarih = _today();

    overlay.querySelector('#kapakPage').innerHTML = `
        <div class="kp-logo-wrap">${ICON_LOGO}</div>

        <table class="kp-tbl kp-tbl-onay">
            <thead>
                <tr>
                    <th>PROJE TASARIMCISININ KAŞE VE ONAYI</th>
                    <th>İGDAŞ'IN ONAYI</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="kp-onay-box-top"></td>
                    <td class="kp-onay-box-right" rowspan="3"></td>
                </tr>
                <tr><td class="kp-onay-mid">Projedeki plan, hesap, beyan ve taahhütlerin mesuliyetini kabul ederim.</td></tr>
                <tr>
                    <td class="kp-onay-notes">
                        <div><strong>Tadilat Açıklama:</strong> ${r(meta.tadilatSebep)}</div>
                        <div><strong>Proje Tasarımcısının Notu:</strong> ${r(meta.projeKapagiNotu)}</div>
                    </td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-3col">
            <colgroup>
                <col class="kp-3col-lbl"><col class="kp-3col-val">
                <col class="kp-3col-lbl"><col class="kp-3col-val">
                <col class="kp-3col-lbl"><col class="kp-3col-val">
            </colgroup>
            <tbody>
                <tr>
                    <th>KULLANIM BASINCI</th><td>${r(basinc)}</td>
                    <th>TESİSAT NO</th><td>${r(meta.binaTesisatNo)}</td>
                    <th>SAYAÇ TİPİ ADEDİ</th><td>${r(sayacTipleri[0])}</td>
                </tr>
                <tr>
                    <th>SERVİS KUTU BASINCI</th><td>${r(basinc)}</td>
                    <th>BAĞLANTI NESNESİ</th><td>${r('')}</td>
                    <th>SAYAÇ TİPİ ADEDİ</th><td>${r(sayacTipleri.slice(1).join(' + '))}</td>
                </tr>
                <tr>
                    <th>SERVİS KUTUSU TİPİ</th><td>${r(kutuTipi)}</td>
                    <th>İGABİS NO</th><td>${r('')}</td>
                    <th>RUHSAT TRH./ NO</th><td>${r('')}</td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-bina">
            <thead>
                <tr><th colspan="4" class="kp-section-head">BİNANIN</th></tr>
                <tr><th>İLÇESİ</th><th>MAHALLESİ</th><th>SOKAĞI VE NO</th><th>ADA-PAFTA-PARSEL</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td>${r(adres.ilce)}</td>
                    <td>${r(adres.mahalle)}</td>
                    <td>${r([adres.sokak, adres.binaNo].filter(Boolean).join(' '))}</td>
                    <td>${r('')}</td>
                </tr>
                <tr><th>KAT SAYISI</th><th>DAİRE VE İŞYERİ SAYISI</th><th>TOPLAM ALAN (m²)</th><th>TOPLAM KAPASİTE (m³/h)</th></tr>
                <tr>
                    <td>${r(_katSayisi())}</td>
                    <td>${r(_daireDukkan())}</td>
                    <td>${r(alan != null ? (Math.round(alan * 10) / 10).toString() : '')}</td>
                    <td>${r(kapasite != null ? (Math.round(kapasite * 100) / 100).toString() : '0')}</td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-tasarimci">
            <thead>
                <tr>
                    <th colspan="3" class="kp-section-head">PROJE TASARIMCISININ</th>
                    <th colspan="2" class="kp-section-head">FİRMANIN</th>
                </tr>
                <tr>
                    <th>ADI SOYADI</th><th>KAYIT NO</th><th>ODA SİCİL NO</th>
                    <th>YETERLİLİK NO</th><th>V.DAİRESİ</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>${r(sorumlu.yetkiliMuhendis)}</td>
                    <td>${r('')}</td><td>${r('')}</td>
                    <td>${r('')}</td><td>${r('')}</td>
                </tr>
                <tr>
                    <th colspan="3">ADRES</th>
                    <th>TELEFON</th>
                    <th>VERGİ NO</th>
                </tr>
                <tr>
                    <td colspan="3">${r([adres.mahalle, adres.sokak, adres.binaNo, adres.ilce, adres.il].filter(Boolean).join(' '))}</td>
                    <td>${r('')}</td>
                    <td>${r('')}</td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-imza">
            <colgroup>
                <col class="kp-imza-c1"><col class="kp-imza-c2">
                <col class="kp-imza-c3"><col class="kp-imza-c4">
            </colgroup>
            <tbody>
                <tr><th>YAPAN</th><td class="kp-tar">${r(tarih)}</td><th>FİRMA ADI</th><th>CEP TEL NO</th></tr>
                <tr>
                    <td class="kp-imza-ad">${r(sorumlu.usta || sorumlu.yetkiliMuhendis)}</td>
                    <th class="kp-imza-sublbl">İMZA</th>
                    <td>${r(sorumlu.yetkiliFirma)}</td>
                    <td>${r('')}</td>
                </tr>
                <tr><th>ÇİZEN</th><td class="kp-tar">${r(tarih)}</td><th>BİNA PROJE ADI</th><th>ÖLÇEK</th></tr>
                <tr>
                    <td class="kp-imza-ad">${r(sorumlu.projeyiCizen)}</td>
                    <th class="kp-imza-sublbl">İMZA</th>
                    <td>${r(projeAdi)}</td>
                    <td>${r('1/50')}</td>
                </tr>
                <tr><th>KONTROL</th><td class="kp-tar">${r(tarih)}</td><th>GAZ ALAN DAIRE NO</th><th>PROJE NO</th></tr>
                <tr>
                    <td class="kp-imza-ad">${r(sorumlu.yetkiliMuhendis)}</td>
                    <th class="kp-imza-sublbl">İMZA</th>
                    <td>${r(_gazAlanDaire())}</td>
                    <td>${r('')}</td>
                </tr>
            </tbody>
        </table>
    `;
}

// ── PUBLIC API ────────────────────────────────────────────────────
export function showKapak() {
    if (!overlay) _buildOverlay();
    _renderPage();
    overlay.classList.add('kapak-visible');
}

export function hideKapak() {
    overlay?.classList.remove('kapak-visible');
}

if (typeof window !== 'undefined') {
    window.__showKapak = showKapak;
}
