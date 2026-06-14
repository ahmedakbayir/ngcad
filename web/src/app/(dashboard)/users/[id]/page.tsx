import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { UserForm } from '../user-form';
import { loadUserFormOptions } from '../user-form-data';

export const dynamic = 'force-dynamic';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: user } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (!user) notFound();

  const [opts, upf, udf] = await Promise.all([
    loadUserFormOptions(supabase),
    supabase.from('user_pf').select('pf_id').eq('user_id', id),
    supabase.from('user_df').select('df_id').eq('user_id', id),
  ]);

  const yetkili_firma_ids = [
    ...(upf.data?.map((r) => r.pf_id) ?? []),
    ...(udf.data?.map((r) => r.df_id) ?? []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/users"><ArrowLeft className="h-3 w-3" /> Kullanıcılar</Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{user.adi}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <UserForm
        mode="edit"
        initial={{ ...user, yetkili_firma_ids }}
        pfList={opts.pfList}
        dfList={opts.dfList}
        candidateYoneticiler={opts.yoneticiler}
      />
    </div>
  );
}
