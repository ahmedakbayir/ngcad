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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Save, Trash2, UserPlus } from 'lucide-react';
import type { FirmaRow } from '@/lib/supabase/types';
import { FirmMultiSelect, type FirmOption } from '@/components/firm-multiselect';
import { QuickUserDialog } from '@/components/quick-user-dialog';
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

  // DF'de parent_id reaktif izlenir; child satırlarda Güncel Sürüm alanı gizlenir/temizlenir.
  const dfParentId = kind === 'df' ? form.watch('parent_id') : null;
  const dfIsChild = kind === 'df' && !!dfParentId;

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

  // Üst firmadan "Yeni Alt Firma ekle" akışı (kind=pf + create + defaultParentId):
  // DF seçilince firma_adi otomatik "<ÜstAdı> / <DFAdı>" şeklinde türetilir.
  // DF temizlenirse alan boş döner (parent adı tek başına anlamsız).
  // Admin firma_adi'yi elle değiştirirse otomatik güncelleme durur.
  const watchedDfId = kind === 'pf' ? form.watch('df_id') : null;
  const lastAutoFirmaAdi = React.useRef<string>('');
  React.useEffect(() => {
    if (mode !== 'create' || kind !== 'pf' || !defaultParentId) return;
    const parentAdi = parentList.find((p) => p.id === defaultParentId)?.firma_adi;
    if (!parentAdi) return;
    const dfAdi = watchedDfId
      ? dfList.find((d) => d.id === watchedDfId)?.firma_adi
      : undefined;
    const current = form.getValues('firma_adi') ?? '';
    // Admin elle yazdıysa (son auto ile eşleşmiyorsa) dokunma.
    if (current && current !== lastAutoFirmaAdi.current) return;
    const auto = dfAdi ? `${parentAdi} / ${dfAdi}` : '';
    if (auto !== current) {
      form.setValue('firma_adi', auto);
      lastAutoFirmaAdi.current = auto;
    }
  }, [watchedDfId, mode, kind, defaultParentId, parentList, dfList, form]);

  // ÜST FİRMA toggle reaktif izlenir; PF ve DF için ortak.
  const ustFirmaActive = form.watch('ust_firma') ?? false;

  // Hızlı Yeni Kullanıcı popup state.
  const [quickUserOpen, setQuickUserOpen] = React.useState(false);

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
          // Child DF (parent_id'si olan): Güncel Sürüm + Son Güncelleme taşımaz.
          if (payload.parent_id) {
            payload.guncel_surum = null;
            payload.son_guncelleme = null;
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
        <CardContent className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <RowField
            label="Firma Adı"
            error={form.formState.errors.firma_adi?.message}
          >
            <Input {...form.register('firma_adi')} placeholder="" />
          </RowField>

          <RowField label="ÜST FİRMA">
            <Controller
              control={form.control}
              name="ust_firma"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch
                    checked={field.value ?? false}
                    disabled={Boolean(initial?.hasChildren)}
                    onCheckedChange={(v) => field.onChange(v)}
                  />
                  <div
                    className="text-xs text-muted-foreground"
                    title={
                      initial?.hasChildren
                        ? "Bu firmanın alt birimleri olduğu için üst firma işareti zorunlu. Önce alt birimleri kaldırın."
                        : kind === 'pf'
                          ? "İşaretliyse bu firma alt birim PF'lerin üst firmasıdır. DF bağı taşımaz; alt firmalar Alt Firmalar bölümünden seçilir."
                          : "İşaretliyse bu firma alt birim DF'lerin üst firmasıdır. PF'ler doğrudan buna bağlanamaz (alt birim DF'lere bağlanır)."
                    }
                  >
                  </div>
                  {field.value && (
                    <Badge variant="info" className="ml-auto text-[10px]">ÜST FİRMA</Badge>
                  )}
                </div>
              )}
            />
          </RowField>

          {!ustFirmaActive && (
            <RowField label="Üst Firma">
              <Controller
                control={form.control}
                name="parent_id"
                render={({ field }) => {
                  // Hem PF hem DF için sadece ust_firma=true olanları parent olarak listele.
                  const candidates = parentList.filter(
                    (p) => p.ust_firma === true && p.id !== initial?.id,
                  );
                  return (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            candidates.length === 0
                              ? 'Önce bir ÜST FİRMA tanımlayın'
                              : 'Üst yok'
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Üst yok —</SelectItem>
                        {candidates.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.firma_adi}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            </RowField>
          )}

          {kind === 'pf' && !ustFirmaActive && (
            <RowField label="Bağlı DF">
              <Controller
                control={form.control}
                name="df_id"
                render={({ field }) => {
                  // Parent'lar üstte, alt birimleri girintili olacak şekilde sırala.
                  // PARENT (üst firma) DF'ler görünür ama seçilemez — alt bölgelerden
                  // (child veya standalone) birinin seçilmesi beklenir.
                  const byId = new Map(dfList.map((d) => [d.id, d]));
                  const tops = dfList.filter((d) => !d.parent_id || !byId.has(d.parent_id));
                  const ordered: { d: DFListEntry; depth: 0 | 1 }[] = [];
                  tops.forEach((p) => {
                    ordered.push({ d: p, depth: 0 });
                    dfList
                      .filter((c) => c.parent_id === p.id)
                      .forEach((c) => ordered.push({ d: c, depth: 1 }));
                  });
                  return (
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                      disabled={dfList.length === 0}
                    >
                      <SelectTrigger>
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
                  );
                }}
              />
            </RowField>
          )}

          <RowField label="Yetkili Kullanıcı">
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="yetkili_user_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    disabled={yetkiliUsers.length === 0}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue
                        placeholder={
                          mode === 'create'
                            ? 'Önce firmayı kaydedip kullanıcı bağlayın'
                            : yetkiliUsers.length === 0
                              ? 'Bu firmaya bağlı kullanıcı yok'
                              : 'Seçilmedi'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                      {yetkiliUsers.map((u) => (
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
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                title="Yeni yetkili kullanıcı tanımla"
                onClick={() => {
                  // Edit modu: doğrudan popup aç.
                  if (mode === 'edit') {
                    setQuickUserOpen(true);
                    return;
                  }
                  // Create modu: firma adı dolu mu?
                  const adi = (form.getValues('firma_adi') ?? '').trim();
                  if (adi.length < 2) {
                    setErr('Önce firma adını girin, sonra Yeni Kullanıcı.');
                    return;
                  }
                  // Önce firmayı kaydet, sonra edit moduna geçince popup açılsın.
                  form.handleSubmit((v) => onSubmit(v, { stay: true, then: 'addUser' }))();
                }}
              >
                <UserPlus className="h-3.5 w-3.5" /> Yeni
              </Button>
            </div>
          </RowField>

          <RowField label="Telefon">
            <Input {...form.register('firma_tel')} placeholder="" />
          </RowField>
          <RowField label="E-posta">
            <Input type="email" {...form.register('firma_email')} placeholder="" />
          </RowField>

          <RowField label="Vergi Dairesi">
            <Input {...form.register('vergi_dairesi')} />
          </RowField>
          <RowField label="Vergi No">
            <Input {...form.register('vergi_no')} />
          </RowField>

          {kind === 'pf' && (
            <RowField label="Yeterlilik No">
              <Input {...form.register('yeterlilik_no')} />
            </RowField>
          )}

          {kind === 'df' && (
            <>
              <RowField label="Sahip">
                <Input
                  {...form.register('sahip')}
                  placeholder=""
                />
              </RowField>
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
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Açılan formda üst firma {initial.firma_adi} olarak seçili gelir;
                  DF seçince firma adı &ldquo;{initial.firma_adi} / &lt;DF Adı&gt;&rdquo;
                  şeklinde otomatik dolar.
                </p>
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
            Kaydet ve Bitir
          </Button>
        </div>
      </div>

      {mode === 'edit' && initial && (
        <QuickUserDialog
          open={quickUserOpen}
          onOpenChange={setQuickUserOpen}
          kind={kind}
          firmaId={initial.id}
          firmaAdi={form.getValues('firma_adi') || initial.firma_adi}
          firmaParentId={initial.parent_id ?? null}
          onCreated={(uid) => form.setValue('yetkili_user_id', uid)}
        />
      )}
    </form>
  );
}
