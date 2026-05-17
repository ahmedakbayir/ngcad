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
    return `Regülatör (${tail.slice(0, 4)})`;
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
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-reg50-${c.id}`,
            message: `${regLabel(c)}: çıkış basıncı 50 mbar olamaz`,
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
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-ocak-fleks-${c.id}`,
            message: `${cihazLabel(c, 'Ocak')} fleksi ${Math.round(len)} cm — ${OCAK_FLEKS_MAX_CM} cm'den uzun olamaz`,
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
        out.push({
            group:   ERROR_GROUP_IDS.TASARIM,
            errorId: `tasarim-kombi-fleks-${c.id}`,
            message: `${cihazLabel(c, 'Kombi')} fleksi ${Math.round(len)} cm — ${KOMBI_FLEKS_MAX_CM} cm'den uzun olamaz`,
            source:  'TS7363 Md:6',
            detail:  'Kombi, şofben, soba vb. cihazlar için esnek bağlantı hortumunun uzunluğu en fazla 60 cm olmalıdır.',
            targets: [{ type: 'comp', id: c.id }],
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
    return out;
}

errorCheckManager.register('tasarim', tasarimChecker);
