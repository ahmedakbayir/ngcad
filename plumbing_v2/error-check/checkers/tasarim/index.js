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
import {
    daireLabel,
    cihazHatLabel,
    findMeterUpstream,
    floorNameById,
    hatNoForComp,
    hatNoForPipe,
    hatPrefix,
    birimHatPrefix,
} from '../../checker-utils.js';

const OCAK_FLEKS_MAX_CM = 150;
const KOMBI_FLEKS_MAX_CM = 60;
const KOMBI_GIBI = new Set(['KOMBI', 'SOFBEN', 'SOBA']);

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

// ─── Toplu checker ────────────────────────────────────────────────────────

function tasarimChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    regCikisBasinc50(manager, out);
    ocakFleksUzunluk(manager, out);
    kombiFleksUzunluk(manager, out);
    esnekReduksiyonKurali(manager, out);
    return out;
}

errorCheckManager.register('tasarim', tasarimChecker);
