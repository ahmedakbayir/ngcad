// One-off generator: reads bina-raw.csv (mojibake-encoded) + 1000-test-adresleri.md,
// fixes Turkish chars, synthesizes plausible abone records for each unit, and writes
// dataset.json — the consolidated sample data that dummy-service.js fetches at runtime.

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ROOT = path.resolve(DIR, '../../');

// ── 1. Mojibake fix ────────────────────────────────────────────────
// File was UTF-8 → read as Win1254/Latin1 → re-saved as UTF-8 (double-encoded).
function fixMojibake(s) {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
    return new TextDecoder('utf-8').decode(bytes);
}
function stripBom(s) {
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

// ── 2. Parse bina-raw.csv ──────────────────────────────────────────
const binaRaw = fs.readFileSync(path.join(DIR, 'bina-raw.csv'), 'utf8');
const binaFixed = stripBom(fixMojibake(binaRaw));
const binaLines = binaFixed.split(/\r?\n/).filter(l => l.trim());
// header: BinaTesisatNo;Daire;Dukkan;Isinma;katSayisi;Alan(m²);Kapasite(m³/h)
const binaRows = binaLines.slice(1).map(line => {
    const c = line.split(';');
    return {
        binaTesisatNo: c[0].trim(),
        daire:    parseInt(c[1], 10) || 0,
        dukkan:   parseInt(c[2], 10) || 0,
        isinma:   c[3].trim(), // BİREYSEL / MERKEZİ
        katSayisi: parseInt(c[4], 10) || 1,
        alan:     parseFloat(String(c[5]).replace(',', '.')) || 0,
        kapasite: parseFloat(String(c[6]).replace(',', '.')) || 0,
    };
});
console.log('bina rows:', binaRows.length, 'sample:', binaRows[0]);

// ── 3. Parse addresses from 1000-test-adresleri.md ─────────────────
const adresMd = fs.readFileSync(path.join(ROOT, 'samples/1000-test-adresleri.md'), 'utf8');
const adresRows = adresMd.split(/\r?\n/)
    .filter(l => l.startsWith('|') && !l.startsWith('| #') && !l.startsWith('|---'))
    .map(line => {
        const c = line.split('|').slice(1, -1).map(s => s.trim());
        // [#, İl, İlçe, Mahalle, Cadde/Sokak, Kapı No]
        return {
            no:      parseInt(c[0], 10),
            il:      c[1],
            ilce:    c[2],
            mahalle: c[3],
            sokak:   c[4],
            kapiNo:  c[5],
        };
    });
console.log('adres rows:', adresRows.length, 'sample:', adresRows[0]);

// ── 4. Synthesize abone records ────────────────────────────────────
const ADLAR = ['Ahmet','Mehmet','Mustafa','Ali','Hasan','Hüseyin','İbrahim','İsmail','Emre','Yusuf','Murat','Onur','Burak','Kerem','Tolga','Veli','Ömer','Can','Kaan','Serkan','Fatih','Selin','Esra','Ayşe','Fatma','Zeynep','Hatice','Merve','Elif','Buse','Melisa','Gizem','Sibel','Tuğba','Ceren','Derya','Aslı','Meryem','Seda','Nazlı','Ece'];
const SOYADLAR = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özer','Acar','Avcı','Korkmaz','Tekin','Türk','Polat','Bulut','Bozkurt','Erdoğan','Altun','Aksoy','Eren','Aktaş','Güneş','Karataş','Ermiş','Duman','Taş','Kaplan'];

let aboneSeq = 3001;
let dukkanSeq = 7347;
function rand(seed) {
    // Deterministic PRNG so output is stable across runs
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}
function pickName(seedBase) {
    const ad1 = ADLAR[Math.floor(rand(seedBase * 1.1) * ADLAR.length)];
    const soy = SOYADLAR[Math.floor(rand(seedBase * 2.3) * SOYADLAR.length)];
    return `${ad1} ${soy}`;
}
function pickPhone(seedBase) {
    let p = '5';
    for (let i = 0; i < 9; i++) p += Math.floor(rand(seedBase + i * 0.13) * 10);
    return p;
}
function pickTC(seedBase) {
    let t = '';
    for (let i = 0; i < 11; i++) {
        const d = Math.floor(rand(seedBase + i * 0.07) * 10);
        if (i === 0 && d === 0) t += '1'; else t += d;
    }
    return t;
}

const binalar = binaRows.map((b, idx) => {
    const adr = adresRows[idx] || { il: '', ilce: '', mahalle: '', sokak: '', kapiNo: '' };
    const sayaclar = [];
    for (let i = 1; i <= b.daire; i++) {
        const seed = parseInt(b.binaTesisatNo, 10) * 100 + i;
        sayaclar.push({
            aboneTuketimNo: String(aboneSeq++),
            aboneTipi: 'Daire',
            birimNo: String(i),
            birimEtiketi: 'D' + i,
            aboneAdi: pickName(seed),
            aboneTel: pickPhone(seed * 1.7),
            aboneTcNo: pickTC(seed * 2.3),
        });
    }
    for (let i = 1; i <= b.dukkan; i++) {
        const seed = parseInt(b.binaTesisatNo, 10) * 100 + 50 + i;
        sayaclar.push({
            aboneTuketimNo: String(dukkanSeq++),
            aboneTipi: 'Dukkan',
            birimNo: String(i),
            birimEtiketi: 'DÜK' + i,
            aboneAdi: pickName(seed),
            aboneTel: pickPhone(seed * 1.7),
            aboneTcNo: pickTC(seed * 2.3),
        });
    }
    // Normalize isınma tipi: BİREYSEL/MERKEZİ → bireysel/merkezi
    let isinmaTipi = 'bireysel';
    const iu = (b.isinma || '').toLocaleUpperCase('tr-TR');
    if (iu.includes('MERKEZ')) isinmaTipi = 'merkezi';
    else if (iu.includes('BOYLER')) isinmaTipi = 'boylerli';

    // Kutu basıncı: kapasitesi yüksek binalar 300 mbar (orta basınç),
    // diğerleri 21 mbar (düşük basınç). Eşik: 30 m³/h.
    const kutuBasinc = b.kapasite >= 30 ? '300' : '21';

    return {
        binaTesisatNo: b.binaTesisatNo,
        adres: {
            il: adr.il, ilce: adr.ilce, mahalle: adr.mahalle, sokak: adr.sokak, binaNo: adr.kapiNo,
        },
        bilgi: {
            daireSayisi: b.daire,
            dukkanSayisi: b.dukkan,
            katSayisi: b.katSayisi,
            alan: b.alan,
            kapasite: b.kapasite,
        },
        tesisat: {
            isinmaTipi,
            kutuBasinc,
        },
        sayaclar,
    };
});

const totalSayac = binalar.reduce((sum, b) => sum + b.sayaclar.length, 0);
console.log('Generated', binalar.length, 'binalar with', totalSayac, 'sayaç');

// Build flat abone index for fast aboneTuketimNo lookup
const aboneIdx = {};
for (const b of binalar) {
    for (const s of b.sayaclar) aboneIdx[s.aboneTuketimNo] = b.binaTesisatNo;
}

// ── 5. Write dataset.json ──────────────────────────────────────────
const out = { binalar, aboneIdx };
fs.writeFileSync(path.join(DIR, 'dataset.json'), JSON.stringify(out));
console.log('Wrote dataset.json (', (fs.statSync(path.join(DIR, 'dataset.json')).size / 1024).toFixed(1), 'KB)');
