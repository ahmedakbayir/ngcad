import { supabaseAdmin } from '@/lib/supabase/admin';

// user ↔ PF/DF junction tablolarını idempotent senkronize eder.
// Mode değişirse (PF↔DF), eski junction'lar temizlenir.
export async function syncFirmaJunctions(
  userId: string,
  isPF: boolean,
  isGDF: boolean,
  firmaIds: string[],
) {
  const admin = supabaseAdmin();
  await admin.from('user_pf').delete().eq('user_id', userId);
  await admin.from('user_df').delete().eq('user_id', userId);

  if (!firmaIds || firmaIds.length === 0) return;
  if (isPF) {
    await admin.from('user_pf').insert(firmaIds.map((pf_id) => ({ user_id: userId, pf_id })));
  } else if (isGDF) {
    await admin.from('user_df').insert(firmaIds.map((df_id) => ({ user_id: userId, df_id })));
  }
}
