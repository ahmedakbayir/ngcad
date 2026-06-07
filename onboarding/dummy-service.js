// onboarding/dummy-service.js
// "Servisten Al" modu için mock BinaServisi & AboneServisi.
// İleride gerçek bir HTTP endpoint'iyle değiştirilecek; bu yüzden API
// promise tabanlı ve setTimeout ile hafif gecikmeli — UI gerçek servise
// karşı nasıl davranacaksa şimdi de aynı şekilde davranıyor.
//
// Veri sözleşmesi
// ───────────────
// Her bina kaydında bir "binaTesisatNo", bina adres bilgileri,
// genel tesisat parametreleri ve sayaç listesi bulunur.
// Her sayaç kendi "aboneTuketimNo"suna sahiptir ve bağlı olduğu
// binanın "binaTesisatNo"sunu işaret eder.
//
//   bina   = { binaTesisatNo, adres, tesisat, sayaclar:[abone] }
//   abone  = { aboneTuketimNo, ... özlük bilgileri }
//
// AboneServisi tüketim no ile çağrıldığında ilgili sayacı + binanın
// binaTesisatNo'sunu döner; oradan BinaServisi'ne zincirleme bağlanır.

const NETWORK_DELAY_MS = 350;

// ── DUMMY VERİ ─────────────────────────────────────────────────────
// Kullanıcı tarafından doldurulacak. Aşağıdaki yorum satırı, beklenen
// alan yapısını gösteren tek bir örnektir — kopyalayıp listeye ekleyin.
export const DUMMY_BINALAR = [
    // {
    //     binaTesisatNo: '1234567',
    //     adres: {
    //         il: 'İSTANBUL', ilKod: '34',
    //         ilce: 'KÜÇÜKÇEKMECE', ilceKod: 'KCK',
    //         mahalle: 'CUMHURİYET MH.', mahalleKod: 'CMH',
    //         sokak: '1. CADDE', cadSokKod: 'C001',
    //         binaNo: '12',
    //         postaKodu: '34290',
    //         lat: 41.0001, lng: 28.7777,
    //     },
    //     tesisat: {
    //         kolonVar: true,
    //         kutuTipi: 'duvar',      // 'duvar' | 'yer'
    //         isinmaTipi: 'bireysel', // 'bireysel' | 'merkezi' | 'boylerli'
    //     },
    //     sayaclar: [
    //         {
    //             aboneTuketimNo: 'A001',
    //             birimNo: '1',
    //             metrekare: 95,
    //             aboneAdi: 'AHMET YILMAZ',
    //             telefon: '0532 000 00 00',
    //             projeDurumu: 'TAMAM',  // 'TAMAM' | 'BEKLEMEDE' | ...
    //             gazDurumu: 'AÇIK',     // 'AÇIK' | 'KAPALI'
    //         },
    //     ],
    // },
];

// ── PUBLIC API ─────────────────────────────────────────────────────

// BinaServisi: bina tesisat no ile bina + sayaç bilgilerini döner.
export function fetchBinaByTesisatNo(binaTesisatNo) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const tno = normalize(binaTesisatNo);
            if (!tno) return reject(new Error('Bina Tesisat No girilmedi.'));
            const bina = DUMMY_BINALAR.find(b => normalize(b.binaTesisatNo) === tno);
            if (!bina) return reject(new Error(`Bina bulunamadı: ${tno}`));
            resolve(cloneRecord(bina));
        }, NETWORK_DELAY_MS);
    });
}

// AboneServisi: tüketim no ile sayaç bilgileri + binanın tesisat no'su döner.
export function fetchAboneByTuketimNo(aboneTuketimNo) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const ano = normalize(aboneTuketimNo);
            if (!ano) return reject(new Error('Abone Tüketim No girilmedi.'));
            for (const bina of DUMMY_BINALAR) {
                const sayac = (bina.sayaclar || []).find(s => normalize(s.aboneTuketimNo) === ano);
                if (sayac) {
                    resolve({
                        abone: cloneRecord(sayac),
                        binaTesisatNo: bina.binaTesisatNo,
                    });
                    return;
                }
            }
            reject(new Error(`Abone bulunamadı: ${ano}`));
        }, NETWORK_DELAY_MS);
    });
}

// Convenience: tüketim no → önce abone, sonra bina (zincirleme çağrı).
export async function fetchBinaByAboneTuketimNo(aboneTuketimNo) {
    const { binaTesisatNo, abone } = await fetchAboneByTuketimNo(aboneTuketimNo);
    const bina = await fetchBinaByTesisatNo(binaTesisatNo);
    return { bina, abone };
}

// ── INTERNAL ───────────────────────────────────────────────────────
function normalize(v) {
    return String(v ?? '').trim();
}

function cloneRecord(obj) {
    return JSON.parse(JSON.stringify(obj));
}
