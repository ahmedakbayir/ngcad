'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, FolderKanban } from 'lucide-react';

interface ProjectRowJoined {
  id: string;
  no: number;
  proje_adi: string;
  durum: string | null;
  created_at: string;
  pf_id: string | null;
  df_id: string | null;
  owner_user_id: string | null;
  pf?: { firma_adi: string } | null;
  df?: { firma_adi: string } | null;
  owner?: { adi: string } | null;
}

const CAD_BASE = process.env.NEXT_PUBLIC_CAD_URL || '../../index.html';

const DURUM_OPTIONS = [
  { value: 'taslak',     label: 'Taslak' },
  { value: 'onaylandi',  label: 'Onaylandı' },
  { value: 'tamamlandi', label: 'Tamamlandı' },
  { value: 'iptal',      label: 'İptal' },
];

function buildColumns(
  allowCad: boolean,
  canLinkPf: boolean,
  canLinkDf: boolean,
): ColumnDef<ProjectRowJoined>[] {
  const base: ColumnDef<ProjectRowJoined>[] = [
  {
    id: 'no',
    accessorKey: 'no',
    header: 'No',
    size: 60,
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">#{row.original.no}</span>,
    meta: { filter: { type: 'text', placeholder: '#' } },
    filterFn: (row, _id, value) =>
      String(row.original.no).includes(String(value).replace(/^#/, '')),
  },
  {
    id: 'ad',
    accessorKey: 'proje_adi',
    header: 'Proje',
    cell: ({ row }) => (
      <Link href={`/projects/${row.original.id}`} className="flex items-center gap-2 hover:underline">
        <div className="rounded-md bg-primary/10 p-1.5 text-primary">
          <FolderKanban className="h-4 w-4" />
        </div>
        <span className="font-medium">{row.original.proje_adi}</span>
      </Link>
    ),
    meta: { filter: { type: 'text' } },
    filterFn: 'includesString',
  },
  {
    id: 'pf',
    header: 'PF',
    accessorFn: (r) => r.pf?.firma_adi ?? '',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.pf_id) return <span className="text-xs text-muted-foreground">—</span>;
      if (!canLinkPf) return <span className="text-sm">{r.pf?.firma_adi}</span>;
      return (
        <Link href={`/firms/pf/${r.pf_id}`} className="text-sm hover:underline">
          {r.pf?.firma_adi}
        </Link>
      );
    },
    meta: { filter: { type: 'text' } },
    filterFn: 'includesString',
  },
  {
    id: 'df',
    header: 'DF',
    accessorFn: (r) => r.df?.firma_adi ?? '',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.df_id) return <span className="text-xs text-muted-foreground">—</span>;
      if (!canLinkDf) return <span className="text-sm">{r.df?.firma_adi}</span>;
      return (
        <Link href={`/firms/df/${r.df_id}`} className="text-sm hover:underline">
          {r.df?.firma_adi}
        </Link>
      );
    },
    meta: { filter: { type: 'text' } },
    filterFn: 'includesString',
  },
  {
    id: 'owner',
    header: 'Sahip',
    accessorFn: (r) => r.owner?.adi ?? '',
    cell: ({ row }) => {
      const r = row.original;
      if (!r.owner_user_id) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <Link href={`/users/${r.owner_user_id}`} className="text-sm hover:underline">
          {r.owner?.adi}
        </Link>
      );
    },
    meta: { filter: { type: 'text' } },
    filterFn: 'includesString',
  },
  {
    id: 'durum',
    header: 'Durum',
    accessorFn: (r) => r.durum ?? 'taslak',
    cell: ({ row }) => {
      const d = row.original.durum ?? 'taslak';
      const variant =
        d === 'onaylandi' ? 'success' :
        d === 'tamamlandi' ? 'info' :
        d === 'iptal' ? 'destructive' :
        'secondary';
      return <Badge variant={variant as 'success' | 'info' | 'destructive' | 'secondary'}>{d}</Badge>;
    },
    meta: { filter: { type: 'select', options: DURUM_OPTIONS } },
    filterFn: 'equalsString',
  },
  ];
  if (allowCad) {
    base.push({
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <Button asChild variant="ghost" size="icon" title="CAD'de Aç">
          <a href={`${CAD_BASE}?project=${row.original.id}`} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      ),
    });
  }
  return base;
}

export function ProjectsTable({
  rows,
  allowCad = false,
  canLinkPf = true,
  canLinkDf = true,
}: {
  rows: ProjectRowJoined[];
  allowCad?: boolean;
  canLinkPf?: boolean;
  canLinkDf?: boolean;
}) {
  const columns = React.useMemo(
    () => buildColumns(allowCad, canLinkPf, canLinkDf),
    [allowCad, canLinkPf, canLinkDf],
  );
  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Proje adı, PF, DF ara…"
      globalFilterFn={(r, q) =>
        [r.proje_adi, r.pf?.firma_adi ?? '', r.df?.firma_adi ?? '', r.owner?.adi ?? '', r.durum ?? '']
          .some((v) => v.toLowerCase().includes(q))
      }
      emptyText="Henüz proje yok."
      storageKey="projects"
    />
  );
}
