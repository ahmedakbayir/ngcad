'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, Save, Trash2, UserPlus, ExternalLink, ChevronDown } from 'lucide-react';
import type { FirmaRow } from '@/lib/supabase/types';
import { FirmMultiSelect, type FirmOption } from '@/components/firm-multiselect';
import { QuickUserDialog } from '@/components/quick-user-dialog';
import { UserSearchDialog } from '@/components/user-search-dialog';
import { cn } from '@/lib/utils';

// Label sol, kontrol sağ — kompakt tek satır
function RowField({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <Label className="mt-2 w-28 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex-1 space-y-1">
        {children}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

const schema = z.object({
  firma_adi: z.string().min(2),
  parent_id: z.string().nullable(),
  firma_tel: z.string().optional().or(z.literal('')),
  firma_email: z.union([z.string().email(), z.literal('')]).optional(),
  vergi_dairesi: z.string().optional().or(z.literal('')),
  vergi_no: z.string().optional().or(z.literal('')),
  adres: z.string().optional().or(z.literal('')),
  yeterlilik_no: z.string().optional().or(z.literal('')),
  yetkili_user_id: z.string().nullable(),
  // sadece PF için: tek bağlı DF
  df_id: z.string().nullable().optional(),
  // sadece PF için: ÜST FİRMA modu + bağlı ALT PF'ler
  ust_firma: z.boolean().optional(),
  alt_firma_ids: z.array(z.string()).optional(),
  // sadece DF için
  sahip: z.string().optional().or(z.literal('')),
  son_guncelleme: z.string().optional().or(z.literal('')),
  guncel_surum: z.union([z.coerce.number().int(), z.literal('')]).optional(),
  df_no: z.union([z.coerce.number().int(), z.literal('')]).optional(),
});

export type FirmFormData = z.input<typeof schema>;

export type FirmKind = 'pf' | 'df';

interface ParentEntry {
  id: string;
  firma_adi: string;
  parent_id?: string | null;
  ust_firma?: boolean;
  // Combobox satırında "FirmaAdı · Yetkili" şeklinde gösterilmesi için
  // server tarafından çözülmüş yetkili user adı.
  yetkili_adi?: string | null;
}

interface DFListEntry {
  id: string;
  firma_adi: string;
  parent_id?: string | null;
  ust_firma?: boolean;
}

// Yetkili kullanıcı dropdown'ı için zenginleştirilmiş seçenek tipi.
// rolEtiketi: "Üst Yönetici" veya "Yönetici" — combobox'ta isim yanında gösterilir.
// Yetkili olabilmek için yönetici seviyesinde olmak şart (Üst/Orta kademe).
export type YetkiliKullaniciOption = {
  id: string;
  adi: string;
  rolEtiketi: 'Üst Yönetici' | 'Yönetici';
};

interface FirmFormProps {
  kind: FirmKind;
  initial?: FirmaRow & {
    alt_firma_ids?: string[];
    // Bu firmanın alt birimi var mı? Varsa "üst firma" toggle'ı zorunlu açık.
    hasChildren?: boolean;
  };
  mode: 'create' | 'edit';
  yetkiliUsers: YetkiliKullaniciOption[];
  parentList: ParentEntry[];
  dfList?: DFListEntry[];
  // Bağlı DF alanını düzenleme izni. Yalnız admin true; PF yetkilisi vb. için
  // false → alan salt-okunur (değiştirilemez, temizlenemez, "yeni sekmede aç"
  // linki gizli). Varsayılan true (create sayfası + admin edit).
  canEditDf?: boolean;
  // Create modunda üst firma altına yeni alt birim eklenirken doldurulur.
  // Form parent_id'yi bu değerle açar; firma_adi otomatik "<ÜstAdı> / <DFAdı>"
  // şeklinde türetilir (admin elle değiştirene kadar).
  defaultParentId?: string | null;
}

// Türkçe karakterleri ASCII'ye düşürüp slug üretir.
function trSlug(s: string): string {
  const map: Record<string, string> = {
    'ş': 's', 'Ş': 's', 'ı': 'i', 'İ': 'i', 'ç': 'c', 'Ç': 'c',
    'ğ': 'g', 'Ğ': 'g', 'ö': 'o', 'Ö': 'o', 'ü': 'u', 'Ü': 'u',
  };
  return s
    .replace(/[şŞıİçÇğĞöÖüÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Firma adından otomatik e-posta türetir ("SAMGAZ" → info@samgaz.com).
function deriveFirmEmail(firmaAdi: string): string {
  const slug = trSlug(firmaAdi);
  if (!slug) return 'info@firma.com';
  return `info@${slug}.com`;
}

// 6 haneli random yeterlilik no: "YT-123456"
function randomYeterlilikNo(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `YT-${n}`;
}

export function FirmForm({
  kind,
  initial,
  mode,
  yetkiliUsers,
  parentList,
  dfList = [],
  canEditDf = true,
  defaultParentId = null,
}: FirmFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Yeni firma için rastgele yeterlilik no — her yeni form mount'unda sabit kalsın.
  const randomYeterlilik = React.useMemo(
    () => (mode === 'create' && kind === 'pf' ? randomYeterlilikNo() : ''),
    [mode, kind],
  );

  const form = useForm<FirmFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firma_adi: initial?.firma_adi ?? '',
      parent_id: initial?.parent_id ?? defaultParentId ?? null,
      firma_tel: initial?.firma_tel ?? (mode === 'create' ? '0212 255 55 55' : ''),
      firma_email: initial?.firma_email ?? '',
      vergi_dairesi: initial?.vergi_dairesi ?? (mode === 'create' ? 'İstanbul' : ''),
      vergi_no: initial?.vergi_no ?? (mode === 'create' ? '1234567890' : ''),
      adres: initial?.adres ?? (mode === 'create' ? 'Güneştepe Mah. Dibek Başı Sokak No:4 Merkez' : ''),
      yeterlilik_no:
        (initial && 'yeterlilik_no' in initial ? initial.yeterlilik_no : randomYeterlilik) ?? randomYeterlilik,
      yetkili_user_id: initial?.yetkili_user_id ?? null,
      df_id: (initial && 'df_id' in initial ? (initial as { df_id?: string | null }).df_id : null) ?? null,
      // Bayrak yoksa ama alt birim varsa, firma fiilen "üst firma"dır
      // (tablo da bu mantıkla ÜST FİRMA rozeti gösterir — tutarlı tutulur).
      ust_firma:
        (initial && 'ust_firma' in initial ? Boolean(initial.ust_firma) : false) ||
        Boolean(initial?.hasChildren),
      alt_firma_ids: initial?.alt_firma_ids ?? [],
      sahip:
        initial && 'sahip' in initial
          ? (initial as { sahip: string | null }).sahip ?? ''
          : '',
      son_guncelleme:
        initial && 'son_guncelleme' in initial
          ? (initial as { son_guncelleme: string | null }).son_guncelleme ?? ''
          : '',
      guncel_surum:
        initial && 'guncel_surum' in initial
          ? ((initial as { guncel_surum: number | null }).guncel_surum ?? '') as number | ''
          : '',
      df_no:
        initial && 'df_no' in initial
          ? ((initial as { df_no: number | null }).df_no ?? '') as number | ''
          : '',
    },
  });

  // Firma tipi: "ust" / "alt" / "tekil" — UI segmented control.
  // Local state olarak tutulur (form ust_firma/parent_id'den DERIVED DEĞİL); aksi
  // halde "Alt" tıklayıp parent_id seçmeden tipini koruyamazdık (derived "tekil"
  // dönerdi). Submit anında ust_firma + parent_id buna göre normalize edilir.
  const [firmTipi, setFirmTipi] = React.useState<'ust' | 'alt' | 'tekil'>(() => {
    if (initial?.ust_firma) return 'ust';
    if (initial?.parent_id) return 'alt';
    return 'tekil';
  });

  const changeFirmTipi = React.useCallback(
    (next: 'ust' | 'alt' | 'tekil') => {
      setFirmTipi(next);
      if (next === 'ust') {
        form.setValue('ust_firma', true);
        form.setValue('parent_id', null);
        if (kind === 'pf') form.setValue('df_id', null);
      } else if (next === 'alt') {
        form.setValue('ust_firma', false);
        // parent_id kullanıcı tarafından seçilecek; mevcutu koru, yoksa null kalsın.
      } else {
        form.setValue('ust_firma', false);
        form.setValue('parent_id', null);
      }
    },
    [form, kind],
  );

  // DF Alt: sürüm + son güncelleme yok (üst firmadan miras alınır).
  const dfIsChild = kind === 'df' && firmTipi === 'alt';

  // PF Alt: vergi dairesi + vergi no gizlenir — şubeler üst firmadan miras alır.
  const pfIsChild = kind === 'pf' && firmTipi === 'alt';

  // YENİ firma: firma adı girildikçe e-posta otomatik türetilir; admin elle
  // değiştirirse (son türetilen ile uyuşmuyorsa) auto-update durur.
  const watchedAdi = form.watch('firma_adi') ?? '';
  const lastAutoEmail = React.useRef<string>('');
  React.useEffect(() => {
    if (mode !== 'create') return;
    const current = form.getValues('firma_email') ?? '';
    if (current && current !== lastAutoEmail.current) return;
    const auto = deriveFirmEmail(watchedAdi);
    if (auto !== current) {
      form.setValue('firma_email', auto);
      lastAutoEmail.current = auto;
    }
  }, [watchedAdi, mode, form]);

  // Alt PF için firma_adi otomatik türetimi:
  // - create + defaultParentId: DF seçilince "<ÜstAdı> (<DFAdı>)" doldurulur.
  // - edit + firmTipi=alt: firma_adi BOŞALTILIRSA yeniden hesaplanır (kullanıcı
  //   talebi). Yani admin alanı silerse parent + df'den otomatik geri gelir.
  const watchedDfId = kind === 'pf' ? form.watch('df_id') : null;
  const watchedParentId = kind === 'pf' ? form.watch('parent_id') : null;
  const lastAutoFirmaAdi = React.useRef<string>('');
  React.useEffect(() => {
    if (kind !== 'pf') return;
    // Etkin parent: create akışında URL'den gelen defaultParentId, aksi halde
    // formdaki seçili parent_id.
    const effectiveParentId = mode === 'create' ? defaultParentId : watchedParentId;
    if (!effectiveParentId) return;
    const parentAdi = parentList.find((p) => p.id === effectiveParentId)?.firma_adi;
    if (!parentAdi) return;
    const dfAdi = watchedDfId
      ? dfList.find((d) => d.id === watchedDfId)?.firma_adi
      : undefined;
    const current = form.getValues('firma_adi') ?? '';
    const auto = dfAdi ? `${parentAdi} (${dfAdi})` : parentAdi;
    if (mode === 'create') {
      // Create: admin elle yazdıysa (son auto ile eşleşmiyorsa) dokunma.
      if (current && current !== lastAutoFirmaAdi.current) return;
      if (auto !== current) {
        form.setValue('firma_adi', auto);
        lastAutoFirmaAdi.current = auto;
      }
    } else {
      // Edit: yalnız BOŞ olduğunda otomatik doldur — admin'in kasıtlı manuel adı
      // ezilmesin. Spec: "edit modunda firma adı boşaltılırsa yeniden hesaplansın".
      // watchedAdi dep'te olduğu için kullanıcı silince effect tetiklenir.
      if (current.trim().length === 0) {
        form.setValue('firma_adi', auto, { shouldValidate: true });
        lastAutoFirmaAdi.current = auto;
      }
    }
  }, [watchedAdi, watchedDfId, watchedParentId, mode, kind, defaultParentId, parentList, dfList, form]);

  // Eski ust_firma aktif türevini koru — alt firmalar bölümü ve cascade UI bu
  // değişkene bakıyor. firmTipi tek kaynaktır.
  const ustFirmaActive = firmTipi === 'ust';

  // Hızlı Yeni Kullanıcı popup state.
  const [quickUserOpen, setQuickUserOpen] = React.useState(false);
  // "Diğer Kullanıcılardan Seç" popup'ı (yetkili belirleme için).
  const [otherUserPickerOpen, setOtherUserPickerOpen] = React.useState(false);
  // Yetkili Kullanıcı combobox'ını programatik açmak için (caret dropdown'dan
  // "Kendi Firma Kullanıcılarından Seç" tıklandığında).
  const [yetkiliSelectOpen, setYetkiliSelectOpen] = React.useState(false);

  // URL'de ?addUser=1 varsa (Yeni Kullanıcı → save-then-redirect akışı) popup'ı
  // otomatik aç. Param tüketildikten sonra URL'yi temizle.
  const searchParams = useSearchParams();
  React.useEffect(() => {
    if (mode !== 'edit') return;
    if (searchParams.get('addUser') === '1') {
      setQuickUserOpen(true);
      const url = `/firms/${kind}/${initial!.id}`;
      router.replace(url);
    }
  // sadece ilk mount'ta tetiklesin
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: FirmFormData, opts: { stay: boolean; then?: 'addUser' }) {
    setErr(null);

    // Tip-bazlı validation: "alt" seçildiyse parent_id şart.
    const tip: 'ust' | 'alt' | 'tekil' = values.ust_firma
      ? 'ust'
      : values.parent_id
        ? 'alt'
        : (firmTipi === 'alt' ? 'alt' : 'tekil');
    if (tip === 'alt' && !values.parent_id) {
      setErr('Alt firma kaydedebilmek için Üst Firma seçmelisiniz.');
      return;
    }

    // Yetkili değişti veya kaldırıldıysa adminle eski yöneticinin astlarının
    // akıbetini onaylat. window.confirm sade ve form akışını engellemeden çalışır
    // (silme onayı ile aynı pattern). 3 olası action:
    //  - 'transfer': eski yetkilinin firmadaki astlarını yeni yetkiliye taşı
    //  - 'keep'   : astları olduğu gibi bırak (eski yetkili pointer'ı kalsın)
    //  - 'clear'  : astların bagli_oldugu_yonetici_id'sini null yap
    let yetkili_change_action: 'transfer' | 'keep' | 'clear' | null = null;
    if (mode === 'edit' && initial) {
      const oldYetkili = initial.yetkili_user_id ?? null;
      const newYetkili = values.yetkili_user_id ?? null;
      if (oldYetkili && oldYetkili !== newYetkili) {
        if (newYetkili) {
          const transferOk = window.confirm(
            'Yöneticiye bağlı tüm kullanıcılar yeni yöneticiye aktarılsın mı?',
          );
          yetkili_change_action = transferOk ? 'transfer' : 'keep';
        } else {
          const keepOk = window.confirm(
            'Bu yöneticiye bağlı tüm kullanıcıların yöneticileri kalsın mı?',
          );
          yetkili_change_action = keepOk ? 'keep' : 'clear';
        }
      }
    }

    setPending(true);
    try {
      const url =
        mode === 'edit'
          ? `/api/firms/${kind}/${initial!.id}`
          : `/api/firms/${kind}`;
      // DF tablosunda yeterlilik_no kolonu yok — DF kaydederken kaldır.
      const payload: Record<string, unknown> = { ...values };
      if (yetkili_change_action) payload.yetkili_change_action = yetkili_change_action;
      if (kind === 'df') {
        delete payload.yeterlilik_no;
        // df_id yalnız PF tablosunda var — DF payload'una sızmasın.
        delete payload.df_id;
        // Boş alanları null'a normalize et.
        if (payload.son_guncelleme === '') payload.son_guncelleme = null;
        if (payload.df_no === '') payload.df_no = null;
        if (payload.guncel_surum === '') payload.guncel_surum = null;
        if (payload.sahip === '') payload.sahip = null;
        if (payload.ust_firma) {
          // ÜST FİRMA: parent_id null; Sürüm/Tarih KORUNUR (kullanıcı girer).
          payload.parent_id = null;
          if (payload.guncel_surum == null) payload.guncel_surum = 100;
        } else {
          payload.alt_firma_ids = [];
          // Child DF (parent_id'si olan): Güncel Sürüm + Son Güncelleme taşımaz +
          // sahip bilgisi olmaz (kullanıcı kuralı: "alt firmalarda sahip bilgisi
          // olmamalı"). Form alanı zaten gizli ama stale değer payload'a sızabilir.
          if (payload.parent_id) {
            payload.guncel_surum = null;
            payload.son_guncelleme = null;
            payload.sahip = null;
          } else if (payload.guncel_surum == null) {
            payload.guncel_surum = 100; // standalone varsayılan
          }
        }
      } else {
        delete payload.son_guncelleme;
        delete payload.guncel_surum;
        delete payload.df_no;
        delete payload.sahip;
        // ÜST FİRMA modu: DF bağı olmaz, parent_id null olur.
        if (payload.ust_firma) {
          payload.df_id = null;
          payload.parent_id = null;
        } else {
          payload.alt_firma_ids = [];
          if (payload.df_id === '') payload.df_id = null;
        }
        // PF alt firma (şube): vergi alanları üst firmadan miras alınır, kendi
        // değerlerini saklamasın — formda gizli olduğu için stale değer kalmasın.
        if (payload.parent_id) {
          payload.vergi_dairesi = null;
          payload.vergi_no = null;
        }
      }
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (opts.stay) {
        // Sayfada kal: create modu ise yeni id'nin edit URL'sine geç.
        if (mode === 'create' && data.id) {
          // "addUser" intent'i URL query'sine yazılır; edit sayfasına geçince
          // popup otomatik açılır.
          const qs = opts.then === 'addUser' ? '?addUser=1' : '';
          router.replace(`/firms/${kind}/${data.id}${qs}`);
        } else if (mode === 'edit' && opts.then === 'addUser') {
          // Zaten edit modundayız — popup'ı doğrudan aç.
          setQuickUserOpen(true);
        }
        router.refresh();
      } else {
        router.push(`/firms/${kind}`);
        router.refresh();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!confirm(`${initial.firma_adi} silinsin mi?`)) return;
    setPending(true);
    try {
      const supabase = supabaseBrowser();
      const table = kind === 'pf' ? 'proje_firmalari' : 'dagitim_firmalari';
      const { error } = await supabase.from(table).delete().eq('id', initial.id);
      if (error) throw error;
      router.push(`/firms/${kind}`);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Silinemedi.');
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit((v) => onSubmit(v, { stay: false }))}
      className="space-y-6"
    >
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Firma Bilgileri</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2">
          {/* PF için Bağlı DF en üstte: önce DF seçilip sonra firma adı otomatik
              türeyebilsin (spec: "PFirm eklerken DFirm seçimi en üstte"). */}
          {kind === 'pf' && !ustFirmaActive && (
            <BagliDfField
              form={form}
              dfList={dfList}
              readOnly={!canEditDf}
              className="sm:col-span-2"
            />
          )}

          <RowField
            label="Firma Adı"
            error={form.formState.errors.firma_adi?.message}
            className="sm:col-span-2"
          >
            <div className="flex items-center gap-2">
              <Input {...form.register('firma_adi')} placeholder="" className="flex-1" />
              <div className="flex items-center gap-1">
                {(['ust', 'alt', 'tekil'] as const).map((t) => {
                  // hasChildren → "üst" zorunlu; diğerlerine geçilemez.
                  const lockToUst = Boolean(initial?.hasChildren);
                  const disabled = lockToUst && t !== 'ust';
                  const label = t === 'ust' ? 'ÜST FİRMA' : t === 'alt' ? 'ALT FİRMA' : 'TEKİL FİRMA';
                  const active = firmTipi === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => changeFirmTipi(t)}
                      disabled={disabled}
                      title={
                        lockToUst && t !== 'ust'
                          ? 'Bu firmanın alt birimleri olduğu için Üst Firma seçimi zorunlu. Önce alt birimleri kaldırın.'
                          : undefined
                      }
                      className={cn(
                        'shrink-0 rounded-md border px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:bg-muted',
                        disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </RowField>

          {firmTipi === 'alt' && (
            <RowField label="Üst Firma" className="sm:col-span-2">
              <Controller
                control={form.control}
                name="parent_id"
                render={({ field }) => {
                  // Hem PF hem DF için sadece ust_firma=true olanları parent olarak listele.
                  const candidates = parentList.filter(
                    (p) => p.ust_firma === true && p.id !== initial?.id,
                  );
                  return (
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={field.value ?? '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue
                            placeholder={
                              candidates.length === 0
                                ? 'Önce bir ÜST FİRMA tanımlayın'
                                : 'Üst seçin'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Üst seçin —</SelectItem>
                          {candidates.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-baseline gap-1.5">
                                <span>{p.firma_adi}</span>
                                {p.yetkili_adi && (
                                  <span className="text-[10px] text-muted-foreground">
                                    · {p.yetkili_adi}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value && (
                        <Button
                          asChild
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          title="Üst firma detayını yeni sekmede aç"
                        >
                          <Link href={`/firms/${kind}/${field.value}`} target="_blank">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  );
                }}
              />
            </RowField>
          )}


          <RowField label="Yetkili Kullanıcı" className="sm:col-span-2">
            <div className="flex items-center gap-1.5">
              <Controller
                control={form.control}
                name="yetkili_user_id"
                render={({ field }) => {
                  // Üst Yöneticileri üstte sırala — kullanıcı kuralı.
                  const sortedUsers = [...yetkiliUsers].sort((a, b) => {
                    const aRank = a.rolEtiketi === 'Üst Yönetici' ? 0 : 1;
                    const bRank = b.rolEtiketi === 'Üst Yönetici' ? 0 : 1;
                    if (aRank !== bRank) return aRank - bRank;
                    return a.adi.localeCompare(b.adi, 'tr');
                  });
                  return (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                      disabled={sortedUsers.length === 0}
                      open={yetkiliSelectOpen}
                      onOpenChange={setYetkiliSelectOpen}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue
                          placeholder={
                            mode === 'create'
                              ? 'Önce firmayı kaydedip kullanıcı bağlayın'
                              : sortedUsers.length === 0
                                ? 'Kendi firmada uygun yetkili yok'
                                : 'Seçilmedi'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                        {sortedUsers.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            <span className="flex items-center gap-1.5">
                              <span>{u.adi}</span>
                              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                · {u.rolEtiketi}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
              {/* İsmin yanında 3 yol caret-buton: Yeni / Kendi Firma / Diğer.
                  Caret butonu ExternalLink'in ÖNÜNDE (kullanıcı tercihi). */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    title="Yetkili seçim kaynağı"
                    className="shrink-0 px-2"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      // Menü kapanmasına izin ver; aksi halde Radix focus-trap'i
                      // Dialog focus'unu engelliyor ve popup görünmez.
                      if (mode === 'edit') {
                        setTimeout(() => setQuickUserOpen(true), 0);
                        return;
                      }
                      const adi = (form.getValues('firma_adi') ?? '').trim();
                      if (adi.length < 2) {
                        setErr('Önce firma adını girin, sonra Yeni Kullanıcı.');
                        return;
                      }
                      form.handleSubmit((v) =>
                        onSubmit(v, { stay: true, then: 'addUser' }),
                      )();
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Yeni Oluştur
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      // Combobox'ı programatik aç — kullanıcı tıklayınca listeyi
                      // doğrudan açmış olur.
                      setTimeout(() => setYetkiliSelectOpen(true), 0);
                    }}
                    disabled={yetkiliUsers.length === 0}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Kendi Firma Kullanıcılarından Seç
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      if (mode === 'edit') {
                        setTimeout(() => setOtherUserPickerOpen(true), 0);
                      } else {
                        setErr('Önce firmayı kaydedin, sonra Diğer kullanıcı seçin.');
                      }
                    }}
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Diğer Kullanıcılardan Seç
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Seçili yetkili user'ın detayını yeni sekmede aç — caret dropdown
                  butonunun ARDINDA (kullanıcı tercihi). */}
              <Controller
                control={form.control}
                name="yetkili_user_id"
                render={({ field }) =>
                  field.value ? (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="Yetkili kullanıcı detayını yeni sekmede aç"
                    >
                      <Link href={`/users/${field.value}`} target="_blank">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  ) : (
                    <></>
                  )
                }
              />
            </div>
          </RowField>

          <RowField label="Telefon">
            <Input {...form.register('firma_tel')} placeholder="" />
          </RowField>
          <RowField label="E-posta">
            <Input type="email" {...form.register('firma_email')} placeholder="" />
          </RowField>

          {!pfIsChild && (
            <>
              <RowField label="Vergi Dairesi">
                <Input {...form.register('vergi_dairesi')} />
              </RowField>
              <RowField label="Vergi No">
                <Input {...form.register('vergi_no')} />
              </RowField>
            </>
          )}

          {kind === 'pf' && firmTipi !== 'ust' && (
            <RowField label="Yeterlilik No">
              <Input {...form.register('yeterlilik_no')} />
            </RowField>
          )}

          {kind === 'df' && (
            <>
              {firmTipi !== 'alt' && (
                <RowField label="Sahip">
                  <Input
                    {...form.register('sahip')}
                    placeholder=""
                  />
                </RowField>
              )}
              <RowField label="DfirmNo">
                <Input
                  type="number"
                  {...form.register('df_no')}
                  placeholder=""
                />
              </RowField>
              {!dfIsChild && (
                <>
                  <RowField label="Son Güncelleme">
                    <Input type="date" {...form.register('son_guncelleme')} />
                  </RowField>
                  <RowField label="Güncel Sürüm">
                    <Input
                      type="number"
                      {...form.register('guncel_surum')}
                      placeholder=""
                    />
                  </RowField>
                </>
              )}
            </>
          )}

          <RowField label="Adres" className="sm:col-span-2">
            <Input {...form.register('adres')} />
          </RowField>
        </CardContent>
      </Card>

      {ustFirmaActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {kind === 'pf' ? 'Alt Firmalar (PF)' : 'Alt Firmalar (DF)'}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {kind === 'pf'
                ? "Bu üst firmaya bağlanacak proje firmaları. Seçilen PF'lerin Üst Firma alanı otomatik olarak bu firmaya işaretlenir."
                : "Bu üst firmaya bağlanacak dağıtım firmaları (bölgeler). Seçilen DF'lerin Üst Firma alanı otomatik bu firmaya işaretlenir."}
            </p>
          </CardHeader>
          <CardContent>
            <Controller
              control={form.control}
              name="alt_firma_ids"
              render={({ field }) => {
                // Aday alt firmalar: kendisi olmayan + ust_firma=false olan firmalar.
                // Başka bir üst firmaya zaten bağlı olanlar pasif gösterilir
                // (bir GDF aynı anda yalnız bir üst firmanın alt birimi olabilir).
                const nameById = new Map(parentList.map((p) => [p.id, p.firma_adi]));
                const altOptions: FirmOption[] = parentList
                  .filter((p) => p.id !== initial?.id && !p.ust_firma)
                  .map((p) => {
                    const ownedByOther =
                      Boolean(p.parent_id) && p.parent_id !== initial?.id;
                    const ownerAdi = ownedByOther
                      ? nameById.get(p.parent_id!) ?? 'başka bir üst firma'
                      : undefined;
                    return {
                      id: p.id,
                      firma_adi: p.firma_adi,
                      parent_id: p.parent_id ?? null,
                      disabled: ownedByOther,
                      disabledReason: ownedByOther
                        ? `Zaten ${ownerAdi} üst firmasının alt birimi`
                        : undefined,
                      hint: ownedByOther
                        ? `↳ ${ownerAdi} altında`
                        : undefined,
                    };
                  });
                return (
                  <FirmMultiSelect
                    options={altOptions}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    comboboxLabel={kind === 'pf' ? 'PF Firmaları' : 'DF Firmaları'}
                    listboxLabel="Alt Firmalar"
                    placeholder=""
                    emptyText="Henüz başka firma tanımlanmamış."
                  />
                );
              }}
            />
            {mode === 'edit' && kind === 'pf' && initial && (
              <div className="mt-3 border-t pt-3">
                <Link
                  href={`/firms/pf/new?parent_id=${initial.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Yeni Alt Firma Ekle
                </Link>

              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        {mode === 'edit' ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
            <Trash2 className="h-4 w-4" /> Sil
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={form.handleSubmit((v) => onSubmit(v, { stay: true }))}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Uygula
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Kaydet ve Çık
          </Button>
        </div>
      </div>

      {mode === 'edit' && initial && (
        <>
          <QuickUserDialog
            open={quickUserOpen}
            onOpenChange={setQuickUserOpen}
            kind={kind}
            firmaId={initial.id}
            firmaAdi={form.getValues('firma_adi') || initial.firma_adi}
            firmaParentId={initial.parent_id ?? null}
            onCreated={(uid) => form.setValue('yetkili_user_id', uid)}
          />
          {/* "Diğer Kullanıcılardan Seç" yetkili seçimi:
              kullanıcı seçilince hem firmaya bağla hem yetkili_user_id'yi setle.
              Bu yüzden mode="attach" — server cascade'i çalışsın + form alanı atansın. */}
          <UserSearchDialog
            open={otherUserPickerOpen}
            onOpenChange={setOtherUserPickerOpen}
            kind={kind}
            firmaId={initial.id}
            firmaAdi={form.getValues('firma_adi') || initial.firma_adi}
            onSelected={(uid) => {
              form.setValue('yetkili_user_id', uid);
              // Otomatik kaydet — adminin form ekstra save adımına ihtiyacı kalmasın.
              form.handleSubmit((v) => onSubmit(v, { stay: true }))();
            }}
          />
        </>
      )}
    </form>
  );
}

// PF "Bağlı DF" alanı — formun en üstüne taşındığı için ayrı helper component
// olarak izole edildi. DF listesini parent/child sıralı verir; ÜST FİRMA DF'ler
// görünür ama seçilemez. Seçili DF için yan tarafta "yeni sekmede aç" butonu.
function BagliDfField({
  form,
  dfList,
  readOnly = false,
  className,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  dfList: DFListEntry[];
  // Salt-okunur: PF yetkilisi vb. bağlı DF adını referans olarak görür ama
  // değiştiremez/temizleyemez ve DF detayına gidemez (link gizli).
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <RowField label="Bağlı DF" className={className}>
      <Controller
        control={form.control}
        name="df_id"
        render={({ field }) => {
          const byId = new Map(dfList.map((d) => [d.id, d]));
          const tops = dfList.filter((d) => !d.parent_id || !byId.has(d.parent_id));
          const ordered: { d: DFListEntry; depth: 0 | 1 }[] = [];
          tops.forEach((p) => {
            ordered.push({ d: p, depth: 0 });
            dfList
              .filter((c) => c.parent_id === p.id)
              .forEach((c) => ordered.push({ d: c, depth: 1 }));
          });
          // Salt-okunur modda seçili DF adını düz metin göster — combobox açılmaz,
          // "— Seçilmedi —" seçeneği ve detay linki hiç render edilmez.
          if (readOnly) {
            const current = field.value ? byId.get(field.value) : null;
            return (
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {current?.firma_adi ?? 'Bağlı DF yok'}
              </div>
            );
          }
          return (
            <div className="flex items-center gap-1.5">
              <Select
                value={field.value ?? '__none__'}
                onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                disabled={dfList.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue
                    placeholder={
                      dfList.length === 0 ? 'Henüz DF tanımlanmamış' : 'Seçilmedi'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                  {ordered.map(({ d, depth }) => (
                    <SelectItem
                      key={d.id}
                      value={d.id}
                      disabled={Boolean(d.ust_firma)}
                      className={cn(
                        d.ust_firma &&
                          'bg-muted/60 font-semibold uppercase tracking-wide text-muted-foreground',
                      )}
                    >
                      {depth === 1 ? `↳ ${d.firma_adi}` : d.firma_adi}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.value && (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  title="Bağlı DF detayını yeni sekmede aç"
                >
                  <Link href={`/firms/df/${field.value}`} target="_blank">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              )}
            </div>
          );
        }}
      />
    </RowField>
  );
}
