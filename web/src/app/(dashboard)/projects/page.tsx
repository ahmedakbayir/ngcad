import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ProjectsTable } from './projects-table';

export const dynamic = 'force-dynamic';

export default async function ProjectsListPage() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('projects')
    .select('id, no, proje_adi, durum, created_at, updated_at, pf_id, df_id, owner_user_id, pf:proje_firmalari(firma_adi), df:dagitim_firmalari(firma_adi), owner:users(adi)')
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projeler</h1>
          <p className="text-sm text-muted-foreground">
            CAD çizimleri ve bağlı proje bilgileri.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new"><Plus className="h-4 w-4" /> Yeni Proje</Link>
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive">Veri çekilemedi: {error.message}</p>
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <ProjectsTable rows={(data ?? []) as any[]} />
      )}
    </div>
  );
}
