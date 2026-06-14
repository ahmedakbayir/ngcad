-- 2026-06-14 — DF için yeterlilik_no kaldırıldı (sadece PF taşır).
alter table public.dagitim_firmalari drop column if exists yeterlilik_no;
