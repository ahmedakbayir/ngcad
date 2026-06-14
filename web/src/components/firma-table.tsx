'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Mail, Pencil, Phone } from 'lucide-react';
import type { FirmaRow } from '@/lib/supabase/types';

interface DFRef { id: string; firma_adi: string }

export function FirmaTable({
  firmas,
  basePath,
  pfDfMap,
  dfFilterList,
}: {
  firmas: FirmaRow[];
  basePath: '/firms/pf' | '/firms/df';
  pfDfMap?: Record<string, DFRef[]>;
  dfFilterList?: DFRef[];
}) {
  const showDfColumn = basePath === '/firms/pf' && !!pfDfMap;
  const [dfFilter, setDfFilter] = React.useState<string>('all');

  // id → firma_adi haritası (parent_id'yi ada çevirmek için) — orijinal listeden hesaplanmalı
  const adById = React.useMemo(() => {
    const m = new Map<string, string>();
    firmas.forEach((f) => m.set(f.id, f.firma_adi));
    return m;
  }, [firmas]);

  const filteredFirmas = React.useMemo(() => {
    if (!showDfColumn || dfFilter === 'all') return firmas;
    return firmas.filter((f) => (pfDfMap?.[f.id] ?? []).some((d) => d.id === dfFilter));
  }, [firmas, dfFilter, pfDfMap, showDfColumn]);

  const columns = React.useMemo<ColumnDef<FirmaRow>[]>(
    () => [
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
        id: 'adi',
        accessorKey: 'firma_adi',
        header: 'Firma',
        cell: ({ row }) => (
          <Link href={`${basePath}/${row.original.id}`} className="flex items-center gap-2 hover:underline">
            <div className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium leading-tight">{row.original.firma_adi}</div>
              {'yeterlilik_no' in row.original && row.original.yeterlilik_no && (
                <div className="text-xs text-muted-foreground">{row.original.yeterlilik_no}</div>
              )}
            </div>
          </Link>
        ),
        meta: { filter: { type: 'text' } },
        filterFn: 'includesString',
      },
      {
        id: 'iletisim',
        header: 'İletişim',
        accessorFn: (r) => `${r.firma_email ?? ''} ${r.firma_tel ?? ''}`,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="space-y-1 text-xs">
              {r.firma_email && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3 w-3" /> {r.firma_email}
                </div>
              )}
              {r.firma_tel && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Phone className="h-3 w-3" /> {r.firma_tel}
                </div>
              )}
            </div>
          );
        },
        meta: { filter: { type: 'text', placeholder: 'E-posta, tel…' } },
        filterFn: 'includesString',
      },
      {
        id: 'parent',
        header: 'Üst Firma',
        accessorFn: (r) => (r.parent_id ? adById.get(r.parent_id) ?? '' : ''),
        cell: ({ row }) => {
          const pid = row.original.parent_id;
          if (!pid) return <span className="text-xs text-muted-foreground">—</span>;
          const ad = adById.get(pid);
          return ad ? (
            <Link href={`${basePath}/${pid}`} className="text-xs hover:underline">
              {ad}
            </Link>
          ) : (
            <Badge variant="outline" className="text-[10px]">Alt birim</Badge>
          );
        },
        meta: { filter: { type: 'text' } },
        filterFn: 'includesString',
      },
      ...(showDfColumn
        ? [{
            id: 'df',
            header: 'Bağlı DF',
            // İlk bağlı DF adına göre sıralanır.
            accessorFn: (r: FirmaRow) =>
              (pfDfMap?.[r.id] ?? []).map((d) => d.firma_adi).join(' '),
            cell: ({ row }: { row: { original: FirmaRow } }) => {
              const dfs = pfDfMap?.[row.original.id] ?? [];
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
            },
            meta: { filter: { type: 'text' } },
            filterFn: 'includesString',
          } as ColumnDef<FirmaRow>]
        : []),
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Button asChild variant="ghost" size="icon">
            <Link href={`${basePath}/${row.original.id}`}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>
        ),
      },
    ],
    [basePath, adById, pfDfMap, showDfColumn],
  );

  const toolbar = dfFilterList && dfFilterList.length > 0 ? (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">DF</span>
      <Select value={dfFilter} onValueChange={setDfFilter}>
        <SelectTrigger className="h-9 w-[220px]">
          <SelectValue placeholder="Hepsi" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Hepsi</SelectItem>
          {dfFilterList.map((d) => (
            <SelectItem key={d.id} value={d.id}>{d.firma_adi}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : undefined;

  return (
    <DataTable
      columns={columns}
      data={filteredFirmas}
      searchPlaceholder="Firma adı, e-posta ara…"
      globalFilterFn={(r, q) =>
        [r.firma_adi, r.firma_email ?? '', r.firma_tel ?? '', r.vergi_no ?? '', r.vergi_dairesi ?? '']
          .some((v) => v.toLowerCase().includes(q))
      }
      emptyText="Henüz firma yok."
      toolbar={toolbar}
    />
  );
}
