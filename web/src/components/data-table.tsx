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
import { ChevronDown, ChevronsUpDown, ChevronUp, FilterX } from 'lucide-react';
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

export type SelectOptionVariant =
  | 'default' | 'default-soft' | 'secondary' | 'success' | 'warning' | 'info' | 'destructive';

export interface SelectFilterOption {
  value: string;
  label: string;
  variant?: SelectOptionVariant;
}

export type ColumnFilterConfig =
  | { type: 'text'; placeholder?: string }
  | { type: 'select'; options: SelectFilterOption[]; placeholder?: string };

// Combobox seçenekleri için yumuşak (filter dropdown'ında göze batmayan) tonlar.
// "default" = Üst Yönetici gibi baskın; "default-soft" = orta kademe Yönetici.
const VARIANT_CLS: Record<SelectOptionVariant, string> = {
  default:        'bg-primary/15 text-primary',
  'default-soft': 'bg-primary/5 text-primary/80',
  secondary:      'bg-muted text-muted-foreground',
  destructive:    'bg-destructive/10 text-destructive',
  success:        'bg-emerald-50 text-emerald-700',
  warning:        'bg-amber-50 text-amber-700',
  info:           'bg-sky-50 text-sky-700',
};

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
  // Satır başına ek Tailwind sınıfı (grup vurgusu, vb.).
  rowClassName?: (row: T, index: number) => string | undefined;
  // Satır başına inline style (örn. CSS değişkeniyle grup rengi).
  rowStyle?: (row: T, index: number) => React.CSSProperties | undefined;
  // Kontrollü sıralama: dışarıdan state geçilirse TanStack iç state yerine
  // bu state kullanılır; manualSorting true olunca verinin sırası dışarıda
  // hazırlanır (TanStack yeniden sıralamaz).
  sorting?: SortingState;
  onSortingChange?: (s: SortingState) => void;
  manualSorting?: boolean;
  // Kompakt mod: hücre padding'leri ve header yüksekliği daralır.
  compact?: boolean;
  // Filtre satırının en sağdaki konfigürasyonsuz hücresinde (Filtreleri Temizle
  // butonunun yanında) render edilecek ek aksiyonlar.
  filterActions?: React.ReactNode;
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
  rowClassName,
  rowStyle,
  sorting: sortingControlled,
  onSortingChange,
  manualSorting,
  compact = false,
  filterActions,
}: DataTableProps<T>) {
  const [sortingInner, setSortingInner] = React.useState<SortingState>([]);
  const sorting = sortingControlled ?? sortingInner;
  // Excel benzeri çoklu kolon sıralaması: yalnız son iki tıklama tutulur.
  // İlk tıklama → tek kolon. İkinci farklı kolon → yeni birincil, eskisi ikincil
  // (tie-breaker). Aynı kolona tekrar tıklama → yönü çevirir (asc/desc).
  const handleSortClick = (colId: string) => {
    const cur = sorting;
    const primary = cur[0];
    let next: SortingState;
    if (primary && primary.id === colId) {
      const flipped = { id: colId, desc: !primary.desc };
      next = cur.length > 1 ? [flipped, cur[1]] : [flipped];
    } else {
      const newPrim = { id: colId, desc: false };
      next = primary ? [newPrim, primary] : [newPrim];
    }
    if (onSortingChange) onSortingChange(next);
    if (!sortingControlled) setSortingInner(next);
  };
  const setSorting = (updater: React.SetStateAction<SortingState>) => {
    const next = typeof updater === 'function'
      ? (updater as (prev: SortingState) => SortingState)(sorting)
      : updater;
    if (onSortingChange) onSortingChange(next);
    if (!sortingControlled) setSortingInner(next);
  };
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  // Global arama kaldırıldı; her kolonda kendi filtresi var.
  const filtered = data;
  void globalFilterFn;
  void searchPlaceholder;

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualSorting,
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-3">
      {(headerLeft || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {headerLeft}
          <div className="ml-auto flex flex-wrap items-center gap-2">{toolbar}</div>
        </div>
      )}

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => {
              const hasAnyFilter = hg.headers.some(
                (h) => (h.column.columnDef.meta as { filter?: ColumnFilterConfig } | undefined)?.filter,
              );
              return (
                <React.Fragment key={hg.id}>
                  {/* Kolon başlıkları üstte. */}
                  <TableRow>
                    {hg.headers.map((h) => {
                      const canSort = h.column.getCanSort();
                      const sortIdx = sorting.findIndex((s) => s.id === h.column.id);
                      const sortEntry = sortIdx >= 0 ? sorting[sortIdx] : undefined;
                      return (
                        <TableHead
                          key={h.id}
                          style={{ width: h.getSize?.() || undefined }}
                          className={compact ? 'h-8 px-2 text-xs' : undefined}
                        >
                          {h.isPlaceholder ? null : (
                            <button
                              type="button"
                              disabled={!canSort}
                              onClick={() => canSort && handleSortClick(h.column.id)}
                              className={cn(
                                'flex items-center gap-1',
                                canSort && 'cursor-pointer select-none hover:text-foreground',
                              )}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {canSort && (
                                sortEntry
                                  ? sortEntry.desc
                                    ? <ChevronDown className="h-3 w-3" />
                                    : <ChevronUp className="h-3 w-3" />
                                  : <ChevronsUpDown className="h-3 w-3 opacity-40" />
                              )}
                              {sortIdx === 1 && (
                                <span className="ml-0.5 rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">
                                  2
                                </span>
                              )}
                            </button>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                  {hasAnyFilter && (() => {
                    // Filtre satırı (kolon başlığı altında). Styling yumuşatıldı.
                    // En sağdaki "konfigürasyonsuz" hücreye Filtreleri Temizle +
                    // filterActions buton(lar)ı yerleşir.
                    const lastEmptyIdx = (() => {
                      for (let i = hg.headers.length - 1; i >= 0; i--) {
                        const c = (hg.headers[i].column.columnDef.meta as { filter?: ColumnFilterConfig } | undefined)?.filter;
                        if (!c) return i;
                      }
                      return -1;
                    })();
                    const hasActiveFilters = table.getState().columnFilters.length > 0;
                    return (
                    <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
                      {hg.headers.map((h, idx) => {
                        const cfg = (h.column.columnDef.meta as { filter?: ColumnFilterConfig } | undefined)?.filter;
                        if (!cfg) {
                          if (idx === lastEmptyIdx && (hasActiveFilters || filterActions)) {
                            return (
                              <TableHead key={h.id} className="py-1.5">
                                <div className="flex items-center justify-end gap-1">
                                  {filterActions}
                                  {hasActiveFilters && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                      onClick={() => table.resetColumnFilters()}
                                      title="Filtreleri Temizle"
                                      aria-label="Filtreleri Temizle"
                                    >
                                      <FilterX className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableHead>
                            );
                          }
                          return <TableHead key={h.id} className="py-1.5" />;
                        }
                        const val = (h.column.getFilterValue() as string) ?? '';
                        if (cfg.type === 'select') {
                          return (
                            <TableHead key={h.id} className="py-1.5">
                              <Select
                                value={val === '' ? '__all__' : val}
                                onValueChange={(v) => h.column.setFilterValue(v === '__all__' ? undefined : v)}
                              >
                                <SelectTrigger className="h-7 w-full rounded-md border-input/40 bg-background px-2.5 text-[11px] font-normal text-muted-foreground/90 shadow-none">
                                  <SelectValue placeholder={cfg.placeholder ?? 'Tümü'} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__all__">Tümü</SelectItem>
                                  {cfg.options.map((opt) => (
                                    <SelectItem
                                      key={opt.value}
                                      value={opt.value}
                                      className={
                                        opt.variant
                                          ? cn('my-0.5', VARIANT_CLS[opt.variant])
                                          : undefined
                                      }
                                    >
                                      {opt.label}
                                    </SelectItem>
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
                              className="h-7 rounded-md border-input/40 bg-background px-2.5 text-[11px] font-normal placeholder:text-muted-foreground/60 focus-visible:ring-1"
                            />
                          </TableHead>
                        );
                      })}
                    </TableRow>
                    );
                  })()}
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
              table.getRowModel().rows.map((row, idx) => (
                <TableRow
                  key={row.id}
                  className={rowClassName?.(row.original, idx)}
                  style={rowStyle?.(row.original, idx)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={compact ? 'px-2 py-1 text-xs' : undefined}
                    >
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
        <div>Toplam {filtered.length} kayıt</div>
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
