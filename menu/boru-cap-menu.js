// boru-cap-menu.js
// "Hesap ► Boru Çapı Hesapları" — TS 7363:2018 §4.4.1 (≤50 mbar, çelik boru)
//
// Her hat için:
//   ΔPΣ = ΔPR + ΔPZ + ΔPH
//   P1 - P2 = 23,2 × R × Q^1.82 / D^4.82 × L                   (bar)
//   ΔPR    = (P1 - P2) × 1000                                  (mbar)
//   V      = 353,677 × Q / (D² × P2)                           (m/s)
//   ΔPZ    = 3,97e-3 × Σξ × V²                                 (mbar)
//   ΔPH    = 0,049 × H                                         (mbar)
//
// Σξ değerleri "Fittings (Lokal Kayıplar)" tablosundan gelir (computeFittings).
// İlk hattın P1'i 21 mbar girişler için 1,021 bar; sonraki hatlarda parent
// hattın P2 değeri kullanılır.
//
// ESNEK TESİSAT (sayaç birimBoruTipi = 'ESNEK'): Sayaç sonrası TÜKETİM hatları
// için ΔPR formül yerine TS EN 15266 BLH hortum tablosundan okunur.
// V ve ΔPR/L değerleri Q için tabloda lineer interpolasyon ile bulunur.
// Esnek boru sadece DN15, DN20, DN25, DN32 için tanımlıdır.
// ΔPZ ve ΔPH normal formülle hesaplanmaya devam eder.

import { plumbingManager } from '../plumbing_v2/plumbing-manager.js';
import { computeHatGroups } from '../plumbing_v2/renderer/renderer-utils.js';
import { computeFittings } from './fittings-menu.js';
import { draw2D } from '../draw/draw2d.js';
import { selectHatInProject, selectPathInProject } from './calc-table-helpers.js';
import { CIHAZ_TIPLERI } from '../plumbing_v2/objects/device.js';

// Birim Tipi + No → "D1", "KD2", "(Ofis) Dük3" gibi kısa daire etiketi.
// renderer-labels.js içindeki getBirimLabelLines ile aynı mantık.
function dairePrefix(comp) {
    if (!comp) return '';
    const no = comp.birimNo;
    if (no == null || String(no).trim() === '') return '';
    const tipi = comp.birimTipi || 'KONUT';
    switch (tipi) {
        case 'KONUT': return `D${no}`;
        case 'OFİS': return `(Ofis) Dük${no}`;
        case 'TİCARİ': return `(Ticari) Dük${no}`;
        case 'KAZAN DAİRESİ': return `KD${no}`;
        default: return `D${no}`;
    }
}

// TS 7363 Çizelge 1 — Çelik borularda dış çap & cidar kalınlığı
export const PIPE_SPECS = {
    'DN15':  { od: 21.3,  wall: 2.80 },
    'DN20':  { od: 26.9,  wall: 2.90 },
    'DN25':  { od: 33.7,  wall: 3.40 },
    'DN32':  { od: 42.4,  wall: 3.60 },
    'DN40':  { od: 48.3,  wall: 3.70 },
    'DN50':  { od: 60.3,  wall: 3.90 },
    'DN65':  { od: 73.0,  wall: 5.20 },
    'DN80':  { od: 88.9,  wall: 5.50 },
    'DN100': { od: 114.3, wall: 6.00 },
    'DN125': { od: 141.0, wall: 6.60 },
    'DN150': { od: 168.3, wall: 7.10 },
    'DN200': { od: 219.1, wall: 8.18 },
    'DN250': { od: 273.0, wall: 9.27 },
    'DN300': { od: 323.0, wall: 9.50 },
    'DN400': { od: 406.0, wall: 9.50 },
    'DN450': { od: 470.0, wall: 9.50 },
};
export const DN_LIST = Object.keys(PIPE_SPECS);

const R_GAS = 0.6;       // gaz sabiti
export const V_LIMIT = 6;       // m/s — 21–50 mbar hatlar için
export const V_LIMIT_HIGH = 15; // m/s — 300 mbar (>50 mbar) hatlar için

// Yüksek basınçlı tesisat eşiği (mbar). > 50 mbar → 300 mbar gibi davranır.
function isHighPressure(basinc) {
    return parseFloat(basinc) > 50;
}

// Hız limiti (m/s) — basınca göre.
export function vLimitFor(basinc) {
    return isHighPressure(basinc) ? V_LIMIT_HIGH : V_LIMIT;
}

// TS EN 15266 — BLH Hortum Takımları (Esnek Tesisat)
// Q (m³/h) → { v (m/s), dPR_L (mbar/m) }
// Sadece sayaç birimBoruTipi = 'ESNEK' için ve sayaç sonrası TÜKETİM hatlarına uygulanır.
const ESNEK_TABLE = {
    'DN15': [
        { Q: 0.5, v: 0.79, dPR_L: 0.0092 },
        { Q: 1.0, v: 1.57, dPR_L: 0.0399 },
        { Q: 1.5, v: 2.36, dPR_L: 0.0938 },
        { Q: 2.0, v: 3.14, dPR_L: 0.1722 },
        { Q: 2.5, v: 3.93, dPR_L: 0.2757 },
        { Q: 3.0, v: 4.72, dPR_L: 0.4050 },
        { Q: 3.5, v: 5.50, dPR_L: 0.5606 },
        { Q: 4.0, v: 6.29, dPR_L: 0.7429 },
    ],
    'DN20': [
        { Q: 0.5, v: 0.44, dPR_L: 0.0025 },
        { Q: 1.0, v: 0.88, dPR_L: 0.0102 },
        { Q: 1.5, v: 1.33, dPR_L: 0.0234 },
        { Q: 2.0, v: 1.77, dPR_L: 0.0422 },
        { Q: 2.5, v: 2.21, dPR_L: 0.0667 },
        { Q: 3.0, v: 2.65, dPR_L: 0.0968 },
        { Q: 3.5, v: 3.09, dPR_L: 0.1328 },
        { Q: 4.0, v: 3.54, dPR_L: 0.1746 },
        { Q: 4.5, v: 3.98, dPR_L: 0.2222 },
        { Q: 5.0, v: 4.42, dPR_L: 0.2757 },
        { Q: 5.5, v: 4.86, dPR_L: 0.3352 },
        { Q: 6.0, v: 5.31, dPR_L: 0.4006 },
        { Q: 6.5, v: 5.75, dPR_L: 0.4720 },
        { Q: 7.0, v: 6.19, dPR_L: 0.5494 },
    ],
    'DN25': [
        { Q: 1.5,  v: 0.85, dPR_L: 0.0035 },
        { Q: 2.0,  v: 1.13, dPR_L: 0.0075 },
        { Q: 2.5,  v: 1.41, dPR_L: 0.0135 },
        { Q: 3.0,  v: 1.70, dPR_L: 0.0218 },
        { Q: 3.5,  v: 1.98, dPR_L: 0.0327 },
        { Q: 4.0,  v: 2.26, dPR_L: 0.0465 },
        { Q: 4.5,  v: 2.55, dPR_L: 0.0635 },
        { Q: 5.0,  v: 2.83, dPR_L: 0.0839 },
        { Q: 5.5,  v: 3.11, dPR_L: 0.1078 },
        { Q: 6.0,  v: 3.40, dPR_L: 0.1357 },
        { Q: 6.5,  v: 3.68, dPR_L: 0.1676 },
        { Q: 7.0,  v: 3.96, dPR_L: 0.2038 },
        { Q: 7.5,  v: 4.24, dPR_L: 0.2445 },
        { Q: 8.0,  v: 4.53, dPR_L: 0.2898 },
        { Q: 8.5,  v: 4.81, dPR_L: 0.3401 },
        { Q: 9.0,  v: 5.09, dPR_L: 0.3955 },
        { Q: 9.5,  v: 5.38, dPR_L: 0.4561 },
        { Q: 10.0, v: 5.66, dPR_L: 0.5223 },
        { Q: 10.5, v: 5.94, dPR_L: 0.5940 },
        { Q: 11.0, v: 6.22, dPR_L: 0.6716 },
    ],
    'DN32': [
        { Q: 3.5,  v: 1.21, dPR_L: 0.0302 },
        { Q: 4.0,  v: 1.38, dPR_L: 0.0337 },
        { Q: 4.5,  v: 1.55, dPR_L: 0.0371 },
        { Q: 5.0,  v: 1.73, dPR_L: 0.0405 },
        { Q: 5.5,  v: 1.90, dPR_L: 0.0438 },
        { Q: 6.0,  v: 2.07, dPR_L: 0.0470 },
        { Q: 6.5,  v: 2.25, dPR_L: 0.0502 },
        { Q: 7.0,  v: 2.42, dPR_L: 0.0533 },
        { Q: 7.5,  v: 2.59, dPR_L: 0.0565 },
        { Q: 8.0,  v: 2.76, dPR_L: 0.0595 },
        { Q: 8.5,  v: 2.94, dPR_L: 0.0626 },
        { Q: 9.0,  v: 3.11, dPR_L: 0.0656 },
        { Q: 9.5,  v: 3.28, dPR_L: 0.0685 },
        { Q: 10.0, v: 3.45, dPR_L: 0.0715 },
        { Q: 10.5, v: 3.63, dPR_L: 0.0744 },
        { Q: 11.0, v: 3.80, dPR_L: 0.0773 },
        { Q: 11.5, v: 3.97, dPR_L: 0.0802 },
        { Q: 12.0, v: 4.14, dPR_L: 0.0830 },
        { Q: 12.5, v: 4.32, dPR_L: 0.0859 },
        { Q: 13.0, v: 4.49, dPR_L: 0.0887 },
        { Q: 13.5, v: 4.66, dPR_L: 0.0915 },
        { Q: 14.0, v: 4.84, dPR_L: 0.0942 },
        { Q: 14.5, v: 5.01, dPR_L: 0.0970 },
        { Q: 15.0, v: 5.18, dPR_L: 0.0997 },
        { Q: 15.5, v: 5.35, dPR_L: 0.1024 },
        { Q: 16.0, v: 5.53, dPR_L: 0.1051 },
        { Q: 16.5, v: 5.70, dPR_L: 0.1078 },
        { Q: 17.0, v: 5.87, dPR_L: 0.1105 },
        { Q: 17.5, v: 6.04, dPR_L: 0.1132 },
    ],
};
export const ESNEK_DN_LIST = Object.keys(ESNEK_TABLE);

// Q için tablo değerlerini lineer interpolasyonla bulur.
// Q tablo aralığı dışındaysa null döner (geçersiz seçim → daha büyük çap gerek).
// Q < ilk satır: orijinden ilk satıra doğru lineer ölçekle.
function interpolateEsnek(dn, Q) {
    const tbl = ESNEK_TABLE[dn];
    if (!tbl) return null;
    if (Q <= 0) return { v: 0, dPR_L: 0 };

    const first = tbl[0];
    if (Q < first.Q) {
        const t = Q / first.Q;
        return { v: first.v * t, dPR_L: first.dPR_L * t };
    }
    const last = tbl[tbl.length - 1];
    if (Q > last.Q) return null;

    for (let i = 0; i < tbl.length - 1; i++) {
        const a = tbl[i], b = tbl[i + 1];
        if (Q >= a.Q && Q <= b.Q) {
            const t = (Q - a.Q) / (b.Q - a.Q);
            return {
                v: a.v + t * (b.v - a.v),
                dPR_L: a.dPR_L + t * (b.dPR_L - a.dPR_L),
            };
        }
    }
    return null;
}

// İlk hattın P1'i (Pmutlak): 1 bar atmosfer + tesisat basıncı (bar).
// 21 mbar → 1,021 bar; 50 mbar → 1,050 bar; 300 mbar → 1,300 bar.
function defaultP1Bar(basinc) {
    const p_mbar = parseFloat(basinc);
    if (!Number.isFinite(p_mbar) || p_mbar <= 0) return 1.021;
    return 1 + p_mbar / 1000;
}

function pipeId(p) { return p.boruCap || 'DN25'; }
function getInternalDiameter(dn) {
    const s = PIPE_SPECS[dn];
    if (!s) return null;
    return s.od - 2 * s.wall; // mm
}

// ─── HAT VERİLERİNİ TOPLA ──────────────────────────────────────────────────────
// hatMap: pipe.id → hatNo
// Çıktı: hat → { dn, Q, L_m, H_m, basinc, headPipe, tailPipe, parentHatNo, segmentType }
export function buildHatData(manager) {
    if (!manager?.pipes?.length) return { hats: [], hatNos: [] };

    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));

    // Çocuk haritası
    const childrenOf = new Map();
    manager.pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
        }
    });

    // Her boru için: sayaç sonrası mı? (TÜKETİM/CİHAZ HATTI) + hangi sayaca ait?
    const downstreamOfMeter = new Set();
    const meterByPipe = new Map(); // pipeId → sayac component
    (manager.components || []).forEach(meter => {
        if (meter.type !== 'sayac' || !meter.cikisBagliBoruId) return;
        const queue = [meter.cikisBagliBoruId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (meterByPipe.has(id)) continue;
            meterByPipe.set(id, meter);
            downstreamOfMeter.add(id);
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    });

    // Hat → pipe id listesi
    const hatPipes = new Map();
    hatMap.forEach((hatNo, pid) => {
        if (!hatPipes.has(hatNo)) hatPipes.set(hatNo, []);
        hatPipes.get(hatNo).push(pid);
    });

    // Component lookup yardımcıları (endpoint ve regülatör tespiti için)
    const comps = manager.components || [];
    const sayacByGirisPipe = new Map();
    const cihazByGirisPipe = new Map();
    const vanaByPipe = new Map();
    const regulatorsByPipe = new Map();
    comps.forEach(c => {
        if (c.type === 'sayac' && c.fleksBaglanti?.boruId) {
            sayacByGirisPipe.set(c.fleksBaglanti.boruId, c);
        } else if (c.type === 'cihaz' && c.fleksBaglanti?.boruId) {
            cihazByGirisPipe.set(c.fleksBaglanti.boruId, c);
        } else if (c.type === 'vana' && c.bagliBoruId) {
            if (!vanaByPipe.has(c.bagliBoruId)) vanaByPipe.set(c.bagliBoruId, []);
            vanaByPipe.get(c.bagliBoruId).push(c);
        } else if (c.type === 'regulator' && c.bagliBoruId) {
            if (!regulatorsByPipe.has(c.bagliBoruId)) regulatorsByPipe.set(c.bagliBoruId, []);
            regulatorsByPipe.get(c.bagliBoruId).push(c);
        }
    });

    // Bu hattın TAİL pipe'ında p2 ucunda regülatör var mı?
    // (recomputeAllPressures regülatörü p2 yakınında varsa tetikleyici sayar.)
    function tailHasRegulator(tailPipeId) {
        if (!tailPipeId) return false;
        const regs = regulatorsByPipe.get(tailPipeId) || [];
        return regs.some(r => (r.boruPozisyonu || 0) >= 0.5);
    }

    // Endpoint tipi + ekran etiketi.
    // Cihaz/sayaç/branşmanda daire no mevcutsa "D1-Kombi", "D1 Sayacı", "D1 Branşmanı".
    function determineEndpointInfo(tailPipeId) {
        if (!tailPipeId) return { type: null, label: '' };

        const sayacAtTail = sayacByGirisPipe.get(tailPipeId);
        if (sayacAtTail) {
            const pre = dairePrefix(sayacAtTail);
            return { type: 'SAYAC', label: pre ? `${pre} Sayacı` : 'Sayaç' };
        }

        const cihazAtTail = cihazByGirisPipe.get(tailPipeId);
        if (cihazAtTail) {
            const cihazAd = CIHAZ_TIPLERI[cihazAtTail.cihazTipi]?.name || 'Cihaz';
            const upstreamSayac = meterByPipe.get(tailPipeId) || null;
            const pre = dairePrefix(upstreamSayac);
            return { type: 'CIHAZ', label: pre ? `${pre}-${cihazAd}` : cihazAd };
        }

        const vanas = vanaByPipe.get(tailPipeId) || [];
        const yan = vanas.find(v => v.vanaTipi === 'YANBINA');
        if (yan) return { type: 'YANBINA', label: 'Yan bina' };
        const bran = vanas.find(v => v.vanaTipi === 'BRANSMAN');
        if (bran) {
            const pre = dairePrefix(bran);
            if (bran.ilerdeKullanim) {
                return {
                    type: 'BRANSMAN_ILERDE',
                    label: 'Birden fazla birim',
                };
            }
            return { type: 'BRANSMAN', label: pre ? `${pre} Branşmanı` : 'Branşman' };
        }

        return { type: null, label: '' };
    }

    const hats = [];
    hatPipes.forEach((pids, hatNo) => {
        const localSet = new Set(pids);
        const pipes = pids.map(id => pipeMap.get(id)).filter(Boolean);
        if (pipes.length === 0) return;

        // Toplam uzunluk (cm → m)
        const totalLenCm = pipes.reduce((s, p) => {
            if (!p.p1 || !p.p2) return s;
            return s + Math.hypot(
                p.p2.x - p.p1.x,
                p.p2.y - p.p1.y,
                (p.p2.z || 0) - (p.p1.z || 0)
            );
        }, 0);
        const L_m = totalLenCm / 100;

        // Head pipe: parent'ı bu hatta DEĞİL (veya yok)
        const heads = pipes.filter(p => {
            const par = p.baslangicBaglanti;
            if (!par || par.tip !== 'boru' || !par.hedefId) return true;
            return !localSet.has(par.hedefId);
        });
        // Tail pipe: tüm çocukları bu hatta DEĞİL (veya yok)
        const tails = pipes.filter(p => {
            const ch = childrenOf.get(p.id) || [];
            if (ch.length === 0) return true;
            return ch.every(cid => !localSet.has(cid));
        });

        const headPipe = heads[0] || pipes[0];
        const tailPipe = tails[0] || pipes[pipes.length - 1];

        // Yükseklik farkı: akış girişi - akış çıkışı (m), pozitif = düşüş (kayıp)
        const entryZ = (headPipe.p1?.z || 0);
        const exitZ  = (tailPipe.p2?.z || 0);
        const H_m = (entryZ - exitZ) / 100;

        // Parent hat: head pipe'ın parent borusunun hat numarası
        let parentHatNo = null;
        const headPar = headPipe.baslangicBaglanti;
        if (headPar?.tip === 'boru' && headPar.hedefId) {
            const ph = hatMap.get(headPar.hedefId);
            if (ph != null && ph !== hatNo) parentHatNo = ph;
        }

        const segmentType = pids.some(id => downstreamOfMeter.has(id))
            ? 'TUKETIM'
            : 'KOLON';

        // Hat hangi sayaca ait? (TÜKETİM hattı ise) — birimBoruTipi ESNEK ise tablo kullan
        const meter = pids.map(id => meterByPipe.get(id)).find(Boolean) || null;
        const boruTipi = meter?.birimBoruTipi === 'ESNEK' ? 'ESNEK' : 'CELIK';

        // Yaprak hat mı? (alt hatları yok)
        const allChildIds = pids.flatMap(id => childrenOf.get(id) || []);
        const isLeafHat = allChildIds.every(cid => localSet.has(cid));
        const endpointInfo = isLeafHat ? determineEndpointInfo(tailPipe.id) : { type: null, label: '' };
        const endpointType = endpointInfo.type;
        const endpointLabel = endpointInfo.label;
        const regAtTail = tailHasRegulator(tailPipe.id);

        hats.push({
            hatNo,
            dn:       pipeId(pipes[0]),
            Q:        Number(pipes[0].debi) || 0,
            L_m,
            H_m,
            basinc:   String(pipes[0].basinc ?? '21'),
            parentHatNo,
            segmentType,
            boruTipi,
            pipeIds:  pids,
            headPipeId: headPipe.id,
            tailPipeId: tailPipe.id,
            endpointType,
            endpointLabel,
            regAtTail,
        });
    });

    hats.sort((a, b) => a.hatNo - b.hatNo);
    const hatNos = hats.map(h => h.hatNo);
    return { hats, hatNos };
}

// ─── PER-HAT HESAPLAMA ─────────────────────────────────────────────────────────
function computeHatRow(hat, sigmaXi, P1_bar) {
    const D_mm = getInternalDiameter(hat.dn);
    const isHigh = isHighPressure(hat.basinc);
    const vLimit = isHigh ? V_LIMIT_HIGH : V_LIMIT;
    if (!D_mm || D_mm <= 0) {
        return { ...hat, error: `Bilinmeyen çap: ${hat.dn}`, P1_bar };
    }

    // ESNEK TESİSAT — sadece DN15..DN32 geçerli; ΔPR tablodan, ΔPF/ΔPA aynı.
    if (hat.boruTipi === 'ESNEK') {
        if (!ESNEK_TABLE[hat.dn]) {
            return { ...hat, error: `Esnek tesisatta ${hat.dn} tanımlı değil (sadece DN15–DN32)`, P1_bar };
        }
        if (hat.Q <= 0 || hat.L_m <= 0) {
            const dPA0 = 0.049 * (hat.H_m || 0);
            return {
                ...hat, sigmaXi, D_mm,
                v: 0, dPR_L: 0, dPR: 0, dPF: 0,
                dPA: dPA0,
                sumDP: isHigh ? 0 : dPA0,
                P1_bar, P2_bar: P1_bar,
                vLimit,
            };
        }
        const interp = interpolateEsnek(hat.dn, hat.Q);
        if (!interp) {
            return { ...hat, error: `Q = ${hat.Q} m³/h, ${hat.dn} esnek tablosu kapsamı dışında`, P1_bar };
        }
        const v = interp.v;
        const dPR_L = interp.dPR_L;
        const dPR = dPR_L * hat.L_m;
        const drop_bar = dPR / 1000;
        const P2_bar = Math.max(0.001, P1_bar - drop_bar);
        const dPF = 3.97e-3 * sigmaXi * v * v;
        const dPA = 0.049 * (hat.H_m || 0);
        // 300 mbar (>50 mbar) tesisatlarında yükseklik kaybı toplama dahil edilmez.
        const sumDP = dPR + dPF + (isHigh ? 0 : dPA);
        return {
            ...hat, sigmaXi, D_mm,
            v, dPR_L, dPR, dPF, dPA, sumDP,
            P1_bar, P2_bar,
            vWarn: v > vLimit,
            vLimit,
        };
    }

    if (hat.Q <= 0 || hat.L_m <= 0) {
        // Akış yok / uzunluk yok → tümü 0
        const dPA0 = 0.049 * (hat.H_m || 0);
        return {
            ...hat,
            sigmaXi,
            D_mm,
            v: 0,
            dPR_L: 0,
            dPR: 0,
            dPF: 0,
            dPA: dPA0,
            sumDP: isHigh ? 0 : dPA0,
            P1_bar,
            P2_bar: P1_bar,
            vLimit,
        };
    }

    // P1 - P2 = 23,2 × R × Q^1.82 / D^4.82 × L  (bar)
    const P2_bar = isHigh?
        Math.sqrt( Math.pow(P1_bar,2)-(29.16 * Math.pow(hat.Q, 1.82) / Math.pow(D_mm, 4.82) * hat.L_m)):
        Math.max(0.001, P1_bar - 23.2 * R_GAS * Math.pow(hat.Q, 1.82) / Math.pow(D_mm, 4.82) * hat.L_m);

    const dPR = (P1_bar-P2_bar) * 1000; // mbar
    const dPR_L = hat.L_m > 0 ? dPR / hat.L_m : 0;



    // V = 353,677 × Q / (D² × P2)
    const v = 353.677 * hat.Q / (D_mm * D_mm * P2_bar);

    // ΔPF (yerel direnç) = 3.97e-3 × Σξ × V²
    const dPF = 3.97e-3 * sigmaXi * v * v;

    // ΔPA (yükseklik) = 0.049 × H
    const dPA = 0.049 * (hat.H_m || 0);

    // 300 mbar (>50 mbar) tesisatlarında yükseklik kaybı toplama dahil edilmez.
    const sumDP = dPR + dPF + (isHigh ? 0 : dPA);

    return {
        ...hat,
        sigmaXi,
        D_mm,
        v,
        dPR_L,
        dPR,
        dPF,
        dPA,
        sumDP,
        P1_bar,
        P2_bar,
        vWarn: v > vLimit,
        vLimit,
    };
}

// Hat ağacında BFS ile P1 → P2 cascade
export function cascadeHats(hats, fittingsByHat) {
    const byHat = new Map(hats.map(h => [h.hatNo, h]));
    const childrenByParent = new Map();
    hats.forEach(h => {
        if (h.parentHatNo == null) return;
        if (!childrenByParent.has(h.parentHatNo)) childrenByParent.set(h.parentHatNo, []);
        childrenByParent.get(h.parentHatNo).push(h.hatNo);
    });

    const rows = new Map();
    const roots = hats.filter(h => h.parentHatNo == null || !byHat.has(h.parentHatNo));

    const bfs = roots.map(h => ({ hat: h, P1_bar: defaultP1Bar(h.basinc) }));
    while (bfs.length > 0) {
        const { hat, P1_bar } = bfs.shift();
        if (rows.has(hat.hatNo)) continue;
        const xi = fittingsByHat.get(hat.hatNo) ?? 0;
        const row = computeHatRow(hat, xi, P1_bar);
        rows.set(hat.hatNo, row);
        (childrenByParent.get(hat.hatNo) || []).forEach(childNo => {
            const ch = byHat.get(childNo);
            if (!ch) return;
            // Parent hattın ucunda regülatör varsa (ör. 300→21 mbar), çocuk hat
            // regülatör sonrası kendi basıncına göre başlar — parent'ın P2'si değil.
            const childP1 = hat.regAtTail ? defaultP1Bar(ch.basinc) : row.P2_bar;
            bfs.push({ hat: ch, P1_bar: childP1 });
        });
    }

    // Yetim kalan (cycle veya kopuk) hatlar — varsayılan girişle hesapla
    hats.forEach(h => {
        if (rows.has(h.hatNo)) return;
        const xi = fittingsByHat.get(h.hatNo) ?? 0;
        rows.set(h.hatNo, computeHatRow(h, xi, defaultP1Bar(h.basinc)));
    });

    return hats.map(h => rows.get(h.hatNo));
}

// ─── BİÇİMLENDİRME ─────────────────────────────────────────────────────────────
const NF5 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });
const NF4 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const NF2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function f4(n) {
    if (n == null || !isFinite(n)) return '–';
    if (Math.abs(n) < 1e-9) return '0,0000';
    return NF4.format(n);
}
function f5(n) {
    if (n == null || !isFinite(n)) return '–';
    if (Math.abs(n) < 1e-9) return '0,00000';
    return NF5.format(n);
}
function f2(n) {
    if (n == null || !isFinite(n)) return '–';
    return NF2.format(n);
}

// ─── FITTINGS BREAKDOWN (HOVER HINT) ───────────────────────────────────────────
function buildFittingsBreakdown(fittingsRow) {
    if (!fittingsRow) return '';
    const items = [];
    if (fittingsRow.reduksiyon) items.push(`Redüksiyon × ${fittingsRow.reduksiyon} (×0,5)`);
    if (fittingsRow.dirsek90)   items.push(`Dirsek 90° × ${fittingsRow.dirsek90} (×0,4)`);
    if (fittingsRow.dirsek45)   items.push(`Dirsek 45° × ${fittingsRow.dirsek45} (×0,3)`);
    if (fittingsRow.teKol)      items.push(`Te Kol Ayırma × ${fittingsRow.teKol} (×1,3)`);
    if (fittingsRow.vana)       items.push(`Vana × ${fittingsRow.vana} (×0,5)`);
    return items.length ? items.join('\n') : 'Lokal kayıp yok';
}

// ─── TABLE RENDER ──────────────────────────────────────────────────────────────
const COLS_LOW = [
    { key: 'Q',     label: 'Q',     unit: 'm³/h' },
    { key: 'L',     label: 'L',     unit: 'm' },
    { key: 'DN',    label: 'DN',    unit: 'mm' },
    { key: 'v',     label: 'v',     unit: 'm/s' },
    { key: 'dPRL',  label: 'ΔPR/L', unit: 'mbar/m' },
    { key: 'dPR',   label: 'ΔPR',   unit: 'mbar' },
    { key: 'xi',    label: 'Σξ',    unit: '' },
    { key: 'dPF',   label: 'ΔPF',   unit: 'mbar' },
    { key: 'H',     label: 'H',     unit: 'm' },
    { key: 'dPA',   label: 'ΔPA',   unit: 'mbar' },
    { key: 'sumDP', label: 'ΣΔP',   unit: 'mbar' },
];

// 300 mbar tablosu — H ve ΔPA yerine P1, P2.
const COLS_HIGH = [
    { key: 'Q',     label: 'Q',     unit: 'm³/h' },
    { key: 'L',     label: 'L',     unit: 'm' },
    { key: 'DN',    label: 'DN',    unit: 'mm' },
    { key: 'v',     label: 'v',     unit: 'm/s' },
    //{ key: 'dPRL',  label: 'ΔPR/L', unit: 'mbar/m' },
    { key: 'dPR',   label: 'ΔPR',   unit: 'mbar' },
    { key: 'xi',    label: 'Σξ',    unit: '' },
    { key: 'dPF',   label: 'ΔPF',   unit: 'mbar' },
    { key: 'P1',    label: 'P1',    unit: 'bar' },
    { key: 'P2',    label: 'P2',    unit: 'bar' },
    { key: 'sumDP', label: 'ΣΔP',   unit: 'mbar' },
];

function renderTableHead(cols) {
    const labelRow = cols.map(c => `<th>${c.label}</th>`).join('');
    const unitRow  = cols.map(c => `<th class="bc-unit">${c.unit}</th>`).join('');
    return `
        <thead>
            <tr>
                <th class="bc-no" rowspan="2">#</th>
                ${labelRow}
            </tr>
            <tr class="bc-units-row">${unitRow}</tr>
        </thead>`;
}

function renderRow(row, fittingsRow, cols) {
    const isHigh = isHighPressure(row.basinc);
    const isEsnek = row.boruTipi === 'ESNEK';
    const allowedDns = isEsnek ? ESNEK_DN_LIST : DN_LIST;
    const invalidDn = !allowedDns.includes(row.dn);
    // Geçersiz mevcut DN'i de listeye dahil et — kullanıcı geçerli birine geçebilsin.
    const optionDns = invalidDn ? [row.dn, ...allowedDns] : allowedDns;
    const dnSelect = `
        <select class="bc-dn-select${invalidDn ? ' bc-warn' : ''}" data-hat="${row.hatNo}"${invalidDn ? ' title="Esnek tesisatta sadece DN15, DN20, DN25, DN32 geçerlidir"' : ''}>
            ${optionDns.map(dn => `<option value="${dn}" ${dn === row.dn ? 'selected' : ''}>${dn}${invalidDn && dn === row.dn ? ' (geçersiz)' : ''}</option>`).join('')}
        </select>`;

    if (row.error) {
        return `<tr data-hat-no="${row.hatNo}"><td class="bc-no">${row.hatNo}</td>
            <td class="bc-cell">${f2(row.Q)}</td>
            <td class="bc-cell">${f2(row.L_m)}</td>
            <td class="bc-cell bc-dn">${dnSelect}</td>
            <td colspan="${cols.length - 3}" class="bc-empty">${row.error}</td></tr>`;
    }

    const xiTooltip = buildFittingsBreakdown(fittingsRow);

    const vLimit = row.vLimit ?? (isHigh ? V_LIMIT_HIGH : V_LIMIT);
    const vClass = row.vWarn ? 'bc-cell bc-warn' : 'bc-cell';
    const vTitle = row.vWarn ? `V > ${vLimit} m/s — limit aşıldı` : '';

    // Son üç sütun (P1/P2 veya H/ΔPA) basınca göre değişir.
    const tailCells = isHigh
        ? `
            <td class="bc-cell">${f5(row.P1_bar)}</td>
            <td class="bc-cell">${f5(row.P2_bar)}</td>`
        : `
            <td class="bc-cell">${f2(row.H_m)}</td>
            <td class="bc-cell">${f4(row.dPA)}</td>`;

    return `
        <tr data-hat-no="${row.hatNo}">
            <td class="bc-no">${row.hatNo}</td>
            <td class="bc-cell">${f2(row.Q)}</td>
            <td class="bc-cell">${f2(row.L_m)}</td>
            <td class="bc-cell bc-dn">${dnSelect}</td>
            <td class="${vClass}" title="${vTitle}">${f2(row.v)}</td>
            ${isHigh ? '' : `<td class="bc-cell">${f4(row.dPR_L)}</td>`}
            <td class="bc-cell">${f4(row.dPR)}</td>
            <td class="bc-cell bc-xi" title="${escAttr(xiTooltip)}">${f2(row.sigmaXi)}</td>
            <td class="bc-cell">${f4(row.dPF)}</td>
            ${tailCells}
            <td class="bc-cell bc-total">${f4(row.sumDP)}</td>
        </tr>`;
}

function renderSection(title, rows, fittingsByHat, cols) {
    if (rows.length === 0) return '';
    const body = rows.map(r => renderRow(r, fittingsByHat.get(r.hatNo + '_full'), cols)).join('');
    return `
        <tr class="bc-section-row"><td colspan="${cols.length + 1}">${title}</td></tr>
        ${body}`;
}

function escAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTable(rows, fittingsByHat, tabId) {
    if (!rows || rows.length === 0) {
        return `<div class="bc-empty-msg">Hesaplanacak hat bulunamadı.</div>`;
    }

    const cols = tabId === 'CELIK_HIGH' ? COLS_HIGH : COLS_LOW;
    const kolon = rows.filter(r => r.segmentType === 'KOLON');
    const tuk   = rows.filter(r => r.segmentType !== 'KOLON');

    const head = renderTableHead(cols);
    const body = `
        ${renderSection('BİNA BAĞLANTI / KOLON HATTI', kolon, fittingsByHat, cols)}
        ${renderSection('TÜKETİM ve CİHAZ HATTI', tuk, fittingsByHat, cols)}
    `;

    return `
        <div class="bc-table-wrapper">
            <table class="bc-table">${head}<tbody>${body}</tbody></table>
        </div>`;
}

// ─── YOL ENÜMERASYONU & LİMİT KONTROLÜ ────────────────────────────────────────
// Limit (mbar) — bu değer ve üstü hatalı (kırmızı).
export const PATH_LIMITS = {
    // 21 mbar kutu → sayaç (varsayılan kolon)
    KOLON:                   1.0000,
    // 21 mbar kutu → branşman (ilerde kullanım)
    KOLON_BRANSMAN:          0.7000,
    // 21 mbar kutu → yan bina
    KOLON_YANBINA:           0.4000,
    // 300 mbar kutu → sayaç (regülatör yok)
    KOLON_HIGH:             21.0000,
    // 300 mbar kutu → branşman (ilerde, regülatör yok)
    KOLON_HIGH_BRANSMAN:    15.0000,
    // 300 mbar kutu → yan bina (regülatör yok)
    KOLON_HIGH_YANBINA:     15.0000,
    // 300 mbar yolda regülatör sonrası → sayaç (regülatör sayaç öncesi)
    REG_SAYAC:               1.0000,
    // 300 mbar yolda regülatör sonrası → branşman (ilerde)
    REG_BRANSMAN:            0.7000,
    // 300 mbar yolda regülatör sonrası → yan bina
    REG_YANBINA:             0.4000,
    // Sayaç sonrası iç tesisat (cihaz)
    TUKETIM:                 0.8000,
    // Sayaç sonrası regülatör → cihaz
    REG_CIHAZ:               1.8000,
};

// Endpoint + start basıncı + regülatör varlığına göre yol limiti ve evalFromIdx
// (toplama dahil edilecek ilk hat indeksi). Kutu→regülatör segmentine limit yoktur,
// regülatör sonrası segment ölçülür.
function getPathLimitInfo(path, byHat, segmentType) {
    const hatNos = path.hatNos;
    const lastHat = byHat.get(hatNos[hatNos.length - 1]);
    const firstHat = byHat.get(hatNos[0]);
    const endpointType = lastHat?.endpointType || null;
    const endpointLabel = lastHat?.endpointLabel || '';
    const isHighStart  = isHighPressure(firstHat?.basinc);

    // Yoldaki regülatör hattı (regülatör tail'de → bir sonraki hat post-reg).
    // Yolun SON hattının tail'inde regülatör varsa o segment endpoint olarak
    // alınır; sayaç → regülatör arası kayıp toplama dahil edilmez.
    let regHatIdx = -1;
    for (let i = 0; i < hatNos.length; i++) {
        if (byHat.get(hatNos[i])?.regAtTail) { regHatIdx = i; break; }
    }
    let hasReg       = regHatIdx >= 0;
    let evalFromIdx  = hasReg ? regHatIdx + 1 : 0;

    // Yolun parent zincirinde (bu enumerasyonun dışında, ör. farklı basınç
    // sekmesindeki hatlar) regülatör varsa, bu yol bütünüyle post-reg sayılır.
    // Örn. sayaç sonrası regülatör → reg-cihaz hattı 21 mbar sekmesinde tek başına
    // yer alır; üst zincirdeki sayaç-reg hattı 300 mbar sekmesindedir.
    if (!hasReg) {
        let cursor = byHat.get(hatNos[0])?.parentHatNo;
        const seen = new Set(hatNos);
        while (cursor != null && !seen.has(cursor)) {
            seen.add(cursor);
            const parent = byHat.get(cursor);
            if (!parent) break;
            if (parent.regAtTail) { hasReg = true; break; }
            cursor = parent.parentHatNo;
        }
    }

    // Regülatöre gelen kayıp denetlenmez. Tüm hatlar regülatör öncesinde kalıyorsa
    // (regülatör son hattın ucunda) → değerlendirilecek post-reg parça yok → yolu atla.
    const allPreReg = evalFromIdx >= hatNos.length;

    // TÜKETİM yolları
    if (segmentType !== 'KOLON') {
        // Kutudan cihaza yolda hiç regülatör yok ve giriş yüksek basınç (>50 mbar)
        // → cihaz 300 mbar gaza maruz kalır, geçersiz → yol listesinde gösterme.
        const noRegHighDevice = !hasReg && isHighStart;
        return {
            limit: hasReg ? PATH_LIMITS.REG_CIHAZ : PATH_LIMITS.TUKETIM,
            evalFromIdx,
            endpointType: endpointType || 'CIHAZ',
            endpointLabel: endpointLabel || (endpointType ? '' : 'Cihaz'),
            hasRegulator: hasReg,
            skip: allPreReg || noRegHighDevice,
        };
    }

    // KOLON yolları — endpoint + basınç + regülatör matrixi
    let limit;
    if (endpointType === 'BRANSMAN_ILERDE') {
        if (isHighStart) limit = hasReg ? PATH_LIMITS.REG_BRANSMAN : PATH_LIMITS.KOLON_HIGH_BRANSMAN;
        else             limit = PATH_LIMITS.KOLON_BRANSMAN;
    } else if (endpointType === 'YANBINA') {
        if (isHighStart) limit = hasReg ? PATH_LIMITS.REG_YANBINA : PATH_LIMITS.KOLON_HIGH_YANBINA;
        else             limit = PATH_LIMITS.KOLON_YANBINA;
    } else {
        // SAYAC veya bilinmeyen → varsayılan kolon limiti
        if (isHighStart) limit = hasReg ? PATH_LIMITS.REG_SAYAC : PATH_LIMITS.KOLON_HIGH;
        else             limit = PATH_LIMITS.KOLON;
    }

    return { limit, evalFromIdx, endpointType, endpointLabel, hasRegulator: hasReg, skip: allPreReg };
}

// Geriye dönük uyumluluk: kolon yolu için varsayılan limit (regülatör/endpoint yok varsayımı).
export function pathLimitForKolon(rows, hatNos) {
    if (!rows || !hatNos) return PATH_LIMITS.KOLON;
    const byHat = rows instanceof Map ? rows : new Map(rows.map(r => [r.hatNo, r]));
    const fakePath = { hatNos };
    return getPathLimitInfo(fakePath, byHat, 'KOLON').limit;
}

// Verilen satır kümesi içinde kök → yaprak yollarını DFS ile çıkar.
// hat sayısı aynı kalır; parent referansı set dışındaysa kök olarak kabul edilir.
export function enumeratePaths(rows) {
    if (!rows || rows.length === 0) return [];
    const byHat = new Map(rows.map(r => [r.hatNo, r]));
    const hatSet = new Set(byHat.keys());
    const childrenOf = new Map();
    rows.forEach(r => {
        const p = r.parentHatNo;
        if (p != null && hatSet.has(p)) {
            if (!childrenOf.has(p)) childrenOf.set(p, []);
            childrenOf.get(p).push(r.hatNo);
        }
    });
    const roots = rows.filter(r => r.parentHatNo == null || !hatSet.has(r.parentHatNo));
    const paths = [];
    function dfs(hatNo, prefix, sum) {
        const r = byHat.get(hatNo);
        const newPrefix = [...prefix, hatNo];
        const newSum = sum + (Number(r.sumDP) || 0);
        const ch = childrenOf.get(hatNo) || [];
        if (ch.length === 0) {
            paths.push({ hatNos: newPrefix, total: newSum, label: newPrefix.join('+') });
        } else {
            ch.forEach(cid => dfs(cid, newPrefix, newSum));
        }
    }
    roots.forEach(r => dfs(r.hatNo, [], 0));
    return paths;
}

// Her yola özgü limit + evalTotal + overLimit + isCritical hesaplar.
// segmentType: 'KOLON' veya 'TUKETIM'.
export function annotatePaths(paths, byHatOrLimit, segmentType = 'KOLON') {
    if (!paths.length) return;

    // Eski imza: annotatePaths(paths, limit) — sabit limit kullan.
    if (typeof byHatOrLimit === 'number') {
        const limit = byHatOrLimit;
        let maxTotal = -Infinity;
        paths.forEach(p => {
            p.limit = limit;
            p.evalTotal = p.total;
            p.ratio = limit > 0 ? p.total / limit : 0;
            p.overLimit = p.total >= limit;
            if (p.total > maxTotal) maxTotal = p.total;
        });
        paths.forEach(p => { p.isCritical = (p.total === maxTotal); });
        return;
    }

    const byHat = byHatOrLimit instanceof Map
        ? byHatOrLimit
        : new Map((byHatOrLimit || []).map(r => [r.hatNo, r]));

    paths.forEach(p => {
        const info = getPathLimitInfo(p, byHat, segmentType);
        p.limit         = info.limit;
        p.evalFromIdx   = info.evalFromIdx;
        p.endpointType  = info.endpointType;
        p.endpointLabel = info.endpointLabel;
        p.hasRegulator  = info.hasRegulator;
        p.skip          = info.skip;
        let total = 0;
        for (let i = info.evalFromIdx; i < p.hatNos.length; i++) {
            total += Number(byHat.get(p.hatNos[i])?.sumDP) || 0;
        }
        p.evalTotal = total;
        p.ratio     = info.limit > 0 ? total / info.limit : 0;
        p.overLimit = total >= info.limit;
        p.segmentType = segmentType;
    });

    let maxRatio = -Infinity;
    paths.forEach(p => {
        if (p.skip) return;
        if (p.ratio > maxRatio) maxRatio = p.ratio;
    });
    paths.forEach(p => {
        p.isCritical = !p.skip && (p.ratio > 0 && p.ratio === maxRatio);
    });
}

// Yol bitiş tipi → Türkçe görüntü etiketi (path.endpointLabel doluysa o yeğlenir).
const ENDPOINT_LABELS = {
    SAYAC:           'Sayaç',
    CIHAZ:           'Cihaz',
    BRANSMAN:        'Branşman',
    BRANSMAN_ILERDE: 'İleride kullanım',
    YANBINA:         'Yan bina',
};

function renderPathItem(path) {
    const limit = path.limit ?? 0;
    const value = path.evalTotal ?? path.total ?? 0;
    const status = path.overLimit ? '❌' : '✅';
    const frac = limit > 0 ? Math.max(0, Math.min(1, value / limit)) : 0;
    const cls = [
        'bc-path',
        path.isCritical ? 'critical' : '',
        path.overLimit  ? 'over'     : '',
    ].filter(Boolean).join(' ');
    const limitStr = NF4.format(limit);
    const epLabel = path.endpointLabel || ENDPOINT_LABELS[path.endpointType] || '';
    const epHtml = epLabel ? `<span class="bc-path-endpoint">${epLabel}</span>` : '';
    // Sadece post-regülatör hatları göster — kayba bakılmayan (pre-reg) hatlar yol etiketinde yazılmaz.
    const displayHats = path.hatNos.slice(path.evalFromIdx || 0);
    return `
        <button type="button" class="${cls}" data-hats="${path.hatNos.join(',')}" style="--bc-bar-frac:${frac.toFixed(4)}">
            <span class="bc-path-status">${status}</span>
            <span class="bc-path-label">${displayHats.join(' + ')}</span>
            ${epHtml}
            <span class="bc-path-value">${f4(value)} mbar</span>
            <span class="bc-path-limit">&lt; ${limitStr} mbar</span>
        </button>`;
}

// Hat sırasına göre sırala — ilk farklı hat numarasına bakar (lex).
function sortPathsByHat(paths) {
    paths.sort((a, b) => {
        const len = Math.min(a.hatNos.length, b.hatNos.length);
        for (let i = 0; i < len; i++) {
            if (a.hatNos[i] !== b.hatNos[i]) return a.hatNos[i] - b.hatNos[i];
        }
        return a.hatNos.length - b.hatNos.length;
    });
}

function renderPathsBlock(title, paths) {
    // Atlanması işaretlenmiş yolları (kayba hiç bakılmayanlar) listeden çıkar.
    const visible = paths.filter(p => !p.skip);
    if (!visible.length) return '';
    sortPathsByHat(visible);
    return `
        <div class="bc-paths-block">
            <div class="bc-paths-title">${title}</div>
            <div class="bc-path-list">${visible.map(p => renderPathItem(p)).join('')}</div>
        </div>`;
}

function renderPathsSection(rows, allRows) {
    const kolonRows = rows.filter(r => r.segmentType === 'KOLON');
    const tukRows   = rows.filter(r => r.segmentType !== 'KOLON');
    const kolon = enumeratePaths(kolonRows);
    const tuk   = enumeratePaths(tukRows);
    // byHat: tüm hatların (sekmeler arası) lookup'ı için global rows kullan —
    // post-reg hat farklı basınç sekmesinde olsa bile parent zincirinde regülatör
    // tespit edilebilsin (REG_CIHAZ limiti doğru uygulansın).
    const byHat = new Map((allRows || rows).map(r => [r.hatNo, r]));
    annotatePaths(kolon, byHat, 'KOLON');
    annotatePaths(tuk,   byHat, 'TUKETIM');
    if (!kolon.length && !tuk.length) return '';
    return `
        <div class="bc-paths">
            ${renderPathsBlock('KOLON HATTI YOLLARI', kolon)}
            ${renderPathsBlock('İÇ TESİSAT YOLLARI', tuk)}
        </div>`;
}

// ─── TAB TANIMLARI ─────────────────────────────────────────────────────────────
// Sırası: 50 mbar üstü çelik → 21–50 mbar çelik → esnek
const TAB_DEFS = [
    {
        id: 'CELIK_HIGH',
        label: '300 mbar Hesapları',
        filter: (r) => r.boruTipi !== 'ESNEK' && parseFloat(r.basinc) > 50,
    },
    {
        id: 'CELIK_LOW',
        label: '21 mbar Hesapları',
        filter: (r) => r.boruTipi !== 'ESNEK' && parseFloat(r.basinc) <= 50,
    },
    {
        id: 'ESNEK',
        label: 'Esnek Boru Hesapları',
        filter: (r) => r.boruTipi === 'ESNEK',
    },
];

let _activeTab = null;

function renderTabBar(availableTabs, activeId) {
    return `
        <div class="bc-tab-bar">
            ${availableTabs.map(t => `
                <button class="bc-tab${t.id === activeId ? ' active' : ''}" data-tab-id="${t.id}">
                    ${t.label} <span class="bc-tab-count">(${t.rows.length})</span>
                </button>
            `).join('')}
        </div>`;
}

// ─── MODAL KONTROL ─────────────────────────────────────────────────────────────
function renderInto(bodyEl) {
    const manager = plumbingManager;

    // 1. Fittings (Σξ) — hatNo → total + breakdown
    const { rows: fitRows } = computeFittings(manager);
    const fittingsByHat = new Map();
    fitRows.forEach(r => {
        fittingsByHat.set(r.hatNo, r.total);
        fittingsByHat.set(r.hatNo + '_full', r);
    });

    // 2. Hat verileri
    const { hats } = buildHatData(manager);

    // 3. Cascade hesabı
    const rows = cascadeHats(hats, fittingsByHat);

    // 4. Tab'lara böl — sadece dolu olanlar görünür
    const availableTabs = TAB_DEFS
        .map(t => ({ ...t, rows: rows.filter(t.filter) }))
        .filter(t => t.rows.length > 0);

    if (availableTabs.length === 0) {
        bodyEl.innerHTML = `<div class="bc-empty-msg">Hesaplanacak hat bulunamadı.</div>`;
        return;
    }

    if (!_activeTab || !availableTabs.find(t => t.id === _activeTab)) {
        _activeTab = availableTabs[0].id;
    }
    const active = availableTabs.find(t => t.id === _activeTab);

    bodyEl.innerHTML = `
        ${renderTabBar(availableTabs, _activeTab)}
        ${renderTable(active.rows, fittingsByHat, _activeTab)}
        ${renderPathsSection(active.rows, rows)}
    `;

    // Tab tıklamaları
    bodyEl.querySelectorAll('.bc-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const id = e.currentTarget.dataset.tabId;
            if (id && id !== _activeTab) {
                _activeTab = id;
                renderInto(bodyEl);
            }
        });
    });

    // DN combobox: değişince ilgili hat pipe'larının boruCap'ini güncelle ve yeniden hesapla
    bodyEl.querySelectorAll('.bc-dn-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const hatNo = parseInt(e.target.dataset.hat, 10);
            const newDn = e.target.value;
            applyDnToHat(manager, hatNo, newDn);
            renderInto(bodyEl);
        });
    });

    const clearAllSelection = () => {
        bodyEl.querySelectorAll('.bc-path.selected').forEach(b => b.classList.remove('selected'));
        bodyEl.querySelectorAll('.bc-path.bc-path-uses-row').forEach(b => b.classList.remove('bc-path-uses-row'));
        bodyEl.querySelectorAll('tr.bc-path-highlight').forEach(tr => tr.classList.remove('bc-path-highlight'));
        bodyEl.querySelectorAll('tr.bc-row-selected').forEach(tr => tr.classList.remove('bc-row-selected'));
    };

    // Yol seçimi → ilgili hat satırlarını vurgula (toggle, tek aktif yol)
    bodyEl.querySelectorAll('.bc-path').forEach(btn => {
        btn.addEventListener('click', () => {
            const wasSelected = btn.classList.contains('selected');
            clearAllSelection();
            if (!wasSelected) {
                btn.classList.add('selected');
                btn.dataset.hats.split(',').forEach(h => {
                    const tr = bodyEl.querySelector(`tr[data-hat-no="${h}"]`);
                    if (tr) tr.classList.add('bc-path-highlight');
                });
            }
        });

        // Yola çift tıklama → paneli kapat ve yolu projede seçili hâle getir.
        // Yol birden fazla katta ise 3D perspektif paneli açılır.
        btn.addEventListener('dblclick', (e) => {
            e.preventDefault();
            const hatNos = btn.dataset.hats.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
            hideBoruCapModal();
            selectPathInProject(hatNos);
        });
    });

    // Hat satırı: tek tıklama → bu hattı kullanan yolları vurgula (toggle).
    // Çift tıklama → paneli kapat ve hattı projede seçili hâle getir.
    bodyEl.querySelectorAll('tr[data-hat-no]').forEach(tr => {
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.bc-dn-select')) return;
            const hatNo = parseInt(tr.dataset.hatNo, 10);
            if (!Number.isFinite(hatNo)) return;
            const wasSelected = tr.classList.contains('bc-row-selected');
            clearAllSelection();
            if (!wasSelected) {
                tr.classList.add('bc-row-selected');
                bodyEl.querySelectorAll('.bc-path').forEach(btn => {
                    const hats = btn.dataset.hats.split(',').map(s => parseInt(s, 10));
                    if (hats.includes(hatNo)) btn.classList.add('bc-path-uses-row');
                });
            }
        });

        tr.addEventListener('dblclick', (e) => {
            // DN combobox üzerindeki çift tıklamada satır seçimini tetikleme.
            if (e.target.closest('.bc-dn-select')) return;
            const hatNo = parseInt(tr.dataset.hatNo, 10);
            if (!Number.isFinite(hatNo)) return;
            hideBoruCapModal();
            selectHatInProject(hatNo);
        });
    });
}

function applyDnToHat(manager, hatNo, newDn) {
    if (!manager?.pipes) return;
    const { hatMap } = computeHatGroups(manager.pipes, manager.components || []);
    let changed = false;
    manager.pipes.forEach(p => {
        if (hatMap.get(p.id) === hatNo && p.boruCap !== newDn) {
            p.boruCap = newDn;
            changed = true;
            // Üzerindeki vananın çapını da güncelle
            (manager.components || []).forEach(c => {
                if (c.type === 'vana' && c.bagliBoruId === p.id) c.vanaCap = newDn;
            });
        }
    });
    if (changed) {
        manager.saveToState?.();
        try { draw2D(); } catch (_) {}
    }
}

function centerModal() {
    const modal = document.querySelector('#boru-cap-modal-overlay .bc-modal');
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const left = Math.max(20, (window.innerWidth - rect.width) / 2);
    const top  = Math.max(20, (window.innerHeight - rect.height) / 2);
    modal.style.left = `${left}px`;
    modal.style.top  = `${top}px`;
}

export function showBoruCapModal() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    const body    = document.getElementById('boru-cap-modal-body');
    if (!overlay || !body) return;
    renderInto(body);
    overlay.style.display = 'block';
    centerModal();
}

function hideBoruCapModal() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function makeDraggable() {
    const overlay = document.getElementById('boru-cap-modal-overlay');
    if (!overlay) return;
    const modal  = overlay.querySelector('.bc-modal');
    const header = overlay.querySelector('.bc-modal-header');
    if (!modal || !header) return;

    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.bc-modal-close')) return;
        dragging = true;
        const rect = modal.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        modal.classList.add('dragging');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        const rect = modal.getBoundingClientRect();
        const maxLeft = window.innerWidth - rect.width;
        const maxTop  = window.innerHeight - rect.height;
        modal.style.left = `${Math.max(0, Math.min(maxLeft, startLeft + dx))}px`;
        modal.style.top  = `${Math.max(0, Math.min(maxTop,  startTop  + dy))}px`;
    });

    document.addEventListener('mouseup', () => {
        if (dragging) { dragging = false; modal.classList.remove('dragging'); }
    });
}

export function initBoruCapMenu() {
    const trigger  = document.getElementById('menuHesapBoruCap');
    const closeBtn = document.getElementById('boru-cap-modal-close');
    const overlay  = document.getElementById('boru-cap-modal-overlay');
    const mainMenu = document.getElementById('mainMenuContent');

    makeDraggable();

    if (trigger) {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            mainMenu?.parentElement.classList.remove('show');
            showBoruCapModal();
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => { e.preventDefault(); hideBoruCapModal(); });
    }
    if (overlay) {
        overlay.addEventListener('click', (e) => { if (e.target === overlay) hideBoruCapModal(); });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') hideBoruCapModal();
    });
}
