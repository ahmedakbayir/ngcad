-- ============================================================================
-- 012 — PF kullanıcısı bağlı olduğu ÜST DF'i görebilsin (salt-okunur)
-- ----------------------------------------------------------------------------
-- Sorun: mig 011'deki read_df_scoped yalnızca user_can_see_df(id) izin veriyor,
-- yani kullanıcı sadece kendi user_df zincirindeki DF'leri görebiliyor. Ama bir
-- PF'in bağlı olduğu DF (proje_firmalari.df_id) PF'in ÜSTÜNDE — PF user'ın DF
-- zincirinde değil. Sonuç:
--   • PF sayfasına girince bağlı DF satırı RLS ile gizleniyor → boş/pasif.
--   • O PF'e proje kaydedince df_id join'i boş dönüyor → DF boş geliyor.
--
-- mig 011'de ters yön zaten simetrikti (PF policy'sinde user_can_see_df(df_id)
-- ile DF user alttaki PF'leri görüyor). Bu migration eksik yönü tamamlar:
-- PF user, görebildiği herhangi bir PF'in bağlı olduğu DF'i de görebilir.
--
-- Seçilebilirlik değişmez — bu yalnız SELECT/görünürlük. DF ataması yine
-- yalnızca DF user tarafında yapılır.
-- ============================================================================

-- Helper: bu DF, kullanıcının görebildiği bir PF'in bağlı olduğu DF mi?
-- user_can_see_pf yalnız proje_firmalari + user_pf üzerinden yürür; DF'e
-- referans vermez, dolayısıyla karşılıklı özyineleme (recursion) yok.
create or replace function public.user_can_see_df_via_pf(p_df_id uuid)
returns boolean language sql stable security definer as $$
    select exists (
        select 1
          from public.proje_firmalari pf
         where pf.df_id = p_df_id
           and public.user_can_see_pf(pf.id)
    );
$$;

-- read_df_scoped'ı genişlet: kendi DF zinciri VEYA bağlı PF üzerinden.
drop policy if exists read_df_scoped on public.dagitim_firmalari;
create policy read_df_scoped on public.dagitim_firmalari
    for select using (
        public.is_admin()
        or public.user_can_see_df(id)
        or public.user_can_see_df_via_pf(id)
    );
