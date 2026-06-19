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

  // Yetkili kullanıcı adaylarını da kapsayacak şekilde: bu PF + (varsa) parent PF.
  const userPfIds = firm.parent_id ? [id, firm.parent_id] : [id];

  const [pf, df, usersLinked, children, pfYoneticileri] = await Promise.all([
    supabase
      .from('proje_firmalari')
      .select('id, firma_adi, parent_id, ust_firma, yetkili_user_id')
      .order('firma_adi'),
    supabase
      .from('dagitim_firmalari')
      .select('id, firma_adi, parent_id, ust_firma')
      .order('firma_adi'),
    supabase
      .from('user_pf')
      .select(`
        pf_id, user_id,
        users:users!inner(
          id, adi, email, unvan,
          firma_yonetici, firma_yonetici_kademe,
          firma_proje_muhendisi, firma_cizim_sorumlusu, firma_tesisat_ustasi,
          gdf_yonetici, gdf_yonetici_kademe,
          gdf_onay_muhendisi, gdf_gaz_acma_muhendisi, gdf_on_buro_yetkilisi
        )
      `)
      .in('pf_id', userPfIds),
    supabase
      .from('proje_firmalari')
      .select('id, no, firma_adi')
      .eq('parent_id', id)
      .order('firma_adi'),
    // Yetkili kullanıcı dropdown'u: tüm PF Yöneticileri (Üst veya Orta kademe).
    // Aile dışı filtre aşağıda uygulanır — başka aile parent'ının yetkilisi listeye
    // girmez.
    supabase
      .from('users')
      .select('id, adi, firma_yonetici_kademe')
      .eq('firma_kullanicisi', true)
      .eq('firma_yonetici', true)
      .order('adi'),
  ]);

  const alt_firma_ids = (children.data ?? []).map((c) => c.id as string);
  // Sadece bu PF'e doğrudan bağlı user'lar — "Bağlı kullanıcılar" kartı için.
  const directLinks = (usersLinked.data ?? []).filter((r) => (r as { pf_id: string }).pf_id === id);

  // Aile = root (parent_id varsa parent, yoksa kendisi) + root'un tüm child'ları.
  // Aile dışında bir PF'de yetkili olan user'lar dropdown'dan dışlanır.
  const rootId = firm.parent_id ?? id;
  const familyIds = new Set<string>([rootId]);
  ((pf.data ?? []) as { id: string; parent_id: string | null }[]).forEach((p) => {
    if (p.parent_id === rootId) familyIds.add(p.id);
  });
  const excludedYetkiliIds = new Set<string>();
  ((pf.data ?? []) as { id: string; yetkili_user_id: string | null }[]).forEach((p) => {
    if (p.yetkili_user_id && !familyIds.has(p.id)) {
      excludedYetkiliIds.add(p.yetkili_user_id);
    }
  });
  // Mevcut yetkili (legacy veri başka aileye atanmış olabilir) her zaman seçili
  // kalabilsin diye filtreden muaf tutulur.
  if (firm.yetkili_user_id) excludedYetkiliIds.delete(firm.yetkili_user_id);

  const eligibleYetkililer = ((pfYoneticileri.data ?? []) as {
    id: string;
    adi: string;
    firma_yonetici_kademe: 'ust' | 'orta' | null;
  }[])
    .filter((u) => !excludedYetkiliIds.has(u.id))
    .map((u) => ({
      id: u.id,
      adi: u.adi,
      rolEtiketi: (u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici') as 'Üst Yönetici' | 'Yönetici',
    }));

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
        initial={{
          ...firm,
          alt_firma_ids,
          hasChildren: (children.data?.length ?? 0) > 0,
        }}
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
            Bağlı kullanıcılar ({directLinks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {directLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
          ) : (
            <ul className="divide-y">
              {directLinks.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const u: any = r.users;
                const rol = userRolEtiketi(u);
                return (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="min-w-0 leading-tight">
                      <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                        {u.adi}
                      </Link>
                      {u.unvan && (
                        <span className="ml-1.5 text-[11px] italic text-muted-foreground">
                          · {u.unvan}
                        </span>
                      )}
                      <div className="text-[11px] text-muted-foreground">{u.email}</div>
                    </div>
                    {rol && (
                      <Badge
                        variant={rol.variant}
                        className={
                          rol.className
                            ? `${rol.className} shrink-0 text-[10px] font-normal`
                            : 'shrink-0 text-[10px] font-normal'
                        }
                      >
                        {rol.label}
                      </Badge>
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

// Tek birincil rol rozetini üretir (en yetkili rol kazanır).
type RolBadge = {
  label: string;
  variant: 'default' | 'secondary' | 'info' | 'success' | 'warning';
  className?: string;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function userRolEtiketi(u: any): RolBadge | null {
  if (u.firma_yonetici) {
    return u.firma_yonetici_kademe === 'ust'
      ? { label: 'Üst Yönetici', variant: 'default' }
      : { label: 'Yönetici',     variant: 'default', className: 'bg-primary/40 hover:bg-primary/40' };
  }
  if (u.firma_proje_muhendisi)  return { label: 'Proje Müh.',   variant: 'info'    };
  if (u.firma_cizim_sorumlusu)  return { label: 'Çizim Sor.',   variant: 'success' };
  if (u.firma_tesisat_ustasi)   return { label: 'Tesisat Ust.', variant: 'warning' };
  if (u.gdf_yonetici) {
    return u.gdf_yonetici_kademe === 'ust'
      ? { label: 'Üst Yönetici', variant: 'default' }
      : { label: 'Yönetici',     variant: 'default', className: 'bg-primary/40 hover:bg-primary/40' };
  }
  if (u.gdf_onay_muhendisi)     return { label: 'Onay Müh.',    variant: 'info'    };
  if (u.gdf_gaz_acma_muhendisi) return { label: 'Gaz Açma',     variant: 'success' };
  if (u.gdf_on_buro_yetkilisi)  return { label: 'Ön Büro',      variant: 'warning' };
  return null;
}
