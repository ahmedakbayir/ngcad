import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { FirmaTable } from '@/components/firma-table';
import type { FirmaRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function PFListPage() {
  const supabase = await supabaseServer();
  const [pfRes, dfRes, usersRes] = await Promise.all([
    supabase.from('proje_firmalari').select('*').order('firma_adi'),
    supabase.from('dagitim_firmalari').select('id, firma_adi, parent_id').order('firma_adi'),
    supabase.from('users').select('id, adi'),
  ]);

  const error = pfRes.error;
  const dfRows = (dfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[];
  const dfById = new Map(dfRows.map((d) => [d.id, d]));

  // Tek-DF modeli: her PF için tek elemanlı (veya boş) DF listesi.
  const pfDfMap: Record<string, { id: string; firma_adi: string; parent_id: string | null }[]> = {};
  ((pfRes.data ?? []) as { id: string; df_id: string | null }[]).forEach((p) => {
    if (!p.df_id) return;
    const df = dfById.get(p.df_id);
    if (!df) return;
    pfDfMap[p.id] = [df];
  });

  const yetkiliUserById: Record<string, { id: string; adi: string }> = {};
  (usersRes.data ?? []).forEach((u) => {
    yetkiliUserById[u.id] = { id: u.id, adi: u.adi };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proje Firmaları (PF)</h1>
        </div>
        <Button asChild>
          <Link href="/firms/pf/new"><Plus className="h-4 w-4" /> Yeni PF</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Veri çekilemedi: {error.message}</p>
      ) : (
        <FirmaTable
          firmas={(pfRes.data ?? []) as FirmaRow[]}
          basePath="/firms/pf"
          pfDfMap={pfDfMap}
          dfMaster={dfRows.map((d) => ({ id: d.id, parent_id: d.parent_id }))}
          yetkiliUserById={yetkiliUserById}
        />
      )}
    </div>
  );
}
