'use client';

import * as React from 'react';
import Link from 'next/link';
import { ColumnDef, type SortingState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/data-table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import type { FirmaRow } from '@/lib/supabase/types';
import { collapseFirmHierarchy } from '@/lib/firm-hierarchy';
import { smartColumnFilterFn } from '@/lib/smart-filter';
import { cn } from '@/lib/utils';

interface DFRef { id: string; firma_adi: string; parent_id?: string | null }

// 15 ayrı grup rengi — ardışık indeksler arasında hue farkı maksimize
// edilecek şekilde sıralandı; iki farklı grup yan yana benzer renk almıyor.
const GROUP_COLORS = [
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#22c55e', // green
  '#d946ef', // fuchsia
  '#0ea5e9', // sky
  '#f97316', // orange
  '#8b5cf6', // violet
  '#84cc16', // lime
  '#ec4899', // pink
  '#14b8a6', // teal
  '#eab308', // yellow
  '#3b82f6', // blue
  '#10b981', // emerald
] as const;


export function FirmaTable({
  firmas,
  basePath,
  pfDfMap,
  dfFilterList,
  dfMaster,
  compact = false,
  yetkiliUserById,
}: {
  firmas: FirmaRow[];
  basePath: '/firms/pf' | '/firms/df';
  pfDfMap?: Record<string, DFRef[]>;
  dfFilterList?: DFRef[];
  // Tüm DF'lerin parent_id bilgisi — bağlı DF kolonunda hiyerarşi daraltma için.
  dfMaster?: { id: string; parent_id: string | null }[];
  // Kompakt mod: satır padding'leri ve ikon boyutları küçülür (DF sayfası gibi).
  compact?: boolean;
  // Firma yetkili kullanıcı kolonu için lookup (verilirse kolon görünür).
  yetkiliUserById?: Record<string, { id: string; adi: string }>;
}) {
  const showDfColumn = basePath === '/firms/pf' && !!pfDfMap;
  const [dfFilter, setDfFilter] = React.useState<string>('all');
  // Collapse: parent anchor id'leri (kapalı tutulanlar). Açık varsayılan.
  const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
  const toggleCollapse = React.useCallback((anchorId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(anchorId)) next.delete(anchorId);
      else next.add(anchorId);
      return next;
    });
  }, []);

  // id —  firma_adi haritası (parent_id'yi ada çevirmek için) — orijinal listeden hesaplanmalı
  const adById = React.useMemo(() => {
    const m = new Map<string, string>();
    firmas.forEach((f) => m.set(f.id, f.firma_adi));
    return m;
  }, [firmas]);

  // Hiyerarşik sıra: önce parent'lar (alfabetik), her parent'tan hemen sonra child'ları.
  const orderedFirmas = React.useMemo(() => {
    const sorted = [...firmas].sort((a, b) =>
      a.firma_adi.localeCompare(b.firma_adi, 'tr'),
    );
    const byParent = new Map<string, FirmaRow[]>();
    const tops: FirmaRow[] = [];
    sorted.forEach((f) => {
      const pid = f.parent_id;
      if (pid && sorted.some((x) => x.id === pid)) {
        const arr = byParent.get(pid) ?? [];
        arr.push(f);
        byParent.set(pid, arr);
      } else {
        tops.push(f);
      }
    });
    const out: FirmaRow[] = [];
    tops.forEach((p) => {
      out.push(p);
      (byParent.get(p.id) ?? []).forEach((c) => out.push(c));
    });
    return out;
  }, [firmas]);

  const filteredFirmas = React.useMemo(() => {
    let base = orderedFirmas;
    if (showDfColumn && dfFilter !== 'all') {
      // Bir satır eşleşirse aynı gruptaki diğerlerini de koru (parent + child birlikte).
      const matches = new Set(
        orderedFirmas
          .filter((f) => (pfDfMap?.[f.id] ?? []).some((d) => d.id === dfFilter))
          .map((f) => f.id),
      );
      const keepGroup = new Set<string>();
      orderedFirmas.forEach((f) => {
        if (!matches.has(f.id)) return;
        keepGroup.add(f.id);
        const parent = f.parent_id;
        if (parent) keepGroup.add(parent);
      });
      orderedFirmas.forEach((f) => {
        if (f.parent_id && keepGroup.has(f.parent_id)) keepGroup.add(f.id);
      });
      base = orderedFirmas.filter((f) => keepGroup.has(f.id));
    }
    // Collapse: kapalı parent'ın child'larını gizle.
    if (collapsed.size === 0) return base;
    return base.filter(
      (f) => !(f.parent_id && collapsed.has(f.parent_id)),
    );
  }, [orderedFirmas, dfFilter, pfDfMap, showDfColumn, collapsed]);

  // Alt birim mi? (parent listede mevcutsa indentasyon uygula)
  const isChildById = React.useMemo(() => {
    const s = new Set<string>();
    firmas.forEach((f) => {
      if (f.parent_id && adById.has(f.parent_id)) s.add(f.id);
    });
    return s;
  }, [firmas, adById]);

  // Grup boyutları (anchor id —  grup üye sayısı) — 1'den büyükse hafif vurgu uygula.
  const groupAnchorById = React.useMemo(() => {
    const m = new Map<string, string>();
    firmas.forEach((f) => {
      const anchor = f.parent_id && adById.has(f.parent_id) ? f.parent_id : f.id;
      m.set(f.id, anchor);
    });
    return m;
  }, [firmas, adById]);

  const groupSizeByAnchor = React.useMemo(() => {
    const m = new Map<string, number>();
    groupAnchorById.forEach((anchor) => {
      m.set(anchor, (m.get(anchor) ?? 0) + 1);
    });
    return m;
  }, [groupAnchorById]);

  // Çoklu (parent + en az 1 child) grup anchor'larını parent firma adına göre
  // sıralayıp ardışık renk indeksi atar. Bu, hash çakışmasıyla iki farklı
  // grubun aynı rengi almasını engeller. 15'ten fazla grup olunca renk
  // havuzu döner (yine de mümkün olduğunca uzak indeksler dağıtılır).
  const colorByAnchor = React.useMemo(() => {
    const multiAnchors = Array.from(groupSizeByAnchor.entries())
      .filter(([, size]) => size > 1)
      .map(([anchor]) => anchor)
      .sort((a, b) =>
        (adById.get(a) ?? '').localeCompare(adById.get(b) ?? '', 'tr'),
      );
    const m = new Map<string, string>();
    multiAnchors.forEach((anchor, idx) => {
      m.set(anchor, GROUP_COLORS[idx % GROUP_COLORS.length]);
    });
    return m;
  }, [groupSizeByAnchor, adById]);

  // Grup-bilinçli sıralama: bir child satır parent satırının "değerini" miras
  // alır ve aynı grupta parent önce, sonra child'lar gelir.
  const firmById = React.useMemo(() => {
    const m = new Map<string, FirmaRow>();
    firmas.forEach((f) => m.set(f.id, f));
    return m;
  }, [firmas]);

  const getGroupAnchor = React.useCallback(
    (r: FirmaRow): FirmaRow => {
      if (r.parent_id) {
        const p = firmById.get(r.parent_id);
        if (p) return p;
      }
      return r;
    },
    [firmById],
  );

  const colValue = React.useCallback(
    (r: FirmaRow, colId: string): string => {
      switch (colId) {
        case 'no':
          return String(r.no).padStart(8, '0');
        case 'adi':
          return r.firma_adi.toLocaleLowerCase('tr');
        case 'iletisim':
          return `${r.firma_email ?? ''} ${r.firma_tel ?? ''}`.toLocaleLowerCase('tr');
        case 'parent': {
          const isUstFlag = 'ust_firma' in r && (r as { ust_firma?: boolean }).ust_firma;
          const isParentInList = (groupSizeByAnchor.get(r.id) ?? 1) > 1;
          if (isUstFlag || isParentInList) return 'üst firma';
          return r.parent_id ? (adById.get(r.parent_id) ?? '').toLocaleLowerCase('tr') : '';
        }
        case 'df':
          return collapseFirmHierarchy(pfDfMap?.[r.id] ?? [], dfMaster ?? [])
            .map((d) => d.firma_adi)
            .join(' ')
            .toLocaleLowerCase('tr');
        default:
          return '';
      }
    },
    [adById, pfDfMap, dfMaster, groupSizeByAnchor],
  );

  // Kontrollü sıralama state'i (manualSorting). TanStack tarafı sıralama
  // yapmaz; biz veriyi grup-bilinçli sıralayıp veriyoruz.
  const [sortingState, setSortingState] = React.useState<SortingState>([]);

  // Sayısal görünen kolonlar için sayısal sıralama uygula (no, df_no, guncel_surum).
  function compareForSort(a: string, b: string, colId: string): number {
    const numCols = new Set(['no', 'df_no', 'guncel_surum']);
    if (numCols.has(colId)) {
      const na = Number(a);
      const nb = Number(b);
      const aValid = Number.isFinite(na);
      const bValid = Number.isFinite(nb);
      if (aValid && bValid) return na - nb;
      if (aValid) return -1;
      if (bValid) return 1;
      return 0;
    }
    return a.localeCompare(b, 'tr');
  }

  const groupedSortingFn = React.useCallback(
    (rowA: { original: FirmaRow }, rowB: { original: FirmaRow }, columnId: string) => {
      const anchorA = getGroupAnchor(rowA.original);
      const anchorB = getGroupAnchor(rowB.original);
      if (anchorA.id === anchorB.id) {
        const aIsChild = rowA.original.id !== anchorA.id;
        const bIsChild = rowB.original.id !== anchorB.id;
        if (aIsChild !== bIsChild) return aIsChild ? 1 : -1;
        return compareForSort(
          colValue(rowA.original, columnId),
          colValue(rowB.original, columnId),
          columnId,
        );
      }
      return compareForSort(
        colValue(anchorA, columnId),
        colValue(anchorB, columnId),
        columnId,
      );
    },
    [getGroupAnchor, colValue],
  );

  // Manual sıralama: parent çocuklarının üstünde kalır; gruplar parent'ın
  // değerine göre asc/desc yönüne saygı duyarak konumlanır.
  // Çok kolonlu: sortingState[0] birincil, [1] (varsa) tie-breaker.
  const sortedFirmas = React.useMemo(() => {
    const sk0 = sortingState[0];
    if (!sk0) return filteredFirmas;
    const sk1 = sortingState[1];
    const cmpWith = (a: FirmaRow, b: FirmaRow) => {
      const c0 = (sk0.desc ? -1 : 1) * compareForSort(colValue(a, sk0.id), colValue(b, sk0.id), sk0.id);
      if (c0 !== 0 || !sk1) return c0;
      return (sk1.desc ? -1 : 1) * compareForSort(colValue(a, sk1.id), colValue(b, sk1.id), sk1.id);
    };
    const cmpAnchorVals = (g1: string, g2: string) => {
      const r1 = firmById.get(g1);
      const r2 = firmById.get(g2);
      if (!r1 || !r2) return 0;
      const c0 = (sk0.desc ? -1 : 1) * compareForSort(colValue(r1, sk0.id), colValue(r2, sk0.id), sk0.id);
      if (c0 !== 0 || !sk1) return c0;
      return (sk1.desc ? -1 : 1) * compareForSort(colValue(r1, sk1.id), colValue(r2, sk1.id), sk1.id);
    };
    const groups: { anchor: string; rows: FirmaRow[] }[] = [];
    const indexByAnchor = new Map<string, number>();
    filteredFirmas.forEach((f) => {
      const anchor = groupAnchorById.get(f.id) ?? f.id;
      let idx = indexByAnchor.get(anchor);
      if (idx === undefined) {
        idx = groups.length;
        indexByAnchor.set(anchor, idx);
        groups.push({ anchor, rows: [] });
      }
      groups[idx].rows.push(f);
    });
    groups.forEach(({ anchor, rows }) => {
      rows.sort((a, b) => {
        const aIsAnchor = a.id === anchor;
        const bIsAnchor = b.id === anchor;
        if (aIsAnchor !== bIsAnchor) return aIsAnchor ? -1 : 1;
        return cmpWith(a, b);
      });
    });
    groups.sort((g1, g2) => cmpAnchorVals(g1.anchor, g2.anchor));
    const out: FirmaRow[] = [];
    groups.forEach((g) => g.rows.forEach((r) => out.push(r)));
    return out;
  }, [filteredFirmas, sortingState, groupAnchorById, firmById, colValue]);

  // Sahip kolonu için combobox seçenekleri: DF firmalarındaki distinct sahip değerleri.
  const sahipOptions = React.useMemo(() => {
    if (basePath !== '/firms/df') return [];
    const set = new Set<string>();
    firmas.forEach((f) => {
      const v = (f as { sahip?: string | null }).sahip;
      if (v && v.trim()) set.add(v.trim());
    });
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b, 'tr'))
      .map((v) => ({ value: v, label: v }));
  }, [firmas, basePath]);

  const columns = React.useMemo<ColumnDef<FirmaRow>[]>(
    () => [
      {
        id: 'no',
        accessorKey: 'no',
        header: 'No',
        size: 60,
        cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">#{row.original.no}</span>,
        meta: { filter: { type: 'text', placeholder: '#' } },
        filterFn: smartColumnFilterFn,
        sortingFn: groupedSortingFn,
      },
      {
        id: 'adi',
        accessorKey: 'firma_adi',
        header: 'Firma',
        sortingFn: groupedSortingFn,
        cell: ({ row }) => {
          const r = row.original;
          const isChild = isChildById.has(r.id);
          const anchor = groupAnchorById.get(r.id);
          const groupSize = anchor ? groupSizeByAnchor.get(anchor) ?? 1 : 1;
          const isParentWithChildren = !isChild && groupSize > 1;
          const isCollapsed = collapsed.has(r.id);
          return (
            <div className={cn('flex items-center gap-1', isChild && 'pl-6')}>
              {isParentWithChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleCollapse(r.id);
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={isCollapsed ? 'Alt birimleri göster' : 'Alt birimleri gizle'}
                  aria-label={isCollapsed ? 'Alt birimleri göster' : 'Alt birimleri gizle'}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <span className="inline-block h-3.5 w-3.5 shrink-0" />
              )}
              <Link
                href={`${basePath}/${r.id}`}
                className="flex flex-1 items-center gap-2 hover:underline"
              >
                <div className="rounded-md bg-primary/10 p-1.5 text-primary">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="whitespace-nowrap font-medium leading-tight">
                    {r.firma_adi}
                    {isParentWithChildren && (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        ({(groupSizeByAnchor.get(r.id) ?? 1) - 1} alt)
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </div>
          );
        },
        meta: { filter: { type: 'text' } },
        filterFn: smartColumnFilterFn,
      },
      {
        id: 'parent',
        header: 'Firma Tipi',
        sortingFn: groupedSortingFn,
        accessorFn: (r) => {
          const isUstFlag = 'ust_firma' in r && (r as { ust_firma?: boolean }).ust_firma;
          const isParentInList = (groupSizeByAnchor.get(r.id) ?? 1) > 1;
          if (isUstFlag || isParentInList) return 'ÜST FİRMA';
          if (r.parent_id && adById.has(r.parent_id)) {
            return `ALT FİRMA ${adById.get(r.parent_id) ?? ''}`;
          }
          return 'TEKİL FİRMA';
        },
        cell: ({ row }) => {
          const r = row.original;
          const isUstFlag = 'ust_firma' in r && (r as { ust_firma?: boolean }).ust_firma;
          const isParentInList = (groupSizeByAnchor.get(r.id) ?? 1) > 1;
          if (isUstFlag || isParentInList) {
            return <Badge variant="info" className="text-[10px]">ÜST FİRMA</Badge>;
          }
          const pid = r.parent_id;
          if (pid && adById.has(pid)) {
            const ad = adById.get(pid)!;
            return (
              <Badge variant="warning" className="gap-1.5 whitespace-nowrap text-[10px]">
                <span>ALT FİRMA</span>
                <span className="opacity-60">|</span>
                <Link href={`${basePath}/${pid}`} className="hover:underline">
                  {ad}
                </Link>
              </Badge>
            );
          }
          return <Badge variant="success" className="text-[10px]">TEKİL FİRMA</Badge>;
        },
        meta: { filter: { type: 'text' } },
        filterFn: smartColumnFilterFn,
      },
      ...(basePath === '/firms/df'
        ? [
            {
              id: 'sahip',
              header: 'Sahip',
              accessorFn: (r: FirmaRow) => (r as { sahip?: string | null }).sahip ?? '',
              cell: ({ row }: { row: { original: FirmaRow } }) => {
                const v = (row.original as { sahip?: string | null }).sahip;
                if (!v) return <span className="text-xs text-muted-foreground">—</span>;
                return <span className="text-xs">{v}</span>;
              },
              meta: { filter: { type: 'select', options: sahipOptions } },
              filterFn: 'equalsString',
            } as ColumnDef<FirmaRow>,
            {
              id: 'df_no',
              header: 'DfirmNo',
              accessorFn: (r: FirmaRow) =>
                String((r as { df_no?: number | null }).df_no ?? ''),
              cell: ({ row }: { row: { original: FirmaRow } }) => {
                const v = (row.original as { df_no?: number | null }).df_no;
                if (v == null) return <span className="text-xs text-muted-foreground">—</span>;
                return <span className="font-mono text-xs">{v}</span>;
              },
              meta: { filter: { type: 'text', placeholder: '#' } },
              filterFn: smartColumnFilterFn,
            } as ColumnDef<FirmaRow>,
            {
              id: 'son_guncelleme',
              header: 'Son Güncelleme',
              // Yalnız parent + standalone'da değer; child satırı boş.
              accessorFn: (r: FirmaRow) => {
                if (isChildById.has(r.id)) return '';
                return (r as { son_guncelleme?: string | null }).son_guncelleme ?? '';
              },
              cell: ({ row }: { row: { original: FirmaRow } }) => {
                const r = row.original;
                if (isChildById.has(r.id)) return null;
                const v = (r as { son_guncelleme?: string | null }).son_guncelleme;
                if (!v) return <span className="text-xs text-muted-foreground">—</span>;
                return <span className="font-mono text-xs">{v}</span>;
              },
              meta: { filter: { type: 'text', placeholder: '>2026-01-01' } },
              filterFn: smartColumnFilterFn,
            } as ColumnDef<FirmaRow>,
            {
              id: 'guncel_surum',
              header: 'Güncel Sürüm',
              // Yalnız parent + standalone'da değer; child satırı boş.
              accessorFn: (r: FirmaRow) => {
                const isChild = isChildById.has(r.id);
                if (isChild) return '';
                const v = (r as { guncel_surum?: number | null }).guncel_surum;
                return v == null ? '' : String(v);
              },
              cell: ({ row }: { row: { original: FirmaRow } }) => {
                const r = row.original;
                if (isChildById.has(r.id)) return null;
                const v = (r as { guncel_surum?: number | null }).guncel_surum;
                if (v == null) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                  <Badge variant="outline" className="font-mono text-[10px]">v{v}</Badge>
                );
              },
              meta: { filter: { type: 'text', placeholder: '#' } },
              filterFn: smartColumnFilterFn,
            } as ColumnDef<FirmaRow>,
          ]
        : []),
      ...(showDfColumn
        ? [{
            id: 'df',
            header: 'Bağlı DF',
            sortingFn: groupedSortingFn,
            // İlk bağlı DF adına göre sıralanır.
            accessorFn: (r: FirmaRow) =>
              collapseFirmHierarchy(pfDfMap?.[r.id] ?? [], dfMaster ?? [])
                .map((d) => d.firma_adi)
                .join(' '),
            cell: ({ row }: { row: { original: FirmaRow } }) => {
              const raw = pfDfMap?.[row.original.id] ?? [];
              const dfs = collapseFirmHierarchy(raw, dfMaster ?? []);
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
            filterFn: smartColumnFilterFn,
          } as ColumnDef<FirmaRow>]
        : []),
      ...(yetkiliUserById
        ? [{
            id: 'yetkili_user',
            header: 'Yetkili Kullanıcı',
            accessorFn: (r: FirmaRow) => yetkiliUserById[r.yetkili_user_id ?? '']?.adi ?? '',
            cell: ({ row }: { row: { original: FirmaRow } }) => {
              const uid = row.original.yetkili_user_id;
              if (!uid) return <span className="text-xs text-muted-foreground">—</span>;
              const u = yetkiliUserById[uid];
              if (!u) return <span className="text-xs text-muted-foreground">—</span>;
              return (
                <Link href={`/users/${u.id}`} className="text-xs hover:underline">
                  {u.adi}
                </Link>
              );
            },
            meta: { filter: { type: 'text', placeholder: 'Yetkili…' } },
            filterFn: smartColumnFilterFn,
          } as ColumnDef<FirmaRow>]
        : []),
      // Boş "actions" kolonu — DataTable filterActions'ı (Hepsini Aç/Kapat) ve
      // "Filtreleri Temizle" butonunu en sağdaki filtre-konfigürasyonsuz hücreye
      // yerleştirir. Kolon görünür ama içeriği yok.
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        size: 36,
        cell: () => null,
      },
    ],
    [
      basePath,
      adById,
      pfDfMap,
      showDfColumn,
      isChildById,
      dfMaster,
      groupedSortingFn,
      groupAnchorById,
      groupSizeByAnchor,
      collapsed,
      toggleCollapse,
      yetkiliUserById,
      sahipOptions,
    ],
  );

  // Tümünü aç/kapat: en az bir parent açık ise hepsini kapatır, aksi halde hepsini açar.
  const multiAnchorIds = React.useMemo(
    () =>
      Array.from(groupSizeByAnchor.entries())
        .filter(([, size]) => size > 1)
        .map(([anchor]) => anchor),
    [groupSizeByAnchor],
  );
  const allCollapsed =
    multiAnchorIds.length > 0 &&
    multiAnchorIds.every((id) => collapsed.has(id));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(multiAnchorIds));
  };

  // Sadece DF filtre Select'i toolbar'da kalır; "Hepsini Aç/Kapat" filtre
  // satırına alındı (filterActions üzerinden).
  const toolbar =
    dfFilterList && dfFilterList.length > 0 ? (
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
    ) : null;

  const filterActions =
    multiAnchorIds.length > 0 ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={toggleAll}
        title={allCollapsed ? 'Hepsini Aç' : 'Hepsini Kapat'}
        aria-label={allCollapsed ? 'Hepsini Aç' : 'Hepsini Kapat'}
      >
        {allCollapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </Button>
    ) : null;

  return (
    <DataTable
      columns={columns}
      data={sortedFirmas}
      sorting={sortingState}
      onSortingChange={setSortingState}
      manualSorting
      compact={compact}
      filterActions={filterActions}
      storageKey={basePath === '/firms/pf' ? 'firms-pf' : basePath === '/firms/df' ? 'firms-df' : undefined}
      searchPlaceholder="Firma adı, e-posta ara…"
      globalFilterFn={(r, q) =>
        [r.firma_adi, r.firma_email ?? '', r.firma_tel ?? '', r.vergi_no ?? '', r.vergi_dairesi ?? '']
          .some((v) => v.toLowerCase().includes(q))
      }
      emptyText="Henüz firma yok."
      toolbar={toolbar}
      rowClassName={(r) => {
        const anchor = groupAnchorById.get(r.id);
        const size = anchor ? groupSizeByAnchor.get(anchor) ?? 1 : 1;
        if (size <= 1) return undefined; // tekil — sade
        const isParent = r.id === anchor;
        const isLastChild = (() => {
          const sameGroup = sortedFirmas.filter(
            (f) => groupAnchorById.get(f.id) === anchor,
          );
          return sameGroup[sameGroup.length - 1]?.id === r.id && !isParent;
        })();
        return cn(
          'bg-muted/20',
          '[&>td:first-child]:relative',
          '[&>td:first-child]:before:absolute',
          '[&>td:first-child]:before:left-0',
          '[&>td:first-child]:before:top-0',
          '[&>td:first-child]:before:h-full',
          '[&>td:first-child]:before:w-[3px]',
          '[&>td:first-child]:before:[background-color:var(--group-color,theme(colors.muted.foreground/0.25))]',
          isParent &&
            '[&>td:first-child]:before:w-[4px]',
          isLastChild && '[&>td]:border-b-2',
        );
      }}
      rowStyle={(r) => {
        const anchor = groupAnchorById.get(r.id);
        const size = anchor ? groupSizeByAnchor.get(anchor) ?? 1 : 1;
        if (size <= 1 || !anchor) return undefined;
        const color = colorByAnchor.get(anchor);
        if (!color) return undefined;
        return { ['--group-color' as string]: color };
      }}
    />
  );
}
