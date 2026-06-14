'use client';

import * as React from 'react';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronsUpDown, ChevronUp, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// Kolon başına filtre meta'sı. ColumnDef.meta.filter ile verilir.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    filter?: ColumnFilterConfig;
  }
}

export type ColumnFilterConfig =
  | { type: 'text'; placeholder?: string }
  | { type: 'select'; options: { value: string; label: string }[]; placeholder?: string };

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  globalFilterFn?: (row: T, q: string) => boolean;
  emptyText?: string;
  toolbar?: React.ReactNode;
  // Arama kutusunun SOLuna yerleştirilecek içerik (örn. tab sekmeleri).
  // Verildiğinde arama kutusu sağ tarafa, içeriğin yanına alınır.
  headerLeft?: React.ReactNode;
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Ara…',
  globalFilterFn,
  emptyText = 'Kayıt yok.',
  toolbar,
  headerLeft,
  pageSize = 25,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const filtered = React.useMemo(() => {
    if (!globalFilter.trim()) return data;
    if (globalFilterFn) {
      return data.filter((r) => globalFilterFn(r, globalFilter.toLowerCase()));
    }
    const q = globalFilter.toLowerCase();
    return data.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [data, globalFilter, globalFilterFn]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {headerLeft}
        <div className={cn(
          'relative min-w-[240px] max-w-md',
          headerLeft ? 'ml-auto' : 'flex-1',
        )}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        <div className={cn('flex flex-wrap items-center gap-2', !headerLeft && 'ml-auto')}>{toolbar}</div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => {
              const hasAnyFilter = hg.headers.some(
                (h) => (h.column.columnDef.meta as { filter?: ColumnFilterConfig } | undefined)?.filter,
              );
              return (
                <React.Fragment key={hg.id}>
                  <TableRow>
                    {hg.headers.map((h) => {
                      const canSort = h.column.getCanSort();
                      const sorted = h.column.getIsSorted();
                      return (
                        <TableHead key={h.id} style={{ width: h.getSize?.() || undefined }}>
                          {h.isPlaceholder ? null : (
                            <button
                              type="button"
                              disabled={!canSort}
                              onClick={h.column.getToggleSortingHandler()}
                              className={cn(
                                'flex items-center gap-1',
                                canSort && 'cursor-pointer select-none hover:text-foreground',
                              )}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {canSort && (
                                sorted === 'asc' ? <ChevronUp className="h-3 w-3" /> :
                                sorted === 'desc' ? <ChevronDown className="h-3 w-3" /> :
                                <ChevronsUpDown className="h-3 w-3 opacity-40" />
                              )}
                            </button>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                  {hasAnyFilter && (
                    <TableRow className="border-t bg-muted/30 hover:bg-muted/30">
                      {hg.headers.map((h) => {
                        const cfg = (h.column.columnDef.meta as { filter?: ColumnFilterConfig } | undefined)?.filter;
                        if (!cfg) return <TableHead key={h.id} className="py-1.5" />;
                        const val = (h.column.getFilterValue() as string) ?? '';
                        if (cfg.type === 'select') {
                          return (
                            <TableHead key={h.id} className="py-1.5">
                              <Select
                                value={val === '' ? '__all__' : val}
                                onValueChange={(v) => h.column.setFilterValue(v === '__all__' ? undefined : v)}
                              >
                                <SelectTrigger className="h-7 w-full px-2 text-xs">
                                  <SelectValue placeholder={cfg.placeholder ?? 'Tümü'} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__all__">Tümü</SelectItem>
                                  {cfg.options.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableHead>
                          );
                        }
                        return (
                          <TableHead key={h.id} className="py-1.5">
                            <Input
                              value={val}
                              onChange={(e) => h.column.setFilterValue(e.target.value || undefined)}
                              placeholder={cfg.placeholder ?? 'Ara…'}
                              className="h-7 px-2 text-xs"
                            />
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Toplam {filtered.length} kayıt
          {globalFilter && data.length !== filtered.length && ` (${data.length} içinden)`}
        </div>
        <div className="flex items-center gap-2">
          <span>
            Sayfa {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            ◀
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            ▶
          </Button>
        </div>
      </div>
    </div>
  );
}
