import type { SupabaseClient } from '@supabase/supabase-js';
import type { DFListItem, PFListItem, YoneticiAday } from './user-form';

// User formunun ihtiyaç duyduğu tüm seçenekler tek server fetch ile.
// PERF: user_pf / user_df full-table scan yerine yalnız yönetici adaylarının
// junction satırları çekilir; yönetici listesi de tek sorguda gelir.
export async function loadUserFormOptions(supabase: SupabaseClient) {
  // Önce PF/DF/yönetici listelerini paralel al — yönetici id'leri user_pf/df
  // sorgularını daraltmak için gerekli.
  const [pfRes, dfRes, yonRes] = await Promise.all([
    supabase.from('proje_firmalari').select('id, firma_adi, parent_id, df_id').order('firma_adi'),
    supabase.from('dagitim_firmalari').select('id, firma_adi, parent_id').order('firma_adi'),
    supabase
      .from('users')
      .select('id, adi, firma_yonetici, gdf_yonetici')
      .or('firma_yonetici.eq.true,gdf_yonetici.eq.true')
      .order('adi'),
  ]);

  const yonRows = (yonRes.data ?? []) as {
    id: string; adi: string; firma_yonetici: boolean; gdf_yonetici: boolean;
  }[];
  const pfYonIds = yonRows.filter((y) => y.firma_yonetici).map((y) => y.id);
  const dfYonIds = yonRows.filter((y) => y.gdf_yonetici).map((y) => y.id);

  const [upfRes, udfRes] = await Promise.all([
    pfYonIds.length
      ? supabase.from('user_pf').select('user_id, pf_id').in('user_id', pfYonIds)
      : Promise.resolve({ data: [] as { user_id: string; pf_id: string }[] }),
    dfYonIds.length
      ? supabase.from('user_df').select('user_id, df_id').in('user_id', dfYonIds)
      : Promise.resolve({ data: [] as { user_id: string; df_id: string }[] }),
  ]);

  const pfRows = (pfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null; df_id: string | null }[];
  const dfRows = (dfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[];
  const dfAdById = new Map(dfRows.map((d) => [d.id, d.firma_adi]));

  // PF → bağlı DF adı (tek-DF modeli; "(GDF: X)" hint'i için)
  const pfToDfAdlari = new Map<string, string[]>();
  pfRows.forEach((p) => {
    if (!p.df_id) return;
    const ad = dfAdById.get(p.df_id);
    if (ad) pfToDfAdlari.set(p.id, [ad]);
  });

  const pfList: PFListItem[] = pfRows.map((p) => ({
    id: p.id,
    firma_adi: p.firma_adi,
    parent_id: p.parent_id,
    df_adlari: pfToDfAdlari.get(p.id) ?? [],
    df_id: p.df_id,
  }));

  const dfList: DFListItem[] = dfRows.map((d) => ({
    id: d.id,
    firma_adi: d.firma_adi,
    parent_id: d.parent_id,
  }));

  // Yönetici adayları: her birinin yetkili olduğu firma_ids (kanala göre)
  const upfByUser = new Map<string, string[]>();
  (upfRes.data ?? []).forEach((r) => {
    const arr = upfByUser.get(r.user_id) ?? [];
    arr.push(r.pf_id);
    upfByUser.set(r.user_id, arr);
  });
  const udfByUser = new Map<string, string[]>();
  (udfRes.data ?? []).forEach((r) => {
    const arr = udfByUser.get(r.user_id) ?? [];
    arr.push(r.df_id);
    udfByUser.set(r.user_id, arr);
  });

  const yoneticiler: YoneticiAday[] = [];
  yonRows.forEach((y) => {
    if (y.firma_yonetici) {
      yoneticiler.push({ id: y.id, adi: y.adi, kanal: 'pf', firma_ids: upfByUser.get(y.id) ?? [] });
    }
    if (y.gdf_yonetici) {
      yoneticiler.push({ id: y.id, adi: y.adi, kanal: 'df', firma_ids: udfByUser.get(y.id) ?? [] });
    }
  });

  return {
    pfList,
    dfList,
    yoneticiler,
  };
}
