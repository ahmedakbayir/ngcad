import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Building2, Network } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default async function EditDFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: firm } = await supabase.from('dagitim_firmalari').select('*').eq('id', id).maybeSingle();
  if (!firm) notFound();

  const [df, usersLinked, pfLinked, children] = await Promise.all([
    supabase.from('dagitim_firmalari').select('id, firma_adi').order('firma_adi'),
    supabase
      .from('user_df')
      .select('user_id, users:users!inner(id, adi, email)')
      .eq('df_id', id),
    supabase
      .from('pf_df')
      .select('pf_id, proje_firmalari:proje_firmalari!inner(id, firma_adi, no)')
      .eq('df_id', id),
    supabase
      .from('dagitim_firmalari')
      .select('id, no, firma_adi')
      .eq('parent_id', id)
      .order('firma_adi'),
  ]);

  const eligibleYetkililer = (usersLinked.data ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u: any = r.users;
    return { id: u.id as string, adi: u.adi as string };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/firms/df"><ArrowLeft className="h-3 w-3" /> Dağıtım Firmaları</Link>
      </Button>

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{firm.firma_adi}</h1>
        <Badge variant="outline">#{firm.no}</Badge>
      </div>

      <FirmForm
        kind="df"
        mode="edit"
        initial={firm}
        parentList={df.data ?? []}
        yetkiliUsers={eligibleYetkililer}
      />

      {(children.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="h-4 w-4" />
              Alt Bölgeler ({children.data!.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {children.data!.map((c) => (
                <li key={c.id} className="py-2 text-sm">
                  <Link href={`/firms/df/${c.id}`} className="hover:underline">
                    #{c.no} {c.firma_adi}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Bağlı kullanıcılar ({usersLinked.data?.length ?? 0})
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
                    <li key={u.id} className="py-2 text-sm">
                      <Link href={`/users/${u.id}`} className="hover:underline">
                        {u.adi} <span className="text-muted-foreground">— {u.email}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Bağlı Proje Firmaları ({pfLinked.data?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!pfLinked.data || pfLinked.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Henüz PF bağlı değil.</p>
            ) : (
              <ul className="divide-y">
                {pfLinked.data.map((r) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const p: any = r.proje_firmalari;
                  return (
                    <li key={p.id} className="py-2 text-sm">
                      <Link href={`/firms/pf/${p.id}`} className="hover:underline">
                        #{p.no} {p.firma_adi}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
