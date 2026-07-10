import { supabaseServer } from '@/lib/supabase/server';

// Çapraz-kanal firma referansları (PF↔DF) link mi yoksa düz metin mi gösterilsin?
// Kural: kullanıcı bir kanalın DETAY sayfasına giremiyorsa o kanalın firma
// referansları tıklanabilir OLMAMALI (düz metin). Detay sayfaları admin VEYA
// kendi kanalı yetkilisine açık (bkz. pf/[id] & df/[id] route gate'leri), o yüzden:
//   canLinkPf = admin || firma_kullanicisi (PF kanalı)
//   canLinkDf = admin || gdf_kullanicisi  (DF kanalı)
// Böylece PF user DF linki görmez, DF user PF linki görmez; admin ikisini de görür.
export type FirmLinkAccess = { canLinkPf: boolean; canLinkDf: boolean };

export async function getFirmLinkAccess(): Promise<FirmLinkAccess> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { canLinkPf: false, canLinkDf: false };
  const { data: row } = await supabase
    .from('users')
    .select('is_admin, firma_kullanicisi, gdf_kullanicisi')
    .eq('id', user.id)
    .maybeSingle();
  const admin = Boolean(row?.is_admin);
  return {
    canLinkPf: admin || Boolean(row?.firma_kullanicisi),
    canLinkDf: admin || Boolean(row?.gdf_kullanicisi),
  };
}
