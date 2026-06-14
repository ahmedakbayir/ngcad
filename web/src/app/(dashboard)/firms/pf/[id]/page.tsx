import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Network } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function EditPFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: firm } = await supabase.from('proje_firmalari').select('*').eq('id', id).maybeSingle();
  if (!firm) notFound();

  const [pf, df, pfdf, usersLinked, children] = await Promise.all([
    supabase.from('proje_firmalari').select('id, firma_adi').order('firma_adi'),
    supabase.from('dagitim_firmalari').select('id, firma_adi').order('firma_adi'),
    supabase.from('pf_df').select('df_id').eq('pf_id', id),
    supabase
      .from('user_pf')
      .select('user_id, users:users!inner(id, adi, email)')
      .eq('pf_id', id),
    supabase
      .from('proje_firmalari')
      .select('id, no, firma_adi')
      .eq('parent_id', id)
      .order('firma_adi'),
  ]);

  const df_ids = pfdf.data?.map((r) => r.df_id) ?? [];
  // Bu PF'e bağlı user'lar → "Yetkili Kullanıcı" select'inde sadece bunlar aday.
  const eligibleYetkililer = (usersLinked.data ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = r.users;
    return { id: u.id as string, adi: u.adi as string };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/firms/pf"><ArrowLeft className="h-3 w-3" /> Proje Firmaları</Link>
      </Button>

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{firm.firma_adi}</h1>
          <Badge variant="outline">#{firm.no}</Badge>
        </div>
      </div>

      <FirmForm
        kind="pf"
        mode="edit"
        initial={{ ...firm, df_ids }}
        parentList={pf.data ?? []}
        dfList={df.data ?? []}
        yetkiliUsers={eligibleYetkililer}
      />

      {(children.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Alt Birimler ({children.data!.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {children.data!.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <Link href={`/firms/pf/${c.id}`} className="hover:underline">
                    #{c.no} {c.firma_adi}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Bu firmaya bağlı kullanıcılar ({usersLinked.data?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!usersLinked.data || usersLinked.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
          ) : (
            <ul className="divide-y">
              {usersLinked.data.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const u: any = r.users;
                return (
                  <li key={u.id} className="py-2">
                    <Link href={`/users/${u.id}`} className="text-sm hover:underline">
                      {u.adi} <span className="text-muted-foreground">— {u.email}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
