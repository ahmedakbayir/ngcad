/**
 * Voice Command Parser (v3)
 * Türkçe sesli komutları yapısal komut nesnelerine ayrıştırır.
 * Yapay zeka benzeri fuzzy intent recognition ile tanınmayan komutları da anlar.
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
 *  ZOOM:
 *   "yakınlaş" / "yaklaş" / "zoom in"      → { type: 'zoom', action: 'in' }
 *   "uzaklaş" / "zoom out"                 → { type: 'zoom', action: 'out' }
 *
 *  SEÇİMİ MERKEZLE:
 *   "seçimi merkezle" / "seçimi ekrana sığdır" → { type: 'view', action: 'fit_selection' }
 *
 *  HAT BÖLME:
 *   "hattı böl"                            → { type: 'split', position: 'middle' }
 *   "hattı 50 cm den böl"                  → { type: 'split', position: 'distance', distance: 50 }
 *   "hattı 3 parçaya böl"                  → { type: 'split', position: 'parts', parts: 3 }
 *
 *  MOD DEĞİŞTİRME:
 *   "mimari moda geç"                      → { type: 'mode', drawingMode: 'MİMARİ' }
 *   "karma moda geç"                       → { type: 'mode', drawingMode: 'KARMA' }
 *   "duvar çiz" / "duvar modu"             → { type: 'mode', mode: 'drawWall' }
 *
 *  ŞEHİR İSMİ İLE HAT SEÇİMİ:
 *   "konya seç"                            → { type: 'select', label: 'K' } (ilk harf)
 *   "istanbul seç"                         → { type: 'select', label: 'İ' }
 *
 *  NAVİGASYON:
 *   "4. adıma dön"                          → { type: 'goto', step: 4 }
 *   "geri al"                               → { type: 'undo' }
 *   "bitir"                                 → { type: 'finish' }
 *
 *  YAPAY ZEKA NİYET TANIMA (FALLBACK):
 *   Tanınmayan komutlar Levenshtein benzerlik analizi ile en yakın bilinen komuta eşlenir.
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

// ───── TÜRK ŞEHİR İSİMLERİ → HAT ETİKETİ EŞLEMESİ ─────

/**
 * Türk şehir isimleri → ilk harf eşlemesi.
 * "konya seç" → K hattını seç anlamına gelir.
 * Her harf için en bilinen şehir öncelikli.
 */
const SEHIR_HARF_HARITASI = {
    'adana': 'A', 'ankara': 'A', 'antalya': 'A', 'afyon': 'A', 'ağrı': 'A', 'aksaray': 'A', 'amasya': 'A', 'ardahan': 'A', 'artvin': 'A', 'aydın': 'A',
    'bursa': 'B', 'bolu': 'B', 'burdur': 'B', 'bilecik': 'B', 'bingöl': 'B', 'bitlis': 'B', 'batman': 'B', 'bayburt': 'B', 'bartın': 'B',
    'çorum': 'Ç', 'çanakkale': 'Ç', 'çankırı': 'Ç',
    'denizli': 'D', 'düzce': 'D', 'diyarbakır': 'D',
    'erzurum': 'E', 'eskişehir': 'E', 'edirne': 'E', 'elazığ': 'E', 'erzincan': 'E',
    'ceyhan': 'C',
    'fethiye': 'F', 'fatsa': 'F', 'fransa': 'F',
    'giresun': 'G', 'gaziantep': 'G', 'gümüşhane': 'G',
    'hatay': 'H', 'hakkari': 'H',
    'istanbul': 'İ', 'izmir': 'İ', 'isparta': 'İ', 'iğdır': 'İ',
    'jandarma': 'J',
    'kahramanmaraş': 'K', 'konya': 'K', 'kayseri': 'K', 'kocaeli': 'K', 'kütahya': 'K', 'kırklareli': 'K', 'kırıkkale': 'K', 'kırşehir': 'K', 'kilis': 'K', 'kastamonu': 'K', 'karaman': 'K', 'karabük': 'K',
    'lüleburgaz': 'L',
    'pozantı': 'P', 'paris': 'P',
    'muğla': 'M', 'malatya': 'M', 'manisa': 'M', 'mersin': 'M', 'mardin': 'M', 'muş': 'M',
    'niğde': 'N', 'nevşehir': 'N',
    'ordu': 'O', 'osmaniye': 'O',
    'rize': 'R',
    'sivas': 'S', 'samsun': 'S', 'sinop': 'S', 'sakarya': 'S', 'siirt': 'S', 'şanlıurfa': 'Ş', 'şırnak': 'Ş',
    'trabzon': 'T', 'tokat': 'T', 'tekirdağ': 'T', 'tunceli': 'T',
    'uşak': 'U', 'urfa': 'U',
    'ünye': 'Ü', 'üsküp': 'Ü', 'ürdün': 'Ü',
    'van': 'V',
    'vaşington': 'W',
    'zenon': 'X',
    'yozgat': 'Y', 'yalova': 'Y',
    'zonguldak': 'Z',
    'kuveyt': 'Q', 'katar': 'Q',
};

// ───── ZOOM KOMUT KALIPLARI ─────

const YAKINLAS_KALIPLARI = [
    'yakınlaş', 'yakinlas', 'yaklaş', 'yaklas', 'zoom in', 'zoomin',
    'yakına gel', 'yakına bak', 'büyüt', 'büyült'
];

const UZAKLAS_KALIPLARI = [
    'uzaklaş', 'uzaklas', 'zoom out', 'zoomout',
    'uzağa git', 'uzağa bak', 'küçült', 'küçüt'
];

// ───── SEÇİMİ MERKEZLE KALIPLARI ─────

const SECIMI_MERKEZLE_KALIPLARI = [
    'seçimi merkezle', 'seçimi ekrana sığdır', 'seçimi ekrana sigdir',
    'seçilen nesneyi ekrana sığdır', 'seçilen nesneyi ekrana sigdir',
    'seçileni merkezle', 'seçileni göster',
    'nesneyi merkezle', 'nesneyi ekrana sığdır',
    'seçime odaklan', 'seçime yakınlaş', 'seçime zoom',
    'seçimi göster', 'seçimi bul',
    'center selection', 'fit selection', 'zoom to selection'
];

// ───── HAT BÖLME KALIPLARI ─────

const HAT_BOL_KALIPLARI = [
    'hattı böl', 'hatti böl', 'hattı bol', 'hatti bol',
    'boruyu böl', 'boruyu bol',
    'hattı 2 parça yap', 'hattı iki parça yap', 'hattı ikiye böl',
    'hattı 2 parçaya böl', 'hattı iki parçaya böl',
    'boruyu 2 parça yap', 'boruyu ikiye böl'
];

// ───── MOD DEĞİŞTİRME HARİTASI ─────

/**
 * Mod değiştirme komutları için anahtar kelime → mod eşlemesi.
 * Her girdi: keywords (tetikleyici kelimeler), mode (hedef mod), drawingMode (proje modu, opsiyonel)
 */
const MOD_HARITASI = [
    // Proje modları
    { keywords: ['mimari mod', 'mimari moda', 'mimari modu'], drawingMode: 'MİMARİ' },
    { keywords: ['tesisat mod', 'tesisat moda', 'tesisat modu'], drawingMode: 'TESİSAT' },
    { keywords: ['karma mod', 'karma moda', 'karma modu', 'karışık mod'], drawingMode: 'KARMA' },

    // Mimari araç modları
    { keywords: ['duvar çiz', 'duvar modu', 'duvar moduna', 'duvar moduna geç'], mode: 'drawWall' },
    { keywords: ['oda çiz', 'oda modu', 'mahal çiz', 'oda moduna geç'], mode: 'drawRoom' },
    { keywords: ['kapı çiz', 'kapı modu', 'kapı koy', 'kapı moduna geç'], mode: 'drawDoor' },
    { keywords: ['pencere çiz', 'pencere modu', 'pencere koy', 'pencere moduna geç'], mode: 'drawWindow' },
    { keywords: ['kolon çiz', 'kolon modu', 'kolon koy', 'kolon moduna geç'], mode: 'drawColumn' },
    { keywords: ['kiriş çiz', 'kiriş modu', 'kiriş koy', 'kiriş moduna geç'], mode: 'drawBeam' },
    { keywords: ['merdiven çiz', 'merdiven modu', 'merdiven koy', 'merdiven moduna geç'], mode: 'drawStairs' },
    { keywords: ['simetri modu', 'simetri moduna geç', 'simetri'], mode: 'drawSymmetry' },

    // Seçim modu
    { keywords: ['seçim modu', 'seçim moduna', 'seç modu', 'seçme modu', 'seçme moduna geç'], mode: 'select' },
];

// ───── YAPAY ZEKA BENZERİ NİYET TANIMA (FUZZY INTENT) ─────

/**
 * Levenshtein mesafesi - iki metin arasındaki düzenleme mesafesini hesaplar.
 * Yazım hatalarını ve ses tanıma farklılıklarını tolere etmek için kullanılır.
 */
function levenshteinDistance(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/**
 * Metin benzerlik skoru (0-1 arası, 1 = tam eşleşme)
 */
function similarity(a, b) {
    if (!a || !b) return 0;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Niyet (intent) tanımlama sistemi.
 * Tanınmayan komutları yapay zeka benzeri benzerlik analizi ile eşleştirir.
 * Eşik: %60 benzerlik (threshold = 0.6)
 */
const INTENT_KALIPLARI = [
    // Zoom
    { patterns: ['yakınlaş', 'yaklaş', 'zoom in', 'büyüt', 'yakına gel'], result: { type: 'zoom', action: 'in' } },
    { patterns: ['uzaklaş', 'zoom out', 'küçült', 'uzağa git'], result: { type: 'zoom', action: 'out' } },

    // Görünüm
    { patterns: ['ekrana sığdır', 'fit to screen', 'hepsini göster'], result: { type: 'view', action: 'fit_to_screen' } },
    { patterns: ['seçimi merkezle', 'seçimi göster', 'seçime odaklan'], result: { type: 'view', action: 'fit_selection' } },
    { patterns: ['3 boyutlu', '3d göster', 'üç boyut'], result: { type: 'view', action: '3d' } },
    { patterns: ['2 boyutlu', '2d göster', 'iki boyut'], result: { type: 'view', action: '2d' } },
    { patterns: ['ölçüleri göster', 'ölçü aç', 'dimension göster'], result: { type: 'view', action: 'show_dimensions' } },
    { patterns: ['ölçüleri gizle', 'ölçü kapat', 'dimension gizle'], result: { type: 'view', action: 'hide_dimensions' } },

    // Mod değiştirme
    { patterns: ['mimari moda geç', 'mimari mod', 'mimari çizim'], result: { type: 'mode', drawingMode: 'MİMARİ' } },
    { patterns: ['tesisat moda geç', 'tesisat mod', 'tesisat çizim'], result: { type: 'mode', drawingMode: 'TESİSAT' } },
    { patterns: ['karma moda geç', 'karma mod', 'karışık mod'], result: { type: 'mode', drawingMode: 'KARMA' } },
    { patterns: ['duvar çiz', 'duvar modu', 'duvar moduna geç'], result: { type: 'mode', mode: 'drawWall' } },
    { patterns: ['oda çiz', 'oda modu', 'mahal çiz'], result: { type: 'mode', mode: 'drawRoom' } },
    { patterns: ['kapı çiz', 'kapı koy', 'kapı modu'], result: { type: 'mode', mode: 'drawDoor' } },
    { patterns: ['pencere çiz', 'pencere koy', 'pencere modu'], result: { type: 'mode', mode: 'drawWindow' } },
    { patterns: ['kolon koy', 'kolon çiz', 'kolon modu'], result: { type: 'mode', mode: 'drawColumn' } },
    { patterns: ['kiriş koy', 'kiriş çiz', 'kiriş modu'], result: { type: 'mode', mode: 'drawBeam' } },
    { patterns: ['merdiven çiz', 'merdiven koy', 'merdiven modu'], result: { type: 'mode', mode: 'drawStairs' } },
    { patterns: ['seçim modu', 'seçme modu', 'seçime geç'], result: { type: 'mode', mode: 'select' } },

    // Boru / Hat
    { patterns: ['hattı böl', 'boruyu böl', 'ikiye böl'], result: { type: 'split', position: 'middle' } },
    { patterns: ['geri al', 'iptal et', 'son adımı geri al'], result: { type: 'undo' } },
    { patterns: ['bitir', 'tamamla', 'kapat', 'bitti'], result: { type: 'finish' } },

    // Yerleştirme
    { patterns: ['servis kutusu koy', 'servis kutusu yerleştir'], result: { type: 'place', object: 'servis_kutusu' } },
    { patterns: ['iç tesisat başlat', 'iç tesisat'], result: { type: 'place', object: 'ic_tesisat' } },

    // Bileşen ekleme
    { patterns: ['vana ekle', 'vana koy'], result: { type: 'add', object: 'vana', position: 'end' } },
    { patterns: ['sayaç ekle', 'sayaç koy'], result: { type: 'add', object: 'sayac' } },
    { patterns: ['kombi ekle', 'kombi koy'], result: { type: 'add', object: 'kombi' } },
    { patterns: ['ocak ekle', 'ocak koy'], result: { type: 'add', object: 'ocak' } },

    // Önceki / Sonraki hat seçimi
    { patterns: ['önceki hattı seç', 'önceki hat', 'öncekini seç'], result: { type: 'select_adjacent', direction: 'prev' } },
    { patterns: ['sonraki hattı seç', 'sonraki hat', 'sonrakini seç'], result: { type: 'select_adjacent', direction: 'next' } },

    // Pan (kaydır)
    { patterns: ['sağa kaydır', 'sağa pan'], result: { type: 'pan', direction: 'right' } },
    { patterns: ['sola kaydır', 'sola pan'], result: { type: 'pan', direction: 'left' } },
    { patterns: ['yukarı kaydır', 'yukarı pan'], result: { type: 'pan', direction: 'up' } },
    { patterns: ['aşağı kaydır', 'aşağı pan'], result: { type: 'pan', direction: 'down' } },
];

/**
 * Fuzzy intent matching - Yapay zeka benzeri niyet tanıma.
 * Tanınmayan komutları en yakın bilinen kalıpla eşleştirir.
 * @param {string} text - Temizlenmiş komut metni
 * @returns {object|null} - Eşleşen komut nesnesi veya null
 */
function fuzzyIntentMatch(text) {
    if (!text || text.length < 2) return null;

    let bestMatch = null;
    let bestScore = 0;
    const THRESHOLD = 0.55; // Minimum benzerlik eşiği

    for (const intent of INTENT_KALIPLARI) {
        for (const pattern of intent.patterns) {
            // Tam metin benzerliği
            const textSim = similarity(text, pattern);

            // Alt-metin kontrolü (metin kalıbı içeriyor mu)
            const containsBonus = text.includes(pattern) || pattern.includes(text) ? 0.3 : 0;

            // Kelime bazlı benzerlik - her kelimeyi karşılaştır
            const textWords = text.split(/\s+/);
            const patternWords = pattern.split(/\s+/);
            let wordMatchScore = 0;
            let matchedWords = 0;
            for (const pw of patternWords) {
                let bestWordSim = 0;
                for (const tw of textWords) {
                    bestWordSim = Math.max(bestWordSim, similarity(tw, pw));
                }
                if (bestWordSim > 0.7) matchedWords++;
                wordMatchScore += bestWordSim;
            }
            const avgWordSim = patternWords.length > 0 ? wordMatchScore / patternWords.length : 0;

            // Toplam skor: metin benzerliği + kelime benzerliği + içerme bonusu
            const totalScore = (textSim * 0.4) + (avgWordSim * 0.4) + containsBonus * 0.2;

            if (totalScore > bestScore && totalScore >= THRESHOLD) {
                bestScore = totalScore;
                bestMatch = { ...intent.result, raw: text, _fuzzyScore: totalScore };
            }
        }
    }

    return bestMatch;
}

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
    const toggleResult = parseToggleCommand(clean, text);
    if (toggleResult) return toggleResult;

    // Ekrana sığdır
    if (EKRANA_SIGDIR_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'view', action: 'fit_to_screen', raw: text };
    }

    // ── 2b1. ÇOK ZOOM (3x yaklaş/uzaklaş) ──

    if (clean.includes('çok')) {
        if (YAKINLAS_KALIPLARI.some(k => clean.includes(k))) {
            return { type: 'zoom', action: 'in', multiplier: 3, raw: text };
        }
        if (UZAKLAS_KALIPLARI.some(k => clean.includes(k))) {
            return { type: 'zoom', action: 'out', multiplier: 3, raw: text };
        }
    }

    // ── 2b. ZOOM (Yakınlaş / Uzaklaş) ──

    if (YAKINLAS_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'zoom', action: 'in', raw: text };
    }

    if (UZAKLAS_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'zoom', action: 'out', raw: text };
    }

    // ── 2c. SEÇİMİ MERKEZLE / SEÇİMİ EKRANA SIĞDIR ──

    if (SECIMI_MERKEZLE_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'view', action: 'fit_selection', raw: text };
    }

    // ── 2c2. PAN (KAYDIR) ──

    if (clean.includes('kaydır') || clean.includes('kaydir')) {
        if (clean.includes('sağa') || clean.includes('saga') || clean.includes('sağ')) {
            return { type: 'pan', direction: 'right', raw: text };
        }
        if (clean.includes('sola') || clean.includes('sol')) {
            return { type: 'pan', direction: 'left', raw: text };
        }
        if (clean.includes('yukarı') || clean.includes('yukari')) {
            return { type: 'pan', direction: 'up', raw: text };
        }
        if (clean.includes('aşağı') || clean.includes('asagi')) {
            return { type: 'pan', direction: 'down', raw: text };
        }
    }

    // ── 2d. MOD DEĞİŞTİRME ──

    const modeCmd = parseModeCommand(clean, text);
    if (modeCmd) return modeCmd;

    // ── 2e. HAT BÖLME ──

    const splitCmd = parseSplitCommand(clean, text);
    if (splitCmd) return splitCmd;

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

    // ── 3a2. ÖNCEKİ / SONRAKİ HAT SEÇİMİ ──

    if (clean.includes('önceki') && (clean.includes('hat') || clean.includes('boru') || clean.includes('seç'))) {
        return { type: 'select_adjacent', direction: 'prev', raw: text };
    }
    if (clean.includes('sonraki') && (clean.includes('hat') || clean.includes('boru') || clean.includes('seç'))) {
        return { type: 'select_adjacent', direction: 'next', raw: text };
    }

    // ── 3b. HAT SEÇİMİ (etikete göre) ──

    // "A hattını seç", "A nolu hattı seç", "B hattı seç", "hattı A seç"
    const selectMatch = clean.match(/([a-zçğıöşü])\s*(?:nolu?\s+)?hatt?[ıi]n?[ıi]?\s*seç/i)
        || clean.match(/hatt?[ıi]\s*([a-zçğıöşü])\s*seç/i)
        || clean.match(/^([a-zçğıöşü])\s+seç$/i);
    if (selectMatch) {
        const label = selectMatch[1].toUpperCase();
        return { type: 'select', label, raw: text };
    }

    // ── 3c. ŞEHİR İSMİ İLE HAT SEÇİMİ ──
    // "konya seç" → K hattını seç, "istanbul seç" → İ hattını seç
    const cityCmd = parseCitySelectCommand(clean, text);
    if (cityCmd) return cityCmd;

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

    // ── 8. YAPAY ZEKA BENZERİ NİYET TANIMA (FALLBACK) ──
    // Hiçbir kalıba uymayan komutlar için fuzzy matching ile niyet tahmini yap
    const fuzzyResult = fuzzyIntentMatch(clean);
    if (fuzzyResult) return fuzzyResult;

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

// ───── MOD DEĞİŞTİRME KOMUTU AYRIŞTIRMA ─────

/**
 * Mod değiştirme komutlarını ayrıştırır.
 * "mimari moda geç", "duvar çiz", "seçim modu" gibi komutlar.
 * Serbest formda da çalışır: "mimari moda geçelim", "tesisat moduna dön" vb.
 */
function parseModeCommand(clean, raw) {
    // Önce kesin kalıpları kontrol et
    for (const entry of MOD_HARITASI) {
        for (const kw of entry.keywords) {
            if (clean.includes(kw)) {
                const result = { type: 'mode', raw };
                if (entry.mode) result.mode = entry.mode;
                if (entry.drawingMode) result.drawingMode = entry.drawingMode;
                return result;
            }
        }
    }

    // Esnek kalıp: "[isim] + [mod/moda/moduna] + [geç/dön/aç/git]"
    const flexMatch = clean.match(/(mimari|tesisat|karma|karışık|duvar|oda|mahal|kapı|pencere|kolon|kiriş|merdiven|simetri|seçim|seçme)\s*(?:mod|moda|modu|moduna|moduna)\s*(?:geç|dön|aç|git)?/);
    if (flexMatch) {
        const name = flexMatch[1];
        const modeMap = {
            'mimari': { drawingMode: 'MİMARİ' },
            'tesisat': { drawingMode: 'TESİSAT' },
            'karma': { drawingMode: 'KARMA' },
            'karışık': { drawingMode: 'KARMA' },
            'duvar': { mode: 'drawWall' },
            'oda': { mode: 'drawRoom' },
            'mahal': { mode: 'drawRoom' },
            'kapı': { mode: 'drawDoor' },
            'pencere': { mode: 'drawWindow' },
            'kolon': { mode: 'drawColumn' },
            'kiriş': { mode: 'drawBeam' },
            'merdiven': { mode: 'drawStairs' },
            'simetri': { mode: 'drawSymmetry' },
            'seçim': { mode: 'select' },
            'seçme': { mode: 'select' },
        };
        const mapped = modeMap[name];
        if (mapped) {
            return { type: 'mode', ...mapped, raw };
        }
    }

    return null;
}

// ───── HAT BÖLME KOMUTU AYRIŞTIRMA ─────

/**
 * Hat/boru bölme komutlarını ayrıştırır.
 * "hattı böl" → ortadan böl
 * "hattı 50 cm den böl" → 50 cm noktasından böl
 * "hattı 3 parçaya böl" → 3 eşit parçaya böl
 */
function parseSplitCommand(clean, raw) {
    // Basit bölme: "hattı böl", "boruyu böl"
    if (HAT_BOL_KALIPLARI.some(k => clean.includes(k))) {
        return { type: 'split', position: 'middle', raw };
    }

    // Belirli mesafeden bölme: "hattı 50 cm den böl", "hattı 50 den böl"
    const distSplitMatch = clean.match(/(?:hatt?[ıi]|boruyu)\s+(\d+(?:[.,]\d+)?)\s*(?:cm|santim)?\s*(?:den|dan|noktasından|noktasında)\s*böl/);
    if (distSplitMatch) {
        const distance = parseFloat(distSplitMatch[1].replace(',', '.'));
        if (distance > 0) {
            return { type: 'split', position: 'distance', distance, raw };
        }
    }

    // N parçaya bölme: "hattı 3 parçaya böl", "hattı 3 parça yap"
    const partsSplitMatch = clean.match(/(?:hatt?[ıi]|boruyu)\s+(\d+)\s*parça(?:ya)?\s*(?:böl|yap|ayır)/);
    if (partsSplitMatch) {
        const parts = parseInt(partsSplitMatch[1], 10);
        if (parts >= 2 && parts <= 20) {
            return { type: 'split', position: 'parts', parts, raw };
        }
    }

    return null;
}

// ───── ŞEHİR İSMİ İLE HAT SEÇİMİ AYRIŞTIRMA ─────

/**
 * Şehir ismi ile hat seçimi: "konya seç" → K hattını seç
 * Şehir isminin ilk harfi hat etiketine dönüştürülür.
 */
function parseCitySelectCommand(clean, raw) {
    // "[şehir] seç" veya "[şehir] hattını seç" kalıbı
    const words = clean.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const label = SEHIR_HARF_HARITASI[word];
        if (label) {
            // Kelimeden sonra "seç" veya "hattını seç" gibi bir fiil var mı?
            const rest = words.slice(i + 1).join(' ');
            if (rest.includes('seç') || rest.includes('sec') ||
                rest.includes('hattı') || rest.includes('hat') ||
                words.length === 1) {
                return { type: 'select', label, raw, _cityName: word };
            }
        }
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
                'fit_to_screen': 'Ekrana Sığdır',
                'fit_selection': 'Seçimi Merkezle'
            };
            return actions[cmd.action] || cmd.action;
        }

        case 'zoom':
            if (cmd.multiplier && cmd.multiplier > 1) {
                return cmd.action === 'in' ? 'Çok Yakınlaş' : 'Çok Uzaklaş';
            }
            return cmd.action === 'in' ? 'Yakınlaş' : 'Uzaklaş';

        case 'split': {
            if (cmd.position === 'distance') return `Hattı ${cmd.distance} cm'den Böl`;
            if (cmd.position === 'parts') return `Hattı ${cmd.parts} Parçaya Böl`;
            return 'Hattı Böl';
        }

        case 'mode': {
            if (cmd.drawingMode) {
                const modes = { 'MİMARİ': 'Mimari Mod', 'TESİSAT': 'Tesisat Mod', 'KARMA': 'Karma Mod' };
                return modes[cmd.drawingMode] || cmd.drawingMode;
            }
            if (cmd.mode) {
                const toolModes = {
                    'drawWall': 'Duvar Çiz', 'drawRoom': 'Oda Çiz', 'drawDoor': 'Kapı Koy',
                    'drawWindow': 'Pencere Koy', 'drawColumn': 'Kolon Koy', 'drawBeam': 'Kiriş Koy',
                    'drawStairs': 'Merdiven Çiz', 'drawSymmetry': 'Simetri', 'select': 'Seçim Modu',
                    'plumbingV2': 'Tesisat Modu'
                };
                return toolModes[cmd.mode] || cmd.mode;
            }
            return 'Mod Değiştir';
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
            return cmd._cityName
                ? `${cmd._cityName.charAt(0).toUpperCase() + cmd._cityName.slice(1)} (${cmd.label}) Hattını Seç`
                : `${cmd.label} Hattını Seç`;
        case 'select_adjacent':
            return cmd.direction === 'next' ? 'Sonraki Hattı Seç' : 'Önceki Hattı Seç';
        case 'pan': {
            const panDirs = { right: 'Sağa', left: 'Sola', up: 'Yukarı', down: 'Aşağı' };
            return `${panDirs[cmd.direction] || ''} Kaydır`;
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
