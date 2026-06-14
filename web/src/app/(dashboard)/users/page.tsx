import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { UsersTable } from './users-table';
import type { UserRow } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function UsersListPage() {
  const supabase = await supabaseServer();
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);

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

      <UsersTable users={(users ?? []) as UserRow[]} />
    </div>
  );
}
