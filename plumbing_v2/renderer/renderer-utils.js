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
 * Boruyu verilen kat aralığına kırpar.
 * Yatay borular (z1≈z2) z değerleri aralıktaysa tek parça döner.
 * Dikey/eğik borular kat sınırlarında kesilir ve crossesBottom/Top bilgisiyle döner.
 * @returns {null | { p1, p2, crossesBottom, crossesTop }}
 */
export function clipPipeToFloor(pipe, floor) {
    if (!pipe || !pipe.p1 || !pipe.p2 || !floor) return null;
    const z1 = pipe.p1.z || 0;
    const z2 = pipe.p2.z || 0;
    const fB = floor.bottomElevation;
    const fT = floor.topElevation;

    // Yatay boru — z sabit
    if (Math.abs(z1 - z2) < 0.01) {
        if (z1 >= fB && z1 < fT) {
            return {
                p1: { ...pipe.p1 },
                p2: { ...pipe.p2 },
                crossesBottom: false,
                crossesTop: false
            };
        }
        return null;
    }

    // Dikey/eğik — [fB, fT) ile kesişim al
    const zMin = Math.min(z1, z2);
    const zMax = Math.max(z1, z2);
    const zLo = Math.max(zMin, fB);
    const zHi = Math.min(zMax, fT);
    if (zLo >= zHi) return null;

    const interp = (p, q, t) => ({
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
        z: (p.z || 0) + ((q.z || 0) - (p.z || 0)) * t
    });

    // p1 -> p2 yönünde ilerleyen t parametresi bul
    const tLo = (zLo - z1) / (z2 - z1);
    const tHi = (zHi - z1) / (z2 - z1);
    const tStart = Math.min(tLo, tHi);
    const tEnd = Math.max(tLo, tHi);

    return {
        p1: interp(pipe.p1, pipe.p2, tStart),
        p2: interp(pipe.p1, pipe.p2, tEnd),
        crossesBottom: zMin < fB - 0.01,
        crossesTop: zMax > fT + 0.01
    };
}

/**
 * Borunun tüm katlarla kesişimini döner. Her slice kendi floorId'sini taşır
 * ve orijinal boruyu referans alır (hierarcy, renk vs. için).
 * @param {object} pipe
 * @param {Array} floors - placeholder olmayanlar
 * @returns {Array<{p1,p2,floorId,originalPipe,crossesBottom,crossesTop}>}
 */
export function slicePipeAcrossFloors(pipe, floors) {
    const out = [];
    if (!floors || !floors.length) return out;
    for (const f of floors) {
        if (f.isPlaceholder) continue;
        const c = clipPipeToFloor(pipe, f);
        if (c) {
            out.push({
                p1: c.p1,
                p2: c.p2,
                floorId: f.id,
                originalPipe: pipe,
                crossesBottom: c.crossesBottom,
                crossesTop: c.crossesTop
            });
        }
    }
    // Eğer hiçbir floor eşleşmediyse (z aralığı dışında), orijinalini ait olduğu
    // floorId ile tek slice olarak döndür — legacy/edge durum güvenliği.
    if (out.length === 0) {
        out.push({
            p1: { ...pipe.p1 },
            p2: { ...pipe.p2 },
            floorId: pipe.floorId || null,
            originalPipe: pipe,
            crossesBottom: false,
            crossesTop: false
        });
    }
    return out;
}

/**
 * Slice verisinden çizim için pipe proxy'si üretir. Orijinal boru özelliklerini
 * (boruTipi, colorGroup, id, boruCap, topraklama) miras alır, yalnız p1/p2 değişir.
 */
export function makeSlicedPipeProxy(slice) {
    const proxy = Object.create(slice.originalPipe);
    proxy.p1 = slice.p1;
    proxy.p2 = slice.p2;
    proxy._isSlice = true;
    proxy._sliceFloorId = slice.floorId;
    proxy._crossesBottom = slice.crossesBottom;
    proxy._crossesTop = slice.crossesTop;
    return proxy;
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
 * TS 7363:2018 Çizelge 7 — Eş Zaman Faktörleri (sayaç sonrası, 1–50 cihaz)
 * Index 0 = 1 cihaz, index 49 = 50 cihaz
 */
const CIZELGE_7 = [
    {ocak:0.621,kombi:1.000,soba:1.000,sofben:1.000},
    {ocak:0.448,kombi:0.883,soba:0.800,sofben:0.607},
    {ocak:0.371,kombi:0.822,soba:0.703,sofben:0.456},
    {ocak:0.325,kombi:0.782,soba:0.641,sofben:0.373},
    {ocak:0.294,kombi:0.752,soba:0.597,sofben:0.320},
    {ocak:0.271,kombi:0.729,soba:0.564,sofben:0.283},
    {ocak:0.253,kombi:0.710,soba:0.537,sofben:0.255},
    {ocak:0.239,kombi:0.694,soba:0.515,sofben:0.234},
    {ocak:0.227,kombi:0.680,soba:0.496,sofben:0.217},
    {ocak:0.217,kombi:0.668,soba:0.480,sofben:0.202},
    {ocak:0.208,kombi:0.657,soba:0.466,sofben:0.191},
    {ocak:0.201,kombi:0.648,soba:0.454,sofben:0.180},
    {ocak:0.194,kombi:0.639,soba:0.443,sofben:0.172},
    {ocak:0.188,kombi:0.631,soba:0.432,sofben:0.164},
    {ocak:0.183,kombi:0.624,soba:0.423,sofben:0.157},
    {ocak:0.178,kombi:0.617,soba:0.415,sofben:0.151},
    {ocak:0.173,kombi:0.611,soba:0.407,sofben:0.146},
    {ocak:0.169,kombi:0.605,soba:0.400,sofben:0.141},
    {ocak:0.166,kombi:0.599,soba:0.394,sofben:0.137},
    {ocak:0.162,kombi:0.594,soba:0.387,sofben:0.133},
    {ocak:0.159,kombi:0.590,soba:0.382,sofben:0.129},
    {ocak:0.156,kombi:0.585,soba:0.376,sofben:0.125},
    {ocak:0.153,kombi:0.581,soba:0.371,sofben:0.122},
    {ocak:0.151,kombi:0.577,soba:0.366,sofben:0.119},
    {ocak:0.148,kombi:0.573,soba:0.362,sofben:0.117},
    {ocak:0.145,kombi:0.569,soba:0.357,sofben:0.114},
    {ocak:0.144,kombi:0.566,soba:0.353,sofben:0.112},
    {ocak:0.142,kombi:0.562,soba:0.349,sofben:0.110},
    {ocak:0.140,kombi:0.559,soba:0.346,sofben:0.108},
    {ocak:0.138,kombi:0.555,soba:0.342,sofben:0.106},
    {ocak:0.136,kombi:0.553,soba:0.339,sofben:0.104},
    {ocak:0.134,kombi:0.550,soba:0.336,sofben:0.102},
    {ocak:0.133,kombi:0.547,soba:0.332,sofben:0.100},
    {ocak:0.131,kombi:0.545,soba:0.329,sofben:0.099},
    {ocak:0.130,kombi:0.542,soba:0.327,sofben:0.097},
    {ocak:0.128,kombi:0.540,soba:0.324,sofben:0.096},
    {ocak:0.127,kombi:0.537,soba:0.321,sofben:0.095},
    {ocak:0.125,kombi:0.535,soba:0.319,sofben:0.093},
    {ocak:0.125,kombi:0.533,soba:0.316,sofben:0.092},
    {ocak:0.123,kombi:0.530,soba:0.314,sofben:0.091},
    {ocak:0.122,kombi:0.528,soba:0.311,sofben:0.090},
    {ocak:0.121,kombi:0.526,soba:0.309,sofben:0.089},
    {ocak:0.120,kombi:0.524,soba:0.307,sofben:0.088},
    {ocak:0.119,kombi:0.522,soba:0.305,sofben:0.087},
    {ocak:0.118,kombi:0.520,soba:0.303,sofben:0.086},
    {ocak:0.117,kombi:0.518,soba:0.301,sofben:0.085},
    {ocak:0.116,kombi:0.517,soba:0.299,sofben:0.084},
    {ocak:0.115,kombi:0.515,soba:0.297,sofben:0.083},
    {ocak:0.114,kombi:0.513,soba:0.295,sofben:0.082},
    {ocak:0.114,kombi:0.512,soba:0.293,sofben:0.082}
];

/** Çizelge 7'den eş zaman faktörünü döner (tipKey: 'ocak'|'kombi'|'soba'|'sofben') */
function getEszamanFaktor(tipKey, count) {
    if (count <= 0) return 1;
    const idx = Math.min(count, 50) - 1;
    return CIZELGE_7[idx]?.[tipKey] ?? 1;
}

/** Sayaç sonrası: her tip için minimum debi (m³/h). En az 1 cihaz varsa uygulanır. */
const MIN_DEBI_TIP = { ocak: 1.6, kombi: 2.5 };

/**
 * TS 7363:2018 Çizelge 6 — Bağımsız birimler (n=1…100)
 * f_bry: eş zaman faktörü, bry: tablodaki doğrudan debi (m³/h, tüm birimler 3.5 m³/h ise)
 * Index 0 = n=1 … index 99 = n=100
 */
const CIZELGE_6 = [
    {f_bry:0.854,bry:  3.5},{f_bry:0.853,bry:  7.0},{f_bry:0.772,bry:  9.5},{f_bry:0.719,bry: 11.8},
    {f_bry:0.682,bry: 14.0},{f_bry:0.670,bry: 16.5},{f_bry:0.644,bry: 18.5},{f_bry:0.625,bry: 20.5},
    {f_bry:0.609,bry: 22.5},{f_bry:0.597,bry: 24.5},{f_bry:0.587,bry: 26.5},{f_bry:0.579,bry: 28.5},
    {f_bry:0.566,bry: 30.2},{f_bry:0.557,bry: 32.0},{f_bry:0.552,bry: 33.9},{f_bry:0.548,bry: 35.9},
    {f_bry:0.545,bry: 38.0},{f_bry:0.542,bry: 40.0},{f_bry:0.539,bry: 42.0},{f_bry:0.524,bry: 43.0},
    {f_bry:0.523,bry: 45.0},{f_bry:0.521,bry: 47.0},{f_bry:0.515,bry: 48.5},{f_bry:0.508,bry: 50.0},
    {f_bry:0.504,bry: 51.6},{f_bry:0.499,bry: 53.2},{f_bry:0.495,bry: 54.8},{f_bry:0.490,bry: 56.3},
    {f_bry:0.484,bry: 57.5},{f_bry:0.477,bry: 58.7},{f_bry:0.474,bry: 60.2},{f_bry:0.471,bry: 61.7},
    {f_bry:0.468,bry: 63.2},{f_bry:0.465,bry: 64.7},{f_bry:0.461,bry: 66.2},{f_bry:0.459,bry: 67.8},
    {f_bry:0.457,bry: 69.3},{f_bry:0.455,bry: 70.9},{f_bry:0.453,bry: 72.4},{f_bry:0.451,bry: 74.0},
    {f_bry:0.449,bry: 75.5},{f_bry:0.447,bry: 77.0},{f_bry:0.445,bry: 78.5},{f_bry:0.443,bry: 80.0},
    {f_bry:0.441,bry: 81.4},{f_bry:0.439,bry: 82.9},{f_bry:0.437,bry: 84.4},{f_bry:0.436,bry: 85.9},
    {f_bry:0.434,bry: 87.3},{f_bry:0.433,bry: 88.8},{f_bry:0.432,bry: 90.3},{f_bry:0.431,bry: 91.8},
    {f_bry:0.430,bry: 93.3},{f_bry:0.428,bry: 94.8},{f_bry:0.427,bry: 96.3},{f_bry:0.426,bry: 97.8},
    {f_bry:0.425,bry: 99.2},{f_bry:0.424,bry:100.7},{f_bry:0.422,bry:102.1},{f_bry:0.421,bry:103.6},
    {f_bry:0.420,bry:105.1},{f_bry:0.419,bry:106.6},{f_bry:0.418,bry:108.1},{f_bry:0.418,bry:109.6},
    {f_bry:0.417,bry:111.1},{f_bry:0.416,bry:112.6},{f_bry:0.415,bry:114.1},{f_bry:0.414,bry:115.5},
    {f_bry:0.414,bry:117.0},{f_bry:0.413,bry:118.5},{f_bry:0.412,bry:120.0},{f_bry:0.411,bry:121.4},
    {f_bry:0.410,bry:122.9},{f_bry:0.410,bry:124.3},{f_bry:0.409,bry:125.8},{f_bry:0.408,bry:127.3},
    {f_bry:0.408,bry:128.8},{f_bry:0.407,bry:130.2},{f_bry:0.407,bry:131.7},{f_bry:0.406,bry:133.2},
    {f_bry:0.405,bry:134.6},{f_bry:0.405,bry:136.1},{f_bry:0.404,bry:137.5},{f_bry:0.404,bry:139.0},
    {f_bry:0.403,bry:140.4},{f_bry:0.403,bry:141.9},{f_bry:0.402,bry:143.4},{f_bry:0.402,bry:144.9},
    {f_bry:0.401,bry:146.4},{f_bry:0.401,bry:148.0},{f_bry:0.400,bry:149.5},{f_bry:0.400,bry:151.0},
    {f_bry:0.399,bry:152.4},{f_bry:0.399,bry:153.9},{f_bry:0.399,bry:155.4},{f_bry:0.399,bry:156.9},
    {f_bry:0.398,bry:158.4},{f_bry:0.398,bry:159.9},{f_bry:0.397,bry:161.3},{f_bry:0.397,bry:162.8}
];

/** 1 birimin bry faktörü — ham debi hesabında bölen olarak kullanılır (0.854) */
const BRY1 = CIZELGE_6[0].f_bry;

/**
 * Çizelge 6 ile sayaç öncesi hat debisini hesaplar.
 * @param {number}  count   - Toplam birim sayısı
 * @param {number}  hamDebi - Ham debi toplamı (her birim = birimDebi / BRY1)
 * @param {boolean} hepsi35 - Tüm birimler tam 3.5 m³/h ise → bry kolonunu doğrudan kullan
 */
export function getCizelge6Debi(count, hamDebi, hepsi35) {
    if (count <= 0) return 0;
    const idx = Math.min(count, 100) - 1;
    const row = CIZELGE_6[idx];
    return hepsi35 ? row.bry : hamDebi * row.f_bry;
}

/**
 * Her boruya kümülatif debi atar.
 *
 * SAYAÇ SONRASI hatlar: TS 7363:2018 Çizelge 7 eş zaman faktörleri uygulanır.
 *   Her boru için downstream cihazlar tipe göre (ocak/kombi/soba/sofben) sayılır,
 *   toplam kapasite × faktör hesaplanır ve tipler toplanır.
 *
 * SAYAÇ ÖNCESİ hatlar: cihazlar doğrudan toplanır (sayaç öncesinde cihaz olmaz).
 */
export function computePipeDebileri(manager) {
    if (!manager?.pipes) return;

    const pipes   = manager.pipes;
    const pipeMap = new Map(pipes.map(p => [p.id, p]));

    // 1. Çocuk ve ebeveyn haritası
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

    // 2. Sayaç sonrası pipe ID'lerini BFS ile belirle (+ pipe→sayac eşlemesi)
    // pipeToMeter: bir post-meter borusunun ait olduğu sayaç bileşeni (en yakın sayaç)
    const sayacSonrasiIds = new Set();
    const pipeToMeter = new Map();
    (manager.components || []).forEach(c => {
        if (c.type !== 'sayac' || !c.cikisBagliBoruId) return;
        const queue = [c.cikisBagliBoruId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (sayacSonrasiIds.has(id)) continue;
            sayacSonrasiIds.add(id);
            if (!pipeToMeter.has(id)) pipeToMeter.set(id, c);
            (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
        }
    });

    // Sayaç ARİTMETİK modunda mı? (TİCARİ veya KAZAN DAİRESİ)
    // Bu sayaçlarda eşzaman faktörü uygulanmaz, cihazlar birebir toplanır;
    // ve sayaç öncesine cikis debisi AYNEN yansır (birim/Çizelge 6 yerine direkt nfd).
    const _isAritmetikSayac = (s) => s && (s.birimTipi === 'TİCARİ' || s.birimTipi === 'KAZAN DAİRESİ');

    // 3. Tüm boruları sıfırla
    //    Sayaç sonrası → cihaz dağılımı (_db) + direkt debi (_directDebi)
    //    Sayaç öncesi  → birim tablosu (_birim: {count, hamDebi, hepsi35}) — Çizelge 6 için
    pipes.forEach(p => {
        p.debi = 0;
        if (sayacSonrasiIds.has(p.id)) {
            p._db = {
                ocak:   { count: 0, totalM3h: 0 },
                kombi:  { count: 0, totalM3h: 0 },
                soba:   { count: 0, totalM3h: 0 },
                sofben: { count: 0, totalM3h: 0 },
                other:  { count: 0, totalM3h: 0 }
            };
            p._nfd = 0;
            p._directDebi = 0;
            p._hasDirectDevice = false;
        } else {
            p._birim = { count: 0, hamDebi: 0, hepsi35: true }; // Çizelge 6 birim biriktirici
            p._nfd   = 0; // Aritmetik eklenen debi (sayaç öncesinde de kullanılır)
        }
    });

    // 4. Doğrudan bağlı bileşenlerin katkısını ata
    (manager.components || []).forEach(c => {
        if (c.type === 'cihaz') {
            const pipeId = c.fleksBaglanti?.boruId;
            if (!pipeId) return;
            const pipe = pipeMap.get(pipeId);
            if (!pipe) return;
            const kcal  = parseFloat(c.kapasiteKcal);
            const verim = (parseFloat(c.verim) || 100) / 100;
            if (isNaN(kcal) || kcal <= 0) return;
            const m3h = kcal / 8250 / verim;

            if (sayacSonrasiIds.has(pipeId)) {
                const tip    = (c.cihazTipi || '').toUpperCase();
                const tipKey = ['OCAK','KOMBI','SOBA','SOFBEN'].includes(tip) ? tip.toLowerCase() : 'other';
                const minM3h = Math.max(m3h, MIN_DEBI_TIP[tipKey] ?? 0);
                pipe._db[tipKey].count++;
                pipe._db[tipKey].totalM3h += minM3h;
                pipe._directDebi += minM3h;
                pipe._hasDirectDevice = true;
            }
            // Sayaç öncesinde cihaz olmaz — yoksay

        } else if (c.type === 'vana' && c.vanaTipi === 'BRANSMAN' && c.bagliBoruId) {
            const debi = parseFloat(c.bransmanDebi);
            if (!isNaN(debi) && debi > 0) {
                const pipe = pipeMap.get(c.bagliBoruId);
                if (!pipe) return;
                if (sayacSonrasiIds.has(c.bagliBoruId)) {
                    pipe._nfd += debi;
                } else {
                    // Sayaç öncesi: 1 birim, ham debi = birimDebi / BRY1
                    pipe._birim.count   += 1;
                    pipe._birim.hamDebi += debi / BRY1;
                    if (Math.abs(debi - 3.5) > 0.001) pipe._birim.hepsi35 = false;
                }
            }

        } else if (c.type === 'vana' && c.vanaTipi === 'YANBINA' && c.bagliBoruId) {
            const d  = parseFloat(c.daireSayisi)  || 0;
            const dk = parseFloat(c.dukkanSayisi) || 0;
            const ek = parseFloat(c.ekDebi)       || 0;
            const pipe = pipeMap.get(c.bagliBoruId);
            if (!pipe) return;
            if (sayacSonrasiIds.has(c.bagliBoruId)) {
                const debi = (d + dk) * 3.5 + ek;
                if (debi > 0) pipe._nfd += debi;
            } else {
                // Sayaç öncesi: (daire+dükkan) birim; her birim 3.5 m³/h
                const n = d + dk;
                if (n > 0) {
                    pipe._birim.count   += n;
                    pipe._birim.hamDebi += n * (3.5 / BRY1);
                    // Yan bina birimleri her zaman 3.5 — hepsi35 değişmez
                }
                // Ek debi: Çizelge 6'ya girmez, doğrudan (aritmetik) eklenir
                if (ek > 0) pipe._nfd += ek;
            }
        }
    });

    // 5. Post-order DFS
    //    Sayaç sonrası: cihaz dağılımını (_db) biriktir → Çizelge 7 ile debi hesapla
    //    Sayaç öncesi : birim bilgisini (_birim) biriktir → Çizelge 6 sonraki adımda
    const visited = new Set();
    function dfs(pipeId) {
        if (visited.has(pipeId)) return;
        visited.add(pipeId);

        (childrenOf.get(pipeId) || []).forEach(childId => {
            dfs(childId);
            const parent = pipeMap.get(pipeId);
            const child  = pipeMap.get(childId);
            if (!parent || !child) return;

            if (sayacSonrasiIds.has(pipeId)) {
                // Sayaç sonrası → _db biriktir
                for (const k of ['ocak','kombi','soba','sofben','other']) {
                    parent._db[k].count    += child._db?.[k]?.count    || 0;
                    parent._db[k].totalM3h += child._db?.[k]?.totalM3h || 0;
                }
                parent._nfd += child._nfd || 0;
                if (!sayacSonrasiIds.has(childId)) {
                    // Alt dal sayaç öncesi ise debisini ekle (degenerate durum)
                    parent._nfd += child.debi;
                }
            } else {
                // Sayaç öncesi → _birim biriktir (çocuk da sayaç öncesiyse)
                if (!sayacSonrasiIds.has(childId) && child._birim) {
                    parent._birim.count   += child._birim.count   || 0;
                    parent._birim.hamDebi += child._birim.hamDebi || 0;
                    if (!child._birim.hepsi35) parent._birim.hepsi35 = false;
                    parent._nfd += child._nfd || 0; // Ek debi aritmetik olarak yukarı taşı
                }
                // Çocuk sayaç sonrasıysa sayaç step 6'da işlenir, burada dokunma
            }
        });

        // Sayaç sonrası boru: Çizelge 7 ile debi hesapla (TİCARİ/KAZAN için aritmetik)
        if (sayacSonrasiIds.has(pipeId)) {
            const pipe = pipeMap.get(pipeId);
            if (pipe) {
                const sayac = pipeToMeter.get(pipeId);
                const aritmetik = _isAritmetikSayac(sayac);
                if (pipe._hasDirectDevice) {
                    pipe.debi = pipe._directDebi + pipe._nfd;
                } else if (aritmetik) {
                    // TİCARİ/KAZAN DAİRESİ: cihazlar BİREBİR aritmetik toplanır
                    let toplam = 0;
                    for (const k of ['ocak','kombi','soba','sofben','other']) {
                        toplam += pipe._db[k].totalM3h || 0;
                    }
                    pipe.debi = toplam + pipe._nfd;
                } else {
                    const tiplerMevcut = ['ocak','kombi','soba','sofben'].filter(k => pipe._db[k].count > 0);
                    const tekTip = tiplerMevcut.length === 1 ? tiplerMevcut[0] : null;
                    let factored = 0;
                    for (const k of tiplerMevcut) {
                        const { count, totalM3h } = pipe._db[k];
                        const hesap = totalM3h * getEszamanFaktor(k, count);
                        factored += tekTip ? Math.max(hesap, MIN_DEBI_TIP[k] ?? 0) : hesap;
                    }
                    factored += pipe._db.other.totalM3h;
                    pipe.debi = factored + pipe._nfd;
                }
            }
        }
    }

    pipes.forEach(p => {
        if (p.baslangicBaglanti?.tip !== 'boru') dfs(p.id);
    });

    // 6. Sayaç geçişi — TİCARİ/KAZAN DAİRESİ AYNEN yansır, KONUT/OFİS Çizelge 6 birim
    //    Her sayaç için giriş borusundan başlayıp tüm sayaç ÖNCESİ borulara dağıt.
    (manager.components || []).forEach(c => {
        if (c.type !== 'sayac') return;
        const girisBoru = c.fleksBaglanti?.boruId ? pipeMap.get(c.fleksBaglanti.boruId) : null;
        const cikisBoru = c.cikisBagliBoruId ? pipeMap.get(c.cikisBagliBoruId) : null;
        if (!girisBoru || !cikisBoru || cikisBoru.debi <= 0) return;

        const sayacDebi = cikisBoru.debi;
        const aritmetik = _isAritmetikSayac(c);

        // Standart birim hesabı (KONUT/OFİS için)
        const birimDebi = sayacDebi <= 5 ? 3.5 : 3.5 + (sayacDebi - 5);
        const hamDebi = birimDebi / BRY1;
        const bu35 = Math.abs(birimDebi - 3.5) <= 0.001;

        // Sayaç giriş borusundan başlayıp YALNIZ ÜST yöne (parentOf) yürü.
        // Aksi hâlde aynı trunk'tan beslenen sibling kollara da birim eklenir
        // ve tek sayaca giden branch'ta 3-4 birim görünür.
        let curId = girisBoru.id;
        const localVisited = new Set();
        while (curId && !localVisited.has(curId) && !sayacSonrasiIds.has(curId)) {
            localVisited.add(curId);
            const p = pipeMap.get(curId);
            if (p) {
                if (aritmetik) {
                    // TİCARİ/KAZAN DAİRESİ: cikis debisi DİREKT yansır (aritmetik)
                    p._nfd = (p._nfd || 0) + sayacDebi;
                } else if (p._birim) {
                    // KONUT/OFİS: Çizelge 6 birim biriktirici
                    p._birim.count += 1;
                    p._birim.hamDebi += hamDebi;
                    if (!bu35) p._birim.hepsi35 = false;
                }
            }
            curId = parentOf.get(curId);
        }
    });

    // 7. Sayaç öncesi borular: Çizelge 6 ile debi hesapla + ek debi aritmetik ekle
    //    Tüm birimler 3.5 m³/h ise → bry kolonunu doğrudan kullan
    //    Aksi hâlde → hamDebi × f_bry
    //    Yan bina ek debisi (_nfd) Çizelge 6 dışında doğrudan eklenir
    pipes.forEach(p => {
        if (sayacSonrasiIds.has(p.id) || !p._birim) return;
        const { count, hamDebi, hepsi35 } = p._birim;
        const cizelgeDebi = (count > 0 && hamDebi > 0) ? getCizelge6Debi(count, hamDebi, hepsi35) : 0;
        p.debi = cizelgeDebi + (p._nfd || 0);
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

    // ── KURAL: SERVİS KUTUSU OLMAYAN İÇ TESİSAT PROJELERİ ──────────────────────
    // Bu tipte projelerde sayaç öncesindeki borulara hat numarası verilmez —
    // sayaç öncesi sadece kısa bağlantı/hizmet kısmıdır, gerçek dağıtım hatları
    // sayaç sonrasında numaralanır. Tek istisna: önemli kapasitede pre-meter
    // (debi > 3.5) vardır → bu durumda hat no kalır (yan bina, ek tüketim, vs.).
    const hasServisKutusu = (components || []).some(c => c.type === 'servis_kutusu');
    if (!hasServisKutusu) {
        // Her sayaçın giriş borusundan upstream'e doğru tüm boruları topla.
        // sayacOncesiByMeter: meter id → set of upstream pipe ids
        // sayacOncesiAll: birleşim — global filtre için
        const sayacOncesiAll = new Set();
        (components || []).forEach(c => {
            if (c.type !== 'sayac' || !c.fleksBaglanti?.boruId) return;
            // Bu sayacın throughput'u (cikis boru debisi) — eşik kontrolü için
            const cikis = c.cikisBagliBoruId ? pipeMap.get(c.cikisBagliBoruId) : null;
            const throughput = cikis ? parseFloat(cikis.debi) || 0 : 0;
            // Sayaç önceki boruları topla (children chain ile upstream yönde)
            const localUpstream = new Set();
            const queue = [c.fleksBaglanti.boruId];
            while (queue.length > 0) {
                const id = queue.shift();
                if (localUpstream.has(id)) continue;
                localUpstream.add(id);
                (childrenOf.get(id) || []).forEach(cid => queue.push(cid));
            }
            // Bu sayaç için throughput ≤ 3.5 ise sayacın TÜM öncesini sil.
            // > 3.5 ise yalnızca debi'si 3.5'i geçen pipe'lar korunur.
            localUpstream.forEach(pid => {
                const p = pipeMap.get(pid);
                const pdebi = p ? (parseFloat(p.debi) || 0) : 0;
                if (throughput <= 3.5 || pdebi <= 3.5) {
                    sayacOncesiAll.add(pid);
                }
            });
        });

        sayacOncesiAll.forEach(pid => hatMap.delete(pid));
    }

    return { hatMap, hatCount: hatCounter21 + (hatCounter300 - 300) };
}
