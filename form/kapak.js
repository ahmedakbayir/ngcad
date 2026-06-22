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
function _sayacTipleri() {
    const counts = new Map();
    for (const c of (_pm()?.components || [])) {
        if (c.type !== 'sayac') continue;
        const t = String(c.sayacTipi || '').trim();
        if (!t) continue;
        counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()].map(([t, n]) => `${t}×${n}`);
}

function _katSayisi() {
    const floors = (state.floors || []).filter(f => !f.isPlaceholder);
    const bodrum = floors.filter(f => /BODRUM/.test(f.name)).length;
    const normal = floors.filter(f => /\.KAT$/.test(f.name)).length;
    const zemin  = floors.some(f => f.name === 'ZEMİN') ? 1 : 0;
    return `${bodrum}+${zemin}+${normal}`;
}

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

// Servis kutusu componentinin gerçek tipi: S200/S300/S700/S2200/CES200.
// meta.kutuTipi ('duvar'/'yer') sadece ilk yerleştirme kararıdır; kapakta yeri yok.
function _servisKutusuTipi() {
    const kutu = (_pm()?.components || []).find(c => c.type === 'servis_kutusu');
    return kutu?.kutuTipi || '';
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

// ── LOGO ──────────────────────────────────────────────────────────
// Gerçek İGDAŞ logosu: general-files/igdas-logo.png dosyasından okunur.
const ICON_LOGO = `<img src="./general-files/igdas-logo.png" alt="İGDAŞ" />`;

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
    const sorumlu = { ...(meta.sorumlu || {}) };
    const adres   = meta.adres        || {};
    const projeAdi = meta.name || document.getElementById('projectNameInput')?.value || '';

    // Web context fallback: onboarding'den gelen sorumlu alanı boşsa, aktif
    // firma ve giriş yapan kullanıcı bilgisini doldur. Onboarding değeri varsa
    // ona dokunmaz.
    const webFirm    = (typeof window !== 'undefined') ? window.AANGCAD_ACTIVE_FIRM  : null;
    const webProfile = (typeof window !== 'undefined') ? window.AANGCAD_USER_PROFILE : null;
    const _blank = (v) => v == null || String(v).trim() === '';
    const _pick  = (...vals) => {
        for (const v of vals) { if (!_blank(v)) return v; }
        return '';
    };
    if (_blank(sorumlu.yetkiliFirma) && webFirm?.pf_adi) {
        sorumlu.yetkiliFirma = webFirm.pf_adi;
    }
    if (_blank(sorumlu.yetkiliMuhendis) && webProfile?.adi) {
        sorumlu.yetkiliMuhendis = webProfile.adi;
    }
    if (_blank(sorumlu.projeyiCizen) && webProfile?.adi && webProfile?.firma_cizim_sorumlusu) {
        sorumlu.projeyiCizen = webProfile.adi;
    }
    if (_blank(sorumlu.usta) && webProfile?.adi && webProfile?.firma_tesisat_ustasi) {
        sorumlu.usta = webProfile.adi;
    }

    // Mühendis ve firma detayları — web verisi + sorumlu fallback'i.
    const muhKayitNo    = _pick(sorumlu.kayitNo,       webProfile?.proje_muh_kayit_no);
    const muhSicilNo    = _pick(sorumlu.odaSicilNo,    webProfile?.proje_muh_oda_sicil_no);
    const muhYeterlilik = _pick(sorumlu.yeterlilikNo,  webFirm?.pf_yeterlilik_no);
    const firmaVDairesi = _pick(sorumlu.vergiDairesi,  webFirm?.pf_vergi_dairesi);
    const firmaVergiNo  = _pick(sorumlu.vergiNo,       webFirm?.pf_vergi_no);
    const firmaAdres    = _pick(sorumlu.firmaAdres,    webFirm?.pf_adres);
    const firmaTelefon  = _pick(sorumlu.firmaTel,      webFirm?.pf_tel);
    const cepTelNo      = _pick(sorumlu.cepTel,        webProfile?.gsm);

    const r = (v) => `<span class="kp-var">${_esc(v ?? '')}</span>`;

    const basinc = String(meta.kutuBasinc || '21');
    const kutuTipi = _servisKutusuTipi();
    const sayacTipleri = _sayacTipleri();
    const alan = _toplamAlan();
    const kapasite = _toplamKapasite();
    const tarih = _today();

    overlay.querySelector('#kapakPage').innerHTML = `
        <div class="kp-frame">
        <div class="kp-logo-wrap">${ICON_LOGO}</div>

        <table class="kp-tbl kp-tbl-onay">
            <colgroup>
                <col style="width: 50%;">
                <col style="width: 50%;">
            </colgroup>
            <thead>
                <tr>
                    <th>PROJE TASARIMCISININ KAŞE VE ONAYI</th>
                    <th>İGDAŞ'IN ONAYI</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td class="kp-onay-box-left-container">
                        <div class="kp-onay-box-top">&nbsp;</div>
                        <div class="kp-onay-mid">Projedeki plan, hesap, beyan ve taahhütlerin mesuliyetini kabul ederim.</div>
                        <div class="kp-onay-notes">
                            ${(meta.tadilatSebep || '').trim() ? `<div><strong>Tadilat Açıklama:</strong> ${r(meta.tadilatSebep)}</div>` : ''}
                            ${(meta.projeKapagiNotu || '').trim() ? `<div><strong>Proje Tasarımcısının Notu:</strong> ${r(meta.projeKapagiNotu)}</div>` : ''}
                        </div>
                    </td>
                    <td class="kp-onay-box-right">&nbsp;</td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-3col">
            <colgroup>
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 8%;">
                <col style="width: 17%;">
                <col style="width: 17%;">
                <col style="width: 16%;">
                <col style="width: 17%;">
            </colgroup>
            <tbody>
                <tr>
                    <th colspan="2">KULLANIM BASINCI</th><td>${r(basinc)}</td>
                    <th>TESİSAT NO</th><td>${r(meta.binaTesisatNo)}</td>
                    <th>SAYAÇ TİPİ ADEDİ</th><td>${r(sayacTipleri[0])}</td>
                </tr>
                <tr>
                    <th colspan="2">SERVİS KUTU BASINCI</th><td>${r(basinc)}</td>
                    <th>BAĞLANTI NESNESİ</th><td>${r('')}</td>
                    <th>SAYAÇ TİPİ ADEDİ</th><td>${r(sayacTipleri.slice(1).join(' + '))}</td>
                </tr>
                <tr>
                    <th colspan="2">SERVİS KUTUSU TİPİ</th><td>${r(kutuTipi)}</td>
                    <th>İGABİS NO</th><td>${r('')}</td>
                    <th>RUHSAT TRH./NO</th><td>${r('')}</td>
                </tr>
            </tbody>
        </table>

        <table class="kp-tbl kp-tbl-bina">
            <colgroup>
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 12%;">
                <col style="width: 13%;">
                <col style="width: 17%;">
                <col style="width: 16%;">
                <col style="width: 17%;">
            </colgroup>
            <thead>
                <tr><th colspan="7" class="kp-section-head">BİNANIN</th></tr>
                <tr>
                    <th colspan="2">İLÇESİ</th>
                    <th colspan="2">MAHALLESİ</th>
                    <th>SOKAĞI VE NO</th>
                    <th colspan="2">ADA-PAFTA-PARSEL</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="2">${r(adres.ilce)}</td>
                    <td colspan="2">${r(adres.mahalle)}</td>
                    <td>${r([adres.sokak, adres.binaNo].filter(Boolean).join(' '))}</td>
                    <td colspan="2">${r('')}</td>
                </tr>
                <tr>
                    <th colspan="2">KAT SAYISI</th>
                    <th colspan="2">DAİRE VE İŞYERİ SAYISI</th>
                    <th>TOPLAM ALAN<span class="kp-unit">(m²)</span></th>
                    <th colspan="2">TOPLAM KAPASİTE<span class="kp-unit">(m³/h)</span></th>
                </tr>
                <tr>
                    <td colspan="2">${r(_katSayisi())}</td>
                    <td colspan="2">${r(_daireDukkan())}</td>
                    <td>${r(alan != null ? Math.round(alan).toString() : '')}</td>
                    <td colspan="2">${r(kapasite != null ? (Math.round(kapasite * 100) / 100).toString() : '0')}</td>
                </tr>
            </tbody>
        </table>

        <!-- ── TASARIMCI + FİRMA tablosu (6 sütun, ortak grid) ────── -->
        <table class="kp-tbl kp-tbl-tasarimci">
            <colgroup>
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 12%;">
                <col style="width: 13%;">
                <col style="width: 17%;">
                <col style="width: 16%;">
                <col style="width: 17%;">
            </colgroup>
            <thead>
                <tr>
                    <th colspan="4" class="kp-section-head">PROJE TASARIMCISININ</th>
                    <th colspan="3" class="kp-section-head">FİRMANIN</th>
                </tr>
                <tr>
                    <th colspan="2">ADI SOYADI</th>
                    <th>KAYIT NO</th>
                    <th>ODA SİCİL NO</th>
                    <th>YETERLİLİK NO</th>
                    <th>V.DAİRESİ</th>
                    <td>${r(firmaVDairesi)}</td>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="2">${r(sorumlu.yetkiliMuhendis)}</td>
                    <td>${r(muhKayitNo)}</td>
                    <td>${r(muhSicilNo)}</td>
                    <td>${r(muhYeterlilik)}</td>
                    <th>VERGİ NO</th>
                    <td>${r(firmaVergiNo)}</td>
                </tr>
                <tr>
                    <th>ADRES</th>
                    <td colspan="4">${r(firmaAdres)}</td>
                    <th>TELEFON</th>
                    <td>${r(firmaTelefon)}</td>
                </tr>
            </tbody>
        </table>

        <!-- ── İMZA bloku — 6 col grid (ortak hizalama) ──────────── -->
        <table class="kp-tbl kp-tbl-imza">
            <colgroup>
                <col style="width: 15%;">
                <col style="width: 10%;">
                <col style="width: 12%;">
                <col style="width: 13%;">
                <col style="width: 17%;">
                <col style="width: 16%;">
                <col style="width: 17%;">
            </colgroup>
            <tbody>
                <!-- YAPAN bloku — YAPAN+date cs=2 (25%), FİRMA ADI cs=4, CEP TEL cs=1 -->
                <tr>
                    <th>YAPAN</th>
                    <td class="kp-tar">${r(tarih)}</td>
                    <td colspan="4" rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">FİRMA ADI</div>
                        <div class="kp-mg-val">${r(sorumlu.yetkiliFirma)}</div>
                    </td>
                    <td rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">CEP TEL NO:</div>
                        <div class="kp-mg-val">${r(cepTelNo)}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" class="kp-imza-ad-left">${r(sorumlu.usta || sorumlu.yetkiliMuhendis)}</td>
                </tr>
                <tr>
                    <th colspan="2">İMZA</th>
                </tr>
                <!-- ÇİZEN bloku -->
                <tr>
                    <th>ÇİZEN</th>
                    <td class="kp-tar">${r(tarih)}</td>
                    <td colspan="4" rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">BİNA PROJE ADI</div>
                        <div class="kp-mg-val">${r(projeAdi)}</div>
                    </td>
                    <td rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">ÖLÇEK</div>
                        <div class="kp-mg-val">${r('1/50')}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" class="kp-imza-ad-left">${r(sorumlu.projeyiCizen)}</td>
                </tr>
                <tr>
                    <th colspan="2">İMZA</th>
                </tr>
                <!-- KONTROL bloku -->
                <tr>
                    <th>KONTROL</th>
                    <td class="kp-tar">${r(tarih)}</td>
                    <td colspan="4" rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">GAZ ALAN DAIRE NO</div>
                        <div class="kp-mg-val">${r(_gazAlanDaire())}</div>
                    </td>
                    <td rowspan="3" class="kp-imza-merged">
                        <div class="kp-mg-lbl">PROJE NO</div>
                        <div class="kp-mg-val">${r('')}</div>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" class="kp-imza-ad-left">${r(sorumlu.yetkiliMuhendis)}</td>
                </tr>
                <tr>
                    <th colspan="2">İMZA</th>
                </tr>
            </tbody>
        </table>
        </div>
    `;
}

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