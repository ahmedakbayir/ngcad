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
