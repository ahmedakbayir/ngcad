-- 2026-06-15 — Proje firması artık yalnızca TEK bir dağıtım firmasına bağlı.
-- pf_df junction tablosu kaldırılır; bağ proje_firmalari.df_id'de tutulur.
-- Migrasyon: birden çok DF'ye bağlı PF'ler için en son eklenen (created_at desc)
-- pf_df satırı tek geçerli bağ olarak alınır; diğerleri pf_df ile birlikte düşer.

alter table public.proje_firmalari
    add column if not exists df_id uuid references public.dagitim_firmalari(id) on delete set null;

-- Her PF için en son pf_df satırını seç ve df_id'ye yaz.
-- pf_df daha önce düşmüş olabilir (örn. reset script'i sonrası); o yüzden
-- backfill dinamik blokta yapılır.
do $$
begin
    if to_regclass('public.pf_df') is not null then
        execute $sql$
            with latest as (
                select distinct on (pf_id) pf_id, df_id
                  from public.pf_df
                 order by pf_id, created_at desc
            )
            update public.proje_firmalari pf
               set df_id = l.df_id
              from latest l
             where l.pf_id = pf.id
        $sql$;
    end if;
end$$;

-- Junction tablo artık gereksiz.
drop table if exists public.pf_df;

create index if not exists ix_pf_df_col on public.proje_firmalari(df_id);
