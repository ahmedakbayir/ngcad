// onboarding/sorumlu-data.js
// User (mühendis) / ProjeFirma / GDF için in-memory katalog.
// Bu liste TÜM PROJELER İÇİN ortaktır — projeMeta sadece seçili User/Firma id'sini
// tutar; lookup buradan yapılır.
//
// Veri Şeması (JSDoc):
//
// /** @typedef {Object} GdfFirma
//  *  @property {string} id
//  *  @property {string} adi
//  *  @property {string|null} parentId   // null = ana GDF; non-null = alt birim
//  */
//
// /** @typedef {Object} ProjeFirma
//  *  @property {string} id
//  *  @property {string} firmaAdi
//  *  @property {string} firmaTel
//  *  @property {string} firmaEMail
//  *  @property {string[]} projeFirmaGdfList   // GdfFirma.id[]
//  *  @property {string} vergiDairesi
//  *  @property {string} vergiNo
//  *  @property {string} adres
//  *  @property {string} yeterlilikNo
//  *  @property {string} yetkiliUserId         // User.id (firma kullanıcılarından)
//  */
//
// /** @typedef {Object} User
//  *  @property {string} id
//  *  @property {string} adi
//  *  @property {string} email
//  *  @property {string} gsm
//  *  @property {string} profilFotografi      // dataURL ya da göreli yol
//  *  // Firma tarafı
//  *  @property {boolean} firmaKullanicisi
//  *  @property {{ yonetici:boolean, projeMuhendisi:boolean,
//  *               projeCizimSorumlusu:boolean, tesisatUstasi:boolean }} firmaRoller
//  *  @property {'ust'|'orta'} firmaYoneticiKademe
//  *  @property {{ montaj:boolean, celikKaynak:boolean, peKaynak:boolean }} ustaRoller
//  *  // GDF tarafı
//  *  @property {boolean} gdfKullanicisi
//  *  @property {{ yonetici:boolean, onayMuhendisi:boolean,
//  *               gazAcmaMuhendisi:boolean, onBuroYetkilisi:boolean }} gdfRoller
//  *  @property {'ust'|'orta'} gdfYoneticiKademe
//  *  // Yetkili olduğu firmalar — firma kullanıcısıysa ProjeFirma.id[],
//  *  // GDF kullanıcısıysa GdfFirma.id[].
//  *  @property {string[]} yetkiliFirmalar
//  *  @property {string}   bagliOlduguYoneticiUserId
//  *  @property {string}   projeMuhendisiOdaSicilNo
//  *  @property {string}   projeMuhendisiKayitNo
//  *  @property {'icTesisat'|'endustriyel'} projeMuhendisiYetkiDurumu
//  *  @property {string}   onayMuhendisiGdfSicilNo
//  *  @property {string}   gazAcmaMuhendisiEkipNo
//  */

// ── SAMPLE GDF (parent + child) ───────────────────────────────────
/** @type {GdfFirma[]} */
const GDF_LIST = [
    { id: 'gdf-igdas',     adi: 'İGDAŞ',                 parentId: null },
    { id: 'gdf-igdas-avr', adi: 'İGDAŞ — Avrupa Bölge',  parentId: 'gdf-igdas' },
    { id: 'gdf-igdas-and', adi: 'İGDAŞ — Anadolu Bölge', parentId: 'gdf-igdas' },
    { id: 'gdf-akmercan',  adi: 'AKMERCAN GEPA',         parentId: null },
    { id: 'gdf-coruh',     adi: 'ÇORUH GAZ',             parentId: null },
];

// ── SAMPLE PROJE FİRMALARI ────────────────────────────────────────
/** @type {ProjeFirma[]} */
const PROJE_FIRMA_LIST = [
    {
        id: 'pf-akre',
        firmaAdi: 'AKRE ISI MÜHENDİSLİK',
        firmaTel: '0212 555 11 22',
        firmaEMail: 'info@akre.com.tr',
        projeFirmaGdfList: ['gdf-igdas-avr'],
        vergiDairesi: 'Beyoğlu',
        vergiNo: '1234567890',
        adres: 'Halaskargazi Cd. No:120 K:4 Şişli/İstanbul',
        yeterlilikNo: 'YT-2024-0123',
        yetkiliUserId: 'user-ahmet',
    },
    {
        id: 'pf-alfa',
        firmaAdi: 'ALFA DOĞALGAZ MÜHENDİSLİK',
        firmaTel: '0216 444 22 33',
        firmaEMail: 'proje@alfagaz.com.tr',
        projeFirmaGdfList: ['gdf-igdas-and', 'gdf-akmercan'],
        vergiDairesi: 'Kadıköy',
        vergiNo: '2345678901',
        adres: 'Atatürk Mah. Meriç Cd. No:7/12 Ataşehir/İstanbul',
        yeterlilikNo: 'YT-2024-0567',
        yetkiliUserId: 'user-omer',
    },
    {
        id: 'pf-beta',
        firmaAdi: 'BETA TESİSAT',
        firmaTel: '0212 333 44 55',
        firmaEMail: 'info@betatesisat.com',
        projeFirmaGdfList: ['gdf-igdas'],
        vergiDairesi: 'Beşiktaş',
        vergiNo: '3456789012',
        adres: 'Esentepe Mah. Büyükdere Cd. No:201 Levent/İstanbul',
        yeterlilikNo: 'YT-2023-0891',
        yetkiliUserId: 'user-fatih',
    },
    {
        id: 'pf-gama',
        firmaAdi: 'GAMA MÜHENDİSLİK',
        firmaTel: '0312 222 11 33',
        firmaEMail: 'contact@gamamuh.com.tr',
        projeFirmaGdfList: ['gdf-coruh'],
        vergiDairesi: 'Çankaya',
        vergiNo: '4567890123',
        adres: 'Tunalı Hilmi Cd. No:88 Çankaya/Ankara',
        yeterlilikNo: 'YT-2024-0234',
        yetkiliUserId: '',
    },
];

// ── SAMPLE USERS ──────────────────────────────────────────────────
/** @type {User[]} */
const USER_LIST = [
    {
        id: 'user-ahmet',
        adi: 'AHMET AKBAYIR',
        email: 'ahmet@akre.com.tr',
        gsm: '0532 111 22 33',
        profilFotografi: '',
        firmaKullanicisi: true,
        firmaRoller: { yonetici: true, projeMuhendisi: true, projeCizimSorumlusu: false, tesisatUstasi: false },
        firmaYoneticiKademe: 'ust',
        ustaRoller: { montaj: false, celikKaynak: false, peKaynak: false },
        gdfKullanicisi: false,
        gdfRoller: { yonetici: false, onayMuhendisi: false, gazAcmaMuhendisi: false, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: ['pf-akre'],
        bagliOlduguYoneticiUserId: '',
        projeMuhendisiOdaSicilNo: '15234',
        projeMuhendisiKayitNo: 'PM-2018-A472',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: '',
        gazAcmaMuhendisiEkipNo: '',
    },
    {
        id: 'user-omer',
        adi: 'ÖMER ÇELİK',
        email: 'omer@akre.com.tr',
        gsm: '0533 444 55 66',
        profilFotografi: '',
        firmaKullanicisi: true,
        firmaRoller: { yonetici: false, projeMuhendisi: false, projeCizimSorumlusu: true, tesisatUstasi: false },
        firmaYoneticiKademe: 'orta',
        ustaRoller: { montaj: false, celikKaynak: false, peKaynak: false },
        gdfKullanicisi: false,
        gdfRoller: { yonetici: false, onayMuhendisi: false, gazAcmaMuhendisi: false, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: ['pf-akre', 'pf-beta'],
        bagliOlduguYoneticiUserId: 'user-ahmet',
        projeMuhendisiOdaSicilNo: '',
        projeMuhendisiKayitNo: '',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: '',
        gazAcmaMuhendisiEkipNo: '',
    },
    {
        id: 'user-fatih',
        adi: 'FATİH KAYA',
        email: 'fatih.kaya@beta.com.tr',
        gsm: '0535 777 88 99',
        profilFotografi: '',
        firmaKullanicisi: true,
        firmaRoller: { yonetici: false, projeMuhendisi: false, projeCizimSorumlusu: false, tesisatUstasi: true },
        firmaYoneticiKademe: 'orta',
        ustaRoller: { montaj: true, celikKaynak: true, peKaynak: false },
        gdfKullanicisi: false,
        gdfRoller: { yonetici: false, onayMuhendisi: false, gazAcmaMuhendisi: false, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: ['pf-beta'],
        bagliOlduguYoneticiUserId: 'user-ahmet',
        projeMuhendisiOdaSicilNo: '',
        projeMuhendisiKayitNo: '',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: '',
        gazAcmaMuhendisiEkipNo: '',
    },
    {
        id: 'user-mehmet',
        adi: 'MEHMET DEMİR',
        email: 'm.demir@igdas.com.tr',
        gsm: '0532 333 44 55',
        profilFotografi: '',
        firmaKullanicisi: false,
        firmaRoller: { yonetici: false, projeMuhendisi: false, projeCizimSorumlusu: false, tesisatUstasi: false },
        firmaYoneticiKademe: 'orta',
        ustaRoller: { montaj: false, celikKaynak: false, peKaynak: false },
        gdfKullanicisi: true,
        gdfRoller: { yonetici: false, onayMuhendisi: true, gazAcmaMuhendisi: false, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: ['gdf-igdas-avr'],
        bagliOlduguYoneticiUserId: '',
        projeMuhendisiOdaSicilNo: '',
        projeMuhendisiKayitNo: '',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: 'IGD-ONY-2451',
        gazAcmaMuhendisiEkipNo: '',
    },
    {
        id: 'user-ayse',
        adi: 'AYŞE YILDIZ',
        email: 'a.yildiz@igdas.com.tr',
        gsm: '0533 222 11 00',
        profilFotografi: '',
        firmaKullanicisi: false,
        firmaRoller: { yonetici: false, projeMuhendisi: false, projeCizimSorumlusu: false, tesisatUstasi: false },
        firmaYoneticiKademe: 'orta',
        ustaRoller: { montaj: false, celikKaynak: false, peKaynak: false },
        gdfKullanicisi: true,
        gdfRoller: { yonetici: false, onayMuhendisi: false, gazAcmaMuhendisi: true, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: ['gdf-igdas-and'],
        bagliOlduguYoneticiUserId: '',
        projeMuhendisiOdaSicilNo: '',
        projeMuhendisiKayitNo: '',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: '',
        gazAcmaMuhendisiEkipNo: 'EKP-AND-117',
    },
];

// ── PUBLIC API ────────────────────────────────────────────────────
export function listUsers()       { return USER_LIST; }
export function listProjeFirmas() { return PROJE_FIRMA_LIST; }
export function listGdfs()        { return GDF_LIST; }

export function getUserById(id) {
    if (!id) return null;
    return USER_LIST.find(u => u.id === id) || null;
}
export function getProjeFirmaById(id) {
    if (!id) return null;
    return PROJE_FIRMA_LIST.find(f => f.id === id) || null;
}
export function getGdfById(id) {
    if (!id) return null;
    return GDF_LIST.find(g => g.id === id) || null;
}

// Aday yöneticiler — verilen user'ın kademe seviyesine göre.
// "üst yönetici" → kimsesi yok; "orta kademe" → tüm üst yöneticiler.
export function getCandidateYoneticiler(userId, kanal /* 'firma' | 'gdf' */) {
    const u = getUserById(userId);
    if (!u) return [];
    const isFirma = kanal === 'firma';
    const isAdmin = isFirma ? u.firmaRoller?.yonetici : u.gdfRoller?.yonetici;
    const kademe = isFirma ? u.firmaYoneticiKademe : u.gdfYoneticiKademe;
    if (isAdmin && kademe === 'ust') return [];
    return USER_LIST.filter(o => {
        if (o.id === u.id) return false;
        const oIsAdmin = isFirma ? o.firmaRoller?.yonetici : o.gdfRoller?.yonetici;
        const oKademe  = isFirma ? o.firmaYoneticiKademe   : o.gdfYoneticiKademe;
        return oIsAdmin && oKademe === 'ust';
    });
}

// Yeni / boş varsayılanlar (formda kullanılır)
export function newUser(id) {
    return {
        id: id || ('user-' + Math.random().toString(36).slice(2, 9)),
        adi: '', email: '', gsm: '', profilFotografi: '',
        firmaKullanicisi: false,
        firmaRoller: { yonetici: false, projeMuhendisi: false, projeCizimSorumlusu: false, tesisatUstasi: false },
        firmaYoneticiKademe: 'orta',
        ustaRoller: { montaj: false, celikKaynak: false, peKaynak: false },
        gdfKullanicisi: false,
        gdfRoller: { yonetici: false, onayMuhendisi: false, gazAcmaMuhendisi: false, onBuroYetkilisi: false },
        gdfYoneticiKademe: 'orta',
        yetkiliFirmalar: [],
        bagliOlduguYoneticiUserId: '',
        projeMuhendisiOdaSicilNo: '',
        projeMuhendisiKayitNo: '',
        projeMuhendisiYetkiDurumu: 'icTesisat',
        onayMuhendisiGdfSicilNo: '',
        gazAcmaMuhendisiEkipNo: '',
    };
}
export function newProjeFirma(id) {
    return {
        id: id || ('pf-' + Math.random().toString(36).slice(2, 9)),
        firmaAdi: '', firmaTel: '', firmaEMail: '',
        projeFirmaGdfList: [],
        vergiDairesi: '', vergiNo: '', adres: '', yeterlilikNo: '',
        yetkiliUserId: '',
    };
}

// Listeye ekle (yerinde mutasyon — diğer modüller aynı referansı görür).
export function addUser(u)       { USER_LIST.push(u);        return u; }
export function addProjeFirma(f) { PROJE_FIRMA_LIST.push(f); return f; }
