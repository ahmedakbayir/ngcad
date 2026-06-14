-- 2026-06-14 — Tesisat ustaları için belge no kolonları.
alter table public.users
    add column if not exists usta_montaj_belge_no       text,
    add column if not exists usta_celik_kaynak_belge_no text,
    add column if not exists usta_pe_kaynak_belge_no    text;
