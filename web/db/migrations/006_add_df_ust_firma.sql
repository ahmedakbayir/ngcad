-- 2026-06-15 — Dağıtım firmalarına "üst firma" işareti.
-- Bir DF üst firma olarak işaretlendiğinde:
--   * PF'ler doğrudan bu üst firmaya bağlanamaz; yalnız alt birim DF'lere bağlanabilir.
--   * Mevcut pf_df bağları (üst firmaya gidenler) koparılır.
alter table public.dagitim_firmalari
    add column if not exists ust_firma boolean not null default false;

-- (Bu noktada hiçbir DF üst firma olarak işaretli olmadığı için temizlik gerekmez.
--  Sonraki güncellemelerde API tarafı, üst firma işaretlenen DF'in pf_df satırlarını siler.)
