// Veritabanı satırlarının TypeScript yansıması.
// schema.sql ile elle senkron tutulur (supabase gen types ile otomatikleştirilebilir).

export type YoneticiKademe = 'ust' | 'orta';
export type ProjeMuhYetki  = 'icTesisat' | 'endustriyel';

export interface UserRow {
  id: string;
  adi: string;
  unvan: string | null;
  email: string;
  gsm: string | null;
  profil_fotografi: string | null;
  is_admin: boolean;

  firma_kullanicisi: boolean;
  firma_yonetici: boolean;
  firma_yonetici_kademe: YoneticiKademe | null;
  firma_proje_muhendisi: boolean;
  firma_cizim_sorumlusu: boolean;
  firma_tesisat_ustasi: boolean;
  usta_montaj: boolean;
  usta_montaj_belge_no: string | null;
  usta_celik_kaynak: boolean;
  usta_celik_kaynak_belge_no: string | null;
  usta_pe_kaynak: boolean;
  usta_pe_kaynak_belge_no: string | null;

  gdf_kullanicisi: boolean;
  gdf_yonetici: boolean;
  gdf_yonetici_kademe: YoneticiKademe | null;
  gdf_onay_muhendisi: boolean;
  gdf_gaz_acma_muhendisi: boolean;
  gdf_on_buro_yetkilisi: boolean;

  bagli_oldugu_yonetici_id: string | null;
  proje_muh_oda_sicil_no: number | null;
  proje_muh_kayit_no: string | null;
  proje_muh_yetki_durumu: ProjeMuhYetki | null;
  onay_muh_gdf_sicil_no: string | null;
  gaz_acma_muh_ekip_no: string | null;

  created_at: string;
  updated_at: string;
}

export interface BaseFirmaRow {
  id: string;
  no: number;
  firma_adi: string;
  parent_id: string | null;
  firma_tel: string | null;
  firma_email: string | null;
  vergi_dairesi: string | null;
  vergi_no: string | null;
  adres: string | null;
  yetkili_user_id: string | null;
  created_at: string;
  updated_at: string;
}

// PF için yeterlilik_no var, DF için yok.
export interface ProjeFirmaRow extends BaseFirmaRow {
  yeterlilik_no: string | null;
  // PF tek bir DF'ye bağlanır.
  df_id: string | null;
  // İşaretliyse PF "üst firma"dır; DF bağı taşımaz, alt birim PF'lerin parent'ı olur.
  ust_firma: boolean;
}
export interface DagitimFirmaRow extends BaseFirmaRow {
  sahip:          string | null; // DF'i sahiplenen üst kuruluş (ör. "Aksa Doğal Gaz")
  son_guncelleme: string | null; // date (YYYY-MM-DD)
  guncel_surum:   number | null; // yalnız parent / standalone DF'lerde anlamlı
  df_no:          number | null;
  // İşaretliyse DF "üst firma"dır; PF doğrudan bağlanamaz, alt birim DF'lerin parent'ı olur.
  ust_firma:      boolean;
}

// Tablo komponentleri her ikisini de aldığı için union.
export type FirmaRow = ProjeFirmaRow | DagitimFirmaRow;

export interface ProjectRow {
  id: string;
  no: number;
  proje_adi: string;
  pf_id: string | null;
  df_id: string | null;
  owner_user_id: string | null;
  cad_data: unknown | null;
  durum: string | null;
  created_at: string;
  updated_at: string;
}

export type UserKategori = 'admin' | 'pf' | 'df' | 'general';

export function getUserKategori(u: Pick<UserRow, 'is_admin' | 'firma_kullanicisi' | 'gdf_kullanicisi'>): UserKategori {
  if (u.is_admin)           return 'admin';
  if (u.firma_kullanicisi)  return 'pf';
  if (u.gdf_kullanicisi)    return 'df';
  return 'general';
}
