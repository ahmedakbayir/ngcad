'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/data-table';
import { getUserKategori, type UserKategori, type UserRow } from '@/lib/supabase/types';
import { Mail, Phone, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FirmaRef { id: string; firma_adi: string }
interface PFWithDfs extends FirmaRef { dfs: FirmaRef[] }

export interface UsersTableProps {
  users: UserRow[];
  userPfMap?: Record<string, PFWithDfs[]>;
  userDfMap?: Record<string, FirmaRef[]>;
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
  const tags: RolEtiket[] = [];
  // ── PF rolleri ──
  if (u.firma_yonetici) {
    tags.push(
      u.firma_yonetici_kademe === 'ust'
        ? { label: 'Üst Yön.',  variant: 'default'   }
        : { label: 'Orta Yön.', variant: 'secondary' },
    );
  }
  if (u.firma_proje_muhendisi)  tags.push({ label: 'Proje Müh.',  variant: 'info'    });
  if (u.firma_cizim_sorumlusu)  tags.push({ label: 'Çizim Sor.',  variant: 'success' });
  if (u.firma_tesisat_ustasi)   tags.push({ label: 'Tesisat Ust.', variant: 'warning' });
  // ── DF rolleri ──
  if (u.gdf_yonetici) {
    tags.push(
      u.gdf_yonetici_kademe === 'ust'
        ? { label: 'GDF Üst',  variant: 'default'   }
        : { label: 'GDF Orta', variant: 'secondary' },
    );
  }
  if (u.gdf_onay_muhendisi)     tags.push({ label: 'Onay Müh.', variant: 'info'    });
  if (u.gdf_gaz_acma_muhendisi) tags.push({ label: 'Gaz Açma',  variant: 'success' });
  if (u.gdf_on_buro_yetkilisi)  tags.push({ label: 'Ön Büro',   variant: 'warning' });
  return tags;
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
): ColumnDef<UserRow>[] {
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
      filterFn: 'includesString',
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
      filterFn: 'includesString',
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
      filterFn: 'includesString',
      cell: ({ row }) => {
        const u = row.original;
        const kat = getUserKategori(u);
        if (kat === 'pf') {
          const pfs = userPfMap?.[u.id] ?? [];
          if (pfs.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="space-y-1 text-xs">
              {pfs.map((pf) => (
                <div key={pf.id} className="leading-tight">
                  <Link href={`/firms/pf/${pf.id}`} className="font-medium hover:underline">
                    {pf.firma_adi}
                  </Link>
                  {pf.dfs.length > 0 && (
                    <div className="space-y-0.5 text-[10px] text-muted-foreground">
                      {pf.dfs.map((d) => (
                        <div key={d.id}>{d.firma_adi}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }
        if (kat === 'df') {
          const dfs = userDfMap?.[u.id] ?? [];
          if (dfs.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex flex-col gap-0.5 text-xs">
              {dfs.map((d) => (
                <Link key={d.id} href={`/firms/df/${d.id}`} className="hover:underline">
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

const TAB_OPTIONS: { value: 'all' | UserKategori; label: string }[] = [
  { value: 'all',     label: 'Hepsi' },
  { value: 'admin',   label: 'Admin' },
  { value: 'pf',      label: 'PF User' },
  { value: 'df',      label: 'DF User' },
  { value: 'general', label: 'General' },
];

export function UsersTable({ users, userPfMap, userDfMap }: UsersTableProps) {
  const [tab, setTab] = React.useState<'all' | UserKategori>('all');

  const columns = React.useMemo(() => buildColumns(userPfMap, userDfMap), [userPfMap, userDfMap]);

  const filtered = React.useMemo(() => {
    if (tab === 'all') return users;
    return users.filter((u) => getUserKategori(u) === tab);
  }, [users, tab]);

  const tabsNode = (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <TabsList>
        {TAB_OPTIONS.map((opt) => {
          const count = opt.value === 'all'
            ? users.length
            : users.filter((u) => getUserKategori(u) === opt.value).length;
          return (
            <TabsTrigger key={opt.value} value={opt.value}>
              {opt.label}
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {count}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );

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
      headerLeft={tabsNode}
    />
  );
}
