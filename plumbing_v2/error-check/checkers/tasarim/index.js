// tasarim / index.js
// Tasarım kuralları — birden fazla bağımsız kural tek checker altında.
// Kurallar (eklenecek olanlar mevcut yapıya kolayca eklenebilir):
//   1. Md:4.3.4  — Kolondaki regülatör çıkış basıncı 50 mbar olamaz
//   2. Md:6      — Ocak fleksi > 150 cm olamaz
//   3. Md:6      — Kombi/şofben/soba fleksi > 60 cm olamaz

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { recomputeAllPressures } from '../../../utils/pressure-recompute.js';
import { draw2D } from '../../../../draw/draw2d.js';
import { state } from '../../../../general-files/main.js';
import { getColumnCorners } from '../../../../architectural-objects/columns.js';
import { getBeamCorners } from '../../../../architectural-objects/beams.js';
import {
    daireLabel,
    cihazHatLabel,
    findMeterUpstream,
    floorNameById,
    hatNoForComp,
    hatNoForPipe,
    hatPrefix,
    birimHatPrefix,
    sayacHatLabel,
    BIRIM_PLACEHOLDER,
} from '../../checker-utils.js';

const OCAK_FLEKS_MAX_CM = 150;
const KOMBI_FLEKS_MAX_CM = 60;
const KOMBI_GIBI = new Set(['KOMBI', 'SOFBEN', 'SOBA']);
const EVSEL_CIHAZ_TIPI = new Set(['OCAK', 'KOMBI', 'SOFBEN', 'SOBA']);

// ─── Yardımcılar ──────────────────────────────────────────────────────────

// Bir regülatörün bağlı olduğu boru, herhangi bir sayacın upstream tarafında mı?
function isUpstreamOfAnyMeter(manager, regulator) {
    if (!regulator?.bagliBoruId) return false;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    for (const meter of (manager.components || [])) {
        if (meter.type !== 'sayac') continue;
        let cursorId = meter.fleksBaglanti?.boruId;
        const seen = new Set();
        while (cursorId && !seen.has(cursorId)) {
            seen.add(cursorId);
            if (cursorId === regulator.bagliBoruId) return true;
            const pipe = pipeMap.get(cursorId);
            const par = pipe?.baslangicBaglanti;
            if (par?.tip === 'boru' && par.hedefId) cursorId = par.hedefId;
            else break;
        }
    }
    return false;
}

function regLabel(reg) {
    if (!reg?.id) return 'Regülatör';
    const tail = reg.id.split('_').pop();
    return `Regülatör`;
}

function cihazLabel(c, fallback) {
    return c.label || c.cihazTipi || fallback;
}

// Fleks uzunluğunun GEOMETRİK olarak gerçek değeri.
// device.js → fleksGuncelle() saklanan 'uzunluk' alanını FLEKS_CONFIG.maxUzunluk
// (150 cm) ile clamp eder; cihazı daha uzağa taşırsanız 'uzunluk' yine 150 kalır.
// Bu yüzden cihazın giriş noktası ile bağlı boru ucu arasındaki düz mesafeyi
// gerçek-zamanlı hesaplıyoruz.
function gercekFleksUzunlukCm(cihaz, manager) {
    const bag = cihaz?.fleksBaglanti;
    if (!bag?.boruId || !bag?.endpoint) {
        return Number(bag?.uzunluk) || 0;
    }
    const pipe = (manager?.pipes || []).find(p => p.id === bag.boruId);
    if (!pipe) return Number(bag?.uzunluk) || 0;
    const end = bag.endpoint === 'p1' ? pipe.p1 : pipe.p2;
    if (!end) return Number(bag?.uzunluk) || 0;

    // Cihazın giriş noktası (world koord.)
    let giris;
    try {
        const local = typeof cihaz.getGirisLocalKoordinat === 'function'
            ? cihaz.getGirisLocalKoordinat()
            : (cihaz.girisOffset || { x: 0, y: 0 });
        giris = typeof cihaz.localToWorld === 'function'
            ? cihaz.localToWorld(local)
            : { x: cihaz.x + local.x, y: cihaz.y + local.y, z: cihaz.z || 0 };
    } catch {
        giris = { x: cihaz.x, y: cihaz.y, z: cihaz.z || 0 };
    }

    return Math.hypot(
        end.x - giris.x,
        end.y - giris.y,
        (end.z || 0) - (giris.z || 0),
    );
}

// ─── Kural emitleyicileri ─────────────────────────────────────────────────

function regCikisBasinc50(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'regulator') return;
        if (c.cikisBasinc !== '50') return;
        if (!isUpstreamOfAnyMeter(manager, c)) return;
        const hatNo = hatNoForComp(manager, c);
        const msg = hatNo != null
            ? `${hatNo} nolu hattaki Regülatör çıkış basıncı 50 mbar olamaz`
            : 'Regülatör çıkış basıncı 50 mbar olamaz';
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-reg50-${c.id}`,
            message: msg,
            floorName: floorNameById(c.floorId),
            source:  'TS7363 Md:4.3.4',
            detail:  'Servis kutusu çıkışı 300 mbar tesisatta, reglaj grubu sayaçtan önce tesis ediliyor ise regülatör çıkış basıncı sadece 21 mbar olabilir.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'Regülatör çıkış basıncı 21 mbar yapılacak',
                apply: () => {
                    c.cikisBasinc = '21';
                    try { recomputeAllPressures(manager); } catch (_) {}
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

function ocakFleksUzunluk(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz' || c.cihazTipi !== 'OCAK') return;
        if (!c.fleksBaglanti?.boruId) return;
        const len = gercekFleksUzunlukCm(c, manager);
        if (!isFinite(len) || len <= OCAK_FLEKS_MAX_CM) return;
        const label = cihazHatLabel(manager, c);
        // "X nolu hattaki Ocak fleksi 150 cm'den uzun olamaz"
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-ocak-fleks-${c.id}`,
            message: `${label} fleksi ${OCAK_FLEKS_MAX_CM} cm'den uzun olamaz`,
            floorName: floorNameById(c.floorId),
            source:  'TS7363 Md:6',
            detail:  'Mutfak cihazlarının gaz hattı bağlantılarında kullanılacak olan esnek bağlantı hortumunun uzunluğu en fazla 150 cm olmalıdır.',
            targets: [{ type: 'comp', id: c.id }],
            fix: null,
        });
    });
}

function ticariCihazTipiKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz' || c.cihazTipi !== 'TICARI') return;
        const tip = String(c.ticariCihazTipi || '').trim();
        if (tip) return;
        const label = cihazHatLabel(manager, c);
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-ticari-tip-${c.id}`,
            message: `${label} için cihaz tipi seçilmelidir`,
            floorName: floorNameById(c.floorId),
            source:  'proje gereği',
            detail:  'Ticari cihazlar için cihaz tipi (Çiller, Brülör, Kazan, Endüstriyel Fırın vb.) panelden seçilmelidir.',
            targets: [{ type: 'comp', id: c.id }],
            fix: null,
        });
    });
}

function kombiFleksUzunluk(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz' || !KOMBI_GIBI.has(c.cihazTipi)) return;
        if (!c.fleksBaglanti?.boruId) return;
        const len = gercekFleksUzunlukCm(c, manager);
        if (!isFinite(len) || len <= KOMBI_FLEKS_MAX_CM) return;
        const label = cihazHatLabel(manager, c);
        // "X nolu hattaki Kombi fleksi 60 cm'den uzun olamaz"
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-kombi-fleks-${c.id}`,
            message: `${label} fleksi ${KOMBI_FLEKS_MAX_CM} cm'den uzun olamaz`,
            floorName: floorNameById(c.floorId),
            source:  'TS7363 Md:6',
            detail:  'Kombi, şofben, soba vb. cihazlar için esnek bağlantı hortumunun uzunluğu en fazla 60 cm olmalıdır.',
            targets: [{ type: 'comp', id: c.id }],
            fix: null,
        });
    });
}

// İki nokta arasında 3D mesafe (cm) — uç eşleştirme için
function _dist3D(a, b) {
    if (!a || !b) return Infinity;
    return Math.hypot(
        (a.x ?? 0) - (b.x ?? 0),
        (a.y ?? 0) - (b.y ?? 0),
        (a.z ?? 0) - (b.z ?? 0),
    );
}
// Child'in başlangıç noktası, parent borusunun akış sonu ucuyla çakışıyor mu?
// Çakışıyorsa "düz devam" (T DEĞİL). 1 cm tolerans, snap işlemlerinden gelen
// yarım cm farklarını yutmak için yeterli.
function isAtPipeEnd(childStart, parentEnd) {
    return _dist3D(childStart, parentEnd) < 1;
}

// ─── Md:4.1.3 — Esnek (ondüleli) boruda T dışında redüksiyon yapılamaz ───
// Sayaç sonrası, birimBoruTipi='ESNEK' olan tesisatlarda her boru çiftinde
// parent ile child çapı farklıysa ve child parent'ın T-ayrımında değilse hata.
function esnekReduksiyonKurali(manager, out) {
    if (!manager?.pipes?.length) return;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));

    (manager.components || []).forEach(sayac => {
        if (sayac.type !== 'sayac') return;
        if (sayac.birimBoruTipi !== 'ESNEK') return;
        const startPipeId = sayac.cikisBagliBoruId;
        if (!startPipeId) return;

        const seen = new Set();
        const queue = [startPipeId];
        while (queue.length) {
            const pid = queue.shift();
            if (seen.has(pid)) continue;
            seen.add(pid);
            const parent = pipeMap.get(pid);
            if (!parent) continue;

            // parent'ın downstream çocukları
            const children = manager.pipes.filter(child =>
                child.baslangicBaglanti?.tip === 'boru' &&
                child.baslangicBaglanti.hedefId === pid
            );

            // Parent ucunda (p2) kaç çocuk başlıyor? 2+ ise TE rakoru (3 yönlü
            // birleşim), her çocuk T-ayrım sayılır → redüksiyona izin var.
            const endChildrenCount = children.filter(c => isAtPipeEnd(c.p1, parent.p2)).length;
            const isEndJunction = endChildrenCount >= 2;

            for (const child of children) {
                // T-ayrım tespiti:
                //   1) parent.tBaglantilar listesinde child.id varsa → T (mid-pipe T)
                //   2) child.p1, parent.p2 (akış sonu) yakınında DEĞİLSE → T (mid-pipe çıkış)
                //   3) parent.p2'de birden fazla çocuk başlıyorsa → TE rakoru (endpoint T)
                //   Sadece düz devam (parent ucunda tek çocuk + p1 ≈ p2) durumunda
                //   redüksiyon yasaktır.
                const inTList = Array.isArray(parent.tBaglantilar)
                    && parent.tBaglantilar.some(tb => tb.boruId === child.id);
                const isStraightContinuation = isAtPipeEnd(child.p1, parent.p2);
                const isTBranch = inTList || !isStraightContinuation || isEndJunction;
                const pCap = parent.boruCap;
                const cCap = child.boruCap;
                if (pCap && cCap && pCap !== cCap && !isTBranch) {
                    const hatNo = hatNoForPipe(manager, child.id);
                    const pre = birimHatPrefix(manager, { sayac, hatNo });
                    // "D2 biriminde X nolu hattaki Esnek boruda sadece TE ayrımında redüksiyon kullanılabilir"
                    out.push({
                        group:   ERROR_GROUP_IDS.TASARIM,
                        errorId: `tasarim-esnek-reduksiyon-${child.id}`,
                        message: `${pre ? pre + ' ' : ''}Esnek boruda sadece TE ayrımında redüksiyon kullanılabilir`,
                        floorName: floorNameById(child.floorId || sayac.floorId),
                        source:  'TS7363 Md:4.1.3',
                        detail:  'Ondüleli boruda ek ve/veya redüksiyon ile çap değişimi yapılmamalıdır. T ayrımına kadar tesisat tek parça olmalı, T ayrımında redüksiyon ile çap değişimi yapılmalıdır.',
                        targets: [{ type: 'pipe', id: child.id }],
                        fix: {
                            description: `Redüksiyon kaldırılacak: ${cCap} → ${pCap} (parent çapı)`,
                            apply: () => fixEsnekReduksiyon(manager, child.id, pCap),
                        },
                    });
                }
                queue.push(child.id);
            }
        }
    });
}

function fixEsnekReduksiyon(manager, pipeId, parentCap) {
    const p = manager.pipes?.find(pp => pp.id === pipeId);
    if (!p || !parentCap) return false;
    p.boruCap = parentCap;
    try { recomputeAllPressures(manager); } catch (_) {}
    manager.saveToState?.();
    try { draw2D(); } catch (_) {}
    return true;
}

// ─── Birim içi bağlantı tipi: daire/ofis (her şey) / ticari + kazan dairesi (sadece kaynaklı) ───
function birimBaglantiTipiKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'sayac') return;
        const tipi = c.birimTipi;
        if (tipi !== 'TİCARİ' && tipi !== 'KAZAN DAİRESİ') return;
        const isKaynakli = c.birimBoruTipi === 'ÇELİK' && c.birimBaglantiTipi === 'KAYNAKLI';
        if (isKaynakli) return;
        const label = sayacHatLabel(manager, c);
        const birimAd = tipi === 'TİCARİ' ? 'ticari' : 'kazan dairesi';
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-birim-baglanti-${c.id}`,
            message: `${label} (${birimAd}) için birim içi tesisat sadece kaynaklı olabilir`,
            floorName: floorNameById(c.floorId),
            source:  'proje gereği',
            detail:  'Ticari ve kazan dairesi birimlerinde birim içi tesisat yalnızca kaynaklı çelik olabilir; esnek veya dişli bağlantı kullanılamaz.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'Birim içi tesisat kaynaklı çelik olarak ayarlanacak',
                apply: () => {
                    c.birimBoruTipi = 'ÇELİK';
                    c.birimBaglantiTipi = 'KAYNAKLI';
                    try { recomputeAllPressures(manager); } catch (_) {}
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });

    // Kolon (servis kutusu) — sadece KAYNAKLI olmalı
    (manager.components || []).forEach(c => {
        if (c.type !== 'servis_kutusu') return;
        const isKaynakli = (!c.kutuBoruTipi || c.kutuBoruTipi === 'ÇELİK')
            && (!c.kutuBaglantiTipi || c.kutuBaglantiTipi === 'KAYNAKLI');
        if (isKaynakli) return;
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-kolon-baglanti-${c.id}`,
            message: `Kolon tesisatı sadece kaynaklı olabilir`,
            floorName: floorNameById(c.floorId),
            source:  'proje gereği',
            detail:  'Sayaç öncesi kolon hattı yalnızca kaynaklı çelik olabilir; esnek veya dişli bağlantı kullanılamaz.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'Kolon tesisatı kaynaklı çelik olarak ayarlanacak',
                apply: () => {
                    c.kutuBoruTipi = 'ÇELİK';
                    c.kutuBaglantiTipi = 'KAYNAKLI';
                    try { recomputeAllPressures(manager); } catch (_) {}
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

// ─── Esnek tesisat sadece 21 mbar olabilir ───
function esnekBasincKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'sayac') return;
        if (c.birimBoruTipi !== 'ESNEK') return;
        const basinc = String(c.basinc ?? '').trim();
        if (basinc === '21') return;
        const label = sayacHatLabel(manager, c);
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-esnek-basinc-${c.id}`,
            message: `${label} için esnek tesisat sadece 21 mbar olabilir`,
            floorName: floorNameById(c.floorId),
            source:  'proje gereği',
            detail:  'Esnek (ondüleli) tesisat yalnızca 21 mbar tasarım basıncında kullanılabilir.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'Sayaç basıncı 21 mbar yapılacak',
                apply: () => {
                    c.basinc = '21';
                    try { recomputeAllPressures(manager); } catch (_) {}
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

// ─── Esnek tesisatta sadece evsel cihazlar (ocak, kombi, soba, şofben) bulunabilir ───
function esnekEvselCihazKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz') return;
        const tip = String(c.cihazTipi || '').toUpperCase();
        if (EVSEL_CIHAZ_TIPI.has(tip)) return;
        const sayac = findMeterUpstream(manager, c.fleksBaglanti?.boruId || c.bagliBoruId);
        if (!sayac) return;
        if (sayac.birimBoruTipi !== 'ESNEK') return;
        const label = cihazHatLabel(manager, c);
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-esnek-cihaz-${c.id}`,
            message: `${label} esnek tesisatta bulunamaz`,
            floorName: floorNameById(c.floorId || sayac.floorId),
            source:  'proje gereği',
            detail:  'Esnek (ondüleli) tesisatta yalnızca evsel cihazlar (ocak, kombi, soba, şofben) bulunabilir; kazan ve ticari cihazlar esnek tesisatta kullanılamaz.',
            targets: [{ type: 'comp', id: c.id }],
            fix: null,
        });
    });
}

// ─── Ticari cihaz varsa birim ticari olmalıdır ───
function ticariCihazBirimKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'cihaz') return;
        const tip = String(c.cihazTipi || '').toUpperCase();
        if (tip !== 'TICARI') return;
        const sayac = findMeterUpstream(manager, c.fleksBaglanti?.boruId || c.bagliBoruId);
        if (!sayac) return;
        if (sayac.birimTipi === 'TİCARİ') return;
        const label = cihazHatLabel(manager, c);
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-ticari-birim-${c.id}`,
            message: `${label} için birim tipi ticari olmalıdır`,
            floorName: floorNameById(c.floorId || sayac.floorId),
            source:  'proje gereği',
            detail:  'Ticari cihaz bulunan birimin tipi TİCARİ olmalıdır.',
            targets: [{ type: 'comp', id: c.id }, { type: 'comp', id: sayac.id }],
            fix: {
                description: 'Sayaçtaki birim tipi TİCARİ olarak ayarlanacak',
                apply: () => {
                    sayac.birimTipi = 'TİCARİ';
                    manager.saveToState?.();
                    try { draw2D(); } catch (_) {}
                    return true;
                },
            },
        });
    });
}

// ─── Kolon / Kiriş içinden tesisat geçişi ────────────────────────────────
// Boru segmenti aynı kattaki kolon veya kiriş gövdesinin içinden geçemez.
// Test: 2D pipe segmenti (p1→p2) rotated rectangle ile kesişiyor mu?

function _ccw(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function _segmentsIntersect(p1, p2, p3, p4) {
    const d1 = _ccw(p3, p4, p1);
    const d2 = _ccw(p3, p4, p2);
    const d3 = _ccw(p1, p2, p3);
    const d4 = _ccw(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function _pointInPolygon(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        if (((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}
function _pipeIntersectsRect(pipe, corners) {
    if (!corners || corners.length < 3 || !pipe?.p1 || !pipe?.p2) return false;
    const a = { x: pipe.p1.x, y: pipe.p1.y };
    const b = { x: pipe.p2.x, y: pipe.p2.y };
    if (_pointInPolygon(a, corners) || _pointInPolygon(b, corners)) return true;
    for (let i = 0; i < corners.length; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % corners.length];
        if (_segmentsIntersect(a, b, c1, c2)) return true;
    }
    return false;
}

function kolonKirisIcindenGecisKurali(manager, out) {
    if (!manager?.pipes?.length) return;
    const columns = state.columns || [];
    const beams = state.beams || [];
    if (!columns.length && !beams.length) return;

    // Floor bazlı kolon/kiriş haritası
    const colsByFloor = new Map();
    columns.forEach(col => {
        const fid = col.floorId ?? null;
        if (!colsByFloor.has(fid)) colsByFloor.set(fid, []);
        colsByFloor.get(fid).push(col);
    });
    const beamsByFloor = new Map();
    beams.forEach(b => {
        const fid = b.floorId ?? null;
        if (!beamsByFloor.has(fid)) beamsByFloor.set(fid, []);
        beamsByFloor.get(fid).push(b);
    });

    manager.pipes.forEach(pipe => {
        if (!pipe?.p1 || !pipe?.p2) return;
        const fid = pipe.floorId ?? null;
        const candidateCols = (colsByFloor.get(fid) || []).concat(colsByFloor.get(null) || []);
        const candidateBeams = (beamsByFloor.get(fid) || []).concat(beamsByFloor.get(null) || []);

        let hitKolon = false;
        let hitKiris = false;
        for (const col of candidateCols) {
            if (_pipeIntersectsRect(pipe, getColumnCorners(col))) { hitKolon = true; break; }
        }
        for (const beam of candidateBeams) {
            if (_pipeIntersectsRect(pipe, getBeamCorners(beam))) { hitKiris = true; break; }
        }
        if (!hitKolon && !hitKiris) return;

        const hatNo = hatNoForPipe(manager, pipe.id);
        const pre = hatPrefix(hatNo);
        const nesne = hitKolon && hitKiris ? 'kolon ve kiriş'
                    : hitKolon ? 'kolon' : 'kiriş';
        const msg = pre
            ? `${pre} tesisat ${nesne} içinden geçmemelidir`
            : `Tesisat ${nesne} içinden geçmemelidir`;
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-kolon-kiris-gecis-${pipe.id}`,
            message: msg,
            floorName: floorNameById(pipe.floorId),
            source:  'proje gereği',
            detail:  'Gaz tesisat boruları taşıyıcı sistem elemanlarının (kolon, kiriş) içinden geçirilemez; bu elemanların çevresinden veya altından/üstünden döşenmelidir.',
            targets: [{ type: 'pipe', id: pipe.id }],
            fix: null,
        });
    });
}

// ─── Bir sayacın parentinde başka sayaç bulunamaz ─────────────────────────
// Sayaç A'nın upstream pipe-parent zincirinde başka bir sayaç B varsa hata.

function parentSayacKurali(manager, out) {
    (manager.components || []).forEach(s => {
        if (s.type !== 'sayac') return;
        const inputPipeId = s.fleksBaglanti?.boruId;
        if (!inputPipeId) return;
        const parentSayac = findMeterUpstream(manager, inputPipeId);
        if (!parentSayac || parentSayac.id === s.id) return;

        const parentDaire = daireLabel(parentSayac) || BIRIM_PLACEHOLDER;
        const childDaire = daireLabel(s);
        const childAd = childDaire ? `${childDaire} sayacı` : 'sayaç';
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-parent-sayac-${s.id}`,
            message: `${parentDaire} biriminde sayaç sonrası tekrar sayaç kullanılamaz (${childAd})`,
            floorName: floorNameById(s.floorId || parentSayac.floorId),
            source:  'proje gereği',
            detail:  'Bir sayacın downstream (sonrası) tesisatında başka bir sayaç bulunamaz; her birim tek sayaçla beslenmelidir.',
            targets: [{ type: 'comp', id: s.id }, { type: 'comp', id: parentSayac.id }],
            fix: null,
        });
    });
}

// ─── Toplu checker ────────────────────────────────────────────────────────

function tasarimChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    regCikisBasinc50(manager, out);
    ocakFleksUzunluk(manager, out);
    kombiFleksUzunluk(manager, out);
    ticariCihazTipiKurali(manager, out);
    esnekReduksiyonKurali(manager, out);
    birimBaglantiTipiKurali(manager, out);
    esnekBasincKurali(manager, out);
    esnekEvselCihazKurali(manager, out);
    ticariCihazBirimKurali(manager, out);
    kolonKirisIcindenGecisKurali(manager, out);
    parentSayacKurali(manager, out);
    return out;
}

errorCheckManager.register('tasarim', tasarimChecker);
