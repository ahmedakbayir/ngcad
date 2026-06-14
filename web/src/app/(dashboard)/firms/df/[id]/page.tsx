import * as React from 'react';
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

  // Bağlı kullanıcıların DİĞER DF'lerini ve (varsa) PF'lerini yükle.
  const userIds = eligibleYetkililer.map((u) => u.id);
  type FirmRef = { id: string; firma_adi: string };
  const userOtherDfs: Record<string, FirmRef[]> = {};
  const userPfs: Record<string, FirmRef[]> = {};
  if (userIds.length > 0) {
    const [otherDfRes, pfRes] = await Promise.all([
      supabase
        .from('user_df')
        .select('user_id, dagitim_firmalari:dagitim_firmalari!inner(id, firma_adi)')
        .in('user_id', userIds)
        .neq('df_id', id),
      supabase
        .from('user_pf')
        .select('user_id, proje_firmalari:proje_firmalari!inner(id, firma_adi)')
        .in('user_id', userIds),
    ]);
    (otherDfRes.data ?? []).forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = r.dagitim_firmalari;
      (userOtherDfs[r.user_id as string] ??= []).push({ id: d.id, firma_adi: d.firma_adi });
    });
    (pfRes.data ?? []).forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = r.proje_firmalari;
      (userPfs[r.user_id as string] ??= []).push({ id: p.id, firma_adi: p.firma_adi });
    });
  }

  // Bağlı PF'lerin (pf_df üzerinden) hangi DİĞER DF'lerle ilişkili olduğunu yükle.
  const pfIds = (pfLinked.data ?? []).map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = r.proje_firmalari;
    return p.id as string;
  });
  const pfOtherDfs: Record<string, FirmRef[]> = {};
  if (pfIds.length > 0) {
    const { data: pfdfAll } = await supabase
      .from('pf_df')
      .select('pf_id, dagitim_firmalari:dagitim_firmalari!inner(id, firma_adi)')
      .in('pf_id', pfIds)
      .neq('df_id', id);
    (pfdfAll ?? []).forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = r.dagitim_firmalari;
      (pfOtherDfs[r.pf_id as string] ??= []).push({ id: d.id, firma_adi: d.firma_adi });
    });
  }

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
                  const otherDfs = userOtherDfs[u.id] ?? [];
                  const pfs = userPfs[u.id] ?? [];
                  return (
                    <li key={u.id} className="py-2 text-sm">
                      <Link href={`/users/${u.id}`} className="hover:underline">
                        {u.adi} <span className="text-muted-foreground">— {u.email}</span>
                      </Link>
                      {(otherDfs.length > 0 || pfs.length > 0) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                          {otherDfs.length > 0 && (
                            <span>
                              Diğer DF:{' '}
                              {otherDfs.map((d, i) => (
                                <React.Fragment key={d.id}>
                                  {i > 0 && ', '}
                                  <Link href={`/firms/df/${d.id}`} className="hover:underline">{d.firma_adi}</Link>
                                </React.Fragment>
                              ))}
                            </span>
                          )}
                          {pfs.length > 0 && (
                            <span>
                              PF:{' '}
                              {pfs.map((p, i) => (
                                <React.Fragment key={p.id}>
                                  {i > 0 && ', '}
                                  <Link href={`/firms/pf/${p.id}`} className="hover:underline">{p.firma_adi}</Link>
                                </React.Fragment>
                              ))}
                            </span>
                          )}
                        </div>
                      )}
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
                  const otherDfs = pfOtherDfs[p.id] ?? [];
                  return (
                    <li key={p.id} className="py-2 text-sm">
                      <Link href={`/firms/pf/${p.id}`} className="hover:underline">
                        #{p.no} {p.firma_adi}
                      </Link>
                      {otherDfs.length > 0 && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          Diğer DF:{' '}
                          {otherDfs.map((d, i) => (
                            <React.Fragment key={d.id}>
                              {i > 0 && ', '}
                              <Link href={`/firms/df/${d.id}`} className="hover:underline">{d.firma_adi}</Link>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
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
