import { supabaseAdmin } from '@/lib/supabase/admin';

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
}
