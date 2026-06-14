# AANGCAD Web Yönetim Paneli

Next.js 15 + Tailwind + shadcn/ui + Supabase (PostgreSQL + Auth) ile inşa edilmiş yönetim paneli.

> CAD çizim uygulaması ile aynı repo'da `web/` alt klasöründe yaşar.
> CAD ↔ Web köprüsü için: [`../onboarding/web-bridge.js`](../onboarding/web-bridge.js)

---

## 1) Supabase Projesi Oluşturma

1. https://supabase.com/dashboard adresine gidin, "New project" deyin.
2. Proje adı, parola, bölge seçin (Frankfurt önerilir).
3. Proje hazır olunca **Project Settings → API** sayfasından üç değeri kopyalayın:
   - `Project URL`
   - `anon public` key
   - `service_role` key (TARAYICIYA SIZDIRMA — sadece server tarafı)

## 2) Şemayı Yükleme

Supabase dashboard → **SQL Editor** → "New query" → bu dosyanın içeriğini yapıştırıp **Run** deyin:

```
web/db/schema.sql
```

Tablolar (`users`, `proje_firmalari`, `dagitim_firmalari`, `user_pf`, `user_df`, `pf_df`, `projects`),
enum'lar, kısıtlar (PF XOR DF, en az bir rol, kademe zorunluluğu vs.), trigger'lar
(`updated_at` otomatik), RLS politikaları tek seferde kurulur.

> Şemada değişiklik olduğunda dosyayı tekrar yapıştırmak yerine `ALTER` cümleleri ekleyip
> versiyonlu migration'a geçilebilir (`web/db/migrations/`).

## 3) Web App Kurulumu

```bash
cd web
cp .env.local.example .env.local
# .env.local içine SUPABASE_URL ve key'leri doldurun
npm install
npm run dev
```

Tarayıcıdan açın: <http://localhost:3001>

## 4) Seed (örnek veri yükleme)

`onboarding/sorumlu-data.js`'teki örnek GDF/PF/User verisini DB'ye yükler:

```bash
# Admin için kendi e-postanızı kullanın (önemli — buradan giriş yapacaksınız)
SEED_ADMIN_EMAIL=siz@ornek.com SEED_ADMIN_PASSWORD=guclu_sifre npm run seed
```

Test ortamında kullanıcılara davet maili yerine sabit şifre (`temp1234`) atamak için:

```bash
npm run seed -- --no-invite
```

Sonunda terminal admin giriş bilgilerini yazar.

## 5) Veritabanını İnceleme

- **Supabase Studio** (dashboard'un içi): Tables → her tabloyu Excel gibi düzenler, satır
  ekler/siler, foreign key'leri takip eder.
- **SQL Editor**: Manuel sorgu, view oluşturma, debug için.
- **Auth → Users**: Kayıtlı kullanıcıları görür, manuel davet gönderir, parolayı sıfırlar.

## 6) CAD Entegrasyonu

`onboarding/web-bridge.js` modülü:

```js
import { getProjectIdFromUrl, loadProjectFromWeb, saveProjectToWeb } from './web-bridge.js';

// CAD açılışında — URL'de ?project=ID varsa otomatik yükle
const pid = getProjectIdFromUrl();
if (pid) {
    const { proje_adi, cad_data } = await loadProjectFromWeb(pid);
    // cad_data → state.* alanlarına atayın
}

// CAD'de "Kaydet" butonuna basıldığında
await saveProjectToWeb(pid, currentState, projeAdi);
```

Web URL farklıysa (ör. production):

```js
window.AANGCAD_WEB_URL = 'https://panel.aangcad.com';
```

> Auth: CAD ↔ Web aynı origin'de değilse cross-site cookie gerekir; geliştirmede
> tarayıcıda CORS uyarısı görürseniz Supabase tarafında "Allowed Origins" alanına
> CAD origin'ini ekleyin.

## 7) Klasör Yapısı

```
web/
├── db/
│   └── schema.sql               # Supabase'e tek seferde yüklenir
├── scripts/
│   └── seed.ts                  # Örnek veri yükleme
├── src/
│   ├── app/
│   │   ├── login/               # Giriş sayfası
│   │   ├── auth/callback/       # Magic-link callback
│   │   ├── api/                 # REST endpoint'leri
│   │   └── (dashboard)/         # Korunan sayfalar
│   │       ├── dashboard/       # Genel bakış
│   │       ├── users/           # Kullanıcı CRUD
│   │       ├── firms/{pf,df}/   # Firma CRUD
│   │       └── projects/        # Proje CRUD (Infos/Docs/... tabları)
│   ├── components/
│   │   ├── ui/                  # shadcn primitives
│   │   ├── data-table.tsx       # TanStack Table wrapper (search/sort/page)
│   │   ├── app-sidebar.tsx
│   │   ├── app-topbar.tsx
│   │   ├── firma-table.tsx
│   │   └── firm-form.tsx
│   ├── lib/
│   │   ├── supabase/{client,server,middleware,admin,types}.ts
│   │   ├── auth-guards.ts
│   │   ├── user-junctions.ts
│   │   └── utils.ts
│   └── middleware.ts            # Oturum cookie refresh + redirect
└── README.md
```

## 8) Yetki Modeli (özet)

| Rol         | Okuma            | Yazma                 |
|-------------|------------------|-----------------------|
| `is_admin`  | her şey          | her şey               |
| Authenticated user | her şey (Faz 1) | kısıtlı (Faz 2'de RLS daraltılır) |
| Anonim      | yok              | yok                   |

> **Faz 2 TODO** (sonra yapılacak): PFUser sadece kendi yetkili olduğu PF'leri görür;
> DFUser sadece kendi yetkili olduğu DF'leri görür. Bunun için RLS policy'leri
> `user_pf` / `user_df` junction'larına bakacak şekilde güncellenecek.
