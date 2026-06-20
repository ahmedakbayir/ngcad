import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, Network } from 'lucide-react';
import { AttachUserSplitButton } from '@/components/attach-user-split-button';
import type { AttachUserOption } from '@/components/attach-user-dialog';
import { sortByRolRank, userRolRank } from '@/lib/user-roles';

export const dynamic = 'force-dynamic';

export default async function EditPFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: firm } = await supabase.from('proje_firmalari').select('*').eq('id', id).maybeSingle();
  if (!firm) notFound();

  // Yetkili kullanıcı adaylarını da kapsayacak şekilde: bu PF + (varsa) parent PF.
  const userPfIds = firm.parent_id ? [id, firm.parent_id] : [id];

  const [pf, df, usersLinked, children, allPfUsers, allUserPf, allUsersById] = await Promise.all([
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
    // "Mevcut Kullanıcı Ekle" havuzu: tüm PF kullanıcıları + rol/yetkili firma
    // hesaplaması için ihtiyaç duyulan flag'ler.
    supabase
      .from('users')
      .select(
        'id, adi, unvan, firma_yonetici, firma_yonetici_kademe, firma_proje_muhendisi, firma_cizim_sorumlusu, firma_tesisat_ustasi',
      )
      .eq('firma_kullanicisi', true)
      .order('adi'),
    // Aile filtresi için: her user'ın hangi PF'lere bağlı olduğu. Boşta + aile içi
    // user'lar listeye girer; başka aileye bağlı olanlar dışlanır.
    supabase.from('user_pf').select('user_id, pf_id'),
    // Üst Firma dropdown'unda yetkili adı yan yana göstermek için id→adi map.
    supabase.from('users').select('id, adi'),
  ]);
  const userAdiById = new Map<string, string>(
    ((allUsersById.data ?? []) as { id: string; adi: string }[]).map((u) => [u.id, u.adi]),
  );
  const parentListWithYetkili = ((pf.data ?? []) as {
    id: string;
    firma_adi: string;
    parent_id: string | null;
    ust_firma: boolean;
    yetkili_user_id: string | null;
  }[]).map((p) => ({
    ...p,
    yetkili_adi: p.yetkili_user_id ? userAdiById.get(p.yetkili_user_id) ?? null : null,
  }));

  const alt_firma_ids = (children.data ?? []).map((c) => c.id as string);
  // Sadece bu PF'e doğrudan bağlı user'lar — "Bağlı kullanıcılar" kartı için.
  // Hiyerarşi: Üst Yönetici → Yönetici → diğer roller; her grup içinde ada göre.
  const directLinks = (usersLinked.data ?? [])
    .filter((r) => (r as { pf_id: string }).pf_id === id)
    .sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ua: any = (a as unknown as { users: any }).users;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ub: any = (b as unknown as { users: any }).users;
      const ra = userRolRank(ua);
      const rb = userRolRank(ub);
      if (ra !== rb) return ra - rb;
      return (ua.adi as string).localeCompare(ub.adi as string, 'tr');
    });

  // Aile = root (parent_id varsa parent, yoksa kendisi) + root'un tüm child'ları.
  // "Diğer havuzu" filtresi için familyIds (aşağıda kullanılır) lazım.
  const rootId = firm.parent_id ?? id;
  const familyIds = new Set<string>([rootId]);
  ((pf.data ?? []) as { id: string; parent_id: string | null }[]).forEach((p) => {
    if (p.parent_id === rootId) familyIds.add(p.id);
  });

  // Yetkili Kullanıcı combobox listesi: SADECE bu firma + (varsa) parent firma'da
  // junction'a kayıtlı yöneticiler (kullanıcı kuralı). usersLinked.data zaten
  // user_pf JOIN sonucu — pf_id IN [this, parent]. Yöneticileri filtreleyip
  // dedupe ederiz; "Yeni / Diğer" zaten caret-dropdown'dan açılır.
  const yetkiliSeen = new Set<string>();
  const eligibleYetkililer: { id: string; adi: string; rolEtiketi: 'Üst Yönetici' | 'Yönetici' }[] =
    [];
  ((usersLinked.data ?? []) as unknown as {
    users: {
      id: string;
      adi: string;
      firma_yonetici: boolean;
      firma_yonetici_kademe: 'ust' | 'orta' | null;
    };
  }[]).forEach((r) => {
    const u = r.users;
    if (!u || !u.firma_yonetici) return;
    if (yetkiliSeen.has(u.id)) return;
    yetkiliSeen.add(u.id);
    eligibleYetkililer.push({
      id: u.id,
      adi: u.adi,
      rolEtiketi: u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici',
    });
  });
  // Mevcut yetkili (legacy: junction kaybolmuş olabilir) listede yoksa
  // ekstra fetch'siz allPfUsers içinde aranır — Select'te değer kaybolmasın.
  if (firm.yetkili_user_id && !yetkiliSeen.has(firm.yetkili_user_id)) {
    const u = ((allPfUsers.data ?? []) as {
      id: string;
      adi: string;
      firma_yonetici: boolean;
      firma_yonetici_kademe: 'ust' | 'orta' | null;
    }[]).find((x) => x.id === firm.yetkili_user_id);
    if (u) {
      eligibleYetkililer.push({
        id: u.id,
        adi: u.adi,
        rolEtiketi: u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici',
      });
    }
  }

  // "Mevcut Kullanıcı Ekle" combobox havuzu — bu PF'e doğrudan bağlı olmayan
  // PF kullanıcıları. user_id → yetkili olduğu PF firma adları haritası
  // pf.data üzerinden hesaplanır (yetkili_user_id eşleşmesi).
  const linkedUserIds = new Set(
    directLinks.map((r) => (r as unknown as { users: { id: string } }).users.id),
  );
  const yetkiliFirmsByUser = new Map<string, string[]>();
  ((pf.data ?? []) as { firma_adi: string; yetkili_user_id: string | null }[]).forEach((p) => {
    if (!p.yetkili_user_id) return;
    const arr = yetkiliFirmsByUser.get(p.yetkili_user_id) ?? [];
    arr.push(p.firma_adi);
    yetkiliFirmsByUser.set(p.yetkili_user_id, arr);
  });
  // user_id → bağlı olduğu PF id seti (aile kapsam filtresi için).
  // Kural: ya boşta (junction yok) ya da tüm bağlantıları familyIds içinde.
  const userPfSet = new Map<string, Set<string>>();
  ((allUserPf.data ?? []) as { user_id: string; pf_id: string }[]).forEach((r) => {
    const s = userPfSet.get(r.user_id) ?? new Set<string>();
    s.add(r.pf_id);
    userPfSet.set(r.user_id, s);
  });
  // Alt birim kartı için: her child PF'nin doğrudan bağlı kullanıcı listesi.
  // allUserPf + allPfUsers üzerinden tek geçişle çıkar — ek sorgu yok.
  type ChildUser = {
    id: string;
    adi: string;
    unvan: string | null;
    firma_yonetici: boolean;
    firma_yonetici_kademe: 'ust' | 'orta' | null;
    firma_proje_muhendisi: boolean;
    firma_cizim_sorumlusu: boolean;
    firma_tesisat_ustasi: boolean;
  };
  const pfUserById = new Map<string, ChildUser>(
    ((allPfUsers.data ?? []) as ChildUser[]).map((u) => [u.id, u]),
  );
  const childUserIdsByPf = new Map<string, string[]>();
  ((allUserPf.data ?? []) as { user_id: string; pf_id: string }[]).forEach((r) => {
    if (!pfUserById.has(r.user_id)) return;
    const arr = childUserIdsByPf.get(r.pf_id) ?? [];
    arr.push(r.user_id);
    childUserIdsByPf.set(r.pf_id, arr);
  });
  const childrenWithUsers = (children.data ?? []).map((c) => ({
    id: c.id as string,
    no: c.no as number,
    firma_adi: c.firma_adi as string,
    users: sortByRolRank(
      (childUserIdsByPf.get(c.id as string) ?? [])
        .map((uid) => pfUserById.get(uid))
        .filter((u): u is ChildUser => !!u),
    ),
  }));

  const availableAttachUsers: AttachUserOption[] = ((allPfUsers.data ?? []) as {
    id: string;
    adi: string;
    unvan: string | null;
    firma_yonetici: boolean;
    firma_yonetici_kademe: 'ust' | 'orta' | null;
    firma_proje_muhendisi: boolean;
    firma_cizim_sorumlusu: boolean;
    firma_tesisat_ustasi: boolean;
  }[])
    .filter((u) => !linkedUserIds.has(u.id))
    .filter((u) => {
      const links = userPfSet.get(u.id);
      if (!links || links.size === 0) return true; // boşta
      for (const fid of links) {
        if (!familyIds.has(fid)) return false; // aile dışı bağ var
      }
      return true; // tüm bağlar aile içi
    })
    .map((u) => {
      const rol = u.firma_yonetici
        ? u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici'
        : u.firma_proje_muhendisi
          ? 'Proje Müh.'
          : u.firma_cizim_sorumlusu
            ? 'Çizim Sor.'
            : u.firma_tesisat_ustasi
              ? 'Tesisat Ust.'
              : null;
      return {
        id: u.id,
        adi: u.adi,
        unvan: u.unvan,
        rolEtiketi: rol,
        yetkiliFirmalar: yetkiliFirmsByUser.get(u.id) ?? [],
      };
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
          {firm.ust_firma ? (
            <Badge variant="info" className="text-[10px]">ÜST FİRMA</Badge>
          ) : firm.parent_id ? (
            <Badge variant="secondary" className="text-[10px]">ALT FİRMA</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">TEKİL FİRMA</Badge>
          )}
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
        parentList={parentListWithYetkili}
        dfList={df.data ?? []}
        yetkiliUsers={eligibleYetkililer}
      />

      {(() => {
        const totalUserCount =
          directLinks.length +
          childrenWithUsers.reduce((sum, c) => sum + c.users.length, 0);
        return (
          <Card>
            <CardHeader className="flex flex-col gap-2 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Bağlı Kullanıcılar ({totalUserCount})
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <AttachUserSplitButton
                  kind="pf"
                  firmaId={firm.id}
                  firmaAdi={firm.firma_adi}
                  selfFirmaUsers={availableAttachUsers}
                  excludeUserIds={Array.from(linkedUserIds)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bu firmaya doğrudan bağlı user'lar. */}
              <div>
                {childrenWithUsers.length > 0 && (
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Bu firmada ({directLinks.length})
                  </p>
                )}
                {directLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
                ) : (
                  <ul className="divide-y">
                    {directLinks.map((r) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const u: any = r.users;
                      const rol = userRolEtiketi(u);
                      return (
                        <li
                          key={u.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <div className="min-w-0 leading-tight">
                            <Link
                              href={`/users/${u.id}`}
                              className="font-medium hover:underline"
                            >
                              {u.adi}
                            </Link>
                            {u.unvan && (
                              <span className="ml-1.5 text-[11px] italic text-muted-foreground">
                                · {u.unvan}
                              </span>
                            )}
                            <div className="text-[11px] text-muted-foreground">
                              {u.email}
                            </div>
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
              </div>

              {/* Alt birimler ve onların user'ları — ÜST FİRMA için. */}
              {childrenWithUsers.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Alt Birimler ({childrenWithUsers.length})
                  </p>
                  <ul className="space-y-2">
                    {childrenWithUsers.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-md border bg-muted/20 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <Network className="h-3.5 w-3.5 text-muted-foreground" />
                          <Link
                            href={`/firms/pf/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            #{c.no} {c.firma_adi}
                          </Link>
                          <span className="text-[11px] text-muted-foreground">
                            ({c.users.length} kullanıcı)
                          </span>
                        </div>
                        {c.users.length > 0 && (
                          <ul className="mt-1.5 space-y-0.5 pl-5">
                            {c.users.map((u) => {
                              const rol = userRolEtiketi(u);
                              return (
                                <li
                                  key={u.id}
                                  className="flex flex-wrap items-center gap-x-2 text-[12px]"
                                >
                                  <Link
                                    href={`/users/${u.id}`}
                                    className="font-medium hover:underline"
                                  >
                                    {u.adi}
                                  </Link>
                                  {u.unvan && (
                                    <span className="text-[10px] italic text-muted-foreground">
                                      {u.unvan}
                                    </span>
                                  )}
                                  {rol && (
                                    <Badge
                                      variant={rol.variant}
                                      className={
                                        rol.className
                                          ? `${rol.className} text-[9px]`
                                          : 'text-[9px]'
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
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}
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
