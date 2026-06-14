import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { UsersTable } from './users-table';
import type { UserRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function UsersListPage() {
  const supabase = await supabaseServer();
  const [usersRes, pfRes, dfRes, upfRes, udfRes, pfDfRes] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('proje_firmalari').select('id, firma_adi'),
    supabase.from('dagitim_firmalari').select('id, firma_adi'),
    supabase.from('user_pf').select('user_id, pf_id'),
    supabase.from('user_df').select('user_id, df_id'),
    supabase.from('pf_df').select('pf_id, df_id'),
  ]);

  const error = usersRes.error;
  if (error) {
    return (
      <div className="mx-auto max-w-6xl space-y-2">
        <h1 className="text-2xl font-semibold">Kullanıcılar</h1>
        <p className="text-sm text-destructive">
          Veri çekilemedi: {error.message}
          <br />
          (Supabase yapılandırması veya RLS politikalarını kontrol edin.)
        </p>
      </div>
    );
  }

  const pfById = new Map(((pfRes.data ?? []) as { id: string; firma_adi: string }[]).map((p) => [p.id, p]));
  const dfById = new Map(((dfRes.data ?? []) as { id: string; firma_adi: string }[]).map((d) => [d.id, d]));

  const pfToDfs: Record<string, { id: string; firma_adi: string }[]> = {};
  (pfDfRes.data ?? []).forEach((r) => {
    const df = dfById.get(r.df_id);
    if (!df) return;
    (pfToDfs[r.pf_id] ??= []).push(df);
  });

  const userPfMap: Record<string, { id: string; firma_adi: string; dfs: { id: string; firma_adi: string }[] }[]> = {};
  (upfRes.data ?? []).forEach((r) => {
    const pf = pfById.get(r.pf_id);
    if (!pf) return;
    (userPfMap[r.user_id] ??= []).push({ ...pf, dfs: pfToDfs[pf.id] ?? [] });
  });

  const userDfMap: Record<string, { id: string; firma_adi: string }[]> = {};
  (udfRes.data ?? []).forEach((r) => {
    const df = dfById.get(r.df_id);
    if (!df) return;
    (userDfMap[r.user_id] ??= []).push(df);
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kullanıcılar</h1>
          <p className="text-sm text-muted-foreground">
            Admin, Proje Firması (PF), Dağıtım Firması (DF) ve genel kullanıcılar.
          </p>
        </div>
        <Button asChild>
          <Link href="/users/new">
            <Plus className="h-4 w-4" />
            Yeni Kullanıcı
          </Link>
        </Button>
      </div>

      <UsersTable
        users={(usersRes.data ?? []) as UserRow[]}
        userPfMap={userPfMap}
        userDfMap={userDfMap}
      />
    </div>
  );
}
