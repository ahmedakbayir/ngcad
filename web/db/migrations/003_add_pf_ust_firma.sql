-- 2026-06-15 — Proje firmalarına "üst firma" işareti.
-- Bu flag işaretlendiğinde firma DF (dağıtım firması) bağı taşımaz; UI'da
-- "Üst Firma" kolonunda ÜST FİRMA rozeti olarak görünür.
alter table public.proje_firmalari
    add column if not exists ust_firma boolean not null default false;
