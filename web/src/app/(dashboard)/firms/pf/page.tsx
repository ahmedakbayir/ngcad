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
  // ÜST PF için kendi df_id'si null olur; child PF'lerin distinct df-root'larından
  // türeyen "Bağlı DF" gösterilir (tek root ise o DF, çoklu root ise "KARMA").
  const pfRows = (pfRes.data ?? []) as {
    id: string;
    df_id: string | null;
    parent_id: string | null;
    ust_firma: boolean;
  }[];
  // DF root = DF'nin parent_id varsa parent, yoksa kendisi.
  const dfRootOf = (dfId: string): string => {
    const d = dfById.get(dfId);
    if (!d) return dfId;
    return d.parent_id ?? d.id;
  };
  const pfDfMap: Record<string, { id: string; firma_adi: string; parent_id: string | null }[]> = {};
  // Önce tek-DF ataması (standart PF + alt PF).
  pfRows.forEach((p) => {
    if (!p.df_id) return;
    const df = dfById.get(p.df_id);
    if (!df) return;
    pfDfMap[p.id] = [df];
  });
  // ÜST PF'ler için child'ların distinct df-root'larını topla.
  pfRows
    .filter((p) => p.ust_firma)
    .forEach((parent) => {
      const childDfIds = pfRows
        .filter((c) => c.parent_id === parent.id && c.df_id)
        .map((c) => c.df_id as string);
      const distinctRoots = new Set<string>();
      childDfIds.forEach((did) => distinctRoots.add(dfRootOf(did)));
      const arr = Array.from(distinctRoots)
        .map((rid) => dfById.get(rid))
        .filter((d): d is { id: string; firma_adi: string; parent_id: string | null } => !!d);
      if (arr.length > 0) pfDfMap[parent.id] = arr;
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
          compact
        />
      )}
    </div>
  );
}
