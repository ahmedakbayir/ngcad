// Parent + tüm child'lar seçili ise yalnızca parent gösterilir.
// Parent + bazı child'lar seçili ise yalnızca child'lar gösterilir.
// Master listede id → parent_id eşlemesi bekleniyor.

export interface HierarchyRef {
  id: string;
  firma_adi: string;
  parent_id?: string | null;
}

interface MasterRef {
  id: string;
  parent_id: string | null;
}

export function collapseFirmHierarchy<T extends HierarchyRef>(
  selected: T[],
  master: MasterRef[],
): T[] {
  if (selected.length === 0) return [];

  const selectedIds = new Set(selected.map((s) => s.id));
  const byId = new Map(selected.map((s) => [s.id, s]));

  // master listeden parent → tüm child id'leri eşlemesi
  const childrenByParent = new Map<string, string[]>();
  master.forEach((m) => {
    if (!m.parent_id) return;
    const arr = childrenByParent.get(m.parent_id) ?? [];
    arr.push(m.id);
    childrenByParent.set(m.parent_id, arr);
  });

  const hide = new Set<string>();
  selected.forEach((s) => {
    const masterChildren = childrenByParent.get(s.id) ?? [];
    if (masterChildren.length === 0) return; // leaf parent — yalnız kendisi
    const selectedChildren = masterChildren.filter((id) => selectedIds.has(id));
    if (selectedChildren.length === 0) {
      // hiç child seçili değil → parent'ı yalnız göster (mevcut davranış)
      return;
    }
    if (selectedChildren.length === masterChildren.length) {
      // tüm child'lar seçili → parent yeter, child'ları gizle
      selectedChildren.forEach((id) => hide.add(id));
    } else {
      // kısmen seçili → parent'ı gizle, child'lar gösterilsin
      hide.add(s.id);
    }
  });

  const result: T[] = [];
  selected.forEach((s) => {
    if (!hide.has(s.id)) result.push(byId.get(s.id) as T);
  });
  return result;
}
