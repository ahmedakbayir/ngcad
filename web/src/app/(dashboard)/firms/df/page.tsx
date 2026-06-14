import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { FirmaTable } from '@/components/firma-table';
import type { FirmaRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function DFListPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('dagitim_firmalari')
    .select('*')
    .order('firma_adi');

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dağıtım Firmaları (DF / GDF)</h1>
          <p className="text-sm text-muted-foreground">
            Bölgesel gaz dağıtım firmaları (İGDAŞ, AKMERCAN GEPA, ÇORUH GAZ vb.).
          </p>
        </div>
        <Button asChild>
          <Link href="/firms/df/new"><Plus className="h-4 w-4" /> Yeni DF</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Veri çekilemedi: {error.message}</p>
      ) : (
        <FirmaTable firmas={(data ?? []) as FirmaRow[]} basePath="/firms/df" />
      )}
    </div>
  );
}
