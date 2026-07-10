import { supabaseServer } from '@/lib/supabase/server';
import { UsersTable } from './users-table';
import type { UserRow } from '@/lib/supabase/types';
import { getFirmLinkAccess } from '@/lib/firm-link-access';

export const dynamic = 'force-dynamic';

export default async function UsersListPage() {
  const supabase = await supabaseServer();
  const { canLinkPf, canLinkDf } = await getFirmLinkAccess();
  const [usersRes, pfRes, dfRes, upfRes, udfRes] = await Promise.all([
    supabase.from('users').select('*').order('created_at', { ascending: false }).limit(1000),
    supabase.from('proje_firmalari').select('id, firma_adi, parent_id, df_id'),
    supabase.from('dagitim_firmalari').select('id, firma_adi, parent_id'),
    supabase.from('user_pf').select('user_id, pf_id'),
    supabase.from('user_df').select('user_id, df_id'),
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

  const pfRows = (pfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null; df_id: string | null }[];
  const dfRows = (dfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[];
  const pfById = new Map(pfRows.map((p) => [p.id, p]));
  const dfById = new Map(dfRows.map((d) => [d.id, d]));

  type FirmRef = { id: string; firma_adi: string; parent_id: string | null };
  // Tek-DF modeli: her PF için en fazla bir DF.
  const pfToDfs: Record<string, FirmRef[]> = {};
  pfRows.forEach((p) => {
    if (!p.df_id) return;
    const df = dfById.get(p.df_id);
    if (!df) return;
    pfToDfs[p.id] = [df];
  });

  const userPfMap: Record<string, (FirmRef & { dfs: FirmRef[] })[]> = {};
  (upfRes.data ?? []).forEach((r) => {
    const pf = pfById.get(r.pf_id);
    if (!pf) return;
    (userPfMap[r.user_id] ??= []).push({ ...pf, dfs: pfToDfs[pf.id] ?? [] });
  });

  const userDfMap: Record<string, FirmRef[]> = {};
  (udfRes.data ?? []).forEach((r) => {
    const df = dfById.get(r.df_id);
    if (!df) return;
    (userDfMap[r.user_id] ??= []).push(df);
  });

  // Yönetici lookup: user_id → { id, adi }
  const users = (usersRes.data ?? []) as UserRow[];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const managerByUserId: Record<string, { id: string; adi: string }> = {};
  users.forEach((u) => {
    if (!u.bagli_oldugu_yonetici_id) return;
    const m = usersById.get(u.bagli_oldugu_yonetici_id);
    if (m) managerByUserId[u.id] = { id: m.id, adi: m.adi };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <UsersTable
        users={users}
        userPfMap={userPfMap}
        userDfMap={userDfMap}
        pfMaster={pfRows.map((p) => ({ id: p.id, parent_id: p.parent_id }))}
        dfMaster={dfRows.map((d) => ({ id: d.id, parent_id: d.parent_id }))}
        managerByUserId={managerByUserId}
        dfList={dfRows.map((d) => ({ id: d.id, firma_adi: d.firma_adi, parent_id: d.parent_id }))}
        canLinkPf={canLinkPf}
        canLinkDf={canLinkDf}
      />
    </div>
  );
}
