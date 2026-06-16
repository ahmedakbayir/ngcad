-- 2026-06-15 — "Alt birim sahibi" firmalar için ust_firma bayrağını doldur.
-- Önceki sürümlerde parent_id atanmış DF/PF'ler ust_firma=false kalabildi;
-- bu durumda tablo "ÜST FİRMA" rozeti gösteriyordu (alt birim sayısı > 0)
-- ama düzenleme formu çeksiz açılıyordu. Veri ile UI'yi senkronlamak için
-- alt birim sahibi olan tüm firmaların bayrağı true'ya çekilir.

update public.dagitim_firmalari
   set ust_firma = true
 where ust_firma = false
   and id in (
       select distinct parent_id
         from public.dagitim_firmalari
        where parent_id is not null
   );

update public.proje_firmalari
   set ust_firma = true
 where ust_firma = false
   and id in (
       select distinct parent_id
         from public.proje_firmalari
        where parent_id is not null
   );
