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

function rolEtiketleri(u: UserRow): string[] {
  const tags: string[] = [];
  if (u.firma_yonetici)         tags.push(u.firma_yonetici_kademe === 'ust' ? 'Üst Yön.' : 'Orta Yön.');
  if (u.firma_proje_muhendisi)  tags.push('Proje Müh.');
  if (u.firma_cizim_sorumlusu)  tags.push('Çizim Sor.');
  if (u.firma_tesisat_ustasi)   tags.push('Tesisat Ust.');
  if (u.gdf_yonetici)           tags.push(u.gdf_yonetici_kademe === 'ust' ? 'GDF Üst' : 'GDF Orta');
  if (u.gdf_onay_muhendisi)     tags.push('Onay Müh.');
  if (u.gdf_gaz_acma_muhendisi) tags.push('Gaz Açma');
  if (u.gdf_on_buro_yetkilisi)  tags.push('Ön Büro');
  return tags;
}

const columns: ColumnDef<UserRow>[] = [
  {
    id: 'adi',
    accessorKey: 'adi',
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
  },
  {
    id: 'iletisim',
    header: 'İletişim',
    enableSorting: false,
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
  },
  {
    id: 'kategori',
    header: 'Kategori',
    accessorFn: (u) => getUserKategori(u),
    cell: ({ row }) => kategoriBadge(getUserKategori(row.original)),
  },
  {
    id: 'roller',
    header: 'Roller',
    enableSorting: false,
    cell: ({ row }) => {
      const tags = rolEtiketleri(row.original);
      if (tags.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] font-normal">{t}</Badge>
          ))}
        </div>
      );
    },
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

const TAB_OPTIONS: { value: 'all' | UserKategori; label: string }[] = [
  { value: 'all',     label: 'Hepsi' },
  { value: 'admin',   label: 'Admin' },
  { value: 'pf',      label: 'PF User' },
  { value: 'df',      label: 'DF User' },
  { value: 'general', label: 'General' },
];

export function UsersTable({ users }: { users: UserRow[] }) {
  const [tab, setTab] = React.useState<'all' | UserKategori>('all');

  const filtered = React.useMemo(() => {
    if (tab === 'all') return users;
    return users.filter((u) => getUserKategori(u) === tab);
  }, [users, tab]);

  return (
    <div className="space-y-3">
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
    </div>
  );
}
