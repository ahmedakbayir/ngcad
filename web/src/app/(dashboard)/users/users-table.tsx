'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getUserKategori, type UserKategori, type UserRow } from '@/lib/supabase/types';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { collapseFirmHierarchy } from '@/lib/firm-hierarchy';
import { smartColumnFilterFn } from '@/lib/smart-filter';
import { cn } from '@/lib/utils';

interface FirmaRef { id: string; firma_adi: string; parent_id?: string | null }
interface PFWithDfs extends FirmaRef { dfs: FirmaRef[] }

export interface UsersTableProps {
  users: UserRow[];
  userPfMap?: Record<string, PFWithDfs[]>;
  userDfMap?: Record<string, FirmaRef[]>;
  // parent_id daraltma için master listeler (id → parent_id)
  pfMaster?: { id: string; parent_id: string | null }[];
  dfMaster?: { id: string; parent_id: string | null }[];
  // Yönetici kolonu için user_id → { manager id, adı } eşlemesi
  managerByUserId?: Record<string, { id: string; adi: string }>;
  // DF filtre combobox'ı için tüm DF listesi (parent + child)
  dfList?: { id: string; firma_adi: string; parent_id: string | null }[];
}

function kategoriBadge(k: UserKategori) {
  // 'general' kategori UI'dan kaldırıldı — yine de tip union'da kalıyor.
  const map: Partial<Record<UserKategori, { label: string; variant: 'default' | 'info' | 'warning' | 'secondary' }>> = {
    admin: { label: 'Admin',   variant: 'default' },
    pf:    { label: 'PF User', variant: 'info'    },
    df:    { label: 'DF User', variant: 'warning' },
  };
  const entry = map[k];
  if (!entry) return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

type RolVariant = 'default' | 'secondary' | 'info' | 'success' | 'warning';
interface RolEtiket {
  label: string;
  variant: RolVariant;
  className?: string;
}

// Üst Yönetici: PF tarafında firma_yonetici + 'ust' VEYA DF tarafında
// gdf_yonetici + 'ust'. Hiyerarşinin tepesinde — bağlı yöneticisi olmaz.
function isUstYonetici(u: UserRow): boolean {
  return (
    (!!u.firma_yonetici && u.firma_yonetici_kademe === 'ust') ||
    (!!u.gdf_yonetici && u.gdf_yonetici_kademe === 'ust')
  );
}

function rolEtiketleri(u: UserRow): RolEtiket[] {
  // Yalnız BİRİNCİL rol gösterilir. Üst Yönetici baskın (default = bg-primary);
  // Orta kademe Yönetici aynı renkten daha açık (bg-primary/40).
  // ── PF birincil rol ──
  if (u.firma_yonetici) {
    return u.firma_yonetici_kademe === 'ust'
      ? [{ label: 'Üst Yönetici', variant: 'default', className: 'bg-emerald-700 text-white hover:bg-emerald-700' }]
      : [{ label: 'Yönetici',     variant: 'default', className: 'bg-emerald-300 text-emerald-900 hover:bg-emerald-300' }];
  }
  if (u.firma_proje_muhendisi)  return [{ label: 'Proje Müh.',   variant: 'info'    }];
  if (u.firma_cizim_sorumlusu)  return [{ label: 'Çizim Sor.',   variant: 'success' }];
  if (u.firma_tesisat_ustasi)   return [{ label: 'Tesisat Ust.', variant: 'warning' }];
  // ── DF birincil rol ──
  if (u.gdf_yonetici) {
    return u.gdf_yonetici_kademe === 'ust'
      ? [{ label: 'Üst Yönetici', variant: 'default', className: 'bg-emerald-700 text-white hover:bg-emerald-700' }]
      : [{ label: 'Yönetici',     variant: 'default', className: 'bg-emerald-300 text-emerald-900 hover:bg-emerald-300' }];
  }
  if (u.gdf_onay_muhendisi)     return [{ label: 'Onay Müh.',    variant: 'info'    }];
  if (u.gdf_gaz_acma_muhendisi) return [{ label: 'Gaz Açma',     variant: 'success' }];
  if (u.gdf_on_buro_yetkilisi)  return [{ label: 'Ön Büro',      variant: 'warning' }];
  return [];
}

const KATEGORI_OPTIONS = [
  { value: 'admin', label: 'Admin',   variant: 'default' as const },
  { value: 'pf',    label: 'PF User', variant: 'info'    as const },
  { value: 'df',    label: 'DF User', variant: 'warning' as const },
];

type RoleVariant = 'default' | 'default-soft' | 'info' | 'success' | 'warning';
interface RolOption {
  value: string;
  label: string;
  variant: RoleVariant;
  kategori: 'pf' | 'df';
}

const ROL_OPTIONS_ALL: RolOption[] = [
  { value: 'firma_yonetici:ust',     label: 'Üst Yönetici (PF)', variant: 'default',      kategori: 'pf' },
  { value: 'firma_yonetici:orta',    label: 'Yönetici (PF)',     variant: 'default-soft', kategori: 'pf' },
  { value: 'firma_proje_muhendisi',  label: 'Proje Mühendisi',   variant: 'info',         kategori: 'pf' },
  { value: 'firma_cizim_sorumlusu',  label: 'Çizim Sorumlusu',   variant: 'success',      kategori: 'pf' },
  { value: 'firma_tesisat_ustasi',   label: 'Tesisat Ustası',    variant: 'warning',      kategori: 'pf' },
  { value: 'gdf_yonetici:ust',       label: 'Üst Yönetici (DF)', variant: 'default',      kategori: 'df' },
  { value: 'gdf_yonetici:orta',      label: 'Yönetici (DF)',     variant: 'default-soft', kategori: 'df' },
  { value: 'gdf_onay_muhendisi',     label: 'Onay Mühendisi',    variant: 'info',         kategori: 'df' },
  { value: 'gdf_gaz_acma_muhendisi', label: 'Gaz Açma Müh.',     variant: 'success',      kategori: 'df' },
  { value: 'gdf_on_buro_yetkilisi',  label: 'Ön Büro',           variant: 'warning',      kategori: 'df' },
];

function buildColumns(
  userPfMap: Record<string, PFWithDfs[]> | undefined,
  userDfMap: Record<string, FirmaRef[]> | undefined,
  pfMaster: { id: string; parent_id: string | null }[] | undefined,
  dfMaster: { id: string; parent_id: string | null }[] | undefined,
  managerByUserId: Record<string, { id: string; adi: string }> | undefined,
  rolOptions: RolOption[],
  dfList: { id: string; firma_adi: string; parent_id: string | null }[] | undefined,
): ColumnDef<UserRow>[] {
  const trCmp = (a: string, b: string) => a.localeCompare(b, 'tr');
  const sortByName = <T extends { firma_adi: string }>(arr: T[]): T[] =>
    arr.slice().sort((a, b) => trCmp(a.firma_adi, b.firma_adi));
  const collapsePfs = (refs: PFWithDfs[]): PFWithDfs[] =>
    sortByName(collapseFirmHierarchy(refs, pfMaster ?? []) as PFWithDfs[]).map((p) => ({
      ...p,
      dfs: sortByName(p.dfs),
    }));
  const collapseDfs = (refs: FirmaRef[]): FirmaRef[] =>
    sortByName(collapseFirmHierarchy(refs, dfMaster ?? []));

  // Bir DF id'sinden ağacın tepesindeki üst firmayı bul.
  const dfById = new Map((dfList ?? []).map((d) => [d.id, d]));
  function topDfOf(id: string | undefined): { id: string; firma_adi: string } | null {
    if (!id) return null;
    let cur = dfById.get(id);
    while (cur?.parent_id) {
      const p = dfById.get(cur.parent_id);
      if (!p) break;
      cur = p;
    }
    return cur ? { id: cur.id, firma_adi: cur.firma_adi } : null;
  }
  // Kullanıcının bağlı olduğu TÜM DF'leri (direct + PF üzerinden) distinct üst
  // GDF (root) listesine indirger. Tek root → o DF, çoklu root → "KARMA".
  function userUstGdfs(u: UserRow): { id: string; firma_adi: string }[] {
    const seen = new Set<string>();
    const tops: { id: string; firma_adi: string }[] = [];
    const push = (id: string | undefined) => {
      const t = topDfOf(id);
      if (!t) return;
      if (seen.has(t.id)) return;
      seen.add(t.id);
      tops.push(t);
    };
    (userDfMap?.[u.id] ?? []).forEach((d) => push(d.id));
    (userPfMap?.[u.id] ?? []).forEach((pf) => pf.dfs?.forEach((d) => push(d.id)));
    return tops;
  }
  // Üst GDF filter combobox seçenekleri: parent'ı olmayan tüm DF'ler (parent
  // firma veya standalone), alfabetik.
  const ustGdfOptions = (dfList ?? [])
    .filter((d) => !d.parent_id)
    .slice()
    .sort((a, b) => trCmp(a.firma_adi, b.firma_adi))
    .map((d) => ({ value: d.id, label: d.firma_adi }));
  return [
    {
      id: 'adi',
      accessorFn: (u) => `${u.adi} ${u.unvan ?? ''} ${u.email}`,
      header: 'Kullanıcı',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <Link href={`/users/${u.id}`} className="flex items-center gap-2 hover:underline">
            <Avatar src={u.profil_fotografi} name={u.adi} size={24} />
            <div className="text-sm font-medium leading-tight">{u.adi}</div>
          </Link>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'Ad, ünvan, e-posta…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'unvan',
      header: 'Ünvan',
      size: 180,
      minSize: 140,
      accessorFn: (u) => u.unvan ?? '',
      cell: ({ row }) => {
        const v = row.original.unvan;
        if (!v) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="text-xs">{v}</span>;
      },
      meta: { filter: { type: 'text', placeholder: 'Ünvan…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'email',
      header: 'E-posta',
      accessorFn: (u) => u.email ?? '',
      cell: ({ row }) => {
        const v = row.original.email;
        if (!v) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <a href={`mailto:${v}`} className="font-mono text-[11px] hover:underline">
            {v}
          </a>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'mail…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'gsm',
      header: 'GSM / Tel',
      accessorFn: (u) => u.gsm ?? '',
      cell: ({ row }) => {
        const v = row.original.gsm;
        if (!v) return <span className="text-xs text-muted-foreground">—</span>;
        return <span className="font-mono text-[11px]">{v}</span>;
      },
      meta: { filter: { type: 'text', placeholder: 'gsm…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'kategori',
      header: 'Kategori',
      accessorFn: (u) => getUserKategori(u),
      cell: ({ row }) => kategoriBadge(getUserKategori(row.original)),
      // Tabs ile birlikte kolon filtresi de korunur (görünüm bozulmasın diye).
      meta: { filter: { type: 'select', options: KATEGORI_OPTIONS } },
      filterFn: 'equalsString',
    },
    {
      id: 'roller',
      header: 'Roller',
      accessorFn: (u) => rolEtiketleri(u)[0]?.label ?? '',
      cell: ({ row }) => {
        const tags = rolEtiketleri(row.original);
        if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Badge
                key={t.label}
                variant={t.variant}
                className={cn('text-[10px] font-normal', t.className)}
              >
                {t.label}
              </Badge>
            ))}
          </div>
        );
      },
      meta: { filter: { type: 'select', options: rolOptions } },
      filterFn: (row, _id, value) => {
        const u = row.original;
        const raw = String(value);
        if (raw.includes(':')) {
          const [key, kademe] = raw.split(':') as [keyof UserRow, 'ust' | 'orta'];
          if (!u[key]) return false;
          const kademeKey = key === 'firma_yonetici' ? 'firma_yonetici_kademe' : 'gdf_yonetici_kademe';
          return u[kademeKey] === kademe;
        }
        return Boolean(u[raw as keyof UserRow]);
      },
      sortingFn: 'alphanumeric',
    },
    {
      id: 'ust_gdf',
      header: 'Üst GDF',
      // Sıralama için: 1 root → o ad, 2+ root → "KARMA", 0 → boş.
      accessorFn: (u) => {
        const tops = userUstGdfs(u);
        if (tops.length === 0) return '';
        if (tops.length > 1) return 'KARMA';
        return tops[0].firma_adi;
      },
      cell: ({ row }) => {
        const tops = userUstGdfs(row.original);
        if (tops.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        if (tops.length > 1) {
          return (
            <Badge variant="warning" className="text-[10px]">
              KARMA
            </Badge>
          );
        }
        const t = tops[0];
        return (
          <Link href={`/firms/df/${t.id}`} className="text-xs font-medium hover:underline">
            {t.firma_adi}
          </Link>
        );
      },
      meta: { filter: { type: 'select', options: ustGdfOptions } },
      filterFn: (row, _id, value) => {
        // Filtre seçilen GDF, kullanıcının distinct root listesinde varsa eşleşir
        // (karma kullanıcılar her root için filtre sonucunda görünür).
        const tops = userUstGdfs(row.original);
        return tops.some((t) => t.id === String(value));
      },
    },
    {
      id: 'firmalar',
      header: 'Firmalar',
      size: 240,
      minSize: 200,
      sortingFn: (a, b) => {
        const firstName = (u: UserRow) =>
          (userPfMap?.[u.id]?.[0]?.firma_adi ??
           userDfMap?.[u.id]?.[0]?.firma_adi ??
           '').toLocaleLowerCase('tr');
        return firstName(a.original).localeCompare(firstName(b.original), 'tr');
      },
      accessorFn: (u) => {
        const pfNames = (userPfMap?.[u.id] ?? [])
          .flatMap((pf) => [pf.firma_adi, ...pf.dfs.map((d) => d.firma_adi)])
          .join(' ');
        const dfNames = (userDfMap?.[u.id] ?? []).map((d) => d.firma_adi).join(' ');
        return `${pfNames} ${dfNames}`;
      },
      meta: { filter: { type: 'text', placeholder: 'Firma adı…' } },
      filterFn: smartColumnFilterFn,
      cell: ({ row }) => {
        const u = row.original;
        const kat = getUserKategori(u);
        if (kat === 'pf') {
          const pfs = collapsePfs(userPfMap?.[u.id] ?? []);
          if (pfs.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="min-w-[200px] space-y-1.5 text-xs">
              {pfs.map((pf) => {
                const dfs = collapseDfs(pf.dfs);
                return (
                  <div key={pf.id} className="leading-tight">
                    <Link
                      href={`/firms/pf/${pf.id}`}
                      className="font-medium uppercase tracking-wide hover:underline"
                    >
                      {pf.firma_adi}
                    </Link>
                    {dfs.length > 0 && (
                      <span className="ml-1.5 italic text-[10.5px] text-muted-foreground">
                        ·{' '}
                        {dfs.map((d, i) => (
                          <React.Fragment key={d.id}>
                            {i > 0 && ', '}
                            <Link href={`/firms/df/${d.id}`} className="hover:underline">
                              {d.firma_adi}
                            </Link>
                          </React.Fragment>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        }
        if (kat === 'df') {
          const dfs = collapseDfs(userDfMap?.[u.id] ?? []);
          if (dfs.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex min-w-[200px] flex-col gap-0.5 text-xs">
              {dfs.map((d) => (
                <Link
                  key={d.id}
                  href={`/firms/df/${d.id}`}
                  className="italic hover:underline"
                >
                  {d.firma_adi}
                </Link>
              ))}
            </div>
          );
        }
        return <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: 'yonetici',
      header: 'Yönetici',
      accessorFn: (u) => (isUstYonetici(u) ? 'Üst Yönetici' : managerByUserId?.[u.id]?.adi ?? ''),
      cell: ({ row }) => {
        const u = row.original;
        if (isUstYonetici(u)) {
          return <Badge variant="default" className="bg-emerald-700 text-white hover:bg-emerald-700 text-[10px]">Üst Yönetici</Badge>;
        }
        const m = managerByUserId?.[u.id];
        if (!m) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <Link href={`/users/${m.id}`} className="text-xs hover:underline">
            {m.adi}
          </Link>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'Yönetici…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'numaralar',
      header: 'Numaralar',
      size: 320,
      minSize: 240,
      enableSorting: false,
      accessorFn: (u) => userNumaralariText(u),
      cell: ({ row }) => {
        const rows = userNumaralari(row.original);
        if (rows.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="space-y-0.5 text-[11px] leading-tight">
            {rows.map((r) => (
              <div key={r.label}>
                <span className="text-muted-foreground">{r.label}</span>{' '}
                <span className="font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'Numara…' } },
      filterFn: smartColumnFilterFn,
    },
    // Boş "actions" kolonu — DataTable filtre temizleme + kolon göster/gizle
    // butonlarını en sağdaki filtre-konfigürasyonsuz hücreye yerleştirir.
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      size: 36,
      cell: () => null,
    },
  ];
}

// Kullanıcının dolu olan tüm yetki/sicil numaralarını kısa etiketleriyle topla.
// Boş alanlar atlanır; etikette user'ın asıl alan adı değil, görsel etiket kullanılır.
function userNumaralari(u: UserRow): { label: string; value: string }[] {
  const items: { label: string; value: string | number | null }[] = [
    { label: 'GDF Sicil No:',           value: u.onay_muh_gdf_sicil_no },
    { label: 'GDF Ekip No:',             value: u.gaz_acma_muh_ekip_no },
    { label: 'MMO Sicil No:',  value: u.proje_muh_oda_sicil_no },
    { label: 'GDF Kayit No:',  value: u.proje_muh_kayit_no },
    { label: 'Montaj Yetki No:',          value: u.usta_montaj_belge_no },
    { label: 'Kaynak Yetki No:',  value: u.usta_celik_kaynak_belge_no },
    { label: 'PE Yetki No:',        value: u.usta_pe_kaynak_belge_no },
  ];
  return items
    .filter((i) => i.value != null && String(i.value).trim() !== '')
    .map((i) => ({ label: i.label, value: String(i.value) }));
}
function userNumaralariText(u: UserRow): string {
  return userNumaralari(u).map((r) => `${r.label}${r.value}`).join(' ');
}

type KategoriTab = 'all' | 'admin' | 'pf' | 'df';

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function UsersTable({
  users,
  userPfMap,
  userDfMap,
  pfMaster,
  dfMaster,
  managerByUserId,
  dfList,
}: UsersTableProps) {
  const [kategoriTab, setKategoriTab] = React.useState<KategoriTab>('all');
  const [dfFilter, setDfFilter] = React.useState<string>('all');

  // Kategori tab + DF filtresine göre veriyi daralt.
  const filtered = React.useMemo(() => {
    let result = users;
    if (kategoriTab !== 'all') {
      result = result.filter((u) => getUserKategori(u) === kategoriTab);
    }
    if (dfFilter !== 'all') {
      // Parent DF seçildiyse child'larını da kapsama dahil et — kullanıcı kuralı:
      // "GDF filtrede parent seçilirse sonuçlarda child olanlar da listelensin".
      const targetDfIds = new Set<string>([dfFilter]);
      (dfList ?? []).forEach((d) => {
        if (d.parent_id === dfFilter) targetDfIds.add(d.id);
      });
      result = result.filter((u) => {
        const directDfs = userDfMap?.[u.id] ?? [];
        if (directDfs.some((d) => targetDfIds.has(d.id))) return true;
        const pfs = userPfMap?.[u.id] ?? [];
        return pfs.some((pf) => pf.dfs.some((d) => targetDfIds.has(d.id)));
      });
    }
    // Admin'ler en üstte; sonra created_at DESC (en son eklenen üstte).
    return result.slice().sort((a, b) => {
      if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  }, [users, kategoriTab, dfFilter, userPfMap, userDfMap]);

  // Roller filtresi tab'a göre daralır (admin → boş, pf → sadece PF rolleri, vb.)
  const rolOptions = React.useMemo<RolOption[]>(() => {
    if (kategoriTab === 'admin') return [];
    if (kategoriTab === 'pf') return ROL_OPTIONS_ALL.filter((r) => r.kategori === 'pf');
    if (kategoriTab === 'df') return ROL_OPTIONS_ALL.filter((r) => r.kategori === 'df');
    return ROL_OPTIONS_ALL;
  }, [kategoriTab]);

  const columns = React.useMemo(
    () => buildColumns(userPfMap, userDfMap, pfMaster, dfMaster, managerByUserId, rolOptions, dfList),
    [userPfMap, userDfMap, pfMaster, dfMaster, managerByUserId, rolOptions, dfList],
  );

  // DF filtre Select için alfabetik + hiyerarşik liste (parent + child).
  const dfOrdered = React.useMemo(() => {
    if (!dfList) return [];
    const trCmp = (a: string, b: string) => a.localeCompare(b, 'tr');
    const byId = new Map(dfList.map((d) => [d.id, d]));
    const tops = dfList
      .filter((d) => !d.parent_id || !byId.has(d.parent_id))
      .slice()
      .sort((a, b) => trCmp(a.firma_adi, b.firma_adi));
    const childrenOf = (pid: string) =>
      dfList
        .filter((c) => c.parent_id === pid)
        .slice()
        .sort((a, b) => trCmp(a.firma_adi, b.firma_adi));
    const ordered: { d: { id: string; firma_adi: string }; depth: 0 | 1 }[] = [];
    tops.forEach((p) => {
      ordered.push({ d: p, depth: 0 });
      childrenOf(p.id).forEach((c) => ordered.push({ d: c, depth: 1 }));
    });
    return ordered;
  }, [dfList]);

  return (
    <div className="space-y-4">
      {/* Sayfa başlığı + ortada tab/DF filtreleri + sağda Yeni Kullanıcı butonu */}
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Kullanıcılar</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border bg-muted/30 p-0.5">
            <TabBtn active={kategoriTab === 'all'}   onClick={() => setKategoriTab('all')}>Hepsi</TabBtn>
            <TabBtn active={kategoriTab === 'admin'} onClick={() => setKategoriTab('admin')}>Admin</TabBtn>
            <TabBtn active={kategoriTab === 'df'}    onClick={() => setKategoriTab('df')}>DFirm</TabBtn>
            <TabBtn active={kategoriTab === 'pf'}    onClick={() => setKategoriTab('pf')}>PFirm</TabBtn>
          </div>
          {dfList && dfList.length > 0 && (
            <Select value={dfFilter} onValueChange={setDfFilter}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder="GDF" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">GDF</SelectItem>
                {dfOrdered.map(({ d, depth }) => (
                  <SelectItem key={d.id} value={d.id}>
                    {depth === 1 ? `↳ ${d.firma_adi}` : d.firma_adi}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button asChild className="ml-auto">
          <Link href="/users/new">
            <Plus className="h-4 w-4" />
            Yeni Kullanıcı
          </Link>
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Ad, e-posta, GSM ara…"
        globalFilterFn={(u, q) =>
          [u.adi, u.email, u.gsm ?? '']
            .some((v) => v.toLowerCase().includes(q))
        }
        emptyText="Bu filtreye uyan kullanıcı bulunamadı."
        compact
        storageKey="users"
      />
    </div>
  );
}
