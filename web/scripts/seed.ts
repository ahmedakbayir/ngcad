/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Seed: sorumlu-data.js'teki örnek GDF / PF / User verisini Supabase'e yükler.
 *
 *   cd web
 *   cp .env.local.example .env.local       # NEXT_PUBLIC_SUPABASE_URL,
 *                                          # NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *                                          # SUPABASE_SERVICE_ROLE_KEY doldurun
 *   npm run seed
 *
 * Idempotent değildir — temiz bir DB üzerinde çalıştırın.
 * Kullanıcılar `inviteUserByEmail` ile davet edilir; gerçek email'ler kullanıyorsanız
 * gönderim atılır. Test için `--no-invite` parametresi ile auth.admin.createUser
 * (mock password ile) çalıştırılır.
 */

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Next.js convention: .env.local Next runtime'da okunur ama tsx scriptinden okunmaz.
// Manuel olarak yükle (önce .env.local, sonra .env fallback).
loadEnv({ path: '.env.local' });
loadEnv();

const noInvite = process.argv.includes('--no-invite');

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL   = process.env.SEED_ADMIN_EMAIL || 'admin@aangcad.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'admin1234';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Eksik env: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── GDF (Dağıtım Firmaları) ───────────────────────────────────────────
const GDF_LIST = [
  { slug: 'gdf-igdas',     adi: 'İGDAŞ',                 parentSlug: null },
  { slug: 'gdf-igdas-avr', adi: 'İGDAŞ — Avrupa Bölge',  parentSlug: 'gdf-igdas' },
  { slug: 'gdf-igdas-and', adi: 'İGDAŞ — Anadolu Bölge', parentSlug: 'gdf-igdas' },
  { slug: 'gdf-akmercan',  adi: 'AKMERCAN GEPA',         parentSlug: null },
  { slug: 'gdf-coruh',     adi: 'ÇORUH GAZ',             parentSlug: null },
];

// ── PF (Proje Firmaları) ──────────────────────────────────────────────
const PF_LIST = [
  {
    slug: 'pf-akre',
    firma_adi: 'AKRE ISI MÜHENDİSLİK',
    firma_tel: '0212 555 11 22',
    firma_email: 'info@akre.com.tr',
    gdfSlugs: ['gdf-igdas-avr'],
    vergi_dairesi: 'Beyoğlu',
    vergi_no: '1234567890',
    adres: 'Halaskargazi Cd. No:120 K:4 Şişli/İstanbul',
    yeterlilik_no: 'YT-2024-0123',
    yetkiliSlug: 'user-ahmet',
  },
  {
    slug: 'pf-alfa',
    firma_adi: 'ALFA DOĞALGAZ MÜHENDİSLİK',
    firma_tel: '0216 444 22 33',
    firma_email: 'proje@alfagaz.com.tr',
    gdfSlugs: ['gdf-igdas-and', 'gdf-akmercan'],
    vergi_dairesi: 'Kadıköy',
    vergi_no: '2345678901',
    adres: 'Atatürk Mah. Meriç Cd. No:7/12 Ataşehir/İstanbul',
    yeterlilik_no: 'YT-2024-0567',
    yetkiliSlug: 'user-omer',
  },
  {
    slug: 'pf-beta',
    firma_adi: 'BETA TESİSAT',
    firma_tel: '0212 333 44 55',
    firma_email: 'info@betatesisat.com',
    gdfSlugs: ['gdf-igdas'],
    vergi_dairesi: 'Beşiktaş',
    vergi_no: '3456789012',
    adres: 'Esentepe Mah. Büyükdere Cd. No:201 Levent/İstanbul',
    yeterlilik_no: 'YT-2023-0891',
    yetkiliSlug: 'user-fatih',
  },
  {
    slug: 'pf-gama',
    firma_adi: 'GAMA MÜHENDİSLİK',
    firma_tel: '0312 222 11 33',
    firma_email: 'contact@gamamuh.com.tr',
    gdfSlugs: ['gdf-coruh'],
    vergi_dairesi: 'Çankaya',
    vergi_no: '4567890123',
    adres: 'Tunalı Hilmi Cd. No:88 Çankaya/Ankara',
    yeterlilik_no: 'YT-2024-0234',
    yetkiliSlug: null,
  },
];

// ── USERS ─────────────────────────────────────────────────────────────
const USER_LIST = [
  {
    slug: 'user-ahmet',
    adi: 'AHMET AKBAYIR',
    email: 'ahmet@akre.com.tr',
    gsm: '0532 111 22 33',
    firma_kullanicisi: true,
    firma_yonetici: true,
    firma_yonetici_kademe: 'ust',
    firma_proje_muhendisi: true,
    firmaSlugs: ['pf-akre'],
    bagliSlug: null,
    proje_muh_oda_sicil_no: 15234,
    proje_muh_kayit_no: 'PM-2018-A472',
    proje_muh_yetki_durumu: 'icTesisat',
  },
  {
    slug: 'user-omer',
    adi: 'ÖMER ÇELİK',
    email: 'omer@akre.com.tr',
    gsm: '0533 444 55 66',
    firma_kullanicisi: true,
    firma_cizim_sorumlusu: true,
    firmaSlugs: ['pf-akre', 'pf-beta'],
    bagliSlug: 'user-ahmet',
  },
  {
    slug: 'user-fatih',
    adi: 'FATİH KAYA',
    email: 'fatih.kaya@beta.com.tr',
    gsm: '0535 777 88 99',
    firma_kullanicisi: true,
    firma_tesisat_ustasi: true,
    usta_montaj: true,
    usta_montaj_belge_no: 'MNT-2022-7741',
    usta_celik_kaynak: true,
    usta_celik_kaynak_belge_no: 'CKB-2023-1129',
    firmaSlugs: ['pf-beta'],
    bagliSlug: 'user-ahmet',
  },
  {
    slug: 'user-mehmet',
    adi: 'MEHMET DEMİR',
    email: 'm.demir@igdas.com.tr',
    gsm: '0532 333 44 55',
    gdf_kullanicisi: true,
    gdf_onay_muhendisi: true,
    firmaSlugs: ['gdf-igdas-avr'],
    onay_muh_gdf_sicil_no: 'IGD-ONY-2451',
  },
  {
    slug: 'user-ayse',
    adi: 'AYŞE YILDIZ',
    email: 'a.yildiz@igdas.com.tr',
    gsm: '0533 222 11 00',
    gdf_kullanicisi: true,
    gdf_gaz_acma_muhendisi: true,
    firmaSlugs: ['gdf-igdas-and'],
    gaz_acma_muh_ekip_no: 'EKP-AND-117',
  },
];

async function ensureAdmin(): Promise<string> {
  console.log(`\n→ Admin kullanıcı: ${ADMIN_EMAIL}`);
  // Listeden bul
  const list = await sb.auth.admin.listUsers();
  let existing = list.data?.users.find((u) => u.email === ADMIN_EMAIL);
  if (!existing) {
    const created = await sb.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    existing = created.data.user!;
    console.log(`  oluşturuldu (şifre: ${ADMIN_PASSWORD})`);
  } else {
    console.log('  zaten var');
  }
  // public.users insert/upsert
  await sb.from('users').upsert({
    id: existing.id,
    adi: 'Admin',
    email: ADMIN_EMAIL,
    is_admin: true,
    firma_kullanicisi: false,
    gdf_kullanicisi: false,
  });
  return existing.id;
}

async function seedGDFs() {
  console.log('\n→ Dağıtım Firmaları (DF)');
  const idMap = new Map<string, string>();
  // Parent yok olanlardan başla
  for (const g of GDF_LIST.filter((x) => !x.parentSlug)) {
    const { data, error } = await sb
      .from('dagitim_firmalari')
      .insert({ firma_adi: g.adi })
      .select('id')
      .single();
    if (error) throw error;
    idMap.set(g.slug, data.id);
    console.log(`  ${g.adi}`);
  }
  for (const g of GDF_LIST.filter((x) => x.parentSlug)) {
    const parent_id = idMap.get(g.parentSlug!);
    const { data, error } = await sb
      .from('dagitim_firmalari')
      .insert({ firma_adi: g.adi, parent_id })
      .select('id')
      .single();
    if (error) throw error;
    idMap.set(g.slug, data.id);
    console.log(`  └─ ${g.adi}`);
  }
  return idMap;
}

async function seedUsers() {
  console.log('\n→ Kullanıcılar');
  const idMap = new Map<string, string>();
  for (const u of USER_LIST) {
    let authId: string | undefined;
    if (noInvite) {
      const created = await sb.auth.admin.createUser({
        email: u.email,
        password: 'temp1234',
        email_confirm: true,
      });
      if (created.error && !created.error.message.toLowerCase().includes('exist')) {
        throw created.error;
      }
      authId = created.data?.user?.id;
    } else {
      const invited = await sb.auth.admin.inviteUserByEmail(u.email);
      if (invited.error && !invited.error.message.toLowerCase().includes('registered')) {
        throw invited.error;
      }
      authId = invited.data?.user?.id;
    }
    if (!authId) {
      // Mevcut auth user'ı al
      const list = await sb.auth.admin.listUsers();
      authId = list.data?.users.find((x) => x.email === u.email)?.id;
    }
    if (!authId) {
      console.warn(`  ⚠ ${u.email}: auth id bulunamadı, atlanıyor`);
      continue;
    }

    const insertRow: any = {
      id: authId,
      adi: u.adi,
      email: u.email,
      gsm: u.gsm,
      firma_kullanicisi: !!u.firma_kullanicisi,
      firma_yonetici: !!u.firma_yonetici,
      firma_yonetici_kademe: u.firma_yonetici_kademe ?? null,
      firma_proje_muhendisi: !!u.firma_proje_muhendisi,
      firma_cizim_sorumlusu: !!u.firma_cizim_sorumlusu,
      firma_tesisat_ustasi: !!u.firma_tesisat_ustasi,
      usta_montaj: !!u.usta_montaj,
      usta_montaj_belge_no: (u as any).usta_montaj_belge_no ?? null,
      usta_celik_kaynak: !!u.usta_celik_kaynak,
      usta_celik_kaynak_belge_no: (u as any).usta_celik_kaynak_belge_no ?? null,
      usta_pe_kaynak_belge_no: (u as any).usta_pe_kaynak_belge_no ?? null,
      gdf_kullanicisi: !!u.gdf_kullanicisi,
      gdf_onay_muhendisi: !!u.gdf_onay_muhendisi,
      gdf_gaz_acma_muhendisi: !!u.gdf_gaz_acma_muhendisi,
      proje_muh_oda_sicil_no: u.proje_muh_oda_sicil_no ?? null,
      proje_muh_kayit_no: u.proje_muh_kayit_no ?? null,
      proje_muh_yetki_durumu: u.proje_muh_yetki_durumu ?? null,
      onay_muh_gdf_sicil_no: u.onay_muh_gdf_sicil_no ?? null,
      gaz_acma_muh_ekip_no: u.gaz_acma_muh_ekip_no ?? null,
    };

    const { error } = await sb.from('users').upsert(insertRow);
    if (error) throw error;
    idMap.set(u.slug, authId);
    console.log(`  ${u.adi}`);
  }

  // bagli_oldugu_yonetici_id - ikinci pass
  for (const u of USER_LIST) {
    if (!u.bagliSlug) continue;
    const id = idMap.get(u.slug);
    const yoneticiId = idMap.get(u.bagliSlug);
    if (id && yoneticiId) {
      await sb.from('users').update({ bagli_oldugu_yonetici_id: yoneticiId }).eq('id', id);
    }
  }

  return idMap;
}

async function seedPFs(gdfMap: Map<string, string>, userMap: Map<string, string>) {
  console.log('\n→ Proje Firmaları (PF)');
  const idMap = new Map<string, string>();
  for (const p of PF_LIST) {
    const { data, error } = await sb
      .from('proje_firmalari')
      .insert({
        firma_adi: p.firma_adi,
        firma_tel: p.firma_tel,
        firma_email: p.firma_email,
        vergi_dairesi: p.vergi_dairesi,
        vergi_no: p.vergi_no,
        adres: p.adres,
        yeterlilik_no: p.yeterlilik_no,
        yetkili_user_id: p.yetkiliSlug ? userMap.get(p.yetkiliSlug) ?? null : null,
      })
      .select('id')
      .single();
    if (error) throw error;
    idMap.set(p.slug, data.id);
    console.log(`  ${p.firma_adi}`);
    // pf_df junction
    for (const gs of p.gdfSlugs) {
      const df_id = gdfMap.get(gs);
      if (df_id) await sb.from('pf_df').insert({ pf_id: data.id, df_id });
    }
  }
  return idMap;
}

async function seedJunctions(
  userMap: Map<string, string>,
  pfMap: Map<string, string>,
  gdfMap: Map<string, string>,
) {
  console.log('\n→ Kullanıcı–Firma bağlantıları');
  for (const u of USER_LIST) {
    const userId = userMap.get(u.slug);
    if (!userId) continue;
    if (u.firma_kullanicisi) {
      for (const fs of u.firmaSlugs ?? []) {
        const pf_id = pfMap.get(fs);
        if (pf_id) await sb.from('user_pf').insert({ user_id: userId, pf_id }).select();
      }
    }
    if (u.gdf_kullanicisi) {
      for (const fs of u.firmaSlugs ?? []) {
        const df_id = gdfMap.get(fs);
        if (df_id) await sb.from('user_df').insert({ user_id: userId, df_id }).select();
      }
    }
  }
}

(async () => {
  try {
    await ensureAdmin();
    const gdfMap = await seedGDFs();
    const userMap = await seedUsers();
    const pfMap   = await seedPFs(gdfMap, userMap);
    await seedJunctions(userMap, pfMap, gdfMap);
    console.log('\n✔ Seed tamamlandı.');
    console.log(`  Giriş: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } catch (e) {
    console.error('\n✘ Hata:', e);
    process.exit(1);
  }
})();
