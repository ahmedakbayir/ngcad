-- ⚠ DESTRUCTIVE: Admin kullanıcılar HARİÇ tüm uygulama verisini siler.
-- Supabase Dashboard → SQL Editor üzerine yapıştırıp tek seferde çalıştırın.
-- Sıra: junction'lar → projeler → firmalar → admin olmayan public.users.
--
-- NOT: auth.users tablosundaki kayıtlar bu script'le silinmez; Supabase
-- Dashboard → Authentication → Users üzerinden manuel temizleyebilirsiniz.
-- public.users.id, auth.users.id'ye on delete cascade ile bağlıdır.

begin;

-- Junction tablolar (eski şema kalıntıları dahil)
delete from public.user_pf;
delete from public.user_df;
do $$
begin
    if to_regclass('public.pf_df') is not null then
        execute 'delete from public.pf_df';
    end if;
end$$;

-- Bağımlı veriler
delete from public.projects;

-- Firmalar (parent_id self-referencing; önce sıfırla, sonra sil)
update public.proje_firmalari   set parent_id = null;
update public.dagitim_firmalari set parent_id = null;
-- df_id kolonu migration 008 öncesi mevcut değil — dinamik kontrol.
do $$
begin
    if exists (
        select 1 from information_schema.columns
         where table_schema = 'public'
           and table_name = 'proje_firmalari'
           and column_name = 'df_id'
    ) then
        execute 'update public.proje_firmalari set df_id = null';
    end if;
end$$;
delete from public.proje_firmalari;
delete from public.dagitim_firmalari;

-- Admin olmayan kullanıcılar
delete from public.users where is_admin = false;

commit;
