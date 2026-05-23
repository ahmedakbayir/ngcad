// vana-eksik / index.js
// TS 7363 vana mevcudiyet denetimleri.
//
// Kurallar (PDF "Vana Eksik" grubu):
//   1. Md:5.1.9  — Kolonda AKV gerekli (servis kutusu sonrası ilk ayrımdan önce)
//   2. Md:6      — Tüm cihazlar için cihaz girişinde 50 cm içinde Cihaz vanası
//   3. Md:5.2.6  — Sayaç öncesi 1 m yakınlıkta Emniyet vanası
//   4. Md:5.1.31 — Ticari birim sayacından sonra (birim dışı) Selenoid vana
//
// Henüz uygulanmayan (proje ayarı / kapı geometrisi gerektirir):
//   • Deprem amaçlı selenoid vana (deprem bölgesi ayarı yok)
//   • Kolonda emniyet vanası (AKV ↔ bina giriş kapısı mesafesi gerek)
//
// Çözüm uygulamaları (otomatik vana yerleştirme) henüz fix=null — kullanıcı
// kontekst menüsünden manuel ekler. İleride otomatik ekleyici eklenebilir.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { addKolonAkv, addCihazValve, addSayacEmniyet, addTicariSelenoid, addDepremSelenoid, hasSelenoidInChain } from './fix.js';
import {
    daireLabel,
    cihazHatLabel,
    floorNameById,
    BIRIM_PLACEHOLDER,
} from '../../checker-utils.js';

const CIHAZ_VANA_MAX_CM = 50;
const SAYAC_EMNIYET_MAX_CM = 100;
const TICARI_SELENOID_MIN_CM = 20;

const CIHAZ_AD = {
    KOMBI:  'Kombi',
    OCAK:   'Ocak',
    SOFBEN: 'Şofben',
    SOBA:   'Soba',
    KAZAN:  'Kazan',
    TICARI: 'Ticari cihaz',
};

// ─── Yardımcılar ──────────────────────────────────────────────────────────

function buildChildrenMap(pipes) {
    const ch = new Map();
    pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!ch.has(bag.hedefId)) ch.set(bag.hedefId, []);
            ch.get(bag.hedefId).push(p.id);
        }
    });
    return ch;
}

function pipeLengthCm(p) {
    if (!p?.p1 || !p?.p2) return 0;
    return Math.hypot(
        p.p2.x - p.p1.x,
        p.p2.y - p.p1.y,
        (p.p2.z || 0) - (p.p1.z || 0),
    );
}

// Bir boruya bağlı (bagliBoruId === pipeId) belirli tipte vana var mı?
function hasVanaOnPipe(manager, pipeId, tip) {
    return (manager.components || []).some(c =>
        c.type === 'vana' && c.bagliBoruId === pipeId && c.vanaTipi === tip
    );
}

// Boruya bağlı, p2 ucuna ≤ maxCm mesafede aranan tipte vana var mı?
function hasVanaNearEnd(manager, pipe, tip, maxCm) {
    const len = pipeLengthCm(pipe);
    if (len <= 0) return false;
    return (manager.components || []).some(c => {
        if (c.type !== 'vana' || c.vanaTipi !== tip) return false;
        if (c.bagliBoruId !== pipe.id) return false;
        const t = c.boruPozisyonu;
        if (t == null) return true; // konum bilinmiyor → güvenli tarafta say
        const distFromP2 = (1 - t) * len;
        return distFromP2 <= maxCm;
    });
}

// Boruya bağlı, p1 ucuna ≤ maxCm mesafede aranan tipte vana var mı?
function hasVanaNearStart(manager, pipe, tip, maxCm) {
    const len = pipeLengthCm(pipe);
    if (len <= 0) return false;
    return (manager.components || []).some(c => {
        if (c.type !== 'vana' || c.vanaTipi !== tip) return false;
        if (c.bagliBoruId !== pipe.id) return false;
        const t = c.boruPozisyonu;
        if (t == null) return true;
        const distFromP1 = t * len;
        return distFromP1 <= maxCm;
    });
}

// Bir borudan UPSTREAM (parent zinciri) belirli tipte vana var mı?
// Toplam tarama mesafesi maxCm cm ile sınırlıdır.
function hasVanaUpstreamWithin(manager, startPipeId, tip, maxCm) {
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const startPipe = pipeMap.get(startPipeId);
    if (!startPipe) return false;

    // Önce start pipe'ın kendisinde p2-yakın vana var mı?
    if (hasVanaNearEnd(manager, startPipe, tip, maxCm)) return true;

    let remaining = maxCm - pipeLengthCm(startPipe);
    let cursor = startPipe;
    const seen = new Set([cursor.id]);

    while (remaining > 0) {
        const par = cursor.baslangicBaglanti;
        if (par?.tip !== 'boru' || !par.hedefId) break;
        const parent = pipeMap.get(par.hedefId);
        if (!parent || seen.has(parent.id)) break;
        seen.add(parent.id);

        if (hasVanaOnPipe(manager, parent.id, tip)) return true;

        remaining -= pipeLengthCm(parent);
        cursor = parent;
    }
    return false;
}

// Bir borudan DOWNSTREAM (çocuk zinciri) tipinde vana var mı?
// Toplam tarama mesafesi maxCm — bir birim içine giriş kontrolü için.
function hasVanaDownstreamWithin(manager, startPipeId, tip, maxCm) {
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const childrenOf = buildChildrenMap(manager.pipes);

    const queue = [{ id: startPipeId, dist: 0 }];
    const seen = new Set();
    while (queue.length) {
        const { id, dist } = queue.shift();
        if (seen.has(id)) continue;
        seen.add(id);
        const p = pipeMap.get(id);
        if (!p) continue;
        if (hasVanaOnPipe(manager, id, tip)) return true;
        const len = pipeLengthCm(p);
        if (dist + len > maxCm) continue;
        (childrenOf.get(id) || []).forEach(cid => queue.push({ id: cid, dist: dist + len }));
    }
    return false;
}

// Sayacın çıkış borusu birimin DIŞINDA en az minCm uzunluğa sahip mi?
// Boru-birim ilişkisi karmaşık olduğundan basit yaklaşık: çıkış borusunun
// uzunluğunun ≥ minCm olmasını ararız.
function meterCikisHasMinLength(manager, meter, minCm) {
    const exitId = meter.cikisBagliBoruId;
    if (!exitId) return false;
    const pipe = manager.pipes.find(p => p.id === exitId);
    return pipe ? pipeLengthCm(pipe) >= minCm : false;
}

// ─── Kurallar ─────────────────────────────────────────────────────────────

// 1. Kolonda AKV gerekli — her servis kutusu için.
function kolonAkvKuralı(manager, out) {
    const boxes = (manager.components || []).filter(c => c.type === 'servis_kutusu');
    if (!boxes.length) return;

    const childrenOf = buildChildrenMap(manager.pipes);

    boxes.forEach(box => {
        // Bu servis kutusundan başlayan kök borular
        const roots = manager.pipes.filter(p =>
            p.baslangicBaglanti?.tip === 'servis_kutusu' &&
            p.baslangicBaglanti.hedefId === box.id
        );
        if (!roots.length) return;

        // Servis kutusundan downstream tüm boruları topla (AKV her yerde olabilir)
        const chainIds = new Set();
        const queue = roots.map(r => r.id);
        while (queue.length) {
            const id = queue.shift();
            if (chainIds.has(id)) continue;
            chainIds.add(id);
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
        if (!chainIds.size) return;

        // Chain'de herhangi bir AKV vanası var mı?
        const hasAkv = (manager.components || []).some(c =>
            c.type === 'vana' && c.vanaTipi === 'AKV' && chainIds.has(c.bagliBoruId)
        );
        if (hasAkv) return;

        // Hedef: servis kutusu sonrası ilk hat (yoksa kutu)
        const firstPipeId = roots[0]?.id;
        const targets = firstPipeId
            ? [{ type: 'pipe', id: firstPipeId }]
            : [{ type: 'comp', id: box.id }];
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `vana-akv-${box.id}`,
            message:  'Kolonda AKV gerekmektedir.',
            floorName: floorNameById(box.floorId),
            source:  'TS7363 Md:5.1.9',
            detail:  'Doğalgaz bina bağlantı hattı üzerinde, rahatça ulaşılabilecek 1,90 – 2,10 m yükseklikte, tüm tesisatın gaz akışını gerektiğinde kesip açma işlevini yerine getirecek ana kapatma vanası (AKV) konulmalıdır.',
            targets,
            fix: {
                description: 'Kolonda servis kutusu sonrası ilk borunun sonuna AKV eklenecek',
                apply: () => addKolonAkv(manager, box.id),
            },
        });
    });
}

// "Cihaz/sayaç girişinin bulunduğu uca ≤ maxCm yakın vana var mı?" kontrolü.
// Geride (parent zinciri) vana olsa da, hattın sonunda yoksa eksik sayılır.
function hasVanaAtComponentEnd(manager, pipe, endpoint, tip, maxCm) {
    if (!pipe || !endpoint) return false;
    return endpoint === 'p1'
        ? hasVanaNearStart(manager, pipe, tip, maxCm)
        : hasVanaNearEnd(manager, pipe, tip, maxCm);
}

// 2. Cihaz vanası — her cihazın bağlandığı borunun cihaz tarafı ucunda
//    (≤ 50 cm) bir CIHAZ vanası bulunmalı.
function cihazVanaKuralı(manager, out) {
    (manager.components || []).forEach(cihaz => {
        if (cihaz.type !== 'cihaz') return;
        const inletPipeId = cihaz.fleksBaglanti?.boruId;
        const endpoint    = cihaz.fleksBaglanti?.endpoint;
        if (!inletPipeId || !endpoint) return;
        const pipe = manager.pipes.find(p => p.id === inletPipeId);
        if (!pipe) return;

        if (hasVanaAtComponentEnd(manager, pipe, endpoint, 'CIHAZ', CIHAZ_VANA_MAX_CM)) return;

        // PDF revize: cihaz hatasında HEDEFin (cihaz) hat no'su yazılır,
        // birimin/sayacın hat no'su tekrarlanmaz.
        const label = cihazHatLabel(manager, cihaz);
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `vana-cihaz-${cihaz.id}`,
            message: `${label} için cihaz vanası gerekli`,
            floorName: floorNameById(cihaz.floorId),
            source:  'TS7363 Md:6',
            detail:  'Her cihazın girişine bir adet kesme vanası mutlaka konulmalıdır.',
            targets: [{ type: 'comp', id: cihaz.id }],
            fix: {
                description: 'Cihaz girişinin bulunduğu boru ucuna kesme vanası eklenecek',
                apply: () => addCihazValve(manager, cihaz.id),
            },
        });
    });
}

// Yardımcı: cihaz'ın bağlı olduğu fleks borudan upstream sayaç bul.
function findMeterUpstreamLocal(manager, pipeId) {
    if (!pipeId || !manager?.pipes) return null;
    const pipeMap = new Map(manager.pipes.map(p => [p.id, p]));
    const metersByExit = new Map();
    (manager.components || []).forEach(c => {
        if (c.type === 'sayac' && c.cikisBagliBoruId) {
            metersByExit.set(c.cikisBagliBoruId, c);
        }
    });
    let cursor = pipeMap.get(pipeId);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        const m = metersByExit.get(cursor.id);
        if (m) return m;
        const par = cursor.baslangicBaglanti;
        if (par?.tip === 'boru' && par.hedefId) cursor = pipeMap.get(par.hedefId);
        else break;
    }
    return null;
}

// 3. Sayaç öncesi emniyet vanası — her sayacın bağlandığı borunun sayaç
//    tarafı ucunda (≤ 100 cm) bir EMNIYET vanası bulunmalı.
function sayacEmniyetKuralı(manager, out) {
    (manager.components || []).forEach(sayac => {
        if (sayac.type !== 'sayac') return;
        const inletPipeId = sayac.fleksBaglanti?.boruId;
        const endpoint    = sayac.fleksBaglanti?.endpoint;
        if (!inletPipeId || !endpoint) return;
        const pipe = manager.pipes.find(p => p.id === inletPipeId);
        if (!pipe) return;

        if (hasVanaAtComponentEnd(manager, pipe, endpoint, 'EMNIYET', SAYAC_EMNIYET_MAX_CM)) return;

        // Daire referansı — hat no eklenmez. "D2 Sayacı öncesi emniyet vanası gerekli"
        const d = daireLabel(sayac) || BIRIM_PLACEHOLDER;
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `vana-sayac-emniyet-${sayac.id}`,
            message: `${d} Sayacı öncesi emniyet vanası gerekli`,
            floorName: floorNameById(sayac.floorId),
            source:  'TS7363 Md:5.2.6',
            detail:  'Her sayaçtan önce bir kapama vanası bulunmalıdır.',
            targets: [{ type: 'comp', id: sayac.id }],
            fix: {
                description: 'Sayaç girişinin bulunduğu boru ucuna emniyet vanası eklenecek',
                apply: () => addSayacEmniyet(manager, sayac.id),
            },
        });
    });
}

// 4. Sayaç sonrası selenoid (ticari) — birimTipi='TİCARİ' sayaçlar için.
// Sayaç çıkışında ≥20 cm parça varsa, oraya selenoid eklenmiş olmalı.
function ticariSelenoidKuralı(manager, out) {
    (manager.components || []).forEach(sayac => {
        if (sayac.type !== 'sayac') return;
        if (sayac.birimTipi !== 'TİCARİ' && sayac.birimTipi !== 'TICARI') return;
        if (!sayac.cikisBagliBoruId) return;
        if (!meterCikisHasMinLength(manager, sayac, TICARI_SELENOID_MIN_CM)) return;

        // Sayaç çıkışından itibaren makul mesafede (örn 200 cm) selenoid ara
        if (hasVanaDownstreamWithin(manager, sayac.cikisBagliBoruId, 'SELENOID', 200)) return;

        const d = daireLabel(sayac) || BIRIM_PLACEHOLDER;
        // Hedef: sayaç çıkışı ilk hat (yoksa sayaç)
        const targets = sayac.cikisBagliBoruId
            ? [{ type: 'pipe', id: sayac.cikisBagliBoruId }]
            : [{ type: 'comp', id: sayac.id }];
        // Daire referansı — hat no eklenmez. "D2 Sayacı sonrası selenoid vana gerekli"
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `vana-ticari-selenoid-${sayac.id}`,
            message: `${d} Sayacı sonrası selenoid vana gerekli`,
            floorName: floorNameById(sayac.floorId),
            source:  'TS7363 Md:5.1.31',
            detail:  'Ticari yerler için yapılan tesisatlarda, solenoid vana ve gaz alarm cihazı bulundurulmak zorundadır. Daire dışında daireye ait ana hat üzerine monte edilecek solenoid vana ile irtibatlandırılmalıdır.',
            targets,
            fix: {
                description: 'Sayaç çıkışına yakın bir noktaya selenoid vana eklenecek',
                apply: () => addTicariSelenoid(manager, sayac.id),
            },
        });
    });
}

// 5. Deprem amaçlı selenoid — TS7363 Md:5.1.9
//    Servis kutusu zincirinde AKV varsa, AKV sonrasında bir SELENOID vana
//    bulunmalıdır (deprem bölgesi varsayımı). Zincirde hiç AKV yoksa kontrol
//    edilmez (önce AKV eksik hatası tetiklenir).
function depremSelenoidKuralı(manager, out) {
    const boxes = (manager.components || []).filter(c => c.type === 'servis_kutusu');
    if (!boxes.length) return;

    boxes.forEach(box => {
        // Zincirde AKV yoksa atla (akv-eksik kuralı ayrıca yakalar)
        const roots = (manager.pipes || []).filter(p =>
            p.baslangicBaglanti?.tip === 'servis_kutusu' &&
            p.baslangicBaglanti.hedefId === box.id
        );
        const chainIds = (() => {
            const ids = new Set();
            const childrenOf = buildChildrenMap(manager.pipes);
            const queue = roots.map(r => r.id);
            while (queue.length) {
                const id = queue.shift();
                if (ids.has(id)) continue;
                ids.add(id);
                (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
            }
            return ids;
        })();
        if (!chainIds.size) return;

        const hasAkv = (manager.components || []).some(c =>
            c.type === 'vana' && c.vanaTipi === 'AKV' && chainIds.has(c.bagliBoruId)
        );
        if (!hasAkv) return;

        if (hasSelenoidInChain(manager, box.id)) return;

        // Hedef: servis kutusu sonrası ilk hat (yoksa kutu)
        const firstPipeId = roots[0]?.id;
        const targets = firstPipeId
            ? [{ type: 'pipe', id: firstPipeId }]
            : [{ type: 'comp', id: box.id }];
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `vana-deprem-selenoid-${box.id}`,
            message: 'Kolonda Deprem amaçlı selenoid vana gerekli',
            floorName: floorNameById(box.floorId),
            source:  'TS7363 Md:5.1.9',
            detail:  'Binaların Yangından Korunması Hakkında Yönetmelik hükümlerinde belirtilen deprem bölgelerinde binaların ana girişinde ana kapama vanasından sonra, sarsıntı olduğunda gaz akışını kesen tertibat olması gerekmektedir.',
            targets,
            fix: {
                description: 'AKV\'nin 30 cm sonrasına selenoid vana eklenecek',
                apply: () => addDepremSelenoid(manager, box.id),
            },
        });
    });
}

// ─── Toplu checker ────────────────────────────────────────────────────────

function vanaEksikChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    kolonAkvKuralı(manager, out);
    cihazVanaKuralı(manager, out);
    sayacEmniyetKuralı(manager, out);
    ticariSelenoidKuralı(manager, out);
    depremSelenoidKuralı(manager, out);
    return out;
}

errorCheckManager.register('vana-eksik', vanaEksikChecker);
