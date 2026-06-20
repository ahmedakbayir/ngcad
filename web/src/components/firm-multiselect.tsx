'use client';

import * as React from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Combobox + listbox: tüm firmalar hiyerarşik olarak listelenir (parent'lar
// üstte, child'lar girintili). Parent satırına + basılınca parent + tüm
// child'lar listbox'a eklenir. Tek bir child'a + basılınca o child + parent
// (yoksa otomatik) eklenir.

export interface FirmOption {
  id: string;
  firma_adi: string;
  parent_id?: string | null;
  // Ek bağlam: tek satır (string) veya alt alta satırlar (string[]).
  hint?: string | string[];
  // Dış kuralla pasifleştirme (ör. başka bir üst firmaya zaten bağlı).
  disabled?: boolean;
  disabledReason?: string;
  // PF için bağlı DF id'si — listbox üstündeki DF filtresi bu alandan süzer.
  dfId?: string | null;
}

export interface DfFilterOption {
  id: string;
  firma_adi: string;
}

function HintLines({ hint }: { hint: string | string[] | undefined }) {
  if (!hint) return null;
  const lines = Array.isArray(hint) ? hint : [hint];
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 text-[10px] text-muted-foreground">
      {lines.map((l, i) => (
        <div key={`${l}-${i}`}>{l}</div>
      ))}
    </div>
  );
}

interface Props {
  options: FirmOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  comboboxLabel?: string;
  listboxLabel?: string;
  emptyText?: string;
  // Seçim tek bir anchor (parent veya standalone) ağacıyla sınırlandırılır.
  // Bir anchor seçildikten sonra başka anchor'lara ait satırlar tıklanamaz olur.
  singleAnchor?: boolean;
  // Üst firma id'leri için auto_inherit bayrağı. Bu listede olan parent'ın
  // altında listbox'ta bir switch görünür; switch açıkken yeni alt birim
  // eklendiğinde sunucu tarafı kullanıcıyı otomatik bağlar.
  autoInheritIds?: string[];
  onAutoInheritChange?: (parentId: string, value: boolean) => void;
  // Listbox üzerinde DF filtresi göstermek için. PF kullanılırken FirmOption.dfId
  // doluysa kullanıcı tek bir DF'ye göre seçilenleri süzebilir (UI only filtre).
  dfFilterOptions?: DfFilterOption[];
}

export function FirmMultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Firma adıyla ara…',
  comboboxLabel = 'Firmalar',
  listboxLabel = 'Seçilenler',
  emptyText = 'Tanımlı firma yok.',
  singleAnchor = false,
  autoInheritIds,
  onAutoInheritChange,
  dfFilterOptions,
}: Props) {
  // Combobox DF filtresi state — UI only, sol taraftaki seçim listesini süzer.
  const [comboboxDfFilter, setComboboxDfFilter] = React.useState<string>('all');
  // Parent collaps state (Set parent id) — varsayılan: hepsi açık.
  const [collapsedParents, setCollapsedParents] = React.useState<Set<string>>(
    () => new Set(),
  );
  const toggleParent = React.useCallback((pid: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);
  // Sol combobox parent collaps state — varsayılan: hepsi KAPALI (uzun listede
  // önce parent'ları gör, gerekirse aç). Arama yapılınca otomatik açılır
  // (filteredHierarchy görünür yapı verir, collaps'i bypass ederiz).
  const [comboboxCollapsed, setComboboxCollapsed] = React.useState<Set<string>>(
    () => new Set(),
  );
  const toggleComboboxParent = React.useCallback((pid: string) => {
    setComboboxCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }, []);
  // İlk render: tüm parent'ları collapsed olarak başlat (toplu çekirdek
  // kullanıcının "compact" beklentisi). options değişimini izlemek için key
  // olarak topLevel parent id setini kullanırız.
  const autoInheritSet = React.useMemo(
    () => new Set(autoInheritIds ?? []),
    [autoInheritIds],
  );
  const [query, setQuery] = React.useState('');

  const byId = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  // parent_id → child[]
  const childrenByParent = React.useMemo(() => {
    const m = new Map<string, FirmOption[]>();
    options.forEach((o) => {
      if (!o.parent_id) return;
      const arr = m.get(o.parent_id) ?? [];
      arr.push(o);
      m.set(o.parent_id, arr);
    });
    return m;
  }, [options]);

  // Üst düzey: parent_id olmayan VEYA parent'ı bu seçim havuzunda bulunmayan
  // ("öksüz") firmalar. Aksi halde üst firmasının filtrelenip listede olmaması
  // durumunda alt birim hiyerarşide görünmez ve aramada bulunamaz.
  const topLevel = React.useMemo(
    () => options.filter((o) => !o.parent_id || !byId.has(o.parent_id)),
    [options, byId],
  );

  // Hiyerarşik düz liste: her parent + altında children sıralı.
  // Filtreleme bu yapı üzerinde yapılır; bir child eşleşirse parent'ı da gösterilir.
  type HierarchyItem = { item: FirmOption; depth: 0 | 1; isParent: boolean };
  const hierarchy = React.useMemo<HierarchyItem[]>(() => {
    const items: HierarchyItem[] = [];
    topLevel.forEach((p) => {
      const kids = childrenByParent.get(p.id) ?? [];
      items.push({ item: p, depth: 0, isParent: kids.length > 0 });
      kids.forEach((k) => items.push({ item: k, depth: 1, isParent: false }));
    });
    return items;
  }, [topLevel, childrenByParent]);

  // İlk montajda + options değişiminde tüm parent'ları collapsed yap.
  const parentIdsKey = React.useMemo(
    () => topLevel.filter((p) => (childrenByParent.get(p.id)?.length ?? 0) > 0).map((p) => p.id).join('|'),
    [topLevel, childrenByParent],
  );
  React.useEffect(() => {
    setComboboxCollapsed(new Set(parentIdsKey.split('|').filter(Boolean)));
  }, [parentIdsKey]);

  const filteredHierarchy = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    const dfActive = comboboxDfFilter !== 'all';
    if (!q && !dfActive) return hierarchy;
    const match = (s: string) => s.toLocaleLowerCase('tr').includes(q);
    const matchDf = (opt: FirmOption) => opt.dfId === comboboxDfFilter;
    const pass = (opt: FirmOption) => {
      const okText = !q || match(opt.firma_adi);
      const okDf = !dfActive || matchDf(opt);
      return okText && okDf;
    };
    // Hangi parent ID'leri sahnede tutmamız gerekiyor?
    // - Parent kendisi geçiyorsa
    // - Veya alt birimlerinden biri geçiyorsa (parent context için)
    const keepParent = new Set<string>();
    hierarchy.forEach((h) => {
      if (h.depth === 0 && pass(h.item)) keepParent.add(h.item.id);
      if (h.depth === 1 && pass(h.item) && h.item.parent_id) {
        keepParent.add(h.item.parent_id);
      }
    });
    return hierarchy.filter((h) => {
      if (h.depth === 0) {
        return pass(h.item) || keepParent.has(h.item.id);
      }
      // Child: kendisi geçmeli VEYA parent'ı keepParent'taysa context olarak göster.
      return pass(h.item) || (h.item.parent_id ? keepParent.has(h.item.parent_id) : false);
    });
  }, [hierarchy, query, comboboxDfFilter]);

  const valueSet = React.useMemo(() => new Set(value), [value]);

  // Aktif anchor (singleAnchor=true ise): mevcut seçimdeki ilk öğenin parent_id'si
  // (varsa) veya id'si. Yoksa null — yeni anchor seçilebilir.
  const activeAnchorId = React.useMemo<string | null>(() => {
    if (!singleAnchor || value.length === 0) return null;
    for (const id of value) {
      const opt = byId.get(id);
      if (!opt) continue;
      return opt.parent_id ?? opt.id;
    }
    return null;
  }, [singleAnchor, value, byId]);

  function anchorOf(opt: FirmOption): string {
    return opt.parent_id ?? opt.id;
  }

  function isAnchorBlocked(opt: FirmOption): boolean {
    if (!singleAnchor || !activeAnchorId) return false;
    return anchorOf(opt) !== activeAnchorId;
  }

  function handleAddParent(opt: FirmOption) {
    const children = childrenByParent.get(opt.id) ?? [];
    const toAdd = [opt.id, ...children.map((c) => c.id)];
    onChange(Array.from(new Set([...value, ...toAdd])));
  }

  function handleAddChild(child: FirmOption) {
    const next = new Set(value);
    next.add(child.id);
    if (child.parent_id) next.add(child.parent_id);
    onChange(Array.from(next));
  }

  function handleAddStandalone(opt: FirmOption) {
    if (valueSet.has(opt.id)) return;
    onChange([...value, opt.id]);
  }

  function handleRemove(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  // Seçilenler: parent'ı kendi alt grubunda göstermek için parent_id'ye göre grupla.
  const selected = React.useMemo(() => {
    const items = value
      .map((id) => byId.get(id))
      .filter((o): o is FirmOption => Boolean(o));
    // Sıra: önce parent'ı olmayanlar (parent kendisi veya standalone),
    // sonra altlarında parent_id'leri eşleşen children sıralı.
    const top: FirmOption[] = [];
    const subsByParent = new Map<string, FirmOption[]>();
    items.forEach((it) => {
      if (it.parent_id && valueSet.has(it.parent_id)) {
        const arr = subsByParent.get(it.parent_id) ?? [];
        arr.push(it);
        subsByParent.set(it.parent_id, arr);
      } else {
        top.push(it);
      }
    });
    return { top, subsByParent };
  }, [value, byId, valueSet]);

  // Sayım: çocuğu da seçili olan parent kendisi sayılmaz (yetki child'larda).
  // Listeleme/sayma sadece efektif bölge sayısını yansıtır.
  const total = React.useMemo(() => {
    const valueArr = value;
    const set = valueSet;
    const hasSelectedChild = (id: string) =>
      (childrenByParent.get(id) ?? []).some((c) => set.has(c.id));
    return valueArr.filter((id) => {
      const opt = byId.get(id);
      if (!opt) return true;
      return !hasSelectedChild(opt.id);
    }).length;
  }, [value, valueSet, byId, childrenByParent]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* ── COMBOBOX (sol) ─────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label className="text-xs">{comboboxLabel}</Label>
        <div className="rounded-md border bg-background">
          <div className="flex items-stretch border-b">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={placeholder}
                className="h-9 border-0 bg-transparent pl-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            {dfFilterOptions && dfFilterOptions.length > 0 && (
              <select
                value={comboboxDfFilter}
                onChange={(e) => setComboboxDfFilter(e.target.value)}
                className="h-9 shrink-0 border-l bg-background px-2 text-[11px]"
                title="DF'ye göre listeyi süz"
              >
                <option value="all">Tüm DF&apos;ler</option>
                {dfFilterOptions.map((df) => (
                  <option key={df.id} value={df.id}>
                    {df.firma_adi}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="max-h-64 overflow-auto">
            {hierarchy.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
            ) : filteredHierarchy.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Eşleşme yok.</p>
            ) : (
              <ul className="divide-y">
                {filteredHierarchy
                  // Collaps: arama yoksa kapalı parent'ın child'larını gizle.
                  // Arama varken (query) tüm eşleşmeler görünür kalır.
                  .filter((h) => {
                    if (query.trim()) return true;
                    if (h.depth === 0) return true;
                    return !(h.item.parent_id && comboboxCollapsed.has(h.item.parent_id));
                  })
                  .map(({ item, depth, isParent }) => {
                  const children = childrenByParent.get(item.id) ?? [];
                  // Eklenmiş sayılır mı?
                  const fully = isParent
                    ? valueSet.has(item.id) && children.every((c) => valueSet.has(c.id))
                    : valueSet.has(item.id);
                  const partiallyAdded = isParent && !fully && (
                    valueSet.has(item.id) || children.some((c) => valueSet.has(c.id))
                  );
                  const blocked = !fully && isAnchorBlocked(item);
                  const externallyDisabled = !fully && Boolean(item.disabled);
                  const onClick = isParent
                    ? () => handleAddParent(item)
                    : item.parent_id
                      ? () => handleAddChild(item)
                      : () => handleAddStandalone(item);
                  const isCollapsed = comboboxCollapsed.has(item.id);
                  return (
                    <li key={item.id} className="flex items-stretch">
                      {/* Parent caret: collaps toggle. Ana button'dan ayrı bir
                          alan, böylece + ekleme ile çakışmaz. */}
                      {isParent ? (
                        <button
                          type="button"
                          onClick={() => toggleComboboxParent(item.id)}
                          className="flex w-6 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent"
                          title={isCollapsed ? 'Aç' : 'Kapat'}
                          aria-label={isCollapsed ? 'Aç' : 'Kapat'}
                        >
                          <span
                            className={cn(
                              'inline-block text-[10px] transition-transform',
                              !isCollapsed && 'rotate-90',
                            )}
                          >
                            ▶
                          </span>
                        </button>
                      ) : (
                        <div className="w-6 shrink-0" />
                      )}
                      <button
                        type="button"
                        disabled={fully || blocked || externallyDisabled}
                        title={
                          externallyDisabled
                            ? item.disabledReason
                            : blocked
                              ? 'Aynı anda yalnız tek bir üst firma seçilebilir'
                              : undefined
                        }
                        onClick={onClick}
                        className={cn(
                          'flex flex-1 items-center justify-between gap-2 py-1 pr-2 text-left text-[12px] transition-colors',
                          depth === 1 ? 'pl-3' : 'pl-1',
                          fully && 'cursor-default opacity-50',
                          (blocked || externallyDisabled) && 'cursor-not-allowed opacity-40',
                          !fully && !blocked && !externallyDisabled && 'hover:bg-accent',
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className={cn(
                            'truncate leading-tight',
                            depth === 0 ? 'font-medium' : 'text-muted-foreground',
                          )}>
                            {depth === 1 && <span className="mr-1">↳</span>}
                            {item.firma_adi}
                          </div>
                          {isParent && (
                            <div className="text-[10px] text-muted-foreground">
                              {children.length} alt · {partiallyAdded ? 'kalanları ekle' : 'toplu ekle'}
                            </div>
                          )}
                          {!isParent && <HintLines hint={item.hint} />}
                        </div>
                        {fully ? (
                          <Check className="h-3 w-3 shrink-0 text-emerald-600" />
                        ) : (
                          <Plus className="h-3 w-3 shrink-0 opacity-60" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* ── LISTBOX (sağ) — kompakt + parent collaps ──── */}
      <div className="space-y-2">
        <Label className="text-xs">
          {listboxLabel} <span className="text-muted-foreground">({total})</span>
        </Label>
        <div className="rounded-md border bg-background">
          <div className="max-h-72 overflow-auto">
            {total === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Henüz seçim yok.</p>
            ) : (
              <ul className="divide-y">
                {selected.top
                  .map((opt) => {
                    const subs = selected.subsByParent.get(opt.id) ?? [];
                    return { opt, subs };
                  })
                  .map(({ opt, subs }) => {
                  const isParentBadge = subs.length > 0;
                  const isCollapsed = collapsedParents.has(opt.id);
                  return (
                    <li key={opt.id} className="px-2 py-1.5 text-[12px]">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => isParentBadge && toggleParent(opt.id)}
                          className={cn(
                            'flex min-w-0 flex-1 items-start gap-1.5 text-left',
                            isParentBadge && 'cursor-pointer',
                          )}
                        >
                          {isParentBadge && (
                            <span
                              className={cn(
                                'mt-0.5 inline-block h-3 w-3 shrink-0 text-muted-foreground transition-transform',
                                !isCollapsed && 'rotate-90',
                              )}
                            >
                              ▶
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 font-medium leading-tight">
                              <span className="truncate">{opt.firma_adi}</span>
                              {isParentBadge && (
                                <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground">
                                  {subs.length}
                                </span>
                              )}
                            </div>
                            {!isParentBadge && <HintLines hint={opt.hint} />}
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0"
                          title="Kaldır"
                          onClick={() => {
                            const all = [opt.id, ...subs.map((s) => s.id)];
                            onChange(value.filter((v) => !all.includes(v)));
                          }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                      {subs.length > 0 && !isCollapsed && (
                        <ul className="mt-1 space-y-0.5 border-l border-border/60 pl-2">
                          {subs.map((s) => (
                              <li
                                key={s.id}
                                className="flex items-start justify-between gap-2 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <div className="text-muted-foreground">↳ {s.firma_adi}</div>
                                  <HintLines hint={s.hint} />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-4 w-4 shrink-0"
                                  title="Sadece bu alt birimi kaldır"
                                  onClick={() => handleRemove(s.id)}
                                >
                                  <X className="h-2 w-2" />
                                </Button>
                              </li>
                            ))}
                        </ul>
                      )}
                      {/* Auto-inherit switch — parent ve callback varsa. */}
                      {isParentBadge && onAutoInheritChange && !isCollapsed && (
                        <div className="mt-1.5 flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-2 py-1">
                          <Switch
                            checked={autoInheritSet.has(opt.id)}
                            onCheckedChange={(v) => onAutoInheritChange(opt.id, v)}
                          />
                          <span className="text-[10px] leading-tight text-muted-foreground">
                            <span className="font-medium text-foreground">{opt.firma_adi}</span>{' '}
                            altına eklenecek yeni firmalar için de yetkili olsun
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
