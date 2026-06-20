'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { UserRow } from '@/lib/supabase/types';
import { FirmMultiSelect, type FirmOption } from '@/components/firm-multiselect';
import { cn } from '@/lib/utils';

// ── ZOD ŞEMASI ──────────────────────────────────────────────────────────────
const schema = z.object({
  adi: z.string().min(2, 'En az 2 karakter'),
  unvan: z.string().optional().or(z.literal('')),
  email: z.string().email('Geçerli e-posta gerekli'),
  // Yalnız oluşturmada zorunlu — düzenlemede boş bırakılabilir, sunucu yoksayar.
  password: z.string().optional().or(z.literal('')),
  gsm: z.string().optional().or(z.literal('')),
  profil_fotografi: z.string().url().optional().or(z.literal('')),
  is_admin: z.boolean(),

  firma_kullanicisi: z.boolean(),
  firma_yonetici: z.boolean(),
  firma_yonetici_kademe: z.enum(['ust', 'orta']).nullable(),
  firma_proje_muhendisi: z.boolean(),
  firma_cizim_sorumlusu: z.boolean(),
  firma_tesisat_ustasi: z.boolean(),
  usta_montaj: z.boolean(),
  usta_montaj_belge_no: z.string().nullable().or(z.literal('').transform(() => null)),
  usta_celik_kaynak: z.boolean(),
  usta_celik_kaynak_belge_no: z.string().nullable().or(z.literal('').transform(() => null)),
  usta_pe_kaynak: z.boolean(),
  usta_pe_kaynak_belge_no: z.string().nullable().or(z.literal('').transform(() => null)),

  gdf_kullanicisi: z.boolean(),
  gdf_yonetici: z.boolean(),
  gdf_yonetici_kademe: z.enum(['ust', 'orta']).nullable(),
  gdf_onay_muhendisi: z.boolean(),
  gdf_gaz_acma_muhendisi: z.boolean(),
  gdf_on_buro_yetkilisi: z.boolean(),

  bagli_oldugu_yonetici_id: z.string().nullable(),
  proje_muh_oda_sicil_no: z.coerce.number().int().positive().nullable().or(z.literal('').transform(() => null)),
  proje_muh_kayit_no: z.string().nullable().or(z.literal('').transform(() => null)),
  proje_muh_yetki_durumu: z.enum(['icTesisat', 'endustriyel']).nullable(),
  onay_muh_gdf_sicil_no: z.string().nullable().or(z.literal('').transform(() => null)),
  gaz_acma_muh_ekip_no: z.string().nullable().or(z.literal('').transform(() => null)),

  yetkili_firma_ids: z.array(z.string()),
  // Üst firma id'leri — altına yeni alt birim eklenince bu user'a otomatik bağlanacak.
  auto_inherit_firma_ids: z.array(z.string()),
})
.refine((d) => d.is_admin || d.firma_kullanicisi || d.gdf_kullanicisi, {
  message: 'Kullanıcı Admin, PF veya DF olmalı (General tipi kullanılmıyor).',
  path: ['is_admin'],
})
.refine((d) => !(d.firma_kullanicisi && d.gdf_kullanicisi), {
  message: 'Bir kullanıcı SADECE PF ya da DF olabilir.',
  path: ['firma_kullanicisi'],
})
.refine(
  (d) =>
    !d.firma_kullanicisi ||
    d.firma_yonetici || d.firma_proje_muhendisi || d.firma_cizim_sorumlusu || d.firma_tesisat_ustasi,
  { message: 'En az bir firma rolü seçin.', path: ['firma_kullanicisi'] },
)
.refine((d) => !d.firma_yonetici || d.firma_yonetici_kademe != null, {
  message: 'Yönetici kademesi seçin (Üst/Orta).',
  path: ['firma_yonetici_kademe'],
})
.refine(
  (d) => !d.firma_tesisat_ustasi || d.usta_montaj || d.usta_celik_kaynak || d.usta_pe_kaynak,
  { message: 'En az bir ustalık alanı seçin.', path: ['firma_tesisat_ustasi'] },
)
.refine(
  (d) =>
    !d.gdf_kullanicisi ||
    d.gdf_yonetici || d.gdf_onay_muhendisi || d.gdf_gaz_acma_muhendisi || d.gdf_on_buro_yetkilisi,
  { message: 'En az bir GDF rolü seçin.', path: ['gdf_kullanicisi'] },
)
.refine((d) => !d.gdf_yonetici || d.gdf_yonetici_kademe != null, {
  message: 'GDF yönetici kademesi seçin.',
  path: ['gdf_yonetici_kademe'],
});

export type UserFormData = z.input<typeof schema>;

export interface YoneticiAday {
  id: string;
  adi: string;
  firma_ids: string[];   // yetkili olduğu PF/DF id'leri (kanala göre)
  kanal: 'pf' | 'df';
}

export interface PFListItem {
  id: string;
  firma_adi: string;
  parent_id: string | null;
  df_adlari?: string[];   // bu PF'in bağlı olduğu DF adları (gösterimde "(GDF: X, Y)")
  // Bağlı tek DF id'si (tek-DF modeli). Yetkili Firmalar listesinde DF filtresi
  // için kullanılır; üst PF için child'lardan türetilir (server tarafı).
  df_id?: string | null;
}

export interface DFListItem {
  id: string;
  firma_adi: string;
  parent_id: string | null;
}

interface UserFormProps {
  initial?: UserRow & { yetkili_firma_ids: string[]; auto_inherit_firma_ids: string[] };
  candidateYoneticiler: YoneticiAday[];
  pfList: PFListItem[];
  dfList: DFListItem[];
  mode: 'create' | 'edit';
  // PF/DF detayından "Kullanıcı Ekle" akışı: yalnız create modunda kullanılır.
  // Form ilgili kanalı (firma_kullanicisi/gdf_kullanicisi) açar ve firma id'sini
  // yetkili_firma_ids'e prefill eder.
  prefillPfId?: string | null;
  prefillDfId?: string | null;
}

// Türkçe karakterleri ASCII'ye düşürüp e-posta yerel kısmı için temiz slug üretir.
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

// "İbrahim Yılmaz" → "ibrahim@yilmaz.com"; tek kelime → "adi@soyadi.com"
function deriveEmailFromAdi(adi: string): string {
  const parts = adi.trim().split(/\s+/).filter(Boolean).map(trSlug).filter(Boolean);
  if (parts.length === 0) return 'adi@soyadi.com';
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : 'soyadi';
  return `${first}@${last}.com`;
}

const defaults = (
  init: UserFormProps['initial'] | undefined,
  mode: 'create' | 'edit',
  prefill?: { pfId?: string | null; dfId?: string | null },
  pfList?: PFListItem[],
  dfList?: DFListItem[],
): UserFormData => ({
  adi: init?.adi ?? '',
  unvan: init?.unvan ?? '',
  email: init?.email ?? '',
  // Yeni: varsayılan 123456. Edit: alanı boş bırakmak yerine 123456 gösterilir;
  // admin aynı bıraksa bile sunucu mevcutla aynı parolayı set eder.
  password: '123456',
  gsm: init?.gsm ?? (mode === 'create' ? '0212 255 55 55' : ''),
  profil_fotografi: init?.profil_fotografi ?? '',
  is_admin: init?.is_admin ?? false,
  firma_kullanicisi: init?.firma_kullanicisi ?? (mode === 'create' && !!prefill?.pfId),
  firma_yonetici: init?.firma_yonetici ?? false,
  firma_yonetici_kademe: init?.firma_yonetici_kademe ?? null,
  firma_proje_muhendisi: init?.firma_proje_muhendisi ?? false,
  firma_cizim_sorumlusu: init?.firma_cizim_sorumlusu ?? false,
  firma_tesisat_ustasi: init?.firma_tesisat_ustasi ?? false,
  usta_montaj: init?.usta_montaj ?? false,
  usta_montaj_belge_no: init?.usta_montaj_belge_no ?? '',
  usta_celik_kaynak: init?.usta_celik_kaynak ?? false,
  usta_celik_kaynak_belge_no: init?.usta_celik_kaynak_belge_no ?? '',
  usta_pe_kaynak: init?.usta_pe_kaynak ?? false,
  usta_pe_kaynak_belge_no: init?.usta_pe_kaynak_belge_no ?? '',
  gdf_kullanicisi: init?.gdf_kullanicisi ?? (mode === 'create' && !!prefill?.dfId),
  gdf_yonetici: init?.gdf_yonetici ?? false,
  gdf_yonetici_kademe: init?.gdf_yonetici_kademe ?? null,
  gdf_onay_muhendisi: init?.gdf_onay_muhendisi ?? false,
  gdf_gaz_acma_muhendisi: init?.gdf_gaz_acma_muhendisi ?? false,
  gdf_on_buro_yetkilisi: init?.gdf_on_buro_yetkilisi ?? false,
  bagli_oldugu_yonetici_id: init?.bagli_oldugu_yonetici_id ?? null,
  proje_muh_oda_sicil_no: init?.proje_muh_oda_sicil_no ?? null,
  proje_muh_kayit_no: init?.proje_muh_kayit_no ?? '',
  proje_muh_yetki_durumu: init?.proje_muh_yetki_durumu ?? null,
  onay_muh_gdf_sicil_no: init?.onay_muh_gdf_sicil_no ?? '',
  gaz_acma_muh_ekip_no: init?.gaz_acma_muh_ekip_no ?? '',
  yetkili_firma_ids:
    init?.yetkili_firma_ids ??
    (mode === 'create'
      ? prefill?.pfId
        ? (() => {
            // Prefill alt firma ise parent'ı da junction'a dahil et — UserForm'da
            // child seçilince parent otomatik eklendiği için server cascade ile
            // tutarlı olsun (kullanıcı: "halbuki ben firmayı userin sayfası
            // içinden ekleseydim parentini eklediği gibi altta switch gelirdi").
            const pf = pfList?.find((p) => p.id === prefill.pfId);
            return pf?.parent_id ? [pf.parent_id, prefill.pfId] : [prefill.pfId];
          })()
        : prefill?.dfId
          ? (() => {
              const df = dfList?.find((d) => d.id === prefill.dfId);
              return df?.parent_id ? [df.parent_id, prefill.dfId] : [prefill.dfId];
            })()
          : []
      : []),
  auto_inherit_firma_ids: init?.auto_inherit_firma_ids ?? [],
});

export function UserForm({
  initial,
  candidateYoneticiler,
  pfList,
  dfList,
  mode,
  prefillPfId = null,
  prefillDfId = null,
}: UserFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const form = useForm<UserFormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults(
      initial,
      mode,
      { pfId: prefillPfId, dfId: prefillDfId },
      pfList,
      dfList,
    ),
  });

  // YENİ kullanıcı: isim girildikçe e-posta otomatik türetilir
  // ("İbrahim Yılmaz" → ibrahim@yilmaz.com). Admin e-postayı el ile değiştirirse
  // (yani değer son türetilenden farklıysa) otomatik güncelleme durur.
  const lastAutoEmail = React.useRef<string>('');
  React.useEffect(() => {
    if (mode !== 'create') return;
    const current = form.getValues('email');
    if (current && current !== lastAutoEmail.current) return;
    const auto = deriveEmailFromAdi(form.getValues('adi'));
    if (auto !== current) {
      form.setValue('email', auto);
      lastAutoEmail.current = auto;
    }
  // form.watch('adi') ile reaktif tetik
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch('adi'), mode]);

  const w = form.watch();

  // Çapraz toggle: PF açılırsa DF kapansın (ve tersi)
  React.useEffect(() => {
    if (w.firma_kullanicisi && w.gdf_kullanicisi) {
      form.setValue('gdf_kullanicisi', false);
    }
  }, [w.firma_kullanicisi, w.gdf_kullanicisi, form]);

  // Sub-flag temizlikleri (yalnız üst kullanıcı türü kapanırsa ya da rol
  // checkbox'ı kapanırsa o role ait veri alanları sıfırlanır).
  React.useEffect(() => {
    if (!w.firma_kullanicisi) {
      form.setValue('firma_yonetici', false);
      form.setValue('firma_yonetici_kademe', null);
      form.setValue('firma_proje_muhendisi', false);
      form.setValue('firma_cizim_sorumlusu', false);
      form.setValue('firma_tesisat_ustasi', false);
    }
    if (!w.firma_yonetici) form.setValue('firma_yonetici_kademe', null);
    if (!w.firma_tesisat_ustasi) {
      form.setValue('usta_montaj', false);
      form.setValue('usta_celik_kaynak', false);
      form.setValue('usta_pe_kaynak', false);
    }
    if (!w.firma_proje_muhendisi) {
      form.setValue('proje_muh_oda_sicil_no', null);
      form.setValue('proje_muh_kayit_no', '');
      form.setValue('proje_muh_yetki_durumu', null);
    }
  }, [
    w.firma_kullanicisi, w.firma_yonetici, w.firma_tesisat_ustasi, w.firma_proje_muhendisi, form,
  ]);

  React.useEffect(() => {
    if (!w.gdf_kullanicisi) {
      form.setValue('gdf_yonetici', false);
      form.setValue('gdf_yonetici_kademe', null);
      form.setValue('gdf_onay_muhendisi', false);
      form.setValue('gdf_gaz_acma_muhendisi', false);
      form.setValue('gdf_on_buro_yetkilisi', false);
    }
    if (!w.gdf_yonetici) form.setValue('gdf_yonetici_kademe', null);
    if (!w.gdf_onay_muhendisi) form.setValue('onay_muh_gdf_sicil_no', '');
    if (!w.gdf_gaz_acma_muhendisi) form.setValue('gaz_acma_muh_ekip_no', '');
  }, [
    w.gdf_kullanicisi, w.gdf_yonetici, w.gdf_onay_muhendisi, w.gdf_gaz_acma_muhendisi, form,
  ]);

  // ── PF / DF yetki toggle'ları ───────────────────────────────────────────────
  // Tüm yetkiler bağımsız switch; YALNIZ kademe (Üst/Orta) mutually exclusive.
  // "Primary" rol display amaçlı users-table'da hesaplanır — en üst rank kazanır.
  const pfUstActive  = !!w.firma_yonetici && w.firma_yonetici_kademe === 'ust';
  const pfOrtaActive = !!w.firma_yonetici && w.firma_yonetici_kademe === 'orta';
  const dfUstActive  = !!w.gdf_yonetici && w.gdf_yonetici_kademe === 'ust';
  const dfOrtaActive = !!w.gdf_yonetici && w.gdf_yonetici_kademe === 'orta';

  function setPfKademe(kademe: 'ust' | 'orta', on: boolean) {
    form.setValue('firma_yonetici', on);
    form.setValue('firma_yonetici_kademe', on ? kademe : null);
  }
  function setDfKademe(kademe: 'ust' | 'orta', on: boolean) {
    form.setValue('gdf_yonetici', on);
    form.setValue('gdf_yonetici_kademe', on ? kademe : null);
  }

  // Aktif kanala göre firma listesi (PF veya DF).
  const firmaOptions: FirmOption[] = w.gdf_kullanicisi
    ? dfList.map((d) => ({
        id: d.id,
        firma_adi: d.firma_adi,
        parent_id: d.parent_id,
      }))
    : w.firma_kullanicisi
      ? pfList.map((p) => ({
          id: p.id,
          firma_adi: p.firma_adi,
          parent_id: p.parent_id,
          hint: p.df_adlari && p.df_adlari.length > 0 ? p.df_adlari : undefined,
          dfId: p.df_id ?? null,
        }))
      : [];

  // PF için "Yetkili Firmalar" listbox'ında DF filtresi — yalnız PF user'da
  // kullanılır; DF kullanıcısında zaten her satır bir DF olduğu için anlamsız.
  const dfFilterOptions = w.firma_kullanicisi
    ? dfList
        .filter((d) => !d.parent_id) // Sadece üst DF / standalone'ları göster
        .map((d) => ({ id: d.id, firma_adi: d.firma_adi }))
    : undefined;

  // Bağlı olduğu yönetici adayları: kullanıcının ETKİN (operasyonel) firmalarından
  // birinde yetkili olan yöneticiler. FirmMultiSelect bir alt birim eklenince
  // üst firmayı da otomatik dahil ettiği için (parent context), salt parent
  // eşleşmesinden yönetici önermek hatalı — örn. AKSA'nın üst yöneticisi,
  // henüz ADANA'ya yetkilendirilmediyse ADANA'lı yeni kullanıcıya önerilmemeli.
  const aktifKanal: 'pf' | 'df' | null =
    w.firma_kullanicisi ? 'pf' : w.gdf_kullanicisi ? 'df' : null;
  const effectiveYetkiliFirmaIds = (() => {
    const set = new Set(w.yetkili_firma_ids);
    const list = aktifKanal === 'pf' ? pfList : aktifKanal === 'df' ? dfList : [];
    const childIdsByParent = new Map<string, string[]>();
    list.forEach((f) => {
      if (!f.parent_id) return;
      const arr = childIdsByParent.get(f.parent_id) ?? [];
      arr.push(f.id);
      childIdsByParent.set(f.parent_id, arr);
    });
    // Alt birimi de seçili olan üst firmayı çıkar — geriye operasyonel firmalar kalır.
    return w.yetkili_firma_ids.filter((id) => {
      const kids = childIdsByParent.get(id) ?? [];
      return !kids.some((cid) => set.has(cid));
    });
  })();
  const yoneticiAdaylari = candidateYoneticiler.filter((y) => {
    if (!aktifKanal || y.kanal !== aktifKanal) return false;
    if (y.id === initial?.id) return false;
    return y.firma_ids.some((fid) => effectiveYetkiliFirmaIds.includes(fid));
  });

  // Üst Yönetici hiyerarşinin tepesinde — kendisine ayrıca yönetici atanmaz.
  const isUstYonetici =
    (w.firma_yonetici && w.firma_yonetici_kademe === 'ust') ||
    (w.gdf_yonetici && w.gdf_yonetici_kademe === 'ust');

  // Üst Yöneticiye geçince varsa bağlı_yönetici_id temizlensin.
  React.useEffect(() => {
    if (isUstYonetici && w.bagli_oldugu_yonetici_id != null) {
      form.setValue('bagli_oldugu_yonetici_id', null);
    }
  }, [isUstYonetici, w.bagli_oldugu_yonetici_id, form]);

  async function onSubmit(values: UserFormData, opts: { stay: boolean }) {
    setErr(null);
    // DF kullanıcısı: yetkili firmalar yalnız tek bir anchor (parent/standalone)
    // ağacında olmalı.
    if (values.gdf_kullanicisi && values.yetkili_firma_ids.length > 0) {
      const anchors = new Set<string>();
      for (const id of values.yetkili_firma_ids) {
        const opt = dfList.find((d) => d.id === id);
        if (!opt) continue;
        anchors.add(opt.parent_id ?? opt.id);
        if (anchors.size > 1) break;
      }
      if (anchors.size > 1) {
        setErr('DF kullanıcısı yalnız tek bir üst firma (veya tek başına bölge) ağacında olabilir.');
        return;
      }
    }
    // Oluşturmada parola zorunlu; düzenlemede boş bırakılırsa mevcut korunur.
    if (mode === 'create' && (!values.password || values.password.length < 6)) {
      setErr('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (mode === 'edit' && values.password && values.password.length > 0 && values.password.length < 6) {
      setErr('Yeni şifre en az 6 karakter olmalı.');
      return;
    }
    setPending(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      // Düzenlemede boş parola gönderme — mevcut şifre korunsun.
      if (mode === 'edit' && (!values.password || values.password.length === 0)) {
        delete payload.password;
      }
      const res = await fetch(`/api/users${mode === 'edit' ? `/${initial!.id}` : ''}`, {
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
        // Sayfada kal: create modu ise yeni id'nin edit URL'sine geç ki form
        // edit moduna dönsün ve candidate yöneticiler taze veriyle yüklensin.
        if (mode === 'create' && data.id) {
          router.replace(`/users/${data.id}`);
        }
        router.refresh();
      } else {
        router.push('/users');
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
    if (!confirm(`${initial.adi} silinsin mi? Bu işlem geri alınamaz.`)) return;
    setPending(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.from('users').delete().eq('id', initial.id);
      if (error) throw error;
      router.push('/users');
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

      {/* ── KİMLİK + PF/DF YETKİ BLOĞU (yan yana, alt hizalı) ────────── */}
      <div className="grid gap-4 md:grid-cols-2">

      {/* ── KİMLİK ───────────────────────────────────────────────────── */}
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="text-base">Kimlik</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <RowField label="Adı Soyadı" error={form.formState.errors.adi?.message}>
            <Input {...form.register('adi')} placeholder="Ahmet Yılmaz" />
          </RowField>
          <RowField label="Ünvan">
            <Input {...form.register('unvan')} placeholder="Müdür, Mühendis, …" />
          </RowField>
          <RowField label="E-posta" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} placeholder="ahmet@firma.com" />
          </RowField>
          <RowField label="Şifre" error={form.formState.errors.password?.message}>
            <Input
              type="text"
              autoComplete="new-password"
              {...form.register('password')}
              placeholder={
                mode === 'create'
                  ? 'En az 6 karakter — kullanıcıya iletin'
                  : 'Değiştirmek için yeni şifre girin; boş bırakırsanız değişmez'
              }
            />
          </RowField>
          <RowField label="GSM">
            <Input {...form.register('gsm')} placeholder="0532 123 45 67" />
          </RowField>
          {(w.firma_kullanicisi || w.gdf_kullanicisi) && !isUstYonetici && (
            <RowField label="Bağlı Yönetici">
              <Controller
                control={form.control}
                name="bagli_oldugu_yonetici_id"
                render={({ field }) => (
                  <Select
                    value={field.value ?? '__none__'}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    disabled={yoneticiAdaylari.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          w.yetkili_firma_ids.length === 0
                            ? 'Önce yetkili firmaları seçip Uygula deyin'
                            : yoneticiAdaylari.length === 0
                              ? 'Seçili firmalarda yönetici yok'
                              : 'Seçilmedi'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Seçilmedi —</SelectItem>
                      {yoneticiAdaylari.map((y) => (
                        <SelectItem key={y.id} value={y.id}>{y.adi}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </RowField>
          )}
          <RowField label="Profil Fotoğrafı (URL)">
            <Input {...form.register('profil_fotografi')} placeholder="https://..." />
          </RowField>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Admin</Label>
              <p className="text-xs text-muted-foreground">Tüm verilere yazma/silme yetkisi.</p>
            </div>
            <Controller
              control={form.control}
              name="is_admin"
              render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── PF + DF KARTLARI (sağ kolon — alt hizaya genişler) ──────── */}
      <div className="flex h-full flex-col gap-4">

      {/* ── FİRMA KULLANICISI (PF) ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Firma Kullanıcısı (PF)</CardTitle>
            <p className="text-xs text-muted-foreground">Proje firması bünyesinde çalışan kullanıcı.</p>
          </div>
          <Controller
            control={form.control}
            name="firma_kullanicisi"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </CardHeader>
        {w.firma_kullanicisi && (
          <CardContent className="space-y-4">
            {form.formState.errors.firma_kullanicisi && (
              <p className="text-xs text-destructive">{form.formState.errors.firma_kullanicisi.message}</p>
            )}

            <div className="space-y-3">
              <Label className="text-xs">Yetkiler</Label>
              <div className="space-y-1.5">
                <YetkiSwitch
                  label="Üst Yönetici"
                  checked={pfUstActive}
                  disabled={pfOrtaActive}
                  onChange={(on) => setPfKademe('ust', on)}
                />
                <YetkiSwitch
                  label="Orta Kademe Yönetici"
                  checked={pfOrtaActive}
                  disabled={pfUstActive}
                  onChange={(on) => setPfKademe('orta', on)}
                />
                <YetkiSwitch
                  label="Proje Mühendisi"
                  checked={w.firma_proje_muhendisi}
                  onChange={(on) => form.setValue('firma_proje_muhendisi', on)}
                />
                <YetkiSwitch
                  label="Proje Çizim Sorumlusu"
                  checked={w.firma_cizim_sorumlusu}
                  onChange={(on) => form.setValue('firma_cizim_sorumlusu', on)}
                />
                <YetkiSwitch
                  label="Tesisat Ustası"
                  checked={w.firma_tesisat_ustasi}
                  onChange={(on) => form.setValue('firma_tesisat_ustasi', on)}
                />
              </div>

              {/* PROJE MÜHENDİSİ verileri */}
              {w.firma_proje_muhendisi && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Proje Mühendisi</p>
                  <NestedBox>
                    <InlineField label="Oda Sicil No">
                      <Input type="number" className="h-8" {...form.register('proje_muh_oda_sicil_no')} />
                    </InlineField>
                    <InlineField label="Kayıt No">
                      <Input className="h-8" {...form.register('proje_muh_kayit_no')} />
                    </InlineField>
                    <InlineField label="Yetki">
                      <Controller
                        control={form.control}
                        name="proje_muh_yetki_durumu"
                        render={({ field }) => (
                          <Select
                            value={field.value ?? ''}
                            onValueChange={(v) => field.onChange(v as 'icTesisat' | 'endustriyel')}
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Seçin" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="icTesisat">İç Tesisat</SelectItem>
                              <SelectItem value="endustriyel">Endüstriyel</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </InlineField>
                  </NestedBox>
                </div>
              )}

              {/* TESİSAT USTASI verileri */}
              {w.firma_tesisat_ustasi && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Tesisat Ustası</p>
                  <NestedBox error={form.formState.errors.firma_tesisat_ustasi?.message}>
                    <UstaRow form={form} checkName="usta_montaj"      belgeName="usta_montaj_belge_no"      label="Montaj"      active={w.usta_montaj} />
                    <UstaRow form={form} checkName="usta_celik_kaynak" belgeName="usta_celik_kaynak_belge_no" label="Çelik Kaynak" active={w.usta_celik_kaynak} />
                    <UstaRow form={form} checkName="usta_pe_kaynak"   belgeName="usta_pe_kaynak_belge_no"   label="PE Kaynak"   active={w.usta_pe_kaynak} />
                  </NestedBox>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── GDF KULLANICISI (DF) — son kart, kalan dikey alanı doldurur ── */}
      <Card className="flex-1">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">GDF Kullanıcısı (DF)</CardTitle>
            <p className="text-xs text-muted-foreground">Dağıtım firması bünyesinde çalışan kullanıcı.</p>
          </div>
          <Controller
            control={form.control}
            name="gdf_kullanicisi"
            render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
          />
        </CardHeader>
        {w.gdf_kullanicisi && (
          <CardContent className="space-y-4">
            {form.formState.errors.gdf_kullanicisi && (
              <p className="text-xs text-destructive">{form.formState.errors.gdf_kullanicisi.message}</p>
            )}

            <div className="space-y-3">
              <Label className="text-xs">Yetkiler</Label>
              <div className="space-y-1.5">
                <YetkiSwitch
                  label="Üst Yönetici"
                  checked={dfUstActive}
                  disabled={dfOrtaActive}
                  onChange={(on) => setDfKademe('ust', on)}
                />
                <YetkiSwitch
                  label="Orta Kademe Yönetici"
                  checked={dfOrtaActive}
                  disabled={dfUstActive}
                  onChange={(on) => setDfKademe('orta', on)}
                />
                <YetkiSwitch
                  label="Onay Mühendisi"
                  checked={w.gdf_onay_muhendisi}
                  onChange={(on) => form.setValue('gdf_onay_muhendisi', on)}
                />
                <YetkiSwitch
                  label="Gaz Açma Mühendisi"
                  checked={w.gdf_gaz_acma_muhendisi}
                  onChange={(on) => form.setValue('gdf_gaz_acma_muhendisi', on)}
                />
                <YetkiSwitch
                  label="Ön Büro Yetkilisi"
                  checked={w.gdf_on_buro_yetkilisi}
                  onChange={(on) => form.setValue('gdf_on_buro_yetkilisi', on)}
                />
              </div>

              {/* ONAY MÜHENDİSİ verileri */}
              {w.gdf_onay_muhendisi && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Onay Mühendisi</p>
                  <NestedBox>
                    <InlineField label="GDF Sicil No">
                      <Input className="h-8" {...form.register('onay_muh_gdf_sicil_no')} />
                    </InlineField>
                  </NestedBox>
                </div>
              )}

              {/* GAZ AÇMA MÜHENDİSİ verileri */}
              {w.gdf_gaz_acma_muhendisi && (
                <div className="rounded-md border p-3">
                  <p className="mb-2 text-sm font-medium">Gaz Açma Mühendisi</p>
                  <NestedBox>
                    <InlineField label="Ekip No">
                      <Input className="h-8" {...form.register('gaz_acma_muh_ekip_no')} />
                    </InlineField>
                  </NestedBox>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      </div>

      </div>

      {/* ── YETKİLİ OLDUĞU FİRMALAR ──────────────────────────────────── */}
      {(w.firma_kullanicisi || w.gdf_kullanicisi) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Yetkili Olduğu Firmalar ({w.gdf_kullanicisi ? 'DF' : 'PF'})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Controller
              control={form.control}
              name="yetkili_firma_ids"
              render={({ field }) => (
                <FirmMultiSelect
                  options={firmaOptions}
                  value={field.value}
                  onChange={(ids) => {
                    field.onChange(ids);
                    // Listeden çıkarılan firmaların auto_inherit bayrağını da temizle.
                    const set = new Set(ids);
                    const ai = form.getValues('auto_inherit_firma_ids');
                    const next = ai.filter((x) => set.has(x));
                    if (next.length !== ai.length) {
                      form.setValue('auto_inherit_firma_ids', next);
                    }
                  }}
                  comboboxLabel={w.gdf_kullanicisi ? 'DF Firmaları' : 'PF Firmaları'}
                  listboxLabel="Yetkili Olduğu Firmalar"
                  placeholder="Firma adıyla ara…"
                  emptyText={w.gdf_kullanicisi ? 'Tanımlı DF yok.' : 'Tanımlı PF yok.'}
                  // singleAnchor=false: DF kullanıcısı birden fazla üst DF'ye
                  // yetkilendirilebilmeli; PF için de aynısı geçerli.
                  singleAnchor={false}
                  dfFilterOptions={dfFilterOptions}
                  autoInheritIds={w.auto_inherit_firma_ids}
                  onAutoInheritChange={(parentId, on) => {
                    const cur = new Set(form.getValues('auto_inherit_firma_ids'));
                    if (on) cur.add(parentId);
                    else cur.delete(parentId);
                    form.setValue('auto_inherit_firma_ids', Array.from(cur));
                  }}
                />
              )}
            />
          </CardContent>
        </Card>
      )}

      {/* ── ACTIONS ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        {mode === 'edit' ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={pending}>
            <Trash2 className="h-4 w-4" />
            Sil
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
    </form>
  );
}

// ── KÜÇÜK HELPER'LAR ────────────────────────────────────────────────────────
// Label solda, input sağda — tek satır (Kimlik gibi temel alanlar için)
function RowField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Label className="mt-2 w-32 shrink-0 text-xs text-muted-foreground">{label}</Label>
      <div className="flex-1 space-y-1">
        {children}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function NestedBox({ error, children }: { error?: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 space-y-1.5 border-l-2 border-primary/30 bg-background/60 pl-3 pt-1">
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// Label sol, kontrol sağ — tek satır, kompakt
function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// Yetki listesindeki tek satır: label sol, switch sağ. Pasifken silik görünür.
function YetkiSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-md border px-3 py-1.5 text-sm',
        disabled && 'opacity-50',
      )}
    >
      <span className={cn(disabled && 'text-muted-foreground')}>{label}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

// Usta satırı: checkbox + sağında belge no inputu (checkbox kapalıyken input disabled)
function UstaRow({
  form,
  checkName,
  belgeName,
  label,
  active,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  checkName: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  belgeName: any;
  label: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Controller
        control={form.control}
        name={checkName}
        render={({ field }: { field: { value: boolean; onChange: (v: boolean) => void } }) => (
          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
        )}
      />
      <span className="w-24 shrink-0 text-sm">{label}</span>
      <Input
        className="h-8 flex-1"
        placeholder={active ? 'Belge No' : '—'}
        disabled={!active}
        {...form.register(belgeName)}
      />
    </div>
  );
}

