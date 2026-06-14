import type { SupabaseClient } from '@supabase/supabase-js';
import type { DFListItem, PFListItem, YoneticiAday } from './user-form';

// User formunun ihtiyaç duyduğu tüm seçenekler tek server fetch ile.
export async function loadUserFormOptions(supabase: SupabaseClient) {
  const [pfRes, dfRes, yonRes, upfRes, udfRes, pfdfRes] = await Promise.all([
    supabase.from('proje_firmalari').select('id, firma_adi, parent_id').order('firma_adi'),
    supabase.from('dagitim_firmalari').select('id, firma_adi, parent_id').order('firma_adi'),
    supabase
      .from('users')
      .select('id, adi, firma_yonetici, gdf_yonetici')
      .or('firma_yonetici.eq.true,gdf_yonetici.eq.true')
      .order('adi'),
    supabase.from('user_pf').select('user_id, pf_id'),
    supabase.from('user_df').select('user_id, df_id'),
    supabase.from('pf_df').select('pf_id, df_id'),
  ]);

  const pfRows = (pfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[];
  const dfRows = (dfRes.data ?? []) as { id: string; firma_adi: string; parent_id: string | null }[];
  const dfAdById = new Map(dfRows.map((d) => [d.id, d.firma_adi]));

  // PF → bağlı DF adları (yetkili firmalar listesinde "(GDF: X)" hint'i için)
  const pfToDfAdlari = new Map<string, string[]>();
  (pfdfRes.data ?? []).forEach((r) => {
    const arr = pfToDfAdlari.get(r.pf_id) ?? [];
    const ad = dfAdById.get(r.df_id);
    if (ad) arr.push(ad);
    pfToDfAdlari.set(r.pf_id, arr);
  });

  const pfList: PFListItem[] = pfRows.map((p) => ({
    id: p.id,
    firma_adi: p.firma_adi,
    parent_id: p.parent_id,
    df_adlari: pfToDfAdlari.get(p.id) ?? [],
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
  (yonRes.data ?? []).forEach((y) => {
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
