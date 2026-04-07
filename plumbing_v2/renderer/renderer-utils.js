// plumbing_v2/renderer-utils.js
// Tesisat renderer için yardımcı fonksiyonlar ve sabitler

// --- VANA RENK PALETLERİ (Light/Dark Mod Destekli) ---
export const VALVE_THEMES = {
    // SARI BORU -> GOLD/SARI VANA
    YELLOW: {
        light: [ // Aydınlık Mod (Daha canlı, parlak)
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(160, 82, 45, 1)' }, // Sienna
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(160, 82, 45, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [ // Karanlık Mod (Daha metalik, doygun)
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(184, 134, 11, 1)' }, // Dark Goldenrod
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(184, 134, 11, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ]
    },
    // TURKUAZ BORU -> MAVİ VANA
    TURQUAZ: {
        light: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(0, 100, 204, 1)' }, // Dark Blue
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(0, 100, 204, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(21, 154, 172, 1)' }, // Dodger Blue
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(21, 154, 172, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ]
    },
    // VARSAYILAN (Gri/Beyaz)
    DEFAULT: {
        light: [
            { pos: 0, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.25, color: 'rgba(128, 128, 128, 1)' },
            { pos: 0.5, color: 'rgba(255, 255, 255, 1)' },
            { pos: 0.75, color: 'rgba(128, 128, 128, 1)' },
            { pos: 1, color: 'rgba(255, 255, 255, 1)' }
        ],
        dark: [
            { pos: 0, color: 'rgba(200, 200, 200, 1)' },
            { pos: 0.25, color: 'rgba(80, 80, 80, 1)' },
            { pos: 0.5, color: 'rgba(200, 200, 200, 1)' },
            { pos: 0.75, color: 'rgba(80, 80, 80, 1)' },
            { pos: 1, color: 'rgba(200, 200, 200, 1)' }
        ]
    }
};

export const CUSTOM_COLORS = {
    SELECTED: '#808080', // 0.5 Derece Gri (Tüm seçili elemanlar için)

    METER_GREEN: { // Sayaç - Yeşil Yoğunluklu
        light: { 0: '#E8F5E9', 0.3: '#A5D6A7', 0.7: '#66BB6A', 1: '#2E7D32' },
        dark: { 0: '#E8F5E9', 0.3: '#81C784', 0.7: '#43A047', 1: '#1B5E20' }
    },
    BOX_ORANGE: { // Servis Kutusu - Turuncu Yoğunluklu
        top: '#9c66bbff',
        middle: '#daa2ffff',
        bottom: '#9c66bbff',
        stroke: '#2f203aff'
    },
    DEVICE_BLUE: { // Ocak/Kombi - Mavi Yoğunluklu
        light: { 0: '#E3F2FD', 0.3: '#90CAF9', 0.6: '#42A5F5', 1: '#1565C0' },
        dark: { 0: '#E3F2FD', 0.3: '#64B5F6', 0.6: '#1E88E5', 1: '#0D47A1' }
    }
};

/**
 * İki nokta arasındaki mesafeyi hesaplar
 */
export function distance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Borular arasında parent-child ilişkisini kurar ve etiketler (Mantıksal Bağlantı Bazlı)
 * @param {Array} pipes - Borular listesi
 * @param {Array} components - Bileşenler listesi
 * @returns {Map} pipe.id -> { label, parent, children }
 */
export function buildPipeHierarchy(pipes, components) {
    if (!pipes || !components || pipes.length === 0) {
        return new Map();
    }

    const hierarchy = new Map();
    const childrenMap = new Map(); // Parent ID -> [Child Pipes]

    // 1. ADIM: Tüm boruların kime bağlı olduğunu (parent) analiz et
    // Mesafe ölçümü yerine doğrudan veritabanındaki 'baslangicBaglanti' verisini kullanıyoruz.
    pipes.forEach(pipe => {
        if (pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === 'boru') {
            const parentId = pipe.baslangicBaglanti.hedefId;
            if (!childrenMap.has(parentId)) {
                childrenMap.set(parentId, []);
            }
            childrenMap.get(parentId).push(pipe);
        }
    });

    // 2. ADIM: Kök (Root) boruları bul
    // Kökler: Servis kutusuna bağlı olanlar, Sayaca bağlı olanlar veya hiçbir şeye bağlı olmayanlar
    const rootPipes = [];
    const processedIds = new Set();

    // A) Bileşenlere bağlı olanlar (Explicit connection)
    components.forEach(comp => {
        if (comp.type === 'servis_kutusu' && comp.bagliBoruId) {
            const pipe = pipes.find(p => p.id === comp.bagliBoruId);
            if (pipe && !processedIds.has(pipe.id)) {
                rootPipes.push(pipe);
                processedIds.add(pipe.id);
            }
        }
        else if (comp.type === 'sayac' && comp.cikisBagliBoruId) {
            const pipe = pipes.find(p => p.id === comp.cikisBagliBoruId);
            if (pipe && !processedIds.has(pipe.id)) {
                rootPipes.push(pipe);
                processedIds.add(pipe.id);
            }
        }
    });

    // B) Parent'ı olmayan diğer borular (Kopuk veya başlangıç boruları)
    pipes.forEach(pipe => {
        if (processedIds.has(pipe.id)) return;

        // Eğer bir boru tipi parent'ı yoksa (childrenMap'e girmediyse) köktür
        const isChildOfPipe = pipe.baslangicBaglanti && pipe.baslangicBaglanti.tip === 'boru';

        if (!isChildOfPipe) {
            rootPipes.push(pipe);
        }
    });

    // Görsel kararlılık için kökleri sırala (Sol-Üst'ten Sağ-Alt'a)
    // Bu sayede sayfa yenilendiğinde A, B harfleri yer değiştirmez.
    rootPipes.sort((a, b) => (a.p1.x + a.p1.y) - (b.p1.x + b.p1.y));

    // 3. ADIM: Hiyerarşiyi oluştur (BFS Algoritması)
    const queue = [];
    let labelIndex = 0;

    // Rootları kuyruğa ekle ve etiketle (A, B, C...)
    rootPipes.forEach(p => {
        const label = String.fromCharCode(65 + labelIndex++);
        hierarchy.set(p.id, { label, parent: null, children: [] });
        queue.push(p);
    });

    while (queue.length > 0) {
        const parentPipe = queue.shift();
        const parentData = hierarchy.get(parentPipe.id);

        // Bu borunun çocuklarını al
        const children = childrenMap.get(parentPipe.id) || [];

        // Çocukları geometrik olarak sırala (Akış yönünde düzenli harf dağılımı için)
        // Parent'ın p1 noktasına olan mesafeye göre sıralıyoruz
        children.sort((a, b) => {
            const distA = Math.hypot(a.p1.x - parentPipe.p1.x, a.p1.y - parentPipe.p1.y);
            const distB = Math.hypot(b.p1.x - parentPipe.p1.x, b.p1.y - parentPipe.p1.y);
            return distA - distB;
        });

        children.forEach(child => {
            if (!hierarchy.has(child.id)) { // Döngüsel bağımlılığı önle
                const childLabel = String.fromCharCode(65 + labelIndex++);

                hierarchy.set(child.id, {
                    label: childLabel,
                    parent: parentData.label,
                    children: []
                });

                // Parent'ın çocuk listesine etiketi ekle
                if (parentData) {
                    parentData.children.push(childLabel);
                }

                queue.push(child);
            }
        });
    }

    return hierarchy;
}

/**
 * Her boruya kümülatif debi atar:
 *   1. Doğrudan bağlı cihazların debisi atanır.
 *   2. Alt→üst (post-order DFS) ile çocukların debisi ebeveyne eklenir.
 * Böylece her borunun debi'si kendisinden sonraki tüm dalların toplamını içerir.
 */
export function computePipeDebileri(manager) {
    if (!manager?.pipes) return;

    const pipes   = manager.pipes;
    const pipeMap = new Map(pipes.map(p => [p.id, p]));

    // 1. Sıfırla ve doğrudan cihaz debilerini ata
    pipes.forEach(p => { p.debi = 0; });
    (manager.components || []).forEach(c => {
        if (c.type === 'cihaz') {
            const pipeId = c.fleksBaglanti?.boruId;
            if (!pipeId) return;
            const kcal  = parseFloat(c.kapasiteKcal);
            const verim = (parseFloat(c.verim) || 100) / 100;
            if (isNaN(kcal) || kcal <= 0) return;
            const pipe = pipeMap.get(pipeId);
            if (pipe) pipe.debi += kcal / 8250 / verim;
        } else if (c.type === 'vana' && c.vanaTipi === 'BRANSMAN' && c.bagliBoruId) {
            // Branşman: kullanıcının girdiği debi doğrudan boruya atanır
            const debi = parseFloat(c.bransmanDebi);
            if (!isNaN(debi) && debi > 0) {
                const pipe = pipeMap.get(c.bagliBoruId);
                if (pipe) pipe.debi += debi;
            }
        } else if (c.type === 'vana' && c.vanaTipi === 'YANBINA' && c.bagliBoruId) {
            // Yan Bina: hesaplanan toplam debi boruya atanır
            const d  = parseFloat(c.daireSayisi)  || 0;
            const dk = parseFloat(c.dukkanSayisi) || 0;
            const ek = parseFloat(c.ekDebi)       || 0;
            const debi = (d + dk) * 3.5 + ek;
            if (debi > 0) {
                const pipe = pipeMap.get(c.bagliBoruId);
                if (pipe) pipe.debi += debi;
            }
        }
    });

    // 2. Çocuk ve ebeveyn haritası
    const childrenOf = new Map();
    const parentOf   = new Map();
    pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
            parentOf.set(p.id, bag.hedefId);
        }
    });

    // 3. Post-order DFS: çocukların debisini ebeveyne ekle
    const visited = new Set();
    function dfs(pipeId) {
        if (visited.has(pipeId)) return;
        visited.add(pipeId);
        (childrenOf.get(pipeId) || []).forEach(childId => {
            dfs(childId);
            const parent = pipeMap.get(pipeId);
            const child  = pipeMap.get(childId);
            if (parent && child) parent.debi += child.debi;
        });
    }

    // Kök borulardan başla (başlangıcı başka bir boruya bağlı olmayanlar)
    pipes.forEach(p => {
        if (p.baslangicBaglanti?.tip !== 'boru') dfs(p.id);
    });

    // 4. Sayaç geçişi: çıkış borusunun debisini sayaç girişinden köke kadar yayar.
    // Her sayaç için giriş borusundan kök boroya kadar tüm atalar güncellenir.
    // (Eski step5 DFS'nin yerine — double-count olmadan)
    (manager.components || []).forEach(c => {
        if (c.type !== 'sayac') return;
        const girisBoru = c.fleksBaglanti?.boruId ? pipeMap.get(c.fleksBaglanti.boruId) : null;
        const cikisBoru = c.cikisBagliBoruId ? pipeMap.get(c.cikisBagliBoruId) : null;
        if (!girisBoru || !cikisBoru || cikisBoru.debi <= 0) return;
        let curId = girisBoru.id;
        while (curId) {
            const p = pipeMap.get(curId);
            if (p) p.debi += cikisBoru.debi;
            curId = parentOf.get(curId);
        }
    });
}

/**
 * Boru segmentlerini "hat" gruplarına ayırır.
 *
 * AŞAMA 1 — Kesim: Şu durumlarda yeni section başlar:
 *   • Çap değişti  • Debi değişti (dallanma)  • Sayaç sınırı  • Basınç değişti
 *
 * AŞAMA 2 — Birleştirme: Aynı özelliklere sahip farklı section'lar aynı hat no'yu paylaşır.
 *   Eşleşme kriterleri: debi · toplam uzunluk · yükseklik farkı · basınç · dirsek sayısı
 *                       · önceki hat çapı · sonraki hat çapı
 *
 * @returns {{ hatMap: Map<pipeId, hatNo>, hatCount: number }}
 */
export function computeHatGroups(pipes, components) {
    if (!pipes || pipes.length === 0) return { hatMap: new Map(), hatCount: 0 };

    const pipeMap = new Map(pipes.map(p => [p.id, p]));

    // Çocuk ve ebeveyn haritaları
    const childrenOf = new Map();
    const parentOf   = new Map();
    pipes.forEach(p => {
        const bag = p.baslangicBaglanti;
        if (bag?.tip === 'boru' && bag.hedefId) {
            if (!childrenOf.has(bag.hedefId)) childrenOf.set(bag.hedefId, []);
            childrenOf.get(bag.hedefId).push(p.id);
            parentOf.set(p.id, bag.hedefId);
        }
    });

    const sayacStartIds = new Set(
        (components || []).filter(c => c.type === 'sayac' && c.cikisBagliBoruId)
            .map(c => c.cikisBagliBoruId)
    );
    const servisRootIds = new Set(
        (components || []).filter(c => c.type === 'servis_kutusu' && c.bagliBoruId)
            .map(c => c.bagliBoruId)
    );

    const rootPipes = pipes.filter(p => !parentOf.has(p.id));
    rootPipes.sort((a, b) => {
        const aS = servisRootIds.has(a.id) ? 0 : sayacStartIds.has(a.id) ? 1 : 2;
        const bS = servisRootIds.has(b.id) ? 0 : sayacStartIds.has(b.id) ? 1 : 2;
        return aS - bS || (a.p1.x + a.p1.y) - (b.p1.x + b.p1.y);
    });

    // ── AŞAMA 1: Section'lara böl ─────────────────────────────────────────────
    // section: { pipeIds, cap, debi, basınç, prevSecIdx, nextSecIdxs[] }
    const sections   = [];
    const sectionOf  = new Map(); // pipeId → section index

    function isBreak(pipeId, parId) {
        if (!parId) return true;
        if (sayacStartIds.has(pipeId)) return true;
        const p = pipeMap.get(pipeId), par = pipeMap.get(parId);
        if (!p || !par) return true;
        if (p.boruCap !== par.boruCap) return true;
        if (Math.abs((p.debi || 0) - (par.debi || 0)) > 0.001) return true;
        if ((p.basinc ?? '') !== (par.basinc ?? '')) return true;
        // Dallanma noktasında (ebeveynin 2+ çocuğu var) yeni hat başlat
        if ((childrenOf.get(parId) || []).length > 1) return true;
        return false;
    }

    const bfsQ = rootPipes.map(p => ({ pipeId: p.id, parId: null, parSecIdx: null }));
    const visited = new Set();

    while (bfsQ.length > 0) {
        const { pipeId, parId, parSecIdx } = bfsQ.shift();
        if (visited.has(pipeId)) continue;
        visited.add(pipeId);

        const pipe = pipeMap.get(pipeId);
        if (!pipe) continue;

        let secIdx;
        if (isBreak(pipeId, parId)) {
            secIdx = sections.length;
            sections.push({
                pipeIds:    [pipeId],
                cap:        pipe.boruCap || 'DN25',
                debi:       pipe.debi    || 0,
                basınç:     pipe.basinc ?? '',
                prevSecIdx: parSecIdx,
                nextSecIdxs: []
            });
            if (parSecIdx != null) sections[parSecIdx].nextSecIdxs.push(secIdx);
        } else {
            secIdx = parSecIdx;
            sections[secIdx].pipeIds.push(pipeId);
        }
        sectionOf.set(pipeId, secIdx);

        const ch = (childrenOf.get(pipeId) || []).slice().sort((a, b) => {
            const pa = pipeMap.get(a), pb = pipeMap.get(b);
            return ((pa?.p1.x||0)+(pa?.p1.y||0)) - ((pb?.p1.x||0)+(pb?.p1.y||0));
        });
        ch.forEach(cid => { if (!visited.has(cid)) bfsQ.push({ pipeId: cid, parId: pipeId, parSecIdx: secIdx }); });
    }

    // ── AŞAMA 2: Her section için özellik hesapla ─────────────────────────────
    sections.forEach(sec => {
        const idSet = new Set(sec.pipeIds);

        // Toplam uzunluk (cm)
        sec.totalLen = Math.round(sec.pipeIds.reduce((s, pid) => {
            const p = pipeMap.get(pid);
            if (!p?.p1 || !p?.p2) return s;
            return s + Math.hypot(p.p2.x-p.p1.x, p.p2.y-p.p1.y, (p.p2.z||0)-(p.p1.z||0));
        }, 0));

        // Yükseklik farkı: section başı p1.z → section sonu p2.z
        let startZ = null, endZ = null;
        sec.pipeIds.forEach(pid => {
            const p = pipeMap.get(pid);
            if (!p) return;
            if (!parentOf.has(pid) || !idSet.has(parentOf.get(pid)))
                startZ = p.p1.z || 0;
            const ch = (childrenOf.get(pid) || []).filter(c => idSet.has(c));
            if (ch.length === 0)
                endZ = p.p2.z || 0;
        });
        sec.heightDiff = Math.round(Math.abs((endZ || 0) - (startZ || 0)));

        // Dirsek sayısı: ardışık borular arasındaki açı > 15°
        // Section içindeki sıralı zincir
        let cur = sec.pipeIds.find(pid => !parentOf.has(pid) || !idSet.has(parentOf.get(pid)));
        const chain = [];
        const vSec = new Set();
        while (cur && !vSec.has(cur)) {
            vSec.add(cur); chain.push(cur);
            cur = (childrenOf.get(cur) || []).find(c => idSet.has(c) && !vSec.has(c));
        }
        let elbows = 0;
        for (let i = 1; i < chain.length; i++) {
            const a = pipeMap.get(chain[i-1]), b = pipeMap.get(chain[i]);
            if (!a || !b) continue;
            const ax = a.p2.x-a.p1.x, ay = a.p2.y-a.p1.y, az = (a.p2.z||0)-(a.p1.z||0);
            const bx = b.p2.x-b.p1.x, by = b.p2.y-b.p1.y, bz = (b.p2.z||0)-(b.p1.z||0);
            const la = Math.hypot(ax,ay,az), lb = Math.hypot(bx,by,bz);
            if (la < 0.01 || lb < 0.01) continue;
            const dot = (ax*bx+ay*by+az*bz)/(la*lb);
            if (Math.acos(Math.max(-1,Math.min(1,dot))) * 180/Math.PI > 15) elbows++;
        }
        sec.elbowCount = elbows;

        // Önceki ve sonraki hat çapları
        sec.prevCap = sec.prevSecIdx != null ? (sections[sec.prevSecIdx]?.cap || '') : '';
        sec.nextCap = sec.nextSecIdxs.length === 1 ? (sections[sec.nextSecIdxs[0]]?.cap || '') : '';
    });

    // ── AŞAMA 3: Fingerprint eşleştirme → hat no atan ─────────────────────────
    // 21 mbar hatlar: 1'den başlar
    // 300 mbar hatlar: 301'den başlar (ayrı sayaç)
    const fpToHat = new Map();
    let hatCounter21  = 0;
    let hatCounter300 = 300;
    const secHat = new Map(); // secIdx → hatNo

    // Section'ları ağaç sırasında (BFS) işle
    const secQueue = rootPipes.map(p => sectionOf.get(p.id)).filter(i => i != null);
    const secVisited = new Set();
    const secOrder = [];
    while (secQueue.length > 0) {
        const idx = secQueue.shift();
        if (secVisited.has(idx)) continue;
        secVisited.add(idx);
        secOrder.push(idx);
        sections[idx].nextSecIdxs.forEach(ni => { if (!secVisited.has(ni)) secQueue.push(ni); });
    }

    secOrder.forEach(idx => {
        const sec = sections[idx];
        const is300 = String(sec.basınç) === '300';
        const fp = [
            is300 ? '300' : '21',  // basınç grubu fingerprint'e dahil
            Math.round((sec.debi || 0) * 1000),
            sec.totalLen,
            sec.heightDiff,
            sec.elbowCount,
            sec.prevCap,
            sec.nextCap,
            sec.cap
        ].join('|');

        if (!fpToHat.has(fp)) {
            fpToHat.set(fp, is300 ? ++hatCounter300 : ++hatCounter21);
        }
        secHat.set(idx, fpToHat.get(fp));
    });

    // ── Boru → hat no eşlemesi ────────────────────────────────────────────────
    const hatMap = new Map();
    pipes.forEach(p => {
        const si = sectionOf.get(p.id);
        if (si != null) hatMap.set(p.id, secHat.get(si));
    });

    return { hatMap, hatCount: hatCounter21 + (hatCounter300 - 300) };
}
