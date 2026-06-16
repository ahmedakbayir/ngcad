'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import { getUserKategori, type UserKategori, type UserRow } from '@/lib/supabase/types';
import { Mail, Phone, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { collapseFirmHierarchy } from '@/lib/firm-hierarchy';
import { smartColumnFilterFn } from '@/lib/smart-filter';

interface FirmaRef { id: string; firma_adi: string; parent_id?: string | null }
interface PFWithDfs extends FirmaRef { dfs: FirmaRef[] }

export interface UsersTableProps {
  users: UserRow[];
  userPfMap?: Record<string, PFWithDfs[]>;
  userDfMap?: Record<string, FirmaRef[]>;
  // parent_id daraltma için master listeler (id → parent_id)
  pfMaster?: { id: string; parent_id: string | null }[];
  dfMaster?: { id: string; parent_id: string | null }[];
}

function kategoriBadge(k: UserKategori) {
  const map: Record<UserKategori, { label: string; variant: 'default' | 'info' | 'warning' | 'secondary' }> = {
    admin:   { label: 'Admin',       variant: 'default' },
    pf:      { label: 'PF User',     variant: 'info' },
    df:      { label: 'DF User',     variant: 'warning' },
    general: { label: 'General',     variant: 'secondary' },
  };
  const { label, variant } = map[k];
  return <Badge variant={variant}>{label}</Badge>;
}

type RolVariant = 'default' | 'secondary' | 'info' | 'success' | 'warning';
interface RolEtiket { label: string; variant: RolVariant }

function rolEtiketleri(u: UserRow): RolEtiket[] {
  // Yalnız BİRİNCİL rol gösterilir. Formdaki radio + alt-yetki hiyerarşisine
  // göre öncelik: Yönetici > sonraki tekil roller. Alt-yetki checkbox'ları
  // (örn. Yönetici altındaki Onay Müh.) listede ayrı rozet olarak çıkmaz.
  // ── PF birincil rol ──
  if (u.firma_yonetici)         return [{ label: 'Yönetici',     variant: 'default' }];
  if (u.firma_proje_muhendisi)  return [{ label: 'Proje Müh.',   variant: 'info'    }];
  if (u.firma_cizim_sorumlusu)  return [{ label: 'Çizim Sor.',   variant: 'success' }];
  if (u.firma_tesisat_ustasi)   return [{ label: 'Tesisat Ust.', variant: 'warning' }];
  // ── DF birincil rol ──
  if (u.gdf_yonetici)           return [{ label: 'GDF Yön.',     variant: 'default' }];
  if (u.gdf_onay_muhendisi)     return [{ label: 'Onay Müh.',    variant: 'info'    }];
  if (u.gdf_gaz_acma_muhendisi) return [{ label: 'Gaz Açma',     variant: 'success' }];
  if (u.gdf_on_buro_yetkilisi)  return [{ label: 'Ön Büro',      variant: 'warning' }];
  return [];
}

const KATEGORI_OPTIONS = [
  { value: 'admin',   label: 'Admin' },
  { value: 'pf',      label: 'PF User' },
  { value: 'df',      label: 'DF User' },
  { value: 'general', label: 'General' },
];

const ROL_OPTIONS = [
  { value: 'firma_yonetici',         label: 'Firma Yönetici' },
  { value: 'firma_proje_muhendisi',  label: 'Proje Mühendisi' },
  { value: 'firma_cizim_sorumlusu',  label: 'Çizim Sorumlusu' },
  { value: 'firma_tesisat_ustasi',   label: 'Tesisat Ustası' },
  { value: 'gdf_yonetici',           label: 'GDF Yönetici' },
  { value: 'gdf_onay_muhendisi',     label: 'Onay Mühendisi' },
  { value: 'gdf_gaz_acma_muhendisi', label: 'Gaz Açma Müh.' },
  { value: 'gdf_on_buro_yetkilisi',  label: 'Ön Büro' },
];

function buildColumns(
  userPfMap?: Record<string, PFWithDfs[]>,
  userDfMap?: Record<string, FirmaRef[]>,
  pfMaster?: { id: string; parent_id: string | null }[],
  dfMaster?: { id: string; parent_id: string | null }[],
): ColumnDef<UserRow>[] {
  const collapsePfs = (refs: PFWithDfs[]): PFWithDfs[] =>
    collapseFirmHierarchy(refs, pfMaster ?? []) as PFWithDfs[];
  const collapseDfs = (refs: FirmaRef[]): FirmaRef[] =>
    collapseFirmHierarchy(refs, dfMaster ?? []);
  return [
    {
      id: 'adi',
      accessorFn: (u) => `${u.adi} ${u.email}`,
      header: 'Kullanıcı',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <Link href={`/users/${u.id}`} className="flex items-center gap-3 hover:underline">
            <Avatar src={u.profil_fotografi} name={u.adi} size={32} />
            <div>
              <div className="font-medium leading-tight">{u.adi}</div>
              <div className="text-xs text-muted-foreground">{u.email}</div>
            </div>
          </Link>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'Ad, e-posta…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'iletisim',
      header: 'İletişim',
      enableSorting: false,
      accessorFn: (u) => `${u.email} ${u.gsm ?? ''}`,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3 w-3" /> {u.email}
            </div>
            {u.gsm && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3 w-3" /> {u.gsm}
              </div>
            )}
          </div>
        );
      },
      meta: { filter: { type: 'text', placeholder: 'E-posta, GSM…' } },
      filterFn: smartColumnFilterFn,
    },
    {
      id: 'kategori',
      header: 'Kategori',
      accessorFn: (u) => getUserKategori(u),
      cell: ({ row }) => kategoriBadge(getUserKategori(row.original)),
      meta: { filter: { type: 'select', options: KATEGORI_OPTIONS } },
      filterFn: 'equalsString',
    },
    {
      id: 'firmalar',
      header: 'Firmalar',
      size: 360,
      minSize: 280,
      // Sıralama: ilk firma adına göre. Filtre: tüm firma adlarında contains.
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
            <div className="min-w-[260px] space-y-1.5 text-xs">
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
            <div className="flex min-w-[260px] flex-col gap-0.5 text-xs">
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
      id: 'roller',
      header: 'Roller',
      // Sıralama: ilk rol etiketine göre alfabetik.
      accessorFn: (u) => rolEtiketleri(u)[0]?.label ?? '',
      cell: ({ row }) => {
        const tags = rolEtiketleri(row.original);
        if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <Badge key={t.label} variant={t.variant} className="text-[10px] font-normal">{t.label}</Badge>
            ))}
          </div>
        );
      },
      meta: { filter: { type: 'select', options: ROL_OPTIONS } },
      filterFn: (row, _id, value) => {
        const u = row.original;
        const key = value as keyof UserRow;
        return Boolean(u[key]);
      },
      sortingFn: 'alphanumeric',
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="icon">
          <Link href={`/users/${row.original.id}`}>
            <Pencil className="h-4 w-4" />
          </Link>
        </Button>
      ),
    },
  ];
}

export function UsersTable({ users, userPfMap, userDfMap, pfMaster, dfMaster }: UsersTableProps) {
  const columns = React.useMemo(
    () => buildColumns(userPfMap, userDfMap, pfMaster, dfMaster),
    [userPfMap, userDfMap, pfMaster, dfMaster],
  );

  const filtered = users;

  return (
    <DataTable
      columns={columns}
      data={filtered}
      searchPlaceholder="Ad, e-posta, GSM ara…"
      globalFilterFn={(u, q) =>
        [u.adi, u.email, u.gsm ?? '']
          .some((v) => v.toLowerCase().includes(q))
      }
      emptyText="Bu filtreye uyan kullanıcı bulunamadı."
    />
  );
}
