import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserForm } from '../user-form';
import { loadUserFormOptions } from '../user-form-data';
import { getUserKategori, type UserRow } from '@/lib/supabase/types';
import { sortByRolRank } from '@/lib/user-roles';

export const dynamic = 'force-dynamic';

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: user } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (!user) notFound();

  const [opts, upf, udf, subordinates] = await Promise.all([
    loadUserFormOptions(supabase),
    supabase.from('user_pf').select('pf_id, auto_inherit').eq('user_id', id),
    supabase.from('user_df').select('df_id, auto_inherit').eq('user_id', id),
    supabase.from('users').select('*').eq('bagli_oldugu_yonetici_id', id).order('adi'),
  ]);

  const yetkili_firma_ids = [
    ...(upf.data?.map((r) => r.pf_id) ?? []),
    ...(udf.data?.map((r) => r.df_id) ?? []),
  ];

  const auto_inherit_firma_ids = [
    ...((upf.data ?? []).filter((r) => r.auto_inherit).map((r) => r.pf_id)),
    ...((udf.data ?? []).filter((r) => r.auto_inherit).map((r) => r.df_id)),
  ];

  // Bu kullanıcıya bağlı kullanıcıların firmalarını yükle (isim listesi için).
  // Hiyerarşi: Üst Yönetici → Yönetici → diğer roller; her grup içinde ada göre.
  // opts zaten tüm PF/DF id→adı tutuyor; ayrı sorgu açmıyoruz.
  const subUsers = sortByRolRank((subordinates.data ?? []) as UserRow[]);
  const subUserIds = subUsers.map((u) => u.id);
  const pfNameById = new Map(opts.pfList.map((p) => [p.id, p.firma_adi]));
  const dfNameById = new Map(opts.dfList.map((d) => [d.id, d.firma_adi]));
  const subPfMap: Record<string, string[]> = {};
  const subDfMap: Record<string, string[]> = {};
  if (subUserIds.length > 0) {
    const [subUpf, subUdf] = await Promise.all([
      supabase.from('user_pf').select('user_id, pf_id').in('user_id', subUserIds),
      supabase.from('user_df').select('user_id, df_id').in('user_id', subUserIds),
    ]);
    (subUpf.data ?? []).forEach((r) => {
      const nm = pfNameById.get(r.pf_id);
      if (nm) (subPfMap[r.user_id] ??= []).push(nm);
    });
    (subUdf.data ?? []).forEach((r) => {
      const nm = dfNameById.get(r.df_id);
      if (nm) (subDfMap[r.user_id] ??= []).push(nm);
    });
  }

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
        initial={{ ...user, yetkili_firma_ids, auto_inherit_firma_ids }}
        pfList={opts.pfList}
        dfList={opts.dfList}
        candidateYoneticiler={opts.yoneticiler}
      />

      {subUsers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Bağlı Kullanıcılar ({subUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {subUsers.map((s) => {
                const kat = getUserKategori(s);
                const bolge = kat === 'pf' ? (subPfMap[s.id] ?? []) : (subDfMap[s.id] ?? []);
                const rol = subordinateRolEtiketi(s);
                return (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/users/${s.id}`} className="font-medium hover:underline">
                      {s.adi}
                    </Link>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {bolge.length > 0 && (
                        <span className="truncate" title={bolge.join(', ')}>
                          {bolge.join(', ')}
                        </span>
                      )}
                      {rol && (
                        <Badge
                          variant={rol.variant}
                          className={rol.className ? `${rol.className} text-[10px] font-normal` : 'text-[10px] font-normal'}
                        >
                          {rol.label}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Detay sayfasında "Bağlı Kullanıcılar" listesi için tek rozet üretir.
function subordinateRolEtiketi(u: UserRow): { label: string; variant: 'default' | 'secondary' | 'info' | 'success' | 'warning'; className?: string } | null {
  if (u.firma_yonetici) {
    return u.firma_yonetici_kademe === 'ust'
      ? { label: 'Üst Yönetici', variant: 'default', className: 'bg-emerald-700 text-white hover:bg-emerald-700' }
      : { label: 'Yönetici',     variant: 'default', className: 'bg-emerald-300 text-emerald-900 hover:bg-emerald-300' };
  }
  if (u.firma_proje_muhendisi)  return { label: 'Proje Müh.',   variant: 'info'    };
  if (u.firma_cizim_sorumlusu)  return { label: 'Çizim Sor.',   variant: 'success' };
  if (u.firma_tesisat_ustasi)   return { label: 'Tesisat Ust.', variant: 'warning' };
  if (u.gdf_yonetici) {
    return u.gdf_yonetici_kademe === 'ust'
      ? { label: 'Üst Yönetici', variant: 'default', className: 'bg-emerald-700 text-white hover:bg-emerald-700' }
      : { label: 'Yönetici',     variant: 'default', className: 'bg-emerald-300 text-emerald-900 hover:bg-emerald-300' };
  }
  if (u.gdf_onay_muhendisi)     return { label: 'Onay Müh.',    variant: 'info'    };
  if (u.gdf_gaz_acma_muhendisi) return { label: 'Gaz Açma',     variant: 'success' };
  if (u.gdf_on_buro_yetkilisi)  return { label: 'Ön Büro',      variant: 'warning' };
  return null;
}
