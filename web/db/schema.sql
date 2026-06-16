-- ============================================================================
-- AANGCAD — Web yönetim paneli şeması (PostgreSQL / Supabase)
-- ----------------------------------------------------------------------------
-- Bu dosyayı Supabase Dashboard → SQL Editor'a yapıştırıp "Run" deyin.
-- Tek seferde çalışacak şekilde idempotent yazıldı (DROP yok — sıfırdan kur).
-- ============================================================================

-- ── ENUM TÜRLERİ ────────────────────────────────────────────────────────────
create type yonetici_kademe as enum ('ust', 'orta');
create type proje_muh_yetki  as enum ('icTesisat', 'endustriyel');

-- ============================================================================
-- USERS — Supabase auth.users'a 1-1 bağlanır
-- ============================================================================
create table public.users (
    id                    uuid primary key references auth.users(id) on delete cascade,

    -- Temel kimlik
    adi                   text not null,
    unvan                 text,                     -- ör. "Müdür", "Mühendis"
    email                 text not null unique,
    gsm                   text,
    profil_fotografi      text,                     -- storage URL veya dataURL

    -- Admin/genel kullanıcı flag'i (firma/gdf seçilmemişse generalUser)
    is_admin              boolean not null default false,

    -- ── FİRMA KULLANICISI (PFUser) ─────────────────────────────────────────
    firma_kullanicisi     boolean not null default false,
    firma_yonetici        boolean not null default false,
    firma_yonetici_kademe yonetici_kademe,
    firma_proje_muhendisi boolean not null default false,
    firma_cizim_sorumlusu boolean not null default false,
    firma_tesisat_ustasi  boolean not null default false,
    usta_montaj           boolean not null default false,
    usta_montaj_belge_no       text,
    usta_celik_kaynak     boolean not null default false,
    usta_celik_kaynak_belge_no text,
    usta_pe_kaynak        boolean not null default false,
    usta_pe_kaynak_belge_no    text,

    -- ── GDF KULLANICISI (DFUser) ───────────────────────────────────────────
    gdf_kullanicisi       boolean not null default false,
    gdf_yonetici          boolean not null default false,
    gdf_yonetici_kademe   yonetici_kademe,
    gdf_onay_muhendisi    boolean not null default false,
    gdf_gaz_acma_muhendisi boolean not null default false,
    gdf_on_buro_yetkilisi boolean not null default false,

    -- ── BAĞLI OLDUĞU YÖNETİCİ ──────────────────────────────────────────────
    bagli_oldugu_yonetici_id uuid references public.users(id) on delete set null,

    -- ── MÜHENDİS BİLGİLERİ ─────────────────────────────────────────────────
    proje_muh_oda_sicil_no   integer,
    proje_muh_kayit_no       text,
    proje_muh_yetki_durumu   proje_muh_yetki,
    onay_muh_gdf_sicil_no    text,
    gaz_acma_muh_ekip_no     text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    -- ── KISITLAR ───────────────────────────────────────────────────────────
    -- Bir user SADECE PFUser ya da DFUser olabilir (ikisi birden değil)
    constraint chk_pf_xor_df check (
        not (firma_kullanicisi and gdf_kullanicisi)
    ),

    -- FirmaKullanicisi seçildiyse alt rollerden en az biri olmalı
    constraint chk_firma_min_rol check (
        not firma_kullanicisi
        or (firma_yonetici or firma_proje_muhendisi or firma_cizim_sorumlusu or firma_tesisat_ustasi)
    ),

    -- Firma yöneticisi seçildiyse kademe zorunlu
    constraint chk_firma_yonetici_kademe check (
        not firma_yonetici or firma_yonetici_kademe is not null
    ),

    -- Tesisat ustası seçildiyse alt tiplerden en az biri olmalı
    constraint chk_usta_min_tip check (
        not firma_tesisat_ustasi
        or (usta_montaj or usta_celik_kaynak or usta_pe_kaynak)
    ),

    -- GDF Kullanıcısı seçildiyse alt rollerden en az biri olmalı
    constraint chk_gdf_min_rol check (
        not gdf_kullanicisi
        or (gdf_yonetici or gdf_onay_muhendisi or gdf_gaz_acma_muhendisi or gdf_on_buro_yetkilisi)
    ),

    -- GDF yöneticisi seçildiyse kademe zorunlu
    constraint chk_gdf_yonetici_kademe check (
        not gdf_yonetici or gdf_yonetici_kademe is not null
    )
);

create index ix_users_firma   on public.users(firma_kullanicisi) where firma_kullanicisi;
create index ix_users_gdf     on public.users(gdf_kullanicisi)   where gdf_kullanicisi;
create index ix_users_admin   on public.users(is_admin)          where is_admin;
create index ix_users_yonetici on public.users(bagli_oldugu_yonetici_id);

-- ============================================================================
-- DAĞITIM FİRMALARI (DF / GDF) — kendine self-referencing parent
-- ============================================================================
create table public.dagitim_firmalari (
    id              uuid primary key default gen_random_uuid(),
    no              serial unique,                    -- sıra numarası
    firma_adi       text not null,
    parent_id       uuid references public.dagitim_firmalari(id) on delete set null,
    firma_tel       text,
    firma_email     text,
    vergi_dairesi   text,
    vergi_no        text,
    adres           text,
    -- NOT: yeterlilik_no DF için yok (sadece PF taşır).
    yetkili_user_id uuid references public.users(id) on delete set null,
    -- DF-özel alanlar
    sahip           text,                             -- DF'i sahiplenen üst kuruluş (ör. "Aksa Doğal Gaz")
    son_guncelleme  date,
    guncel_surum    integer,                          -- yalnız parent/standalone'da kullanılır
    df_no           integer,                          -- manuel DfirmNo
    -- İşaretliyse DF "üst firma"dır: PF'ler doğrudan buna bağlanamaz, alt birim DF'lerin parent'ı olur.
    ust_firma       boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index ix_df_parent on public.dagitim_firmalari(parent_id);

-- ============================================================================
-- PROJE FİRMALARI (PF)
-- ============================================================================
create table public.proje_firmalari (
    id              uuid primary key default gen_random_uuid(),
    no              serial unique,
    firma_adi       text not null,
    parent_id       uuid references public.proje_firmalari(id) on delete set null,
    firma_tel       text,
    firma_email     text,
    vergi_dairesi   text,
    vergi_no        text,
    adres           text,
    yeterlilik_no   text,
    yetkili_user_id uuid references public.users(id) on delete set null,
    -- Bir PF yalnızca tek bir DF'ye bağlanır.
    df_id           uuid references public.dagitim_firmalari(id) on delete set null,
    -- İşaretliyse firma "üst firma"dır: DF bağı taşımaz, alt birimlerin parent'ı olur.
    ust_firma       boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index ix_pf_parent on public.proje_firmalari(parent_id);
create index ix_pf_df_col on public.proje_firmalari(df_id);

-- ============================================================================
-- M-N: PFUser ↔ PF
-- ============================================================================
create table public.user_pf (
    user_id uuid not null references public.users(id)            on delete cascade,
    pf_id   uuid not null references public.proje_firmalari(id)  on delete cascade,
    -- İşaretliyse bu PF üst firma; altına yeni alt birim eklenince kullanıcıya
    -- otomatik (auto_inherit=false ile) bağlanır.
    auto_inherit boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (user_id, pf_id)
);

create index ix_user_pf_pf on public.user_pf(pf_id);

-- ============================================================================
-- M-N: DFUser ↔ DF
-- ============================================================================
create table public.user_df (
    user_id uuid not null references public.users(id)               on delete cascade,
    df_id   uuid not null references public.dagitim_firmalari(id)   on delete cascade,
    -- İşaretliyse bu DF üst firma; altına yeni alt birim (bölge) eklenince
    -- kullanıcıya otomatik (auto_inherit=false ile) bağlanır.
    auto_inherit boolean not null default false,
    created_at timestamptz not null default now(),
    primary key (user_id, df_id)
);

create index ix_user_df_df on public.user_df(df_id);

-- ============================================================================
-- NOT: PF ↔ DF artık M-N değil; proje_firmalari.df_id ile 1-N. (Bkz. mig 008)
-- ============================================================================
-- PROJECTS — iskelet (Infos/Docs/Insurances/Units/UnitDevices/Appointments/Histories/States sonra)
-- ============================================================================
create table public.projects (
    id            uuid primary key default gen_random_uuid(),
    no            serial unique,
    proje_adi     text not null,
    pf_id         uuid references public.proje_firmalari(id)    on delete set null,
    df_id         uuid references public.dagitim_firmalari(id)  on delete set null,
    owner_user_id uuid references public.users(id)              on delete set null,

    -- CAD'in tam çizim JSON'u (state snapshot). Versiyonlama için ayrı tablo yapılabilir.
    cad_data      jsonb,

    -- Statü (Histories/States ileride genişler)
    durum         text default 'taslak',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index ix_projects_pf    on public.projects(pf_id);
create index ix_projects_df    on public.projects(df_id);
create index ix_projects_owner on public.projects(owner_user_id);
create index ix_projects_durum on public.projects(durum);

-- ============================================================================
-- AUTO updated_at TRIGGER
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end$$;

create trigger trg_users_touch    before update on public.users               for each row execute function public.touch_updated_at();
create trigger trg_pf_touch       before update on public.proje_firmalari     for each row execute function public.touch_updated_at();
create trigger trg_df_touch       before update on public.dagitim_firmalari   for each row execute function public.touch_updated_at();
create trigger trg_projects_touch before update on public.projects            for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS — Row Level Security (MVP: oturum açmış herkes okur, admin yazar)
-- ----------------------------------------------------------------------------
-- TODO Faz 2: PFUser sadece kendi PF'sini, DFUser sadece kendi DF'sini görür.
-- ============================================================================
alter table public.users             enable row level security;
alter table public.proje_firmalari   enable row level security;
alter table public.dagitim_firmalari enable row level security;
alter table public.user_pf           enable row level security;
alter table public.user_df           enable row level security;
alter table public.projects          enable row level security;

-- Helper: oturum sahibi admin mi?
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
    select coalesce((select is_admin from public.users where id = auth.uid()), false);
$$;

-- READ — oturum açan herkes
create policy read_all_users on public.users             for select using (auth.role() = 'authenticated');
create policy read_all_pf    on public.proje_firmalari   for select using (auth.role() = 'authenticated');
create policy read_all_df    on public.dagitim_firmalari for select using (auth.role() = 'authenticated');
create policy read_all_upf   on public.user_pf           for select using (auth.role() = 'authenticated');
create policy read_all_udf   on public.user_df           for select using (auth.role() = 'authenticated');
create policy read_all_proj  on public.projects          for select using (auth.role() = 'authenticated');

-- WRITE — sadece admin
create policy write_admin_users on public.users             for all using (public.is_admin()) with check (public.is_admin());
create policy write_admin_pf    on public.proje_firmalari   for all using (public.is_admin()) with check (public.is_admin());
create policy write_admin_df    on public.dagitim_firmalari for all using (public.is_admin()) with check (public.is_admin());
create policy write_admin_upf   on public.user_pf           for all using (public.is_admin()) with check (public.is_admin());
create policy write_admin_udf   on public.user_df           for all using (public.is_admin()) with check (public.is_admin());
create policy write_admin_proj  on public.projects          for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- MIGRATION (idempotent): junction tablolarına auto_inherit kolonu
-- Mevcut DB'de schema.sql'i yeniden çalıştıramayanlar için.
-- ============================================================================
alter table public.user_pf add column if not exists auto_inherit boolean not null default false;
alter table public.user_df add column if not exists auto_inherit boolean not null default false;
alter table public.users               add column if not exists unvan        text;
alter table public.dagitim_firmalari   add column if not exists sahip        text;
