// Kolon arama kutusu için akıllı operatör desteği.
// Desteklenen önekler: >=, <=, >, <, !=, <> (= != ile aynı)
// Operatör sayısal değerse karşılaştırma, metin değerse:
//   - '!=' / '<>' → İÇERMEYEN (substring negate)
//   - diğer operatörler metin için kullanılmaz → fallback substring contains
// Operatörsüz değer: case-insensitive substring contains (Türkçe locale).

const PREFIXES = ['>=', '<=', '!=', '<>', '>', '<'] as const;
type Op = (typeof PREFIXES)[number];

interface Parsed {
  op: Op | null;
  rest: string;
}

function parse(raw: string): Parsed {
  const v = raw.trimStart();
  for (const p of PREFIXES) {
    if (v.startsWith(p)) {
      return { op: p, rest: v.slice(p.length).trim() };
    }
  }
  return { op: null, rest: v.trim() };
}

function toNum(s: string): number | null {
  if (s === '') return null;
  // Türkçe ondalık için virgülü noktaya çevir.
  const normalized = s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function lc(s: string): string {
  return s.toLocaleLowerCase('tr');
}

/** Bir hücre değerini (string) filtre ifadesine göre eşler. */
export function smartMatch(rowValueRaw: unknown, filterRaw: string): boolean {
  const filter = String(filterRaw ?? '');
  if (!filter.trim()) return true;
  const { op, rest } = parse(filter);
  if (!rest) return true;

  const cellStr = String(rowValueRaw ?? '');
  // Sayısal değer denemesi (hem hücre hem filtre tarafında).
  const cellNum = toNum(cellStr);
  const filterNum = toNum(rest);

  if (op === '!=' || op === '<>') {
    if (cellNum != null && filterNum != null) return cellNum !== filterNum;
    return !lc(cellStr).includes(lc(rest));
  }

  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    if (cellNum == null || filterNum == null) return false;
    switch (op) {
      case '>':  return cellNum >  filterNum;
      case '>=': return cellNum >= filterNum;
      case '<':  return cellNum <  filterNum;
      case '<=': return cellNum <= filterNum;
    }
  }

  // Operatörsüz: contains
  return lc(cellStr).includes(lc(rest));
}

/** TanStack table filterFn imzasına uygun yardımcı. */
export function smartFilterFn<T>(
  getCellValue: (row: T) => unknown,
) {
  return (row: { original: T }, _id: string, value: unknown) =>
    smartMatch(getCellValue(row.original), String(value ?? ''));
}

/**
 * TanStack tablodaki kolon için doğrudan kullanılabilir filterFn.
 * Hücre değerini row.getValue ile (accessorFn / accessorKey) alır.
 */
export function smartColumnFilterFn(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  value: unknown,
): boolean {
  return smartMatch(row.getValue(columnId), String(value ?? ''));
}

