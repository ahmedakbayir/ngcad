'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { Building2, Mail, Pencil, Phone } from 'lucide-react';
import type { FirmaRow } from '@/lib/supabase/types';

export function FirmaTable({
  firmas,
  basePath,
}: {
  firmas: FirmaRow[];
  basePath: '/firms/pf' | '/firms/df';
}) {
  // id → firma_adi haritası (parent_id'yi ada çevirmek için)
  const adById = React.useMemo(() => {
    const m = new Map<string, string>();
    firmas.forEach((f) => m.set(f.id, f.firma_adi));
    return m;
  }, [firmas]);

  const columns = React.useMemo<ColumnDef<FirmaRow>[]>(
    () => [
      {
        id: 'no',
        accessorKey: 'no',
        header: 'No',
        size: 60,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">#{row.original.no}</span>,
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
                <div className="text-xs text-muted-foreground">YT: {row.original.yeterlilik_no}</div>
              )}
            </div>
          </Link>
        ),
      },
      {
        id: 'iletisim',
        header: 'İletişim',
        enableSorting: false,
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
      },
      {
        id: 'vergi',
        header: 'Vergi',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          if (!r.vergi_no && !r.vergi_dairesi) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="text-xs">
              {r.vergi_dairesi && <div>{r.vergi_dairesi}</div>}
              {r.vergi_no && <div className="font-mono text-muted-foreground">{r.vergi_no}</div>}
            </div>
          );
        },
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
      },
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
    [basePath],
  );

  return (
    <DataTable
      columns={columns}
      data={firmas}
      searchPlaceholder="Firma adı, vergi no, e-posta ara…"
      globalFilterFn={(r, q) =>
        [r.firma_adi, r.firma_email ?? '', r.firma_tel ?? '', r.vergi_no ?? '', r.vergi_dairesi ?? '']
          .some((v) => v.toLowerCase().includes(q))
      }
      emptyText="Henüz firma yok."
    />
  );
}
