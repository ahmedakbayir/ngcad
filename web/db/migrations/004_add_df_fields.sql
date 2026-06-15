-- 2026-06-15 — Dağıtım firmalarına son güncelleme tarihi, güncel sürüm ve
-- DfirmNo (manuel tamsayı) eklenir.
alter table public.dagitim_firmalari
    add column if not exists son_guncelleme date,
    add column if not exists guncel_surum   integer,
    add column if not exists df_no          integer;

-- Mevcut parent (üst) ve tek başına bölgelere varsayılan sürüm 100.
-- (Child satırlarında null kalır; UI bu kolonu child seviyesinde göstermez.)
update public.dagitim_firmalari d
   set guncel_surum = 100
 where d.guncel_surum is null
   and (d.parent_id is null);
