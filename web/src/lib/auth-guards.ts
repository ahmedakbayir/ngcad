import { supabaseServer } from '@/lib/supabase/server';

export async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: 'Oturum yok' };

  const { data: row } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!row?.is_admin) return { ok: false as const, status: 403, error: 'Yetkisiz (admin gerekli)' };
  return { ok: true as const, user };
}
