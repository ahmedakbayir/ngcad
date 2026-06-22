// Proje açma / yeni proje yetkisi: yalnızca PF kullanıcısı, admin ve DF değil.
// Web UI'da "Yeni Proje" ve "CAD'de Aç" butonları bu kontrole bağlanır.
export function canOpenCad(u: { is_admin?: boolean | null; firma_kullanicisi?: boolean | null; gdf_kullanicisi?: boolean | null } | null | undefined): boolean {
  if (!u) return false;
  return !!u.firma_kullanicisi && !u.is_admin && !u.gdf_kullanicisi;
}

// Kullanıcı rol flag'lerinden insan-okur ünvan üretir.
// Hiyerarşi: PF Üst/Orta Yönetici → PF uzmanlık → DF Üst/Orta Yönetici → DF uzmanlık.
// Hiç rol yoksa boş string döner; bu durumda çağıran unvan'a dokunmaz.
type UserRoleInfo = {
  firma_yonetici?: boolean;
  firma_yonetici_kademe?: 'ust' | 'orta' | null;
  firma_proje_muhendisi?: boolean;
  firma_cizim_sorumlusu?: boolean;
  firma_tesisat_ustasi?: boolean;
  gdf_yonetici?: boolean;
  gdf_yonetici_kademe?: 'ust' | 'orta' | null;
  gdf_onay_muhendisi?: boolean;
  gdf_gaz_acma_muhendisi?: boolean;
  gdf_on_buro_yetkilisi?: boolean;
};

// Kullanıcının baskın rolünün sıralama önceliği — küçük rakam üstte.
// Hiyerarşi: Üst Yönetici (1) → Yönetici (2) → Mühendis/uzman rolleri (3..5)
// → rolsüz user (9). PF ve DF kanalları aynı rank uzayını paylaşır.
export function userRolRank(u: UserRoleInfo): number {
  if (u.firma_yonetici && u.firma_yonetici_kademe === 'ust') return 1;
  if (u.gdf_yonetici && u.gdf_yonetici_kademe === 'ust')   return 1;
  if (u.firma_yonetici && u.firma_yonetici_kademe === 'orta') return 2;
  if (u.gdf_yonetici && u.gdf_yonetici_kademe === 'orta')   return 2;
  if (u.firma_proje_muhendisi)  return 3;
  if (u.gdf_onay_muhendisi)     return 3;
  if (u.firma_cizim_sorumlusu)  return 4;
  if (u.gdf_gaz_acma_muhendisi) return 4;
  if (u.firma_tesisat_ustasi)   return 5;
  if (u.gdf_on_buro_yetkilisi)  return 5;
  return 9;
}

// Aynı UserRoleInfo + adi alanına sahip array'i hiyerarşi → ada göre yerinde
// sıralanmış yeni array döner. Detay sayfalarında "Üst Yönetici üstte" kuralı.
export function sortByRolRank<T extends UserRoleInfo & { adi: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const ra = userRolRank(a);
    const rb = userRolRank(b);
    if (ra !== rb) return ra - rb;
    return a.adi.localeCompare(b.adi, 'tr');
  });
}

export function deriveUnvanFromRoles(u: UserRoleInfo): string {
  if (u.firma_yonetici) {
    return u.firma_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici';
  }
  if (u.firma_proje_muhendisi) return 'Proje Mühendisi';
  if (u.firma_cizim_sorumlusu) return 'Çizim Sorumlusu';
  if (u.firma_tesisat_ustasi) return 'Tesisat Ustası';
  if (u.gdf_yonetici) {
    return u.gdf_yonetici_kademe === 'ust' ? 'Üst Yönetici' : 'Yönetici';
  }
  if (u.gdf_onay_muhendisi)     return 'Onay Mühendisi';
  if (u.gdf_gaz_acma_muhendisi) return 'Gaz Açma Mühendisi';
  if (u.gdf_on_buro_yetkilisi)  return 'Ön Büro Yetkilisi';
  return '';
}

// Payload'da unvan alanı varsa ve boşsa (null/undefined/whitespace), rol
// flag'lerinden türetip yerine yazar. Payload'u in-place mutate eder.
// Çağrı yerleri: /api/users (POST) ve /api/users/[id] (PATCH). PATCH için role
// flag'leri payload'da yoksa türetme boş kalır ve unvan değiştirilmez.
export function fillUnvanIfBlank(payload: Record<string, unknown>): void {
  if (!Object.prototype.hasOwnProperty.call(payload, 'unvan')) return;
  const cur = payload.unvan;
  const isBlank =
    cur == null || (typeof cur === 'string' && cur.trim() === '');
  if (!isBlank) return;
  const derived = deriveUnvanFromRoles(payload as UserRoleInfo);
  if (derived) payload.unvan = derived;
}
