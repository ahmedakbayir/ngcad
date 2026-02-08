/**
 * Voice Command Parser (v2)
 * Türkçe sesli komutları yapısal komut nesnelerine ayrıştırır.
 *
 * Desteklenen komutlar:
 *
 *  YERLEŞTIRME:
 *   "servis kutusu koy"                     → { type: 'place', object: 'servis_kutusu' }
 *   "iç tesisat başlat" / "iç tesisat"      → { type: 'place', object: 'ic_tesisat' }
 *
 *  HAREKET (boru çizme):
 *   "100 cm sağa" / "100 sağa" / "sağa 100" → { type: 'move', distance: 100, direction: 'saga' }
 *   "sağa" (mesafesiz)                       → { type: 'move', distance: null, direction: 'saga' }
 *   "100 sağ, 150 yukarı, 200 ileri"         → toplu ayrıştırma (parseBatch)
 *
 *  BİLEŞEN EKLEME:
 *   "vana ekle"                             → { type: 'add', object: 'vana', position: 'end' }
 *   "hattın sonuna vana ekle"               → { type: 'add', object: 'vana', position: 'end' }
 *   "hattın ortasına vana ekle"             → { type: 'add', object: 'vana', position: 'middle' }
 *   "10 cm geriye vana ekle"                → { type: 'add', object: 'vana', position: 'offset', offset: 10 }
 *   "sayaç ekle"                            → { type: 'add', object: 'sayac' }
 *   "kombi ekle"                            → { type: 'add', object: 'kombi' }
 *   "ocak ekle"                             → { type: 'add', object: 'ocak' }
 *
 *  GÖRÜNÜM:
 *   "3d" / "3 boyut" / "3d sahne"           → { type: 'view', action: '3d' }
 *   "2d" / "2 boyut" / "2d sahne"           → { type: 'view', action: '2d' }
 *   "ölçüleri göster"                       → { type: 'view', action: 'show_dimensions' }
 *   "ölçüleri gizle"                        → { type: 'view', action: 'hide_dimensions' }
 *
 *  NAVİGASYON:
 *   "4. adıma dön"                          → { type: 'goto', step: 4 }
 *   "geri al"                               → { type: 'undo' }
 *   "bitir"                                 → { type: 'finish' }
 */

// ───── YÖN HARİTASI ─────

// Tek kelimelik yön eşleşmeleri (her kelime kendi başına kontrol edilir)
const YON_KELIME_HARITASI = {
    // sağ ailesi
    'sağa': 'saga', 'sağ': 'saga', 'saga': 'saga', 'sağı': 'saga',
    // sol ailesi
    'sola': 'sola', 'sol': 'sola',
    // yukarı ailesi
    'yukarı': 'yukari', 'yukarıya': 'yukari', 'yukari': 'yukari', 'yukarıya': 'yukari',
    // aşağı ailesi
    'aşağı': 'asagi', 'aşağıya': 'asagi', 'asagi': 'asagi', 'aşağıya': 'asagi',
    // ileri ailesi
    'ileri': 'ileri', 'ileriye': 'ileri', 'ileriyi': 'ileri',
    // geri ailesi
    'geri': 'geri', 'geriye': 'geri', 'geriyi': 'geri',
};

// Geriye uyumluluk için eski harita (resolveDirection kullanır)
const YON_HARITASI = { ...YON_KELIME_HARITASI };

// Yön → vektör eşlemesi
// X: sağa/sola, Y: ileri/geri (ekranda yukarı/aşağı), Z: yukarı/aşağı (dikey)
export const YON_VEKTORLERI = {
    saga:   { dx:  1, dy:  0, dz: 0 },
    sola:   { dx: -1, dy:  0, dz: 0 },
    ileri:  { dx:  0, dy: -1, dz: 0 },
    geri:   { dx:  0, dy:  1, dz: 0 },
    yukari: { dx:  0, dy:  0, dz: 1 },
    asagi:  { dx:  0, dy:  0, dz:-1 },
};

// Varsayılan mesafe (ölçü verilmezse)
export const VARSAYILAN_MESAFE = 100; // cm

// ───── TOPLU KOMUT AYRIŞTIRMA ─────

/**
 * Virgül veya "ve" ile ayrılmış toplu komutu ayrı komutlara böler.
 * "100 sağ, 150 yukarı, 200 ileri" → 3 ayrı komut
 * @param {string} text - Ham metin
 * @returns {object[]} Ayrıştırılmış komut dizisi
 */
export function parseBatch(text) {
    if (!text || typeof text !== 'string') return [];

    // Virgül veya " ve " ile böl
    const parts = text.split(/\s*[,،]\s*|\s+ve\s+/i)
        .map(p => p.trim())
        .filter(p => p.length > 0);

    // Tek parça ise normal ayrıştırma
    if (parts.length <= 1) {
        const cmd = parseVoiceCommand(text);
        return cmd ? [cmd] : [];
    }

    // Birden fazla parça → her birini ayrıştır
    const commands = [];
    for (const part of parts) {
        const cmd = parseVoiceCommand(part);
        if (cmd) commands.push(cmd);
    }
    return commands;
}

// ───── TEK KOMUT AYRIŞTIRMA ─────

/**
 * Tek bir Türkçe sesli komutu ayrıştırır.
 * @param {string} text - Ham komut metni
 * @returns {object|null} Komut nesnesi veya null
 */
export function parseVoiceCommand(text) {
    if (!text || typeof text !== 'string') return null;

    const clean = text.toLowerCase().trim()
        .replace(/\s+/g, ' ');

    // ── 1. YERLEŞTIRME ──

    // Servis kutusu
    if (clean.includes('servis kutusu') && matchAny(clean, ['koy', 'yerleştir', 'ekle', 'başlat'])) {
        return { type: 'place', object: 'servis_kutusu', raw: text };
    }
    if (clean === 'servis kutusu') {
        return { type: 'place', object: 'servis_kutusu', raw: text };
    }

    // İç tesisat
    if (clean.includes('iç tesisat')) {
        return { type: 'place', object: 'ic_tesisat', raw: text };
    }

    // ── 2. GÖRÜNÜM ──

    // 3D sahne
    if (/^(3\s*d|3\s*boyut|üç\s*boyut)(.*sahne)?$/i.test(clean)) {
        return { type: 'view', action: '3d', raw: text };
    }

    // 2D sahne
    if (/^(2\s*d|2\s*boyut|iki\s*boyut)(.*sahne)?$/i.test(clean)) {
        return { type: 'view', action: '2d', raw: text };
    }

    // Ölçüleri göster
    if (matchAny(clean, ['ölçüleri göster', 'ölçüler göster', 'ölçüleri aç', 'ölçü göster'])) {
        return { type: 'view', action: 'show_dimensions', raw: text };
    }

    // Ölçüleri gizle
    if (matchAny(clean, ['ölçüleri gizle', 'ölçüler gizle', 'ölçüleri kapat', 'ölçü gizle'])) {
        return { type: 'view', action: 'hide_dimensions', raw: text };
    }

    // ── 3. BİLEŞEN EKLEME ──

    // Vana ekleme (konumlu)
    const vanaCmd = parseVanaCommand(clean, text);
    if (vanaCmd) return vanaCmd;

    // Sayaç ekle
    if (matchAny(clean, ['sayaç ekle', 'sayac ekle', 'sayaç koy', 'sayaç yerleştir'])) {
        return { type: 'add', object: 'sayac', raw: text };
    }

    // Kombi ekle
    if (matchAny(clean, ['kombi ekle', 'kombi koy', 'kombi yerleştir', 'kombi bağla'])) {
        return { type: 'add', object: 'kombi', raw: text };
    }

    // Ocak ekle
    if (matchAny(clean, ['ocak ekle', 'ocak koy', 'ocak yerleştir', 'ocak bağla'])) {
        return { type: 'add', object: 'ocak', raw: text };
    }

    // ── 4. NAVİGASYON ──

    // Bitir
    if (matchAny(clean, ['bitir', 'bitti', 'tamam', 'durdur'])) {
        return { type: 'finish', raw: text };
    }

    // Geri al
    if (matchAny(clean, ['geri al', 'iptal', 'son adımı geri al'])) {
        return { type: 'undo', raw: text };
    }

    // Adıma dön
    const gotoMatch = clean.match(/(\d+)\s*\.?\s*adıma?\s*(dön|git)/i)
        || clean.match(/adım\s*(\d+)\s*'?\s*[ea]\s*(dön|git)/i);
    if (gotoMatch) {
        const step = parseInt(gotoMatch[1], 10);
        if (!isNaN(step) && step > 0) {
            return { type: 'goto', step, raw: text };
        }
    }

    // ── 5. DALLANMA (hattın ortasından/başından yön) ──
    const branchCmd = parseBranchCommand(clean, text);
    if (branchCmd) return branchCmd;

    // ── 6. HAREKET (boru çizme) ──
    // En sona bırakıyoruz çünkü en geniş eşleme kurallarına sahip

    const moveCmd = parseMoveCommand(clean, text);
    if (moveCmd) return moveCmd;

    return null;
}

// ───── HAREKET KOMUTU AYRIŞTIRMA ─────

/**
 * Çok esnek hareket komutu ayrıştırıcı.
 * İçinde bir yön kelimesi ve (opsiyonel) bir sayı varsa hareket komutudur.
 * "100 sağa", "sağa 100", "sağ tarafa 100", "100 birim sağ",
 * "sağa doğru 100", "100 cm sağa çiz", "sağa git", "sağ" hepsi geçerli.
 */
function parseMoveCommand(clean, raw) {
    const words = clean.split(/\s+/);

    // 1. Yön kelimesini bul
    let dir = null;
    for (const w of words) {
        const d = YON_KELIME_HARITASI[w];
        if (d) { dir = d; break; }
    }
    if (!dir) return null;

    // 2. Sayıyı bul (varsa)
    let distance = null;
    const numMatch = clean.match(/(\d+(?:[.,]\d+)?)/);
    if (numMatch) {
        let dist = parseFloat(numMatch[1].replace(',', '.'));
        // Metre birimi kontrolü
        if (clean.includes('metre')) {
            dist *= 100;
        }
        if (dist > 0) {
            distance = dist;
        }
    }

    return { type: 'move', distance, direction: dir, raw };
}

// ───── DALLANMA KOMUTU AYRIŞTIRMA ─────

/**
 * "hattın ortasından 100 ileri", "hattın ortasından sağa 50" gibi dallanma komutlarını ayrıştırır.
 * Mevcut borunun belirtilen noktasından yeni bir boru dallandırır (T-bağlantı).
 */
function parseBranchCommand(clean, raw) {
    // "hattın ortasından", "borunun ortasından" kalıbı
    const ortaMatch = clean.match(/(?:hatt?ın|borunun)\s+ortası(?:ndan|na)/);
    if (!ortaMatch) return null;

    // Yön ve mesafe bul
    const afterMatch = clean.substring(ortaMatch.index + ortaMatch[0].length).trim();
    const combined = afterMatch || clean;

    // Yön kelimesini bul
    let dir = null;
    for (const w of combined.split(/\s+/)) {
        const d = YON_KELIME_HARITASI[w];
        if (d) { dir = d; break; }
    }
    if (!dir) return null;

    // Sayıyı bul (varsa)
    let distance = null;
    const numMatch = clean.match(/(\d+(?:[.,]\d+)?)/);
    if (numMatch) {
        let dist = parseFloat(numMatch[1].replace(',', '.'));
        if (clean.includes('metre')) dist *= 100;
        if (dist > 0) distance = dist;
    }

    return { type: 'branch', position: 'middle', distance, direction: dir, raw };
}

// ───── VANA KOMUTU AYRIŞTIRMA ─────

function parseVanaCommand(clean, raw) {
    // "vana ekle" → son noktaya
    if (/^vana\s+(ekle|koy|yerleştir)$/.test(clean)) {
        return { type: 'add', object: 'vana', position: 'end', raw };
    }

    // "hattın sonuna vana ekle"
    if (/hatt?ın\s+sonuna\s+vana\s+(ekle|koy)/.test(clean)) {
        return { type: 'add', object: 'vana', position: 'end', raw };
    }

    // "hattın ortasına vana ekle"
    if (/hatt?ın\s+ortasına\s+vana\s+(ekle|koy)/.test(clean)) {
        return { type: 'add', object: 'vana', position: 'middle', raw };
    }

    // "hattın başına vana ekle"
    if (/hatt?ın\s+başına\s+vana\s+(ekle|koy)/.test(clean)) {
        return { type: 'add', object: 'vana', position: 'start', raw };
    }

    // "10 cm geriye vana ekle" / "sondan 10 cm vana ekle"
    const offsetMatch = clean.match(/(\d+)\s*(?:cm)?\s*(?:geriye?|ileriye?|sondan|baştan)\s*vana\s*(ekle|koy)/);
    if (offsetMatch) {
        const offset = parseInt(offsetMatch[1], 10);
        const fromEnd = clean.includes('baştan') || clean.includes('ileri') ? 'start' : 'end';
        return { type: 'add', object: 'vana', position: 'offset', offset, fromEnd, raw };
    }

    // "vana ekle 10 cm geriye"
    const offsetMatch2 = clean.match(/vana\s*(ekle|koy)\s*(\d+)\s*(?:cm)?\s*(?:geriye?|sondan)/);
    if (offsetMatch2) {
        const offset = parseInt(offsetMatch2[2], 10);
        return { type: 'add', object: 'vana', position: 'offset', offset, fromEnd: 'end', raw };
    }

    return null;
}

// ───── YARDIMCI FONKSİYONLAR ─────

/**
 * Metin içinde belirtilen kelimelerden herhangi birinin geçip geçmediğini kontrol eder.
 */
function matchAny(text, patterns) {
    return patterns.some(p => text.includes(p));
}

/**
 * Yön metnini normalize yön anahtarına çevirir.
 * Kelime kelime kontrol eder, herhangi birinde yön bulursa döndürür.
 */
function resolveDirection(text) {
    if (!text) return null;
    const t = text.toLowerCase().trim();
    // Kelime kelime kontrol et
    const words = t.split(/\s+/);
    for (const w of words) {
        if (YON_KELIME_HARITASI[w]) return YON_KELIME_HARITASI[w];
    }
    return null;
}

// ───── KOMUT → METİN ÇEVİRİCİ ─────

const YON_ISIMLERI = {
    saga: 'sağa', sola: 'sola',
    ileri: 'ileri', geri: 'geri',
    yukari: 'yukarı', asagi: 'aşağı'
};

/**
 * Komut nesnesini okunabilir Türkçe metne çevirir.
 */
export function commandToText(cmd) {
    if (!cmd) return '';

    switch (cmd.type) {
        case 'place':
            if (cmd.object === 'ic_tesisat') return 'İç Tesisat Başlat';
            return 'Servis Kutusu Koy';

        case 'move': {
            const yonAd = YON_ISIMLERI[cmd.direction] || cmd.direction;
            if (cmd.distance) return `${cmd.distance} cm ${yonAd}`;
            return yonAd;
        }

        case 'add': {
            const objNames = { vana: 'Vana', sayac: 'Sayaç', kombi: 'Kombi', ocak: 'Ocak' };
            const name = objNames[cmd.object] || cmd.object;
            if (cmd.position === 'middle') return `${name} Ekle (ortaya)`;
            if (cmd.position === 'start') return `${name} Ekle (başa)`;
            if (cmd.position === 'offset') return `${name} Ekle (${cmd.offset} cm ${cmd.fromEnd === 'start' ? 'baştan' : 'sondan'})`;
            return `${name} Ekle`;
        }

        case 'view': {
            const actions = {
                '3d': '3D Sahne',
                '2d': '2D Sahne',
                'show_dimensions': 'Ölçüleri Göster',
                'hide_dimensions': 'Ölçüleri Gizle'
            };
            return actions[cmd.action] || cmd.action;
        }

        case 'branch': {
            const yonAd = YON_ISIMLERI[cmd.direction] || cmd.direction;
            const mesafe = cmd.distance ? `${cmd.distance} cm ` : '';
            return `Ortadan ${mesafe}${yonAd}`;
        }

        case 'goto':
            return `${cmd.step}. adıma dön`;
        case 'undo':
            return 'Geri Al';
        case 'finish':
            return 'Bitir';
        default:
            return cmd.raw || '?';
    }
}

/**
 * Yön komutunu vektöre çevirir.
 */
export function directionToVector(direction, distance) {
    const vec = YON_VEKTORLERI[direction];
    if (!vec) return { dx: 0, dy: 0, dz: 0 };
    return {
        dx: vec.dx * distance,
        dy: vec.dy * distance,
        dz: vec.dz * distance
    };
}
