import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { UserForm } from '../user-form';
import { loadUserFormOptions } from '../user-form-data';

export const dynamic = 'force-dynamic';

export default async function NewUserPage() {
  const supabase = await supabaseServer();
  const opts = await loadUserFormOptions(supabase);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/users"><ArrowLeft className="h-3 w-3" /> Kullanıcılar</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Yeni Kullanıcı</h1>
        <p className="text-sm text-muted-foreground">
          Davet e-postası gönderilecek; kullanıcı şifresini kendisi belirler.
        </p>
      </div>

      <UserForm
        mode="create"
        pfList={opts.pfList}
        dfList={opts.dfList}
        candidateYoneticiler={opts.yoneticiler}
      />
    </div>
  );
}
