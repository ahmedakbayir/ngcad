-- 2026-06-15 — DFUser sadece TEK bir parent DF (veya tek başına standalone DF)
-- ağacında olabilir. Mevcut veride birden çok parent'a bağlı kullanıcılar varsa
-- alfabetik olarak ilk anchor'ı (uuid sırasına göre min) bırakılır, diğer
-- anchor'lara ait tüm user_df satırları silinir.

with df_anchor as (
    select id, coalesce(parent_id, id) as anchor_id
      from public.dagitim_firmalari
),
keep as (
    select ud.user_id,
           (min(da.anchor_id::text))::uuid as anchor_id
      from public.user_df ud
      join df_anchor da on da.id = ud.df_id
     group by ud.user_id
)
delete from public.user_df ud
 using df_anchor da, keep k
 where ud.df_id = da.id
   and ud.user_id = k.user_id
   and da.anchor_id <> k.anchor_id;
