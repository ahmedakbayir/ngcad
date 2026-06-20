// Kolon arama kutusu için akıllı operatör desteği.
// Desteklenen önekler: >=, <=, >, <, !=, <> (= != ile aynı)
// Operatör sayısal değerse karşılaştırma, metin değerse:
//   - '!=' / '<>' → İÇERMEYEN (substring negate)
//   - diğer operatörler metin için kullanılmaz → fallback substring contains
// Operatörsüz değer: case-insensitive substring contains (Türkçe locale).
//
// BOŞ/DOLU TOKEN'LARI: filtre kutusuna "null" yazılırsa boş hücreler, "not null"
// yazılırsa dolu hücreler getirilir. "!= null" / "<> null" de "dolu" anlamına
// gelir. Token'lar case-insensitive ve trim'lenir.
//
// Tarih desteği: hem hücre hem de filtre değeri ISO formatında (YYYY-MM-DD,
// YYYY-MM veya YYYY) ise tarih karşılaştırması uygulanır. Operatöre göre
// kısmi tarihler aralığın uç noktasına genişler: >2026 → 2026-12-31'den sonra,
// <2026 → 2026-01-01'den önce gibi. Tırnaklı yazımlar ("YYYY-MM-DD") da
// kabul edilir.

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
      return { op: p, rest: stripQuotes(v.slice(p.length).trim()) };
    }
  }
  return { op: null, rest: stripQuotes(v.trim()) };
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const f = s[0], l = s[s.length - 1];
    if ((f === '"' || f === "'") && f === l) return s.slice(1, -1);
  }
  return s;
}

function toNum(s: string): number | null {
  if (s === '') return null;
  // Tarih biçimindeki değerleri sayıya çevirme (dash içerirler) — açıkça reddet.
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return null;
  // Türkçe ondalık için virgülü noktaya çevir.
  const normalized = s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// ISO biçimi tarihleri (YYYY, YYYY-MM, YYYY-MM-DD) sayısal YYYYMMDD'ye çevirir.
// Aralık karşılaştırmaları için 'edge': 'low' (ay/yıl başlangıcı) ya da 'high'
// (ay/yıl sonu) seçeneğiyle eksik bileşenler doldurulur.
function toDate(s: string, edge: 'low' | 'high' | 'exact'): number | null {
  const m = s.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  let mo = m[2] ? parseInt(m[2], 10) : null;
  let d  = m[3] ? parseInt(m[3], 10) : null;
  if (mo == null) mo = edge === 'high' ? 12 : 1;
  if (d == null) {
    if (edge === 'high') {
      // Ayın son günü
      d = new Date(y, mo, 0).getDate();
    } else {
      d = 1;
    }
  }
  return y * 10000 + mo * 100 + d;
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

  // Boş/dolu token'ları — operatör veya operatörsüz çalışır.
  const restLc = rest.trim().toLocaleLowerCase('tr');
  const isCellEmpty = cellStr.trim() === '';
  const isNullToken = restLc === 'null';
  const isNotNullToken = restLc === 'not null' || restLc === 'notnull';
  if (op == null && isNullToken) return isCellEmpty;
  if (op == null && isNotNullToken) return !isCellEmpty;
  if ((op === '!=' || op === '<>') && isNullToken) return !isCellEmpty;
  // Sayısal değer denemesi (hem hücre hem filtre tarafında).
  const cellNum = toNum(cellStr);
  const filterNum = toNum(rest);
  // Tarih değeri denemesi — hücre her zaman tam tarih kabul edilir.
  const cellDate = toDate(cellStr, 'exact');

  if (op === '!=' || op === '<>') {
    if (cellDate != null) {
      const f = toDate(rest, 'exact');
      if (f != null) return cellDate !== f;
    }
    if (cellNum != null && filterNum != null) return cellNum !== filterNum;
    return !lc(cellStr).includes(lc(rest));
  }

  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    // Önce tarih karşılaştırması — kısmi tarihler aralık uç noktasına genişler.
    if (cellDate != null) {
      // >YYYY → YYYY-12-31'den sonra; <YYYY → YYYY-01-01'den önce
      const edge: 'low' | 'high' =
        op === '>' || op === '<=' ? 'high' : 'low';
      const f = toDate(rest, edge);
      if (f != null) {
        switch (op) {
          case '>':  return cellDate >  f;
          case '>=': return cellDate >= f;
          case '<':  return cellDate <  f;
          case '<=': return cellDate <= f;
        }
      }
    }
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

