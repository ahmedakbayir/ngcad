import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Building2, Network } from 'lucide-react';
import { FirmForm } from '@/components/firm-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AttachUserSplitButton } from '@/components/attach-user-split-button';
import type { AttachUserOption } from '@/components/attach-user-dialog';
import { sortByRolRank, userRolRank } from '@/lib/user-roles';

export const dynamic = 'force-dynamic';

export default async function EditDFPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data: firm } = await supabase.from('dagitim_firmalari').select('*').eq('id', id).maybeSingle();
  if (!firm) notFound();

  // Kanal kilidi: DF detay sayfası yalnız admin VEYA DF kanalı yetkilisine açık.
  // PF kullanıcısı bağlı DF adını salt-okunur görür ama detayına GİREMEZ.
  // user_can_see_df yalnız user_df zincirini sayar (mig 012'deki via_pf'i İÇERMEZ),
  // dolayısıyla PF köprüsüyle gelen erişimi kapsamaz — tam istenen davranış.
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const { data: meRow } = authUser
    ? await supabase.from('users').select('is_admin, firma_kullanicisi').eq('id', authUser.id).maybeSingle()
    : { data: null };
  const isAdmin = Boolean(meRow?.is_admin);
  if (!isAdmin) {
    const { data: canSee } = await supabase.rpc('user_can_see_df', { p_id: id });
    if (!canSee) notFound();
  }
  // Alt PF linkleri: DF kullanıcısı PF detayına giremez → düz metin. Admin veya
  // PF kanalı (dual) kullanıcısı link görür.
  const canLinkPf = isAdmin || Boolean(meRow?.firma_kullanicisi);

  // Yetkili kullanıcı adaylarını da kapsayacak şekilde: bu DF + (varsa) parent DF.
  const userDfIds = firm.parent_id ? [id, firm.parent_id] : [id];

  const [df, usersLinked, pfLinked, children, allDfUsers, allUserDf, allUsersById, allPfRows] = await Promise.all([
    supabase
      .from('dagitim_firmalari')
      .select('id, firma_adi, parent_id, ust_firma, yetkili_user_id')
      .order('firma_adi'),
    supabase
      .from('user_df')
      .select(`
        df_id, user_id,
        users:users!inner(
          id, adi, email, unvan,
          firma_yonetici, firma_yonetici_kademe,
          firma_proje_muhendisi, firma_cizim_sorumlusu, firma_tesisat_ustasi,
          gdf_yonetici, gdf_yonetici_kademe,
          gdf_onay_muhendisi, gdf_gaz_acma_muhendisi, gdf_on_buro_yetkilisi
        )
      `)
      .in('df_id', userDfIds),
    supabase
      .from('proje_firmalari')
      .select('id, firma_adi, no, df_id')
      .eq('df_id', id)
      .order('firma_adi'),
    supabase
      .from('dagitim_firmalari')
      .select('id, no, firma_adi')
      .eq('parent_id', id)
      .order('firma_adi'),
    // "Mevcut Kullanıcı Ekle" havuzu: tüm DF kullanıcıları + rol/yetkili firma
    // hesaplaması için ihtiyaç duyulan flag'ler.
    supabase
      .from('users')
      .select(
        'id, adi, unvan, gdf_yonetici, gdf_yonetici_kademe, gdf_onay_muhendisi, gdf_gaz_acma_muhendisi, gdf_on_buro_yetkilisi',
      )
      .eq('gdf_kullanicisi', true)
      .order('adi'),
    // Aile filtresi: user_df junction üzerinden her user'ın bağlı olduğu DF setine
    // bakarak boşta + aile içi user'ları geçir.
    supabase.from('user_df').select('user_id, df_id'),
    // Üst Firma dropdown'unda yetkili adını yan yana göstermek için id→adi map.
    supabase.from('users').select('id, adi'),
    // ÜST DF için: alt bölgelere bağlı tüm PF'leri tek seferde al — alt bölge
    // satırının altında collaps olarak gösterilir. df_id, parent_id ile hangi
    // alt bölgenin altına gireceği belli olur.
    supabase
      .from('proje_firmalari')
      .select('id, firma_adi, no, df_id, parent_id, ust_firma')
      .not('df_id', 'is', null),
  ]);
  const userAdiById = new Map<string, string>(
    ((allUsersById.data ?? []) as { id: string; adi: string }[]).map((u) => [u.id, u.adi]),
  );
  const parentListWithYetkili = ((df.data ?? []) as {
    id: string;
    firma_adi: string;
    parent_id: string | null;
    ust_firma: boolean;
    yetkili_user_id: string | null;
  }[]).map((d) => ({
    ...d,
    yetkili_adi: d.yetkili_user_id ? userAdiById.get(d.yetkili_user_id) ?? null : null,
  }));

  // Sadece bu DF'ye doğrudan bağlı kullanıcılar — "Bağlı kullanıcılar" kartı için.
  // Hiyerarşi: Üst Yönetici → Yönetici → diğer roller; her grup içinde ada göre.
  const directLinks = (usersLinked.data ?? [])
    .filter((r) => (r as { df_id: string }).df_id === id)
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
  // "Diğer havuzu" filtresi için familyIds aşağıda kullanılır.
  const rootId = firm.parent_id ?? id;
  const familyIds = new Set<string>([rootId]);
  ((df.data ?? []) as { id: string; parent_id: string | null }[]).forEach((d) => {
    if (d.parent_id === rootId) familyIds.add(d.id);
  });

  // Yetkili Kullanıcı combobox listesi: SADECE bu firma + (varsa) parent firma'da
  // junction'a kayıtlı GDF yöneticileri (kullanıcı kuralı). usersLinked.data
  // zaten user_df JOIN — df_id IN [this, parent]. "Yeni / Diğer" caret-dropdown'dan.
  const yetkiliSeen = new Set<string>();
  const eligibleYetkililer: { id: string; adi: string; rolEtiketi: 'Üst Yönetici' | 'Yönetici' }[] =
    [];
  ((usersLinked.data ?? []) as unknown as {
    users: {
      id: string;
      adi: string;
      gdf_yonetici: boolean;
      gdf_yonetici_kademe: 'ust' | 'orta' | null;
    };
  }[]).forEach((r) => {
    const u = r.users;
    if (!u || !u.gdf_yonetici) return;
    if (yetkiliSeen.has(u.id)) return;
    yetkiliSeen.add(u.id);
    eligibleYetkililer.push({
      id: u.id,
      adi: u.adi,
      rolEtiketi: u.gdf_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici',
    });
  });
  // Legacy: yetkili junction'da yoksa allDfUsers'tan ekle — Select'te değer kaybolmasın.
  if (firm.yetkili_user_id && !yetkiliSeen.has(firm.yetkili_user_id)) {
    const u = ((allDfUsers.data ?? []) as {
      id: string;
      adi: string;
      gdf_yonetici: boolean;
      gdf_yonetici_kademe: 'ust' | 'orta' | null;
    }[]).find((x) => x.id === firm.yetkili_user_id);
    if (u) {
      eligibleYetkililer.push({
        id: u.id,
        adi: u.adi,
        rolEtiketi: u.gdf_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici',
      });
    }
  }

  // "Mevcut Kullanıcı Ekle" havuzu — bu DF'ye doğrudan bağlı olmayan DF user'ları.
  // user_id → yetkili olduğu DF firma adları haritası df.data üzerinden çıkar.
  const linkedUserIds = new Set(
    directLinks.map((r) => (r as unknown as { users: { id: string } }).users.id),
  );
  const yetkiliFirmsByUser = new Map<string, string[]>();
  ((df.data ?? []) as { firma_adi: string; yetkili_user_id: string | null }[]).forEach((d) => {
    if (!d.yetkili_user_id) return;
    const arr = yetkiliFirmsByUser.get(d.yetkili_user_id) ?? [];
    arr.push(d.firma_adi);
    yetkiliFirmsByUser.set(d.yetkili_user_id, arr);
  });
  // user_id → bağlı olduğu DF id seti (aile kapsam filtresi).
  // Kural: boşta (junction yok) ya da tüm bağlantıları familyIds içinde.
  const userDfSet = new Map<string, Set<string>>();
  ((allUserDf.data ?? []) as { user_id: string; df_id: string }[]).forEach((r) => {
    const s = userDfSet.get(r.user_id) ?? new Set<string>();
    s.add(r.df_id);
    userDfSet.set(r.user_id, s);
  });
  // Alt bölge kartı için: her child DF'nin doğrudan bağlı kullanıcı listesi.
  // allUserDf + allDfUsers üzerinden tek geçişte çıkar — ek sorgu yok.
  type ChildUser = {
    id: string;
    adi: string;
    unvan: string | null;
    gdf_yonetici: boolean;
    gdf_yonetici_kademe: 'ust' | 'orta' | null;
    gdf_onay_muhendisi: boolean;
    gdf_gaz_acma_muhendisi: boolean;
    gdf_on_buro_yetkilisi: boolean;
  };
  const dfUserById = new Map<string, ChildUser>(
    ((allDfUsers.data ?? []) as ChildUser[]).map((u) => [u.id, u]),
  );
  const childUserIdsByDf = new Map<string, string[]>();
  ((allUserDf.data ?? []) as { user_id: string; df_id: string }[]).forEach((r) => {
    if (!dfUserById.has(r.user_id)) return;
    const arr = childUserIdsByDf.get(r.df_id) ?? [];
    arr.push(r.user_id);
    childUserIdsByDf.set(r.df_id, arr);
  });
  // df_id → bağlı PF listesi (ÜST PF olanlar görünmez, child + standalone PF'ler).
  type LinkedPF = {
    id: string;
    no: number | null;
    firma_adi: string;
    parent_id: string | null;
    ust_firma: boolean;
    df_id: string | null;
  };
  const pfsByDf = new Map<string, LinkedPF[]>();
  ((allPfRows.data ?? []) as LinkedPF[]).forEach((p) => {
    if (!p.df_id || p.ust_firma) return;
    const arr = pfsByDf.get(p.df_id) ?? [];
    arr.push(p);
    pfsByDf.set(p.df_id, arr);
  });
  const childrenWithUsers = (children.data ?? []).map((c) => ({
    id: c.id as string,
    no: c.no as number,
    firma_adi: c.firma_adi as string,
    users: sortByRolRank(
      (childUserIdsByDf.get(c.id as string) ?? [])
        .map((uid) => dfUserById.get(uid))
        .filter((u): u is ChildUser => !!u),
    ),
    pfs: (pfsByDf.get(c.id as string) ?? []).sort((a, b) =>
      a.firma_adi.localeCompare(b.firma_adi, 'tr'),
    ),
  }));

  const availableAttachUsers: AttachUserOption[] = ((allDfUsers.data ?? []) as {
    id: string;
    adi: string;
    unvan: string | null;
    gdf_yonetici: boolean;
    gdf_yonetici_kademe: 'ust' | 'orta' | null;
    gdf_onay_muhendisi: boolean;
    gdf_gaz_acma_muhendisi: boolean;
    gdf_on_buro_yetkilisi: boolean;
  }[])
    .filter((u) => !linkedUserIds.has(u.id))
    .filter((u) => {
      const links = userDfSet.get(u.id);
      if (!links || links.size === 0) return true; // boşta
      for (const fid of links) {
        if (!familyIds.has(fid)) return false; // aile dışı bağ var
      }
      return true; // tüm bağlar aile içi
    })
    .map((u) => {
      const rol = u.gdf_yonetici
        ? u.gdf_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici'
        : u.gdf_onay_muhendisi
          ? 'Onay Müh.'
          : u.gdf_gaz_acma_muhendisi
            ? 'Gaz Açma'
            : u.gdf_on_buro_yetkilisi
              ? 'Ön Büro'
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
        <Link href="/firms/df"><ArrowLeft className="h-3 w-3" /> Dağıtım Firmaları</Link>
      </Button>

      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">{firm.firma_adi}</h1>
        <Badge variant="outline">#{firm.no}</Badge>
        {firm.ust_firma ? (
          <Badge variant="info" className="text-[10px]">ÜST FİRMA</Badge>
        ) : firm.parent_id ? (
          <Badge variant="secondary" className="text-[10px]">ALT BÖLGE</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">TEKİL FİRMA</Badge>
        )}
      </div>

      <FirmForm
        kind="df"
        mode="edit"
        initial={{
          ...firm,
          alt_firma_ids: (children.data ?? []).map((c) => c.id as string),
          hasChildren: (children.data?.length ?? 0) > 0,
        }}
        parentList={parentListWithYetkili}
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
                  kind="df"
                  firmaId={firm.id}
                  firmaAdi={firm.firma_adi}
                  selfFirmaUsers={availableAttachUsers}
                  excludeUserIds={Array.from(linkedUserIds)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bu DF'ye doğrudan bağlı user'lar. */}
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

              {/* Alt bölgeler ve onların user'ları + bağlı PF'leri — ÜST FİRMA
                  için. Her alt bölge native <details> ile collapsible: başlığa
                  tıklayınca kullanıcılar + PF listesi açılır. */}
              {childrenWithUsers.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Alt Bölgeler ({childrenWithUsers.length})
                  </p>
                  <ul className="space-y-2">
                    {childrenWithUsers.map((c) => (
                      <li key={c.id} className="rounded-md border bg-muted/20">
                        <details open className="group">
                          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm">
                            <Network className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                            <Link
                              href={`/firms/df/${c.id}`}
                              className="font-medium hover:underline"
                            >
                              #{c.no} {c.firma_adi}
                            </Link>
                            <span className="text-[11px] text-muted-foreground">
                              ({c.users.length} kullanıcı · {c.pfs.length} PF)
                            </span>
                          </summary>
                          <div className="grid gap-x-4 gap-y-2 px-3 pb-2 pl-8 sm:grid-cols-2">
                            {c.users.length > 0 && (
                              <div>
                                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Kullanıcılar
                                </p>
                                <ul className="space-y-0.5">
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
                              </div>
                            )}
                            {c.pfs.length > 0 && (
                              <div>
                                <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  Bağlı Proje Firmaları
                                </p>
                                <ul className="space-y-0.5">
                                  {c.pfs.map((p) => (
                                    <li key={p.id} className="text-[12px]">
                                      {canLinkPf ? (
                                        <Link
                                          href={`/firms/pf/${p.id}`}
                                          className="font-medium hover:underline"
                                        >
                                          #{p.no ?? '–'} {p.firma_adi}
                                        </Link>
                                      ) : (
                                        <span className="font-medium">#{p.no ?? '–'} {p.firma_adi}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Bağlı PF kartı: Alt/Tekil DF için doğrudan bağlanan PF'leri listeler.
          ÜST DF için PF'ler alt bölgelerin altında collaps olarak gösterildiği
          için bu kart gizlenir. */}
      {!firm.ust_firma && (
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
                {pfLinked.data.map((p) => (
                  <li key={p.id} className="py-2 text-sm">
                    {canLinkPf ? (
                      <Link href={`/firms/pf/${p.id}`} className="hover:underline">
                        #{p.no} {p.firma_adi}
                      </Link>
                    ) : (
                      <span>#{p.no} {p.firma_adi}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
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
