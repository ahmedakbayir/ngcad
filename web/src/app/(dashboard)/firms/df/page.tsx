import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { FirmaTable } from '@/components/firma-table';
import type { FirmaRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function DFListPage() {
  const supabase = await supabaseServer();
  const [{ data, error }, usersRes] = await Promise.all([
    supabase.from('dagitim_firmalari').select('*').order('firma_adi'),
    supabase.from('users').select('id, adi'),
  ]);

  const yetkiliUserById: Record<string, { id: string; adi: string }> = {};
  (usersRes.data ?? []).forEach((u) => {
    yetkiliUserById[u.id] = { id: u.id, adi: u.adi };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dağıtım Firmaları (DF)</h1>
        </div>
        <Button asChild>
          <Link href="/firms/df/new"><Plus className="h-4 w-4" /> Yeni DF</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Veri çekilemedi: {error.message}</p>
      ) : (
        <FirmaTable
          firmas={(data ?? []) as FirmaRow[]}
          basePath="/firms/df"
          compact
          yetkiliUserById={yetkiliUserById}
        />
      )}
    </div>
  );
}
