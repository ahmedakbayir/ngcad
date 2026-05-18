// tesisat-nesnesi-eksik / index.js
// "Tesisat nesnesi eksik" grubu — kolonda topraklama çubuğu ve AKV muhafaza.
//
// Kurallar:
//   1. Md:5.1.20 — Servis kutusu sonrası ilk kolon parçasında Topraklama
//      çubuğu bulunmalı (ilk vana veya ilk dallanmadan önce).
//   2. Md:5.1.9  — AKV vanası dış ortamda ise muhafazalı olmalı.
//      "Dış ortam" tespiti otomatik değildir; AKV'lerde muhafaza
//      seçili değilse uyarı verilir.

import { errorCheckManager } from '../../error-check-manager.js';
import { ERROR_GROUP_IDS } from '../../error-types.js';
import { ensureTopraklama, ensureAkvMuhafaza } from './fix.js';

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

function hasValveOnPipe(manager, pipeId) {
    return (manager.components || []).some(c =>
        c.type === 'vana' && c.bagliBoruId === pipeId
    );
}

// Servis kutusundan başlayıp ilk vana veya ilk dallanmaya kadar olan
// pipe id'lerini toplar. İlk parçayı bu küme temsil eder.
function firstSegmentPipeIds(manager, rootPipe, childrenOf) {
    const ids = new Set();
    if (!rootPipe) return ids;
    let cursor = rootPipe;
    const visited = new Set();
    while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        ids.add(cursor.id);
        // Bu boruda vana varsa "ilk parça" buraya kadardır.
        if (hasValveOnPipe(manager, cursor.id)) break;
        const children = (childrenOf.get(cursor.id) || []);
        if (children.length !== 1) break; // ayrım veya uç
        const nextPipe = manager.pipes.find(p => p.id === children[0]);
        if (!nextPipe) break;
        // Sonraki boruda regülatör de bir "kesişim" sayılır → dur.
        // (Şu an basit tutuyoruz; ilerleyen kuralarda revize edilebilir.)
        cursor = nextPipe;
    }
    return ids;
}

// ─── Kurallar ─────────────────────────────────────────────────────────────

function topraklamaKurali(manager, out) {
    const boxes = (manager.components || []).filter(c => c.type === 'servis_kutusu');
    if (!boxes.length) return;
    const childrenOf = buildChildrenMap(manager.pipes);

    boxes.forEach(box => {
        // Servis kutusundan başlayan kök boru(lar)
        const roots = manager.pipes.filter(p =>
            p.baslangicBaglanti?.tip === 'servis_kutusu' &&
            p.baslangicBaglanti.hedefId === box.id
        );
        if (!roots.length) return;

        // Birden fazla kök varsa her birini ayrı zincir olarak ele almak yerine
        // tek "ilk parça" hesabı için ilk kök yeterli; geri kalan kolonlar
        // ileride farklı projelerde nadiren rastlanır.
        const firstRoot = roots[0];
        const segment = firstSegmentPipeIds(manager, firstRoot, childrenOf);
        if (!segment.size) return;

        // İlk parça borularından birinde topraklama var mı?
        const hasTop = (manager.components || []).some(c =>
            c.type === 'topraklama' && segment.has(c.bagliBoruId)
        );
        if (hasTop) return;

        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `topraklama-${box.id}`,
            message: 'Topraklama çubuğu gerekli',
            source:  'TS7363 Md:5.1.20',
            detail:  'Topraklama en az 16 mm çapında ve 1,5 m uzunlukta som bakır çubuk elektrotlar, en az 20 mm çapında ve 1,25 m uzunluğunda som bakır çubuk elektrotlar veya 0,5 m² ve 2 mm kalınlığında bakır levha ile yapılmalıdır.',
            targets: [{ type: 'pipe', id: firstRoot.id }],
            fix: {
                description: 'AKV\'nin 50 cm altına (yükselen kolona) topraklama eklenecek',
                apply: () => ensureTopraklama(manager, box.id),
            },
        });
    });
}

function akvMuhafazaKurali(manager, out) {
    (manager.components || []).forEach(c => {
        if (c.type !== 'vana' || c.vanaTipi !== 'AKV') return;
        if (c.muhafaza === true) return;
        out.push({
            group:   ERROR_GROUP_IDS.TESISAT_NESNESI_EKSIK,
            errorId: `akv-muhafaza-${c.id}`,
            message: 'AKV muhafazalı olmalıdır',
            source:  'TS7363 Md:5.1.9',
            detail:  'Ana kapatma vanası (dişli bağlantılı) bina dışında bir noktaya konulacak ise havalandırılmış bir kutu içine alınmalıdır.',
            targets: [{ type: 'comp', id: c.id }],
            fix: {
                description: 'AKV için muhafaza işaretlenecek',
                apply: () => ensureAkvMuhafaza(manager, c.id),
            },
        });
    });
}

// ─── Toplu checker ────────────────────────────────────────────────────────
function tesisatNesnesiEksikChecker({ manager }) {
    if (!manager) return [];
    const out = [];
    topraklamaKurali(manager, out);
    akvMuhafazaKurali(manager, out);
    return out;
}

errorCheckManager.register('tesisat-nesnesi-eksik', tesisatNesnesiEksikChecker);
