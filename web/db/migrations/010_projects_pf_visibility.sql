-- ============================================================================
-- 010 — Projects RLS: PF üyeliği + ancestor zinciriyle görünürlük
-- ----------------------------------------------------------------------------
-- Önceden read_all_proj tüm authenticated kullanıcılara açıktı. Artık:
--   • Admin → tüm projeler.
--   • Diğer → project.pf_id, user_pf'inde bulunan bir PF'ye veya o PF'lerden
--     birinin ancestor zincirine eşitse (parent_id yukarı yürür).
--     Sibling PF kullanıcıları göremez.
--   • Legacy NULL pf_id projeleri sadece owner görür.
-- Insert/update sırasında pf_id user'ın görünürlük zincirinde olmak zorunda.
-- ============================================================================

-- Helper: project.pf_id verildiğinde, current user (auth.uid) onu görebiliyor mu?
-- Ancestor traversal: project'in PF'sinden başlayıp parent_id zinciriyle yukarı.
-- User user_pf'de bu zincirin herhangi bir noktasında varsa true döner.
create or replace function public.user_can_see_project(p_pf_id uuid)
returns boolean language sql stable security definer as $$
    with recursive ancestors as (
        select id, parent_id
          from public.proje_firmalari
         where id = p_pf_id
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

-- READ — eski açık policy'yi kaldır, yenisini koy
drop policy if exists read_all_proj on public.projects;
drop policy if exists read_proj_pf  on public.projects;
create policy read_proj_pf on public.projects
    for select using (
        public.is_admin()
        or (pf_id is null and owner_user_id = auth.uid())
        or public.user_can_see_project(pf_id)
    );

-- INSERT — owner + pf_id görünür PF olmalı
drop policy if exists insert_own_proj on public.projects;
create policy insert_own_proj on public.projects
    for insert
    with check (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
        and (pf_id is null or public.user_can_see_project(pf_id))
    );

-- UPDATE — sadece owner update edebilir; update sonrası pf_id yine görünür olmalı
drop policy if exists update_own_proj on public.projects;
create policy update_own_proj on public.projects
    for update
    using (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    )
    with check (
        owner_user_id = auth.uid()
        and (pf_id is null or public.user_can_see_project(pf_id))
    );

-- DELETE — sadece owner silebilir (değişiklik yok ama idempotent yeniden yaz)
drop policy if exists delete_own_proj on public.projects;
create policy delete_own_proj on public.projects
    for delete
    using (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    );
