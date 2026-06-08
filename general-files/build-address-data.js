// general-files/build-address-data.js
// Bir kerelik build:  node general-files/build-address-data.js
// Girdi : adres/{*ilceler,*mahalleler,*sokaklar}.{txt,jsonl}  (her satır bir JSON)
// Çıktı : onboarding/address-data/index.json
//         onboarding/address-data/streets/{ilceKod}.json

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'adres');
const OUT = path.join(ROOT, 'onboarding', 'address-data');
const OUT_STREETS = path.join(OUT, 'streets');

// il_id (plaka kodu) → il adı. NDJSON dosyalarındaki "il_id" alanı plaka koduna
// eşittir; yeni il eklenirse aşağıda yoksa "İL-<id>" olarak kaydedilir.
const IL_NAMES = {
    1:'ADANA', 2:'ADIYAMAN', 3:'AFYONKARAHİSAR', 4:'AĞRI', 5:'AMASYA', 6:'ANKARA',
    7:'ANTALYA', 8:'ARTVİN', 9:'AYDIN', 10:'BALIKESİR', 11:'BİLECİK', 12:'BİNGÖL',
    13:'BİTLİS', 14:'BOLU', 15:'BURDUR', 16:'BURSA', 17:'ÇANAKKALE', 18:'ÇANKIRI',
    19:'ÇORUM', 20:'DENİZLİ', 21:'DİYARBAKIR', 22:'EDİRNE', 23:'ELAZIĞ', 24:'ERZİNCAN',
    25:'ERZURUM', 26:'ESKİŞEHİR', 27:'GAZİANTEP', 28:'GİRESUN', 29:'GÜMÜŞHANE',
    30:'HAKKARİ', 31:'HATAY', 32:'ISPARTA', 33:'MERSİN', 34:'İSTANBUL', 35:'İZMİR',
    36:'KARS', 37:'KASTAMONU', 38:'KAYSERİ', 39:'KIRKLARELİ', 40:'KIRŞEHİR',
    41:'KOCAELİ', 42:'KONYA', 43:'KÜTAHYA', 44:'MALATYA', 45:'MANİSA',
    46:'KAHRAMANMARAŞ', 47:'MARDİN', 48:'MUĞLA', 49:'MUŞ', 50:'NEVŞEHİR', 51:'NİĞDE',
    52:'ORDU', 53:'RİZE', 54:'SAKARYA', 55:'SAMSUN', 56:'SİİRT', 57:'SİNOP',
    58:'SİVAS', 59:'TEKİRDAĞ', 60:'TOKAT', 61:'TRABZON', 62:'TUNCELİ', 63:'ŞANLIURFA',
    64:'UŞAK', 65:'VAN', 66:'YOZGAT', 67:'ZONGULDAK', 68:'AKSARAY', 69:'BAYBURT',
    70:'KARAMAN', 71:'KIRIKKALE', 72:'BATMAN', 73:'ŞIRNAK', 74:'BARTIN', 75:'ARDAHAN',
    76:'IĞDIR', 77:'YALOVA', 78:'KARABÜK', 79:'KİLİS', 80:'OSMANİYE', 81:'DÜZCE',
};

function readNdjson(file) {
    const text = fs.readFileSync(file, 'utf8');
    const out = [];
    let bad = 0;
    for (const line of text.split(/\r?\n/)) {
        const s = line.trim();
        if (!s) continue;
        try { out.push(JSON.parse(s)); }
        catch { bad++; }
    }
    if (bad) console.warn('  !', path.basename(file), 'bozuk satır atlandı:', bad);
    return out;
}

// general-files/ altında pattern'e uyan tüm .txt / .jsonl dosyalarını oku.
// Birden fazla il için ayrı dosya konabilir: ilceler.txt + 06ilceler.jsonl + …
function readNdjsonGroup(suffix) {
    const re = new RegExp('(?:^|[^a-zA-Z])' + suffix + '\\.(?:txt|jsonl)$', 'i');
    const files = fs.readdirSync(SRC).filter(f => re.test(f)).sort();
    if (files.length === 0) {
        throw new Error('Eşleşen dosya yok: *' + suffix + '.{txt,jsonl}');
    }
    const all = [];
    for (const f of files) {
        const rows = readNdjson(path.join(SRC, f));
        console.log('  ·', f, '→', rows.length);
        all.push(...rows);
    }
    return all;
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

const trCmp = (a, b) => a.localeCompare(b, 'tr');

function main() {
    console.log('İlçeler okunuyor…');
    const ilceler = readNdjsonGroup('ilceler');
    console.log('  →', ilceler.length, 'ilçe (toplam)');

    console.log('Mahalleler okunuyor…');
    const mahalleler = readNdjsonGroup('mahalleler');
    console.log('  →', mahalleler.length, 'mahalle (toplam)');

    console.log('Sokaklar okunuyor (büyük dosyalar)…');
    const sokaklar = readNdjsonGroup('sokaklar');
    console.log('  →', sokaklar.length, 'sokak/cadde (toplam)');

    // mahalle.kimlikNo → ilce.kimlikNo eşlemesi
    const mahalleToIlce = new Map();
    const mahalleByIlce = new Map(); // ilce.kimlikNo → mahalle[]
    for (const m of mahalleler) {
        mahalleToIlce.set(m.kimlikNo, m.ilce_id);
        if (!mahalleByIlce.has(m.ilce_id)) mahalleByIlce.set(m.ilce_id, []);
        mahalleByIlce.get(m.ilce_id).push(m);
    }

    // sokakları ilçeye göre grupla, içinde mahalleye göre grupla
    const streetsByIlce = new Map(); // ilceKimlikNo → Map<mahalleKimlikNo, street[]>
    let orphan = 0;
    for (const s of sokaklar) {
        const ilceId = mahalleToIlce.get(s.mahalle_id);
        if (ilceId == null) { orphan++; continue; }
        if (!streetsByIlce.has(ilceId)) streetsByIlce.set(ilceId, new Map());
        const inner = streetsByIlce.get(ilceId);
        if (!inner.has(s.mahalle_id)) inner.set(s.mahalle_id, []);
        inner.get(s.mahalle_id).push({
            kod: String(s.kimlikNo),
            ad: s.bilesenAdi, // "AYIŞIĞI (Sokak)" gibi tür ekli ad
        });
    }
    if (orphan) console.warn('  ! mahalleye bağlanamayan sokak:', orphan);

    // ilçeleri il_id'ye göre grupla
    const ilceByIl = new Map(); // il_id → ilce[]
    for (const ilce of ilceler) {
        if (!ilceByIl.has(ilce.il_id)) ilceByIl.set(ilce.il_id, []);
        ilceByIl.get(ilce.il_id).push(ilce);
    }

    // index.json: il → ilçe → mahalle (sokaksız)
    const illerOut = [];
    for (const [ilId, ilIlceler] of ilceByIl) {
        const ilcelerOut = [];
        for (const ilce of ilIlceler) {
            const ms = (mahalleByIlce.get(ilce.kimlikNo) || []).map(m => ({
                kod: String(m.kimlikNo),
                ad: m.bilesenAdi,
            }));
            ms.sort((a, b) => trCmp(a.ad, b.ad));
            ilcelerOut.push({
                kod: String(ilce.kimlikNo),
                ad: ilce.adi,
                mahalleler: ms,
            });
        }
        ilcelerOut.sort((a, b) => trCmp(a.ad, b.ad));
        illerOut.push({
            kod: String(ilId),
            ad: IL_NAMES[ilId] || ('İL-' + ilId),
            ilceler: ilcelerOut,
        });
    }
    illerOut.sort((a, b) => trCmp(a.ad, b.ad));

    const index = { iller: illerOut };
    console.log('  →', illerOut.length, 'il (' + illerOut.map(x => x.ad).join(', ') + ')');

    ensureDir(OUT);
    ensureDir(OUT_STREETS);

    fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
    console.log('Yazıldı: onboarding/address-data/index.json',
        '(' + (fs.statSync(path.join(OUT, 'index.json')).size / 1024).toFixed(1) + ' KB)');

    let total = 0;
    for (const [ilceId, innerMap] of streetsByIlce) {
        const obj = {};
        for (const [mahId, streets] of innerMap) {
            streets.sort((a, b) => trCmp(a.ad, b.ad));
            obj[String(mahId)] = streets;
        }
        const file = path.join(OUT_STREETS, String(ilceId) + '.json');
        fs.writeFileSync(file, JSON.stringify(obj));
        total += fs.statSync(file).size;
    }
    console.log('Yazıldı:', streetsByIlce.size, 'sokak dosyası',
        '(toplam ' + (total / 1024).toFixed(0) + ' KB)');

    console.log('Tamam.');
}

main();
