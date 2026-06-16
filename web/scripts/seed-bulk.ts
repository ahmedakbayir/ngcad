/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Zengin seed: 10 DF + 10 PF + 10 PFUser + 10 DFUser
 *
 *   cd web
 *   npm run seed:bulk
 *
 * İdempotent: aynı isimli firma / aynı email'li user varsa atlar, yoksa ekler.
 */

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: '.env.local' });
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD     = process.env.SEED_BULK_PASSWORD || 'temp1234';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Eksik env: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ═══════════════════════════════════════════════════════════════════════════
//   DF (10) — 3 parent + alt birimler + bağımsızlar
// ═══════════════════════════════════════════════════════════════════════════
const DF_LIST = [
  { slug: 'df-igdas',      adi: 'İGDAŞ',                   parent: null,        tel: '0212 887 11 00', email: 'info@igdas.com.tr',     vergi_dairesi: 'Büyük Mük.',  vergi_no: '4810097654',  adres: 'Halkalı Cd. No:1 Küçükçekmece/İstanbul' },
  { slug: 'df-igdas-avr',  adi: 'İGDAŞ — Avrupa Bölge',    parent: 'df-igdas',  tel: '0212 555 22 11', email: 'avr@igdas.com.tr',      vergi_dairesi: 'Büyük Mük.',  vergi_no: '4810097654',  adres: 'Mecidiyeköy/İstanbul' },
  { slug: 'df-igdas-and',  adi: 'İGDAŞ — Anadolu Bölge',   parent: 'df-igdas',  tel: '0216 555 33 44', email: 'and@igdas.com.tr',      vergi_dairesi: 'Büyük Mük.',  vergi_no: '4810097654',  adres: 'Kadıköy/İstanbul' },
  { slug: 'df-akmercan',   adi: 'AKMERCAN GEPA',           parent: null,        tel: '0286 217 11 11', email: 'info@akmercangepa.com', vergi_dairesi: 'Çanakkale',    vergi_no: '0250478932',  adres: 'Cumhuriyet Mah. Çanakkale' },
  { slug: 'df-akmercan-m', adi: 'AKMERCAN — Marmara',      parent: 'df-akmercan', tel: '0264 444 55 66', email: 'marmara@akmercangepa.com', vergi_dairesi: 'Çanakkale', vergi_no: '0250478932', adres: 'Sapanca/Sakarya' },
  { slug: 'df-coruh',      adi: 'ÇORUH GAZ',               parent: null,        tel: '0466 211 22 33', email: 'info@coruhgaz.com.tr',  vergi_dairesi: 'Artvin',        vergi_no: '2400371291',  adres: 'Çoruh Cd. No:14 Artvin' },
  { slug: 'df-bursagaz',   adi: 'BURSAGAZ',                parent: null,        tel: '0224 270 30 30', email: 'info@bursagaz.com.tr',  vergi_dairesi: 'Bursa',         vergi_no: '1840039876',  adres: 'Yıldırım/Bursa' },
  { slug: 'df-agdas',      adi: 'AGDAŞ',                   parent: null,        tel: '0312 211 11 11', email: 'info@agdas.com.tr',     vergi_dairesi: 'Ankara',        vergi_no: '0610154321',  adres: 'Söğütözü/Ankara' },
  { slug: 'df-kayserigaz', adi: 'KAYSERİGAZ',              parent: null,        tel: '0352 222 33 44', email: 'info@kayserigaz.com.tr', vergi_dairesi: 'Kayseri',      vergi_no: '4960082347',  adres: 'Talas/Kayseri' },
  { slug: 'df-palgaz',     adi: 'PALGAZ',                  parent: null,        tel: '0282 651 99 88', email: 'info@palgaz.com.tr',    vergi_dairesi: 'Tekirdağ',      vergi_no: '7250114455',  adres: 'Çorlu/Tekirdağ' },
];

// ═══════════════════════════════════════════════════════════════════════════
//   PF (10) — 7 bağımsız + AKRE'nin 2 alt şubesi + THETA
// ═══════════════════════════════════════════════════════════════════════════
const PF_LIST = [
  { slug: 'pf-akre',        adi: 'AKRE ISI MÜHENDİSLİK',  parent: null,       tel: '0212 555 11 22', email: 'info@akre.com.tr',           vergi_dairesi: 'Beyoğlu',    vergi_no: '1234567890', adres: 'Halaskargazi Cd. No:120 Şişli/İST',  yeterlilik_no: 'YT-2024-0123', dfSlugs: ['df-igdas-avr'] },
  { slug: 'pf-akre-and',    adi: 'AKRE — Anadolu Şube',   parent: 'pf-akre',  tel: '0216 555 11 22', email: 'and@akre.com.tr',            vergi_dairesi: 'Kadıköy',    vergi_no: '1234567890', adres: 'Bağdat Cd. No:340 Caddebostan/İST', yeterlilik_no: 'YT-2024-0123', dfSlugs: ['df-igdas-and'] },
  { slug: 'pf-akre-trk',    adi: 'AKRE — Trakya Şube',    parent: 'pf-akre',  tel: '0282 651 22 33', email: 'trakya@akre.com.tr',         vergi_dairesi: 'Çorlu',      vergi_no: '1234567890', adres: 'Atatürk Cd. No:55 Çorlu/Tekirdağ',  yeterlilik_no: 'YT-2024-0123', dfSlugs: ['df-palgaz'] },
  { slug: 'pf-alfa',        adi: 'ALFA DOĞALGAZ MÜH.',    parent: null,       tel: '0216 444 22 33', email: 'proje@alfagaz.com.tr',       vergi_dairesi: 'Kadıköy',    vergi_no: '2345678901', adres: 'Meriç Cd. No:7/12 Ataşehir/İST',    yeterlilik_no: 'YT-2024-0567', dfSlugs: ['df-igdas-and', 'df-akmercan-m'] },
  { slug: 'pf-beta',        adi: 'BETA TESİSAT',          parent: null,       tel: '0212 333 44 55', email: 'info@betatesisat.com',       vergi_dairesi: 'Beşiktaş',   vergi_no: '3456789012', adres: 'Büyükdere Cd. No:201 Levent/İST',   yeterlilik_no: 'YT-2023-0891', dfSlugs: ['df-igdas'] },
  { slug: 'pf-gama',        adi: 'GAMA MÜHENDİSLİK',      parent: null,       tel: '0312 222 11 33', email: 'contact@gamamuh.com.tr',     vergi_dairesi: 'Çankaya',    vergi_no: '4567890123', adres: 'Tunalı Hilmi Cd. No:88 Çankaya/ANK', yeterlilik_no: 'YT-2024-0234', dfSlugs: ['df-agdas'] },
  { slug: 'pf-delta',       adi: 'DELTA ENERJİ',          parent: null,       tel: '0232 422 55 66', email: 'info@deltaenerji.com.tr',    vergi_dairesi: 'Bornova',    vergi_no: '5678901234', adres: 'Ergene Sk. No:9 Bornova/İZMİR',      yeterlilik_no: 'YT-2023-0445', dfSlugs: ['df-bursagaz'] },
  { slug: 'pf-epsilon',     adi: 'EPSILON PROJE',         parent: null,       tel: '0232 366 77 88', email: 'mail@epsilonproje.com',      vergi_dairesi: 'Karşıyaka',  vergi_no: '6789012345', adres: 'Bostanlı Cd. No:14 Karşıyaka/İZMİR', yeterlilik_no: 'YT-2024-0998', dfSlugs: ['df-bursagaz'] },
  { slug: 'pf-zeta',        adi: 'ZETA MÜHENDİSLİK',      parent: null,       tel: '0224 451 22 33', email: 'info@zetamuh.com.tr',        vergi_dairesi: 'Nilüfer',    vergi_no: '7890123456', adres: 'Görükle Mah. No:48 Nilüfer/BURSA',  yeterlilik_no: 'YT-2024-0112', dfSlugs: ['df-bursagaz'] },
  { slug: 'pf-theta',       adi: 'THETA DOĞALGAZ',        parent: null,       tel: '0216 332 44 55', email: 'iletisim@thetadogalgaz.com', vergi_dairesi: 'Maltepe',    vergi_no: '8901234567', adres: 'E-5 Yan Yol No:12 Maltepe/İST',     yeterlilik_no: 'YT-2025-0034', dfSlugs: ['df-igdas-and', 'df-kayserigaz'] },
];

// ═══════════════════════════════════════════════════════════════════════════
//   PFUser (10) — Yönetici (üst/orta) + Müh + Çizim + Ustalar
// ═══════════════════════════════════════════════════════════════════════════
const PF_USERS = [
  // 1. Üst Yönetici + Proje Müh. (içtesisat)
  { slug: 'pfu-ahmet',  adi: 'AHMET AKBAYIR',  email: 'ahmet@akre.com.tr',          gsm: '0532 111 22 33',
    firma_yonetici: true, firma_yonetici_kademe: 'ust',
    firma_proje_muhendisi: true, proje_muh_oda_sicil_no: 15234, proje_muh_kayit_no: 'PM-2018-A472', proje_muh_yetki_durumu: 'icTesisat',
    firmaSlugs: ['pf-akre'], bagliSlug: null },

  // 2. Orta Yönetici + Proje Müh. (endüstriyel) — bağlı: Ahmet
  { slug: 'pfu-selim',  adi: 'SELİM ARSLAN',   email: 'selim.arslan@alfa.com.tr',   gsm: '0533 222 33 44',
    firma_yonetici: true, firma_yonetici_kademe: 'orta',
    firma_proje_muhendisi: true, proje_muh_oda_sicil_no: 21778, proje_muh_kayit_no: 'PM-2019-B331', proje_muh_yetki_durumu: 'endustriyel',
    firmaSlugs: ['pf-alfa'], bagliSlug: 'pfu-ahmet' },

  // 3. Çizim Sorumlusu — birden çok firma, bağlı: Ahmet
  { slug: 'pfu-omer',   adi: 'ÖMER ÇELİK',     email: 'omer.celik@akre.com.tr',     gsm: '0533 444 55 66',
    firma_cizim_sorumlusu: true,
    firmaSlugs: ['pf-akre', 'pf-beta'], bagliSlug: 'pfu-ahmet' },

  // 4. Tesisat Ustası (Montaj + Çelik) — bağlı: Ahmet
  { slug: 'pfu-fatih',  adi: 'FATİH KAYA',     email: 'fatih.kaya@beta.com.tr',     gsm: '0535 777 88 99',
    firma_tesisat_ustasi: true, usta_montaj: true, usta_montaj_belge_no: 'MNT-2022-7741', usta_celik_kaynak: true, usta_celik_kaynak_belge_no: 'CKB-2023-1129',
    firmaSlugs: ['pf-beta'], bagliSlug: 'pfu-ahmet' },

  // 5. Tesisat Ustası (PE Kaynak)
  { slug: 'pfu-burak',  adi: 'BURAK YILMAZ',   email: 'burak.yilmaz@delta.com.tr',  gsm: '0536 998 22 11',
    firma_tesisat_ustasi: true, usta_pe_kaynak: true, usta_pe_kaynak_belge_no: 'PEK-2024-0044',
    firmaSlugs: ['pf-delta'], bagliSlug: null },

  // 6. Üst Yönetici (başka firma)
  { slug: 'pfu-hakan',  adi: 'HAKAN TOPRAK',   email: 'hakan.toprak@epsilon.com.tr', gsm: '0532 654 77 11',
    firma_yonetici: true, firma_yonetici_kademe: 'ust',
    firmaSlugs: ['pf-epsilon'], bagliSlug: null },

  // 7. Proje Müh + Çizim Sorumlusu (çift rol)
  { slug: 'pfu-ismail', adi: 'İSMAİL AKSOY',   email: 'ismail.aksoy@zeta.com.tr',   gsm: '0537 112 33 44',
    firma_proje_muhendisi: true, proje_muh_oda_sicil_no: 32114, proje_muh_kayit_no: 'PM-2021-Z901', proje_muh_yetki_durumu: 'icTesisat',
    firma_cizim_sorumlusu: true,
    firmaSlugs: ['pf-zeta'], bagliSlug: null },

  // 8. Orta Yönetici (AKRE Anadolu Şube) — bağlı: Ahmet
  { slug: 'pfu-murat',  adi: 'MURAT ŞAHİN',    email: 'murat.sahin@akre.com.tr',    gsm: '0538 998 11 22',
    firma_yonetici: true, firma_yonetici_kademe: 'orta',
    firmaSlugs: ['pf-akre-and'], bagliSlug: 'pfu-ahmet' },

  // 9. Tesisat Ustası (3 belge birden — full sertifika)
  { slug: 'pfu-volkan', adi: 'VOLKAN ÇETİNKAYA', email: 'volkan.cetinkaya@theta.com.tr', gsm: '0530 221 99 88',
    firma_tesisat_ustasi: true,
    usta_montaj: true,        usta_montaj_belge_no:        'MNT-2020-2211',
    usta_celik_kaynak: true,  usta_celik_kaynak_belge_no:  'CKB-2021-3344',
    usta_pe_kaynak: true,     usta_pe_kaynak_belge_no:     'PEK-2022-5566',
    firmaSlugs: ['pf-theta'], bagliSlug: null },

  // 10. Proje Müh. (içtesisat) — GAMA
  { slug: 'pfu-erdem',  adi: 'ERDEM ÖZTÜRK',   email: 'erdem.ozturk@gama.com.tr',   gsm: '0531 444 55 66',
    firma_proje_muhendisi: true, proje_muh_oda_sicil_no: 18445, proje_muh_kayit_no: 'PM-2017-G118', proje_muh_yetki_durumu: 'icTesisat',
    firmaSlugs: ['pf-gama'], bagliSlug: null },
];

// ═══════════════════════════════════════════════════════════════════════════
//   DFUser (10) — Yönetici + Onay/Gaz Açma/Ön Büro
// ═══════════════════════════════════════════════════════════════════════════
const DF_USERS = [
  // 1. Üst Yönetici — İGDAŞ parent
  { slug: 'dfu-hasan',  adi: 'HASAN KARA',     email: 'hasan.kara@igdas.com.tr',     gsm: '0532 998 11 00',
    gdf_yonetici: true, gdf_yonetici_kademe: 'ust',
    firmaSlugs: ['df-igdas'], bagliSlug: null },

  // 2. Onay Müh. — İGDAŞ Avrupa, bağlı: Hasan
  { slug: 'dfu-mehmet', adi: 'MEHMET DEMİR',   email: 'm.demir@igdas.com.tr',        gsm: '0532 333 44 55',
    gdf_onay_muhendisi: true, onay_muh_gdf_sicil_no: 'IGD-ONY-2451',
    firmaSlugs: ['df-igdas-avr'], bagliSlug: 'dfu-hasan' },

  // 3. Onay Müh. — İGDAŞ Avrupa (ikinci kişi)
  { slug: 'dfu-yeliz',  adi: 'YELİZ ACAR',     email: 'yeliz.acar@igdas.com.tr',     gsm: '0533 111 88 99',
    gdf_onay_muhendisi: true, onay_muh_gdf_sicil_no: 'IGD-ONY-2588',
    firmaSlugs: ['df-igdas-avr'], bagliSlug: 'dfu-hasan' },

  // 4. Gaz Açma Müh. — İGDAŞ Anadolu, bağlı: Hasan
  { slug: 'dfu-ayse',   adi: 'AYŞE YILDIZ',    email: 'a.yildiz@igdas.com.tr',       gsm: '0533 222 11 00',
    gdf_gaz_acma_muhendisi: true, gaz_acma_muh_ekip_no: 'EKP-AND-117',
    firmaSlugs: ['df-igdas-and'], bagliSlug: 'dfu-hasan' },

  // 5. Onay Müh. — AKMERCAN
  { slug: 'dfu-zeynep', adi: 'ZEYNEP AYDIN',   email: 'zeynep.aydin@akmercan.com.tr', gsm: '0534 998 77 66',
    gdf_onay_muhendisi: true, onay_muh_gdf_sicil_no: 'AKM-ONY-0341',
    firmaSlugs: ['df-akmercan'], bagliSlug: null },

  // 6. Onay + Gaz Açma çift rol — AKMERCAN Marmara
  { slug: 'dfu-yusuf',  adi: 'YUSUF EREN',     email: 'yusuf.eren@akmercan.com.tr',  gsm: '0535 444 99 11',
    gdf_onay_muhendisi: true,    onay_muh_gdf_sicil_no: 'AKM-ONY-0512',
    gdf_gaz_acma_muhendisi: true, gaz_acma_muh_ekip_no:  'EKP-MAR-204',
    firmaSlugs: ['df-akmercan-m'], bagliSlug: null },

  // 7. Ön Büro Yetkilisi — ÇORUH GAZ
  { slug: 'dfu-kemal',  adi: 'KEMAL POLAT',    email: 'kemal.polat@coruhgaz.com.tr', gsm: '0536 222 11 33',
    gdf_on_buro_yetkilisi: true,
    firmaSlugs: ['df-coruh'], bagliSlug: null },

  // 8. Orta Yönetici + Onay Müh. — BURSAGAZ
  { slug: 'dfu-ali',    adi: 'ALİ ÇAKIR',      email: 'ali.cakir@bursagaz.com.tr',   gsm: '0537 111 22 88',
    gdf_yonetici: true, gdf_yonetici_kademe: 'orta',
    gdf_onay_muhendisi: true, onay_muh_gdf_sicil_no: 'BRS-ONY-1108',
    firmaSlugs: ['df-bursagaz'], bagliSlug: null },

  // 9. Gaz Açma — AGDAŞ
  { slug: 'dfu-esra',   adi: 'ESRA GÜNEŞ',     email: 'esra.gunes@agdas.com.tr',     gsm: '0538 776 44 22',
    gdf_gaz_acma_muhendisi: true, gaz_acma_muh_ekip_no: 'AGD-EKP-029',
    firmaSlugs: ['df-agdas'], bagliSlug: null },

  // 10. Üst Yönetici — PALGAZ
  { slug: 'dfu-tulay',  adi: 'TÜLAY BOZKURT',  email: 'tulay.bozkurt@palgaz.com.tr', gsm: '0530 888 99 00',
    gdf_yonetici: true, gdf_yonetici_kademe: 'ust',
    firmaSlugs: ['df-palgaz'], bagliSlug: null },
];

// ═══════════════════════════════════════════════════════════════════════════
//   YARDIMCILAR — idempotent insert/upsert
// ═══════════════════════════════════════════════════════════════════════════

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { data } = await sb.from('users').select('id').eq('email', email).maybeSingle();
  if (data) return data.id as string;
  // Auth tarafında olabilir, public.users'ta olmayabilir
  const list = await sb.auth.admin.listUsers();
  return list.data?.users.find((u) => u.email === email)?.id ?? null;
}

async function findFirmaIdByAdi(table: 'dagitim_firmalari' | 'proje_firmalari', adi: string): Promise<string | null> {
  const { data } = await sb.from(table).select('id').eq('firma_adi', adi).maybeSingle();
  return data?.id ?? null;
}

async function ensureAuth(email: string): Promise<string> {
  let id = await findUserIdByEmail(email);
  if (id) return id;
  const created = await sb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
  });
  if (created.error && !created.error.message.toLowerCase().includes('exist')) {
    throw created.error;
  }
  id = created.data?.user?.id ?? (await findUserIdByEmail(email));
  if (!id) throw new Error(`Auth user oluşturulamadı: ${email}`);
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
//   ÇALIŞMA
// ═══════════════════════════════════════════════════════════════════════════

async function seedDFs(): Promise<Map<string, string>> {
  console.log('\n→ Dağıtım Firmaları (DF)');
  const idMap = new Map<string, string>();
  // 1. tur — parent yokları ekle
  for (const d of DF_LIST.filter((x) => !x.parent)) {
    let id = await findFirmaIdByAdi('dagitim_firmalari', d.adi);
    if (!id) {
      const { data, error } = await sb.from('dagitim_firmalari').insert({
        firma_adi: d.adi, firma_tel: d.tel, firma_email: d.email,
        vergi_dairesi: d.vergi_dairesi, vergi_no: d.vergi_no, adres: d.adres,
      }).select('id').single();
      if (error) throw error;
      id = data.id;
      console.log(`  + ${d.adi}`);
    } else {
      console.log(`  · ${d.adi} (mevcut)`);
    }
    idMap.set(d.slug, id);
  }
  // 2. tur — parent'lı olanlar
  for (const d of DF_LIST.filter((x) => x.parent)) {
    let id = await findFirmaIdByAdi('dagitim_firmalari', d.adi);
    if (!id) {
      const parent_id = idMap.get(d.parent!);
      const { data, error } = await sb.from('dagitim_firmalari').insert({
        firma_adi: d.adi, parent_id, firma_tel: d.tel, firma_email: d.email,
        vergi_dairesi: d.vergi_dairesi, vergi_no: d.vergi_no, adres: d.adres,
      }).select('id').single();
      if (error) throw error;
      id = data.id;
      console.log(`  + └─ ${d.adi}`);
    } else {
      console.log(`  · └─ ${d.adi} (mevcut)`);
    }
    idMap.set(d.slug, id);
  }
  return idMap;
}

async function seedPFs(dfMap: Map<string, string>): Promise<Map<string, string>> {
  console.log('\n→ Proje Firmaları (PF)');
  const idMap = new Map<string, string>();
  // Tek-DF modeli: dfSlugs içinde ilk bulunan DF kullanılır.
  const pickDfId = (slugs: string[]): string | null => {
    for (const ds of slugs) {
      const id = dfMap.get(ds);
      if (id) return id;
    }
    return null;
  };
  for (const p of PF_LIST.filter((x) => !x.parent)) {
    let id = await findFirmaIdByAdi('proje_firmalari', p.adi);
    const df_id = pickDfId(p.dfSlugs);
    if (!id) {
      const { data, error } = await sb.from('proje_firmalari').insert({
        firma_adi: p.adi, firma_tel: p.tel, firma_email: p.email,
        vergi_dairesi: p.vergi_dairesi, vergi_no: p.vergi_no, adres: p.adres,
        yeterlilik_no: p.yeterlilik_no, df_id,
      }).select('id').single();
      if (error) throw error;
      id = data.id;
      console.log(`  + ${p.adi}`);
    } else {
      console.log(`  · ${p.adi} (mevcut)`);
    }
    idMap.set(p.slug, id);
  }
  for (const p of PF_LIST.filter((x) => x.parent)) {
    let id = await findFirmaIdByAdi('proje_firmalari', p.adi);
    const df_id = pickDfId(p.dfSlugs);
    if (!id) {
      const parent_id = idMap.get(p.parent!);
      const { data, error } = await sb.from('proje_firmalari').insert({
        firma_adi: p.adi, parent_id, firma_tel: p.tel, firma_email: p.email,
        vergi_dairesi: p.vergi_dairesi, vergi_no: p.vergi_no, adres: p.adres,
        yeterlilik_no: p.yeterlilik_no, df_id,
      }).select('id').single();
      if (error) throw error;
      id = data.id;
      console.log(`  + └─ ${p.adi}`);
    } else {
      console.log(`  · └─ ${p.adi} (mevcut)`);
    }
    idMap.set(p.slug, id);
  }
  return idMap;
}

async function seedUsers(
  list: any[],
  channel: 'pf' | 'df',
  pfMap: Map<string, string>,
  dfMap: Map<string, string>,
): Promise<Map<string, string>> {
  console.log(`\n→ ${channel.toUpperCase()}User (${list.length})`);
  const idMap = new Map<string, string>();
  for (const u of list) {
    const authId = await ensureAuth(u.email);
    idMap.set(u.slug, authId);

    const row: any = {
      id: authId, adi: u.adi, email: u.email, gsm: u.gsm,
      firma_kullanicisi: channel === 'pf',
      gdf_kullanicisi:   channel === 'df',
      firma_yonetici:         !!u.firma_yonetici,
      firma_yonetici_kademe:  u.firma_yonetici_kademe ?? null,
      firma_proje_muhendisi:  !!u.firma_proje_muhendisi,
      firma_cizim_sorumlusu:  !!u.firma_cizim_sorumlusu,
      firma_tesisat_ustasi:   !!u.firma_tesisat_ustasi,
      usta_montaj:        !!u.usta_montaj,        usta_montaj_belge_no:        u.usta_montaj_belge_no ?? null,
      usta_celik_kaynak:  !!u.usta_celik_kaynak,  usta_celik_kaynak_belge_no:  u.usta_celik_kaynak_belge_no ?? null,
      usta_pe_kaynak:     !!u.usta_pe_kaynak,     usta_pe_kaynak_belge_no:     u.usta_pe_kaynak_belge_no ?? null,
      gdf_yonetici:          !!u.gdf_yonetici,
      gdf_yonetici_kademe:   u.gdf_yonetici_kademe ?? null,
      gdf_onay_muhendisi:    !!u.gdf_onay_muhendisi,
      gdf_gaz_acma_muhendisi: !!u.gdf_gaz_acma_muhendisi,
      gdf_on_buro_yetkilisi: !!u.gdf_on_buro_yetkilisi,
      proje_muh_oda_sicil_no: u.proje_muh_oda_sicil_no ?? null,
      proje_muh_kayit_no:     u.proje_muh_kayit_no ?? null,
      proje_muh_yetki_durumu: u.proje_muh_yetki_durumu ?? null,
      onay_muh_gdf_sicil_no:  u.onay_muh_gdf_sicil_no ?? null,
      gaz_acma_muh_ekip_no:   u.gaz_acma_muh_ekip_no ?? null,
    };
    const { error } = await sb.from('users').upsert(row);
    if (error) throw error;
    console.log(`  ${u.adi}`);

    // Junction
    if (channel === 'pf') {
      await sb.from('user_pf').delete().eq('user_id', authId);
      for (const fs of u.firmaSlugs ?? []) {
        const pf_id = pfMap.get(fs);
        if (pf_id) await sb.from('user_pf').insert({ user_id: authId, pf_id });
      }
    } else {
      await sb.from('user_df').delete().eq('user_id', authId);
      for (const fs of u.firmaSlugs ?? []) {
        const df_id = dfMap.get(fs);
        if (df_id) await sb.from('user_df').insert({ user_id: authId, df_id });
      }
    }
  }

  // Bağlı olduğu yönetici — ikinci pass
  for (const u of list) {
    if (!u.bagliSlug) continue;
    const id = idMap.get(u.slug);
    const yon = idMap.get(u.bagliSlug);
    if (id && yon) {
      await sb.from('users').update({ bagli_oldugu_yonetici_id: yon }).eq('id', id);
    }
  }

  return idMap;
}

(async () => {
  try {
    const dfMap = await seedDFs();
    const pfMap = await seedPFs(dfMap);
    await seedUsers(PF_USERS, 'pf', pfMap, dfMap);
    await seedUsers(DF_USERS, 'df', pfMap, dfMap);
    console.log('\n✔ Bulk seed tamamlandı.');
    console.log(`  Tüm yeni kullanıcılar şifre: ${PASSWORD}`);
  } catch (e) {
    console.error('\n✘ Hata:', e);
    process.exit(1);
  }
})();
