-- ============================================================================
-- 011 — users / PF / DF / projects için kapsamlı görünürlük (RLS)
-- ----------------------------------------------------------------------------
-- Kurallar:
--   • PF user → user_pf'inde bulunan PF'ler ve onların descendant PF'leri
--   • DF user → user_df'inde bulunan DF'ler ve onların descendant DF'leri
--   • Kendi yetki alanlarındaki: PF kayıtları, DF kayıtları (PF'nin df_id'si
--     üzerinden de PF DF user'a açılır), kullanıcılar, projeler.
--   • Sibling PF/DF kullanıcılarını/projelerini göremez.
--   • Admin tümünü görür; her user kendi profilini her zaman görür.
--   • mig 010'daki user_can_see_project tek-arg yerine (pf_id, df_id) iki-arg.
-- ============================================================================

-- ─── 1. Helper'lar ──────────────────────────────────────────────────────────

-- PF görünür mü? p_id'den parent_id zinciri yukarı yürür, user_pf'de eşleşme
-- arar. Yani p_id user'ın PF'i veya descendant'ı ise true.
create or replace function public.user_can_see_pf(p_id uuid)
returns boolean language sql stable security definer as $$
    with recursive ancestors as (
        select id, parent_id
          from public.proje_firmalari
         where id = p_id
        union
        select pf.id, pf.parent_id
          from public.proje_firmalari pf
          join ancestors a on pf.id = a.parent_id
    )
    select exists (
        select 1 from public.user_pf
         where user_id = auth.uid()
           and pf_id in (select id from ancestors)
    );
$$;

-- DF görünür mü? Aynı mantık, dagitim_firmalari + user_df.
create or replace function public.user_can_see_df(p_id uuid)
returns boolean language sql stable security definer as $$
    with recursive ancestors as (
        select id, parent_id
          from public.dagitim_firmalari
         where id = p_id
        union
        select df.id, df.parent_id
          from public.dagitim_firmalari df
          join ancestors a on df.id = a.parent_id
    )
    select exists (
        select 1 from public.user_df
         where user_id = auth.uid()
           and df_id in (select id from ancestors)
    );
$$;

-- Kullanıcı görünür mü? Kendi profili her zaman; aksi halde p_user_id
-- benim görebildiğim PF veya DF'lerden birinin junction'unda yer alıyor mu?
create or replace function public.user_can_see_user(p_user_id uuid)
returns boolean language sql stable security definer as $$
    select
        p_user_id = auth.uid()
        or exists (
            select 1 from public.user_pf upf
             where upf.user_id = p_user_id
               and public.user_can_see_pf(upf.pf_id)
        )
        or exists (
            select 1 from public.user_df udf
             where udf.user_id = p_user_id
               and public.user_can_see_df(udf.df_id)
        );
$$;

-- ─── 2. Eski policy ve fonksiyonu temizle (sırası önemli) ───────────────────

-- mig 010'da projects'e bağlanan policy'leri kaldır (fonksiyon DROP'tan önce)
drop policy if exists read_proj_pf   on public.projects;
drop policy if exists insert_own_proj on public.projects;
drop policy if exists update_own_proj on public.projects;

-- Tek arg'lı eski sürümü kaldır
drop function if exists public.user_can_see_project(uuid);

-- ─── 3. Yeni 2-arg user_can_see_project ─────────────────────────────────────

create or replace function public.user_can_see_project(p_pf_id uuid, p_df_id uuid)
returns boolean language sql stable security definer as $$
    select
        (p_pf_id is not null and public.user_can_see_pf(p_pf_id))
     or (p_df_id is not null and public.user_can_see_df(p_df_id));
$$;

-- ─── 4. SELECT policy'leri (eski açık olanları kaldır + yenisini koy) ──────

-- users — kendi yetki alanındakiler + admin tümü
drop policy if exists read_all_users    on public.users;
drop policy if exists read_users_scoped on public.users;
create policy read_users_scoped on public.users
    for select using (
        public.is_admin()
        or public.user_can_see_user(id)
    );

-- proje_firmalari — kendi PF zinciri + DF user için altındaki PF'ler
drop policy if exists read_all_pf    on public.proje_firmalari;
drop policy if exists read_pf_scoped on public.proje_firmalari;
create policy read_pf_scoped on public.proje_firmalari
    for select using (
        public.is_admin()
        or public.user_can_see_pf(id)
        or (df_id is not null and public.user_can_see_df(df_id))
    );

-- dagitim_firmalari — kendi DF zinciri
drop policy if exists read_all_df    on public.dagitim_firmalari;
drop policy if exists read_df_scoped on public.dagitim_firmalari;
create policy read_df_scoped on public.dagitim_firmalari
    for select using (
        public.is_admin()
        or public.user_can_see_df(id)
    );

-- ─── 5. projects RLS — yeni 2-arg helper ile ────────────────────────────────

create policy read_proj_pf on public.projects
    for select using (
        public.is_admin()
        or (pf_id is null and owner_user_id = auth.uid())
        or public.user_can_see_project(pf_id, df_id)
    );

create policy insert_own_proj on public.projects
    for insert
    with check (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
        and (pf_id is null or public.user_can_see_project(pf_id, df_id))
    );

create policy update_own_proj on public.projects
    for update
    using (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    )
    with check (
        owner_user_id = auth.uid()
        and (pf_id is null or public.user_can_see_project(pf_id, df_id))
    );
