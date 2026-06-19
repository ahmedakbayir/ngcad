import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Bir kullanıcı bir firmaya eklendiğinde otomatik olarak o firmanın yetkili
// kullanıcısına bağlı yönetici olarak atanır.
// Atama yapılır iff:
//   - firma.yetkili_user_id mevcut ve user ≠ yetkili
//   - user.bagli_oldugu_yonetici_id şu an null (admin manuel atamasını ezme)
//   - user Üst Yönetici DEĞİL (hiyerarşinin tepesi, kendisine bağlı yönetici olmaz)
// Why: kullanıcı raporu — bir firmaya yetkili tanımlanmışsa, ekibe sonradan
// eklenen herkes default olarak o yetkiliye bağlanmalı; her kanal/rol için aynı.
export async function autoAssignBagliYoneticiFromFirma(
  admin: SupabaseClient,
  userId: string,
  kind: 'pf' | 'df',
  firmaId: string,
): Promise<void> {
  const firmTable = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';

  const { data: firmRow } = await admin
    .from(firmTable)
    .select('yetkili_user_id')
    .eq('id', firmaId)
    .single();
  const yetkiliUserId = (firmRow as { yetkili_user_id?: string | null } | null)?.yetkili_user_id;
  if (!yetkiliUserId || yetkiliUserId === userId) return;

  const { data: userRow } = await admin
    .from('users')
    .select(
      'bagli_oldugu_yonetici_id, firma_yonetici, firma_yonetici_kademe, gdf_yonetici, gdf_yonetici_kademe',
    )
    .eq('id', userId)
    .single();
  const u = userRow as {
    bagli_oldugu_yonetici_id?: string | null;
    firma_yonetici?: boolean;
    firma_yonetici_kademe?: string | null;
    gdf_yonetici?: boolean;
    gdf_yonetici_kademe?: string | null;
  } | null;
  if (!u) return;
  if (u.bagli_oldugu_yonetici_id) return;
  const isUst =
    (!!u.firma_yonetici && u.firma_yonetici_kademe === 'ust') ||
    (!!u.gdf_yonetici && u.gdf_yonetici_kademe === 'ust');
  if (isUst) return;

  await admin
    .from('users')
    .update({ bagli_oldugu_yonetici_id: yetkiliUserId })
    .eq('id', userId);
}

// Verilen firma (parent olabilir veya child olabilir) için auto-inherit cascade
// durumunu tutarlı hale getirir. Çağrı senaryoları:
// - firma POST/PATCH sonrası: alt firma sayısı veya yetkili kullanıcı değiştiyse
// - üst firma yetkilisi atandığında: tüm child'lar otomatik bağlansın
//
// Algoritma: BU firmanın auto_inherit=true olan user'larını bul (var ise üst
// firma yetkilileri); BU firmanın tüm current child'larını bul; her (user,
// child) çifti için junction satırı yoksa auto_inherit=false ile ekle. Mevcut
// satırların auto_inherit değerini DEĞİŞTİRMEZ — ignoreDuplicates kullanır.
export async function reconcileUstFirmaInherits(
  admin: SupabaseClient,
  kind: 'pf' | 'df',
  parentFirmId: string,
): Promise<void> {
  const junction = kind === 'pf' ? 'user_pf' : 'user_df';
  const firmCol = kind === 'pf' ? 'pf_id' : 'df_id';
  const table = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';

  // Parent'ın current alt birimleri.
  const { data: children } = await admin
    .from(table)
    .select('id')
    .eq('parent_id', parentFirmId);
  const childIds = ((children ?? []) as { id: string }[]).map((c) => c.id);
  if (childIds.length === 0) return;

  // Parent'ın auto_inherit=true olan kullanıcıları.
  const { data: inherits } = await admin
    .from(junction)
    .select('user_id')
    .eq(firmCol, parentFirmId)
    .eq('auto_inherit', true);
  const userIds = ((inherits ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (userIds.length === 0) return;

  const rows: Record<string, unknown>[] = [];
  for (const cid of childIds) {
    for (const uid of userIds) {
      rows.push({ user_id: uid, [firmCol]: cid, auto_inherit: false });
    }
  }
  // ignoreDuplicates: var olan satırların auto_inherit'ini SAKIN değiştirme.
  await admin
    .from(junction)
    .upsert(rows, { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true });

  // Yeni eklenen child junction'ları için bağlı yönetici otomatik ata.
  // Helper idempotent — mevcut bagli/Üst Yönetici durumu atamayı no-op yapar.
  for (const cid of childIds) {
    for (const uid of userIds) {
      await autoAssignBagliYoneticiFromFirma(admin, uid, kind, cid);
    }
  }
}

// user ↔ PF/DF junction tablolarını idempotent senkronize eder.
// Mode değişirse (PF↔DF), eski junction'lar temizlenir.
// autoInheritFirmaIds: bu kullanıcı için auto_inherit=true olacak parent firma id'leri.
export async function syncFirmaJunctions(
  userId: string,
  isPF: boolean,
  isGDF: boolean,
  firmaIds: string[],
  autoInheritFirmaIds: string[] = [],
) {
  const admin = supabaseAdmin();
  await admin.from('user_pf').delete().eq('user_id', userId);
  await admin.from('user_df').delete().eq('user_id', userId);

  if (!firmaIds || firmaIds.length === 0) return;
  const inheritSet = new Set(autoInheritFirmaIds);

  // ÜST FİRMA yetkili kullanıcısı için auto_inherit zorla true.
  // Why: Admin user formunda switch'i kapatsa bile kullanıcı bu üst firmanın
  // yetkili_user_id'si ise altına eklenecek yeni firmalardan otomatik
  // yetkilendirilmeli; aksi takdirde "yetkili olunan bölgeler" güncel kalmaz.
  if (isPF) {
    const { data: forced } = await admin
      .from('proje_firmalari')
      .select('id')
      .in('id', firmaIds)
      .eq('ust_firma', true)
      .eq('yetkili_user_id', userId);
    (forced ?? []).forEach((r: { id: string }) => inheritSet.add(r.id));
  } else if (isGDF) {
    const { data: forced } = await admin
      .from('dagitim_firmalari')
      .select('id')
      .in('id', firmaIds)
      .eq('ust_firma', true)
      .eq('yetkili_user_id', userId);
    (forced ?? []).forEach((r: { id: string }) => inheritSet.add(r.id));
  }

  if (isPF) {
    const { error } = await admin.from('user_pf').insert(
      firmaIds.map((pf_id) => ({
        user_id: userId,
        pf_id,
        auto_inherit: inheritSet.has(pf_id),
      })),
    );
    if (error) throw new Error(`user_pf yazılamadı: ${error.message}`);
  } else if (isGDF) {
    const { error } = await admin.from('user_df').insert(
      firmaIds.map((df_id) => ({
        user_id: userId,
        df_id,
        auto_inherit: inheritSet.has(df_id),
      })),
    );
    if (error) throw new Error(`user_df yazılamadı: ${error.message}`);
  }

  // CASCADE TAMAMLAMA: auto_inherit=true olan her üst firma için, alt firmaların
  // junction'ını da garanti et. Why: user formu yüklendikten sonra eklenmiş
  // alt firmalar yetkili_firma_ids'te yoktu, bu yüzden delete+insert'te
  // kayboluyorlardı.
  const kind: 'pf' | 'df' | null = isPF ? 'pf' : isGDF ? 'df' : null;
  if (kind) {
    for (const ustId of inheritSet) {
      await reconcileUstFirmaInherits(admin, kind, ustId);
    }
    // BAĞLI YÖNETİCİ OTOMATİK ATAMA: kullanıcı her hangi bir firmaya eklendiyse
    // ve o firmanın yetkili'si varsa, bu kullanıcı (Üst Yönetici değilse +
    // bagli boşsa) firma yetkilisine bağlanır.
    for (const fid of firmaIds) {
      await autoAssignBagliYoneticiFromFirma(admin, userId, kind, fid);
    }
  }
}
