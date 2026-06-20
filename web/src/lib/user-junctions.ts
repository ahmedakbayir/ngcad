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

// Toplu versiyon: çok sayıda (userId, firmaId) çifti için autoAssign'ı tek
// seferde uygular. Bireysel çağrıdaki 2-3 round-trip'i firma adedinden bağımsız
// 3 sorguya indirir. autoAssignBagliYoneticiFromFirma ile aynı koşullar.
async function autoAssignBagliYoneticiBatch(
  admin: SupabaseClient,
  kind: 'pf' | 'df',
  pairs: Array<{ userId: string; firmaId: string }>,
): Promise<void> {
  if (pairs.length === 0) return;
  const firmTable = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';

  const firmaIds = Array.from(new Set(pairs.map((p) => p.firmaId)));
  const userIds = Array.from(new Set(pairs.map((p) => p.userId)));

  const [firmRes, userRes] = await Promise.all([
    admin.from(firmTable).select('id, yetkili_user_id').in('id', firmaIds),
    admin
      .from('users')
      .select(
        'id, bagli_oldugu_yonetici_id, firma_yonetici, firma_yonetici_kademe, gdf_yonetici, gdf_yonetici_kademe',
      )
      .in('id', userIds),
  ]);

  const yetkiliByFirma = new Map<string, string | null>();
  (firmRes.data ?? []).forEach((r: { id: string; yetkili_user_id: string | null }) => {
    yetkiliByFirma.set(r.id, r.yetkili_user_id ?? null);
  });

  type UserLite = {
    id: string;
    bagli_oldugu_yonetici_id: string | null;
    firma_yonetici: boolean | null;
    firma_yonetici_kademe: string | null;
    gdf_yonetici: boolean | null;
    gdf_yonetici_kademe: string | null;
  };
  const userById = new Map<string, UserLite>();
  (userRes.data ?? []).forEach((u: UserLite) => userById.set(u.id, u));

  // user_id → atanacak yetkili. Her user için tek karar — birden fazla çiftten
  // ilk uygun olanı kullanılır (kayda değer fark yok; her ikisi de firma yetkilisi).
  const updates = new Map<string, string>();
  for (const { userId, firmaId } of pairs) {
    if (updates.has(userId)) continue;
    const yetkili = yetkiliByFirma.get(firmaId);
    if (!yetkili || yetkili === userId) continue;
    const u = userById.get(userId);
    if (!u || u.bagli_oldugu_yonetici_id) continue;
    const isUst =
      (!!u.firma_yonetici && u.firma_yonetici_kademe === 'ust') ||
      (!!u.gdf_yonetici && u.gdf_yonetici_kademe === 'ust');
    if (isUst) continue;
    updates.set(userId, yetkili);
  }

  if (updates.size === 0) return;
  // Hedef yöneticiye göre grupla — Supabase tek update'te tek değer set
  // edebildiği için her yetkili için bir update.
  const byYetkili = new Map<string, string[]>();
  updates.forEach((yetkili, uid) => {
    const arr = byYetkili.get(yetkili) ?? [];
    arr.push(uid);
    byYetkili.set(yetkili, arr);
  });
  await Promise.all(
    Array.from(byYetkili.entries()).map(([yetkili, uids]) =>
      admin
        .from('users')
        .update({ bagli_oldugu_yonetici_id: yetkili })
        .in('id', uids),
    ),
  );
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

  // Parent'ın current alt birimleri + auto_inherit=true kullanıcıları paralel.
  const [childrenRes, inheritsRes] = await Promise.all([
    admin.from(table).select('id').eq('parent_id', parentFirmId),
    admin
      .from(junction)
      .select('user_id')
      .eq(firmCol, parentFirmId)
      .eq('auto_inherit', true),
  ]);
  const childIds = ((childrenRes.data ?? []) as { id: string }[]).map((c) => c.id);
  if (childIds.length === 0) return;
  const userIds = ((inheritsRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
  if (userIds.length === 0) return;

  const rows: Record<string, unknown>[] = [];
  const assignPairs: Array<{ userId: string; firmaId: string }> = [];
  for (const cid of childIds) {
    for (const uid of userIds) {
      rows.push({ user_id: uid, [firmCol]: cid, auto_inherit: false });
      assignPairs.push({ userId: uid, firmaId: cid });
    }
  }
  // ignoreDuplicates: var olan satırların auto_inherit'ini SAKIN değiştirme.
  await admin
    .from(junction)
    .upsert(rows, { onConflict: `user_id,${firmCol}`, ignoreDuplicates: true });

  // Yeni eklenen child junction'ları için bağlı yönetici otomatik ata — batch.
  await autoAssignBagliYoneticiBatch(admin, kind, assignPairs);
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
  // İki kanal delete + (varsa) forced üst-firma sorgusu paralel.
  const hasFirmas = firmaIds && firmaIds.length > 0;
  const forcedTable = isPF ? 'proje_firmalari' : isGDF ? 'dagitim_firmalari' : null;
  const forcedQuery =
    forcedTable && hasFirmas
      ? admin
          .from(forcedTable)
          .select('id')
          .in('id', firmaIds)
          .eq('ust_firma', true)
          .eq('yetkili_user_id', userId)
      : Promise.resolve({ data: [] as { id: string }[] });

  const [, , forcedRes] = await Promise.all([
    admin.from('user_pf').delete().eq('user_id', userId),
    admin.from('user_df').delete().eq('user_id', userId),
    forcedQuery,
  ]);

  if (!hasFirmas) return;
  const inheritSet = new Set(autoInheritFirmaIds);
  // ÜST FİRMA yetkili kullanıcısı için auto_inherit zorla true.
  // Why: Admin user formunda switch'i kapatsa bile kullanıcı bu üst firmanın
  // yetkili_user_id'si ise altına eklenecek yeni firmalardan otomatik
  // yetkilendirilmeli; aksi takdirde "yetkili olunan bölgeler" güncel kalmaz.
  ((forcedRes.data ?? []) as { id: string }[]).forEach((r) => inheritSet.add(r.id));

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
    // Üst firma reconcile + bu kullanıcının yetkili olduğu firmalardan bağlı
    // yönetici batch ataması paralel koşar.
    await Promise.all([
      ...Array.from(inheritSet).map((ustId) =>
        reconcileUstFirmaInherits(admin, kind, ustId),
      ),
      autoAssignBagliYoneticiBatch(
        admin,
        kind,
        firmaIds.map((firmaId) => ({ userId, firmaId })),
      ),
    ]);
  }
}
