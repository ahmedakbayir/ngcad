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
}: Props) {
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

  const filteredHierarchy = React.useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return hierarchy;
    const match = (s: string) => s.toLocaleLowerCase('tr').includes(q);
    // Hangi parent ID'leri sahnede tutmamız gerekiyor?
    // - Parent kendisi eşleşiyorsa
    // - Veya alt birimlerinden biri eşleşiyorsa (parent context için)
    const keepParent = new Set<string>();
    hierarchy.forEach((h) => {
      if (h.depth === 0 && match(h.item.firma_adi)) keepParent.add(h.item.id);
      if (h.depth === 1 && match(h.item.firma_adi) && h.item.parent_id) {
        keepParent.add(h.item.parent_id);
      }
    });
    return hierarchy.filter((h) => {
      if (h.depth === 0) {
        // Parent kendisi eşleşiyor mu? Veya alt birim eşleşmesi sebebiyle context olarak göster.
        return match(h.item.firma_adi) || keepParent.has(h.item.id);
      }
      // Child: kendisi eşleşmeli VEYA parent'ı eşleştiyse alt liste olarak göster.
      const parentMatches = h.item.parent_id ? match(byId.get(h.item.parent_id)?.firma_adi ?? '') : false;
      return match(h.item.firma_adi) || parentMatches;
    });
  }, [hierarchy, query, byId]);

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
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="h-9 border-0 bg-transparent pl-9 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {hierarchy.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{emptyText}</p>
            ) : filteredHierarchy.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">Eşleşme yok.</p>
            ) : (
              <ul className="divide-y">
                {filteredHierarchy.map(({ item, depth, isParent }) => {
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
                  return (
                    <li key={item.id}>
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
                          'flex w-full items-start justify-between gap-2 py-2 pr-3 text-left text-sm transition-colors',
                          depth === 1 ? 'pl-8' : 'pl-3',
                          fully && 'cursor-default opacity-50',
                          (blocked || externallyDisabled) && 'cursor-not-allowed opacity-40',
                          !fully && !blocked && !externallyDisabled && 'hover:bg-accent',
                        )}
                      >
                        <div className="min-w-0">
                          <div className={cn(
                            'leading-tight',
                            depth === 0 ? 'font-medium' : 'text-muted-foreground',
                          )}>
                            {depth === 1 && <span className="mr-1">↳</span>}
                            {item.firma_adi}
                          </div>
                          {isParent ? (
                            <div className="text-[10px] text-muted-foreground">
                              {children.length} alt birim
                              {partiallyAdded ? ' · kalanları ekle' : ' · toplu ekle'}
                            </div>
                          ) : (
                            <HintLines hint={item.hint} />
                          )}
                        </div>
                        {fully ? (
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
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

      {/* ── LISTBOX (sağ) ──────────────────────────────────────────── */}
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
                {selected.top.map((opt) => {
                  const subs = selected.subsByParent.get(opt.id) ?? [];
                  const isParentBadge = subs.length > 0;
                  return (
                    <li key={opt.id} className="px-3 py-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-medium leading-tight">
                            <span>{opt.firma_adi}</span>
                            {isParentBadge && (
                              <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground">
                                Parent
                              </span>
                            )}
                          </div>
                          <HintLines hint={opt.hint} />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          title="Kaldır"
                          onClick={() => {
                            // Parent kaldırılınca alt birimleri de düşür.
                            const all = [opt.id, ...subs.map((s) => s.id)];
                            onChange(value.filter((v) => !all.includes(v)));
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      {subs.length > 0 && (
                        <ul className="mt-1 space-y-1 border-l border-border/60 pl-2">
                          {subs.map((s) => (
                            <li
                              key={s.id}
                              className="flex items-start justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="text-muted-foreground">↳ {s.firma_adi}</div>
                                <HintLines hint={s.hint} />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 shrink-0"
                                title="Sadece bu alt birimi kaldır"
                                onClick={() => handleRemove(s.id)}
                              >
                                <X className="h-2.5 w-2.5" />
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* Üst firma için auto-inherit switch'i — yalnız bu parent listede ve callback verilmişse. */}
                      {isParentBadge && onAutoInheritChange && (
                        <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-2 py-1.5">
                          <Switch
                            checked={autoInheritSet.has(opt.id)}
                            onCheckedChange={(v) => onAutoInheritChange(opt.id, v)}
                          />
                          <span className="text-[11px] leading-tight text-muted-foreground">
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
