import * as React from 'react';
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
    supabase.from('dagitim_firmalari').select('id, firma_adi, parent_id').order('firma_adi'),
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

  // Bu PF'e bağlı her user'ın DİĞER firmalarını (PF/DF) yükle — listede bağlam göster.
  const userIds = eligibleYetkililer.map((u) => u.id);
  type FirmRef = { id: string; firma_adi: string };
  const userOtherPfs: Record<string, FirmRef[]> = {};
  const userDfs: Record<string, FirmRef[]> = {};
  if (userIds.length > 0) {
    const [otherPfRes, dfRes] = await Promise.all([
      supabase
        .from('user_pf')
        .select('user_id, proje_firmalari:proje_firmalari!inner(id, firma_adi)')
        .in('user_id', userIds)
        .neq('pf_id', id),
      supabase
        .from('user_df')
        .select('user_id, dagitim_firmalari:dagitim_firmalari!inner(id, firma_adi)')
        .in('user_id', userIds),
    ]);
    (otherPfRes.data ?? []).forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = r.proje_firmalari;
      (userOtherPfs[r.user_id as string] ??= []).push({ id: p.id, firma_adi: p.firma_adi });
    });
    (dfRes.data ?? []).forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d: any = r.dagitim_firmalari;
      (userDfs[r.user_id as string] ??= []).push({ id: d.id, firma_adi: d.firma_adi });
    });
  }

  // Bu PF'in bağlı DF'leri (sayfada ayrıca gösterilecek)
  const dfAdById = new Map(((df.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[])
    .map((d) => [d.id, d.firma_adi]));
  const linkedDfAdlari = df_ids.map((id) => dfAdById.get(id)).filter(Boolean) as string[];

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
          {linkedDfAdlari.length > 0 && (
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <div>Bağlı DF:</div>
              {linkedDfAdlari.map((ad) => (
                <div key={ad}>{ad}</div>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!usersLinked.data || usersLinked.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
          ) : (
            <ul className="divide-y">
              {usersLinked.data.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const u: any = r.users;
                const otherPfs = userOtherPfs[u.id] ?? [];
                const dfs = userDfs[u.id] ?? [];
                return (
                  <li key={u.id} className="py-2">
                    <Link href={`/users/${u.id}`} className="text-sm hover:underline">
                      {u.adi} <span className="text-muted-foreground">— {u.email}</span>
                    </Link>
                    {(otherPfs.length > 0 || dfs.length > 0) && (
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        {otherPfs.length > 0 && (
                          <span>
                            Diğer PF:{' '}
                            {otherPfs.map((p, i) => (
                              <React.Fragment key={p.id}>
                                {i > 0 && ', '}
                                <Link href={`/firms/pf/${p.id}`} className="hover:underline">{p.firma_adi}</Link>
                              </React.Fragment>
                            ))}
                          </span>
                        )}
                        {dfs.length > 0 && (
                          <span>
                            DF:{' '}
                            {dfs.map((d, i) => (
                              <React.Fragment key={d.id}>
                                {i > 0 && ', '}
                                <Link href={`/firms/df/${d.id}`} className="hover:underline">{d.firma_adi}</Link>
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
    </div>
  );
}
