'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronsUpDown, ChevronUp, FilterX, GripVertical, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
    // Göster/gizle dropdown'unda görünecek kullanıcı-okur etiket. Verilmezse
    // header string'i, o da yoksa column.id kullanılır.
    columnLabel?: string;
    // İlk açılışta kolon kapalı başlasın (localStorage'da kayıt yoksa).
    // Kullanıcı KOLONLAR menüsünden açabilir; açıkça açılırsa tercih persist.
    defaultHidden?: boolean;
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
  // Kolon görünürlüğü + sıralama tercihini localStorage'da saklamak için anahtar.
  // Her tabloya farklı bir anahtar verilmeli; verilmezse persist edilmez.
  storageKey?: string;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = 'Ara…',
  globalFilterFn,
  emptyText = 'Kayıt yok.',
  toolbar,
  headerLeft,
  pageSize = 50,
  rowClassName,
  rowStyle,
  sorting: sortingControlled,
  onSortingChange,
  manualSorting,
  compact = false,
  filterActions,
  storageKey,
}: DataTableProps<T>) {
  const [sortingInner, setSortingInner] = React.useState<SortingState>([]);
  const sorting = sortingControlled ?? sortingInner;

  // SSR ile birebir aynı başlangıç state. localStorage hidrasyondan SONRA
  // effect'te okunur; aksi takdirde server (boş tercih) ve client (persisted
  // tercih) ilk render'da farklı kolon sırası/görünürlüğü üretip mismatch verir.
  const storageReadKey = storageKey ? `data-table:${storageKey}` : null;
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = React.useState<string[]>([]);
  const hydratedRef = React.useRef(false);

  // meta.defaultHidden = true olan kolonların id'leri — localStorage'da kayıt
  // yokken bu kolonlar otomatik gizli başlasın.
  const defaultHiddenIds = React.useMemo(() => {
    const ids: string[] = [];
    for (const c of columns) {
      const meta = c.meta as { defaultHidden?: boolean } | undefined;
      if (meta?.defaultHidden) {
        const id = (c as { id?: string }).id ?? (c as { accessorKey?: string }).accessorKey;
        if (id) ids.push(id);
      }
    }
    return ids;
  }, [columns]);

  // İlk mount'ta localStorage'tan oku ve state'i güncelle (hidrasyondan sonra).
  // Kayıt yoksa defaultHidden kolonları kapalı başlat. SADECE ilk mount'ta
  // çalışır — dependency'lere bağlasak parent'ın yeni columns referansı her
  // render'da effect'i tetikler ve user'ın toggle ettiği değeri geri yükler.
  React.useEffect(() => {
    if (hydratedRef.current) return;
    if (typeof window === 'undefined') {
      hydratedRef.current = true;
      return;
    }
    let applied = false;
    if (storageReadKey) {
      try {
        const raw = window.localStorage.getItem(storageReadKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { v?: VisibilityState; o?: string[] };
          if (parsed.v) { setColumnVisibility(parsed.v); applied = true; }
          if (parsed.o) setColumnOrder(parsed.o);
        }
      } catch {
        /* parse / quota — sessizce yut */
      }
    }
    if (!applied && defaultHiddenIds.length > 0) {
      const v: VisibilityState = {};
      for (const id of defaultHiddenIds) v[id] = false;
      setColumnVisibility(v);
    }
    hydratedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sonraki değişiklikleri localStorage'a yaz; hidrasyon öncesi ilk default'u yazma.
  React.useEffect(() => {
    if (!storageReadKey || typeof window === 'undefined' || !hydratedRef.current) return;
    try {
      window.localStorage.setItem(
        storageReadKey,
        JSON.stringify({ v: columnVisibility, o: columnOrder }),
      );
    } catch {
      /* quota / private mode — sessizce yut */
    }
  }, [storageReadKey, columnVisibility, columnOrder]);
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
    state: { sorting, columnFilters, columnVisibility, columnOrder },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
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
                          if (idx === lastEmptyIdx) {
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
                                  <ColumnVisibilityMenu table={table} />
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

// Kolon göster/gizle + sıralama dropdown'u — filtre satırının sağ ucunda
// Settings2 ikonu. Click-outside ile kapanır. Native HTML5 drag-and-drop ile
// satır sürükleyince tablo kolon sırası anında güncellenir. Etiketsiz kolonlar
// (örn. boş header'lı actions) menüde gözükmez ve sıralanamaz.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ColumnVisibilityMenu({ table }: { table: any }) {
  const [open, setOpen] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // Panel pozisyonu fixed; Table wrapper'ı overflow-auto olduğu için absolute
  // pozisyonlama dropdown'u kesiyordu. Portal ile body'e taşıyıp viewport-relative
  // konum hesaplıyoruz.
  const [pos, setPos] = React.useState<{ top: number; right: number } | null>(null);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [open]);

  // Mevcut sıraya göre (TanStack getAllLeafColumns columnOrder uygular).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hideable: any[] = table.getAllLeafColumns().filter((c: any) => {
    if (!c.getCanHide()) return false;
    const meta = c.columnDef.meta as { columnLabel?: string } | undefined;
    const header = c.columnDef.header;
    return Boolean(
      meta?.columnLabel || (typeof header === 'string' && header.length > 0),
    );
  });

  if (hideable.length === 0) return null;

  // Sürükle-bırak: dragId'yi overId'nin pozisyonuna taşı. TanStack columnOrder
  // tüm leaf kolonları içermeli; hideable dışındaki structural kolonların
  // (actions vb.) yerini korumak için tam sırayı tekrar inşa ediyoruz.
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullIds: string[] = table.getAllLeafColumns().map((c: any) => c.id);
    const fromIdx = fullIds.indexOf(dragId);
    const toIdx = fullIds.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = fullIds.slice();
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, dragId);
    table.setColumnOrder(next);
    setDragId(null);
    setOverId(null);
  }

  const panel = open && pos && typeof document !== 'undefined' ? createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 100 }}
      className="min-w-[220px] max-h-[70vh] overflow-auto rounded-md border bg-popover p-2 shadow-md"
    >
      <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Kolonlar
      </p>
      <p className="mb-1 px-2 text-[10px] text-muted-foreground">
        Sürükle-bırak ile sırala
      </p>
      <div className="space-y-0.5">
        {hideable.map((c) => {
          const meta = c.columnDef.meta as { columnLabel?: string } | undefined;
          const header = c.columnDef.header;
          const label =
            meta?.columnLabel ??
            (typeof header === 'string' ? header : c.id);
          const isDragging = dragId === c.id;
          const isOver = overId === c.id && dragId !== null && dragId !== c.id;
          return (
            <div
              key={c.id}
              draggable
              onDragStart={(e) => {
                setDragId(c.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', c.id);
              }}
              onDragEnter={() => setOverId(c.id)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDragLeave={() => {
                setOverId((cur) => (cur === c.id ? null : cur));
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(c.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted',
                isDragging && 'opacity-40',
                isOver && 'ring-2 ring-primary/40',
              )}
            >
              <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground" />
              <Checkbox
                checked={c.getIsVisible()}
                onCheckedChange={(v) => c.toggleVisibility(!!v)}
              />
              <span className="cursor-grab text-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <Button
        ref={btnRef}
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
        title="Kolonları Göster/Gizle"
        aria-label="Kolonları Göster/Gizle"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Button>
      {panel}
    </>
  );
}
