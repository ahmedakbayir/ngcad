import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { FirmaTable } from '@/components/firma-table';
import type { FirmaRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function PFListPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('proje_firmalari')
    .select('*')
    .order('firma_adi');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Proje Firmaları (PF)</h1>
          <p className="text-sm text-muted-foreground">
            Doğalgaz iç tesisat projelerini çizen/hazırlayan firmalar.
          </p>
        </div>
        <Button asChild>
          <Link href="/firms/pf/new"><Plus className="h-4 w-4" /> Yeni PF</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Veri çekilemedi: {error.message}</p>
      ) : (
        <FirmaTable firmas={(data ?? []) as FirmaRow[]} basePath="/firms/pf" />
      )}
    </div>
  );
}
