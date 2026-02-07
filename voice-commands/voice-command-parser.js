/**
 * Voice Command Parser
 * Türkçe sesli komutları yapısal komut nesnelerine ayrıştırır.
 *
 * Desteklenen komutlar:
 *   "servis kutusu koy"           → { type: 'place', object: 'servis_kutusu' }
 *   "100 cm sağa"                 → { type: 'move', distance: 100, direction: 'saga' }
 *   "200 cm yukarı"               → { type: 'move', distance: 200, direction: 'yukari' }
 *   "250 cm ileri"                → { type: 'move', distance: 250, direction: 'ileri' }
 *   "4. adıma dön"               → { type: 'goto', step: 4 }
 *   "geri al"                     → { type: 'undo' }
 *   "bitir"                       → { type: 'finish' }
 */

// Yön haritası - Türkçe yön adlarını normalize edilmiş yön anahtarlarına eşler
const YON_HARITASI = {
    'sağa':   'saga',
    'saga':   'saga',
    'sola':   'sola',
    'yukarı': 'yukari',
    'yukari': 'yukari',
    'yukarı': 'yukari',
    'aşağı':  'asagi',
    'asagi':  'asagi',
    'aşağı':  'asagi',
    'ileri':  'ileri',
    'geri':   'geri',
};

// Yön → vektör eşlemesi (plan görünümünde)
// X: sağa/sola, Y: ileri/geri (ekranda yukarı/aşağı), Z: yukarı/aşağı (dikey)
export const YON_VEKTORLERI = {
    saga:   { dx:  1, dy:  0, dz: 0 },  // +X (sağa)
    sola:   { dx: -1, dy:  0, dz: 0 },  // -X (sola)
    ileri:  { dx:  0, dy: -1, dz: 0 },  // -Y (ileri = ekranda yukarı)
    geri:   { dx:  0, dy:  1, dz: 0 },  // +Y (geri = ekranda aşağı)
    yukari: { dx:  0, dy:  0, dz: 1 },  // +Z (yukarı = dikey yükselme)
    asagi:  { dx:  0, dy:  0, dz:-1 },  // -Z (aşağı = dikey düşüş)
};

/**
 * Türkçe sesli komut metnini yapısal komut nesnesine ayrıştırır.
 * @param {string} text - Ham sesli komut metni
 * @returns {object|null} Ayrıştırılmış komut nesnesi veya null (tanınmayan komut)
 */
export function parseVoiceCommand(text) {
    if (!text || typeof text !== 'string') return null;

    // Metni küçük harfe çevir ve temizle
    const clean = text.toLowerCase().trim()
        .replace(/\s+/g, ' ')     // Çoklu boşlukları tek boşluğa indir
        .replace(/,/g, '');       // Virgülleri kaldır

    // 1. Servis kutusu koy
    if (clean.includes('servis kutusu') && (clean.includes('koy') || clean.includes('yerleştir') || clean.includes('ekle'))) {
        return { type: 'place', object: 'servis_kutusu', raw: text };
    }

    // 2. Bitir komutu
    if (clean === 'bitir' || clean === 'bitti' || clean === 'tamam' || clean === 'durdur') {
        return { type: 'finish', raw: text };
    }

    // 3. Geri al
    if (clean === 'geri al' || clean === 'iptal' || clean === 'son adımı geri al') {
        return { type: 'undo', raw: text };
    }

    // 4. Adıma dön - "4. adıma dön", "adım 4'e dön", "4 adıma dön"
    const gotoMatch = clean.match(/(\d+)\s*\.?\s*adıma?\s*dön/i)
        || clean.match(/adım\s*(\d+)\s*'?\s*[ea]\s*dön/i);
    if (gotoMatch) {
        const step = parseInt(gotoMatch[1], 10);
        if (!isNaN(step) && step > 0) {
            return { type: 'goto', step, raw: text };
        }
    }

    // 5. Mesafe + yön komutu: "100 cm sağa", "200 sağa", "150 santim ileri"
    // Regex: sayı + opsiyonel birim + yön
    const moveMatch = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:cm|santim|santimetre|metre)?\s+(\S+)/);
    if (moveMatch) {
        let distance = parseFloat(moveMatch[1].replace(',', '.'));
        const yonText = moveMatch[2];

        // Birim kontrolü - "metre" ise cm'ye çevir
        if (clean.includes('metre') && !clean.includes('santimetre') && !clean.includes('santim') && !clean.includes('cm')) {
            distance *= 100;
        }

        // Yönü bul
        const direction = YON_HARITASI[yonText];
        if (direction && distance > 0) {
            return { type: 'move', distance, direction, raw: text };
        }
    }

    // 6. Yön + mesafe komutu: "sağa 100 cm", "ileri 200"
    const moveMatch2 = clean.match(/(\S+)\s+(\d+(?:[.,]\d+)?)\s*(?:cm|santim|santimetre|metre)?/);
    if (moveMatch2) {
        const yonText = moveMatch2[1];
        let distance = parseFloat(moveMatch2[2].replace(',', '.'));

        if (clean.includes('metre') && !clean.includes('santimetre') && !clean.includes('santim') && !clean.includes('cm')) {
            distance *= 100;
        }

        const direction = YON_HARITASI[yonText];
        if (direction && distance > 0) {
            return { type: 'move', distance, direction, raw: text };
        }
    }

    return null;
}

/**
 * Komut nesnesini okunabilir Türkçe metne çevirir.
 * @param {object} cmd - Komut nesnesi
 * @returns {string} Okunabilir metin
 */
export function commandToText(cmd) {
    if (!cmd) return '';

    switch (cmd.type) {
        case 'place':
            return 'Servis Kutusu Koy';
        case 'move': {
            const yonIsimleri = {
                saga: 'sağa', sola: 'sola',
                ileri: 'ileri', geri: 'geri',
                yukari: 'yukarı', asagi: 'aşağı'
            };
            const yonAd = yonIsimleri[cmd.direction] || cmd.direction;
            return `${cmd.distance} cm ${yonAd}`;
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
 * @param {string} direction - Yön anahtarı (saga, sola, ileri, geri, yukari, asagi)
 * @param {number} distance - Mesafe (cm)
 * @returns {object} { dx, dy, dz } vektör
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
