-- ============================================================================
-- 009 — Projects RLS: kullanıcı kendi projesini insert/update edebilsin
-- ----------------------------------------------------------------------------
-- Önceden sadece is_admin yazabiliyordu. Artık authenticated user da
-- owner_user_id = auth.uid() koşuluyla insert/update edebilir.
-- ============================================================================

-- Admin tüm projeleri yazabilir (mevcut policy korunur). Burada user için ek policy.

drop policy if exists insert_own_proj on public.projects;
create policy insert_own_proj on public.projects
    for insert
    with check (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    );

drop policy if exists update_own_proj on public.projects;
create policy update_own_proj on public.projects
    for update
    using (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    )
    with check (
        owner_user_id = auth.uid()
    );

drop policy if exists delete_own_proj on public.projects;
create policy delete_own_proj on public.projects
    for delete
    using (
        auth.role() = 'authenticated'
        and owner_user_id = auth.uid()
    );
