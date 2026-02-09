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

// ───── SES TANIMA DÜZELTMELERİ ─────

/**
 * Web Speech API'nin Türkçe'de sıkça yanlış tanıdığı kelimelerin düzeltme haritası.
 * Anahtar: yanlış tanınan kelime, Değer: doğru kelime
 */
const SES_DUZELTME_HARITASI = {
    'bana': 'vana',
    'izle': 'gizle',
    'daha': 'sağa',
    'dana': 'vana',
    'vane': 'vana',
    'bane': 'vana',
    'saha': 'sağa',
    'sala': 'sola',
    'ilerleme': 'ileri',
    'ileride': 'ileri',
    'geride': 'geri',
    'yukarıda': 'yukarı',
    'aşağıda': 'aşağı',
    'doksanı': 'doksan',
    'ellisi': 'elli',
    'yüzü': 'yüz',
};

/**
 * Ses tanıma metnini düzeltir - yanlış tanınan kelimeleri doğru karşılıklarıyla değiştirir.
 * @param {string} text - Ham ses tanıma metni
 * @returns {string} Düzeltilmiş metin
 */
function correctSpeechText(text) {
    if (!text) return text;
    const words = text.split(/\s+/);
    const corrected = words.map(w => {
        const lower = w.toLowerCase();
        return SES_DUZELTME_HARITASI[lower] || w;
    });
    return corrected.join(' ');
}

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

    // Ses tanıma düzeltmelerini uygula
    text = correctSpeechText(text);

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

    // Ses tanıma düzeltmelerini uygula
    text = correctSpeechText(text);

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

    // Toggle komutları: konu + on/off grubu
    // ON grubu: göster, aç, on, açık
    // OFF grubu: gizle, kapat, off, kapalı, gösterme
    const toggleResult = parseToggleCommand(clean, text);
    if (toggleResult) return toggleResult;

    // Ekrana sığdır
    if (EKRANA_SIGDIR_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'view', action: 'fit_to_screen', raw: text };
    }

    // ── 3. BİLEŞEN EKLEME ──

    // Vana ekleme (konumlu)
    const vanaCmd = parseVanaCommand(clean, text);
    if (vanaCmd) return vanaCmd;

    // Sayaç ekle - "sayaç" tek başına da yeterli
    if (matchAny(clean, ['sayaç ekle', 'sayac ekle', 'sayaç koy', 'sayaç yerleştir']) || clean === 'sayaç' || clean === 'sayac') {
        return { type: 'add', object: 'sayac', raw: text };
    }

    // Kombi ekle - "kombi" tek başına da yeterli
    if (matchAny(clean, ['kombi ekle', 'kombi koy', 'kombi yerleştir', 'kombi bağla']) || clean === 'kombi') {
        return { type: 'add', object: 'kombi', raw: text };
    }

    // Ocak ekle - "ocak" tek başına da yeterli
    if (matchAny(clean, ['ocak ekle', 'ocak koy', 'ocak yerleştir', 'ocak bağla']) || clean === 'ocak') {
        return { type: 'add', object: 'ocak', raw: text };
    }

    // ── 3b. HAT SEÇİMİ (etikete göre) ──

    // "A hattını seç", "A nolu hattı seç", "B hattı seç", "hattı A seç"
    const selectMatch = clean.match(/([a-z])\s*(?:nolu?\s+)?hatt?[ıi]n?[ıi]?\s*seç/i)
        || clean.match(/hatt?[ıi]\s*([a-z])\s*seç/i)
        || clean.match(/([a-z])\s+seç/i);
    if (selectMatch) {
        const label = selectMatch[1].toUpperCase();
        return { type: 'select', label, raw: text };
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

    // ── 7. SADECE SAYI (son yönde devam) ──
    // "50", "100", "200 cm" gibi yönsüz sayılar → son yönde devam
    const numOnly = clean.match(/^(\d+(?:[.,]\d+)?)\s*(?:cm|santim|santimetre|birim)?$/);
    if (numOnly) {
        let dist = parseFloat(numOnly[1].replace(',', '.'));
        if (dist > 0) {
            return { type: 'continue', distance: dist, raw: text };
        }
    }

    return null;
}

// ───── TÜRKÇE SAYI KELİMELERİ ─────

const TURKCE_SAYILAR = {
    'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5,
    'altı': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9,
    'on': 10, 'yirmi': 20, 'otuz': 30, 'kırk': 40, 'elli': 50,
    'altmış': 60, 'yetmiş': 70, 'seksen': 80, 'doksan': 90,
    'yüz': 100, 'ikiyüz': 200, 'üçyüz': 300,
};

/**
 * Türkçe ek/takılarını temizleyerek kök kelimeyi bulmaya çalışır.
 * "doksanı" → "doksan", "yüzü" → "yüz", "elliyi" → "elli"
 */
function stripTurkceSuffix(word) {
    // Yaygın Türkçe sayı ekleri: -ı, -i, -u, -ü, -yı, -yi, -yu, -yü, -e, -a, -ye, -ya, -den, -dan
    const suffixes = ['yı', 'yi', 'yu', 'yü', 'ı', 'i', 'u', 'ü', 'ye', 'ya', 'e', 'a', 'den', 'dan'];
    for (const suffix of suffixes) {
        if (word.endsWith(suffix) && word.length > suffix.length + 1) {
            const stem = word.slice(0, -suffix.length);
            if (TURKCE_SAYILAR[stem] !== undefined) return stem;
        }
    }
    return word;
}

/**
 * Türkçe sayı kelimelerini rakama çevirir.
 * "doksan" → 90, "yüz elli" → 150, "iki yüz" → 200
 * Ek/takıları da tanır: "doksanı" → 90, "yüzü" → 100
 */
function parseTurkceNumber(text) {
    if (!text) return null;

    // Önce rakam ara
    const numMatch = text.match(/(\d+(?:[.,]\d+)?)/);
    if (numMatch) {
        let dist = parseFloat(numMatch[1].replace(',', '.'));
        if (text.includes('metre')) dist *= 100;
        return dist > 0 ? dist : null;
    }

    // Türkçe sayı kelimeleri ara (ek/takı temizleme ile)
    const words = text.toLowerCase().split(/\s+/);
    let total = 0;
    let found = false;

    for (const w of words) {
        if (TURKCE_SAYILAR[w] !== undefined) {
            total += TURKCE_SAYILAR[w];
            found = true;
        } else {
            // Ek/takı temizleyerek dene
            const stem = stripTurkceSuffix(w);
            if (stem !== w && TURKCE_SAYILAR[stem] !== undefined) {
                total += TURKCE_SAYILAR[stem];
                found = true;
            }
        }
    }

    return found && total > 0 ? total : null;
}

// ───── HAREKET KOMUTU AYRIŞTIRMA ─────

/**
 * Çok esnek hareket komutu ayrıştırıcı.
 * İçinde bir yön kelimesi ve (opsiyonel) bir sayı varsa hareket komutudur.
 * "100 sağa", "sağa 100", "sağ tarafa 100", "100 birim sağ",
 * "sağa doğru 100", "100 cm sağa çiz", "sağa git", "sağ" hepsi geçerli.
 * "doksan ileri", "90 ileri", "ileri 90" hepsi geçerli.
 */
function parseMoveCommand(clean, raw) {
    const words = clean.split(/\s+/);

    // 1. Yön kelimesini bul (tam kelime eşleşmesi)
    let dir = null;
    for (const w of words) {
        const d = YON_KELIME_HARITASI[w];
        if (d) { dir = d; break; }
    }

    // 2. Tam kelime bulunamadıysa, alt-metin eşleşmesi dene
    //    (ses tanıma bitişik yazabilir: "doksanileri", "yüzsağa" vb.)
    if (!dir) {
        // Bilinen yön köklerini metinde ara (uzundan kısaya sıralı - en spesifik önce)
        const YON_KOKLERI = [
            { pattern: 'yukarıya', dir: 'yukari' },
            { pattern: 'aşağıya', dir: 'asagi' },
            { pattern: 'ileriye', dir: 'ileri' },
            { pattern: 'geriye', dir: 'geri' },
            { pattern: 'yukarı', dir: 'yukari' },
            { pattern: 'yukari', dir: 'yukari' },
            { pattern: 'aşağı', dir: 'asagi' },
            { pattern: 'asagi', dir: 'asagi' },
            { pattern: 'ileri', dir: 'ileri' },
            { pattern: 'sağa', dir: 'saga' },
            { pattern: 'saga', dir: 'saga' },
            { pattern: 'sola', dir: 'sola' },
            { pattern: 'geri', dir: 'geri' },
            { pattern: 'sağ', dir: 'saga' },
            { pattern: 'sol', dir: 'sola' },
        ];

        for (const yk of YON_KOKLERI) {
            if (clean.includes(yk.pattern)) {
                dir = yk.dir;
                break;
            }
        }
    }

    if (!dir) return null;

    // 3. Sayıyı bul (varsa) - rakam veya Türkçe sayı kelimesi
    const distance = parseTurkceNumber(clean);

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

    // Sayıyı bul (varsa) - rakam veya Türkçe sayı kelimesi
    const distance = parseTurkceNumber(clean);

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

    // Genel offset vana komutu: metin içinde vana + sayı + yön ipucu varsa
    // "ucundan 30 cm geriye vana ekle", "10 cm geriye vana ekle",
    // "sondan 10 cm vana ekle", "vana ekle 10 cm geriye"
    if (clean.includes('vana')) {
        const numMatch = clean.match(/(\d+)/);
        if (numMatch) {
            const offset = parseInt(numMatch[1], 10);
            if (offset > 0) {
                const fromEnd = (clean.includes('baştan') || clean.includes('başından') || clean.includes('ileri')) ? 'start' : 'end';
                return { type: 'add', object: 'vana', position: 'offset', offset, fromEnd, raw };
            }
        }
    }

    return null;
}

// ───── TOGGLE KOMUT AYRIŞTIRMA ─────

// ON grubu: görünürlüğü açan kelimeler
const ON_KELIMELER = ['göster', 'aç', 'on', 'açık'];
// OFF grubu: görünürlüğü kapatan kelimeler
// "gösterme" "göster"den önce kontrol edilmeli (substring çakışması)
const OFF_KELIMELER = ['gösterme', 'gizle', 'kapat', 'off', 'kapalı'];

// Toggle konuları: konu anahtar kelimeleri → show/hide action eşlemesi
const TOGGLE_KONULARI = [
    { keywords: ['ölçü', 'ölçüleri', 'ölçüler'], on: 'show_dimensions', off: 'hide_dimensions' },
    { keywords: ['z kotu', 'z', 'kot', 'kotu'],   on: 'show_z',          off: 'hide_z' },
    { keywords: ['gölge', 'gölgeleri', 'gölgeyi'], on: 'show_shadow',     off: 'hide_shadow' },
    { keywords: ['etiket', 'etiketleri', 'hat no'], on: 'show_labels',    off: 'hide_labels' },
];

// Ekrana sığdır kalıpları
const EKRANA_SIGDIR_KALIPLARI = [
    'ekrana sığdır', 'ekrana sigdir', 'sığdır', 'sigdir',
    'ekrana sıgdır', 'ekrana sıgdır',
    'fit', 'fit to screen'
];

/**
 * Kelime sınırı duyarlı metin arama.
 * Kısa anahtar kelimeler (3 karakter ve altı) için kelime sınırı kontrolü yapar.
 * Uzun anahtar kelimeler için includes kullanır.
 */
function subjectMatch(clean, keyword) {
    if (keyword.length <= 2) {
        // Kısa kelimeler (z, on vb.) için kelime sınırı duyarlı arama
        const regex = new RegExp('(?:^|\\s)' + keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)');
        return regex.test(clean);
    }
    return clean.includes(keyword);
}

/**
 * Toggle komutunu ayrıştırır.
 * Herhangi bir konu + ON/OFF kelime kombinasyonu çalışır.
 * Örnek: "etiket göster", "etiketleri aç", "etiket on" → show_labels
 *         "etiket gizle", "etiketleri kapat", "etiket off" → hide_labels
 */
function parseToggleCommand(clean, raw) {
    for (const konu of TOGGLE_KONULARI) {
        const hasSubject = konu.keywords.some(k => subjectMatch(clean, k));
        if (!hasSubject) continue;

        // OFF önce kontrol et ("gösterme" içinde "göster" var, çakışma olmasın)
        const isOff = OFF_KELIMELER.some(k => clean.includes(k));
        if (isOff) return { type: 'view', action: konu.off, raw };

        const isOn = ON_KELIMELER.some(k => clean.includes(k));
        if (isOn) return { type: 'view', action: konu.on, raw };
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
                'hide_dimensions': 'Ölçüleri Gizle',
                'show_z': 'Z Kotu Göster',
                'hide_z': 'Z Kotu Gizle',
                'show_shadow': 'Gölge Göster',
                'hide_shadow': 'Gölge Gizle',
                'show_labels': 'Etiket Göster',
                'hide_labels': 'Etiket Gizle',
                'fit_to_screen': 'Ekrana Sığdır'
            };
            return actions[cmd.action] || cmd.action;
        }

        case 'continue': {
            const yonAd = cmd.direction ? (YON_ISIMLERI[cmd.direction] || cmd.direction) : 'devam';
            return `${cmd.distance} cm ${yonAd}`;
        }

        case 'branch': {
            const yonAd = YON_ISIMLERI[cmd.direction] || cmd.direction;
            const mesafe = cmd.distance ? `${cmd.distance} cm ` : '';
            return `Ortadan ${mesafe}${yonAd}`;
        }

        case 'select':
            return `${cmd.label} Hattını Seç`;
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
