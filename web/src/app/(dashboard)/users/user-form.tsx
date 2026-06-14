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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { UserRow } from '@/lib/supabase/types';
import { FirmMultiSelect, type FirmOption } from '@/components/firm-multiselect';

// ── ZOD ŞEMASI ──────────────────────────────────────────────────────────────
const schema = z.object({
  adi: z.string().min(2, 'En az 2 karakter'),
  email: z.string().email('Geçerli e-posta gerekli'),
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
}

export interface DFListItem {
  id: string;
  firma_adi: string;
  parent_id: string | null;
}

interface UserFormProps {
  initial?: UserRow & { yetkili_firma_ids: string[] };
  candidateYoneticiler: YoneticiAday[];
  pfList: PFListItem[];
  dfList: DFListItem[];
  mode: 'create' | 'edit';
}

const defaults = (init?: UserFormProps['initial']): UserFormData => ({
  adi: init?.adi ?? '',
  email: init?.email ?? '',
  gsm: init?.gsm ?? '',
  profil_fotografi: init?.profil_fotografi ?? '',
  is_admin: init?.is_admin ?? false,
  firma_kullanicisi: init?.firma_kullanicisi ?? false,
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
  gdf_kullanicisi: init?.gdf_kullanicisi ?? false,
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
  yetkili_firma_ids: init?.yetkili_firma_ids ?? [],
});

export function UserForm({ initial, candidateYoneticiler, pfList, dfList, mode }: UserFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const form = useForm<UserFormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults(initial),
  });

  const w = form.watch();

  // Çapraz toggle: PF açılırsa DF kapansın (ve tersi)
  React.useEffect(() => {
    if (w.firma_kullanicisi && w.gdf_kullanicisi) {
      form.setValue('gdf_kullanicisi', false);
    }
  }, [w.firma_kullanicisi, w.gdf_kullanicisi, form]);

  // Sub-flag temizlikleri
  React.useEffect(() => {
    if (!w.firma_kullanicisi) {
      form.setValue('firma_yonetici', false);
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

  // Aktif kanala göre firma listesi (PF veya DF)
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
        }))
      : [];

  // Bağlı olduğu yönetici adayları: kullanıcının seçtiği firmalardan birinde yetkili olan yöneticiler.
  const aktifKanal: 'pf' | 'df' | null =
    w.firma_kullanicisi ? 'pf' : w.gdf_kullanicisi ? 'df' : null;
  const yoneticiAdaylari = candidateYoneticiler.filter((y) => {
    if (!aktifKanal || y.kanal !== aktifKanal) return false;
    if (y.id === initial?.id) return false;
    return y.firma_ids.some((fid) => w.yetkili_firma_ids.includes(fid));
  });

  async function onSubmit(values: UserFormData) {
    setErr(null);
    setPending(true);
    try {
      const res = await fetch(`/api/users${mode === 'edit' ? `/${initial!.id}` : ''}`, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const out = await res.json();
      router.push(`/users/${out.id ?? initial?.id}`);
      router.refresh();
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {err && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {err}
        </div>
      )}

      {/* ── KİMLİK ───────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kimlik</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <RowField label="Adı Soyadı" error={form.formState.errors.adi?.message}>
            <Input {...form.register('adi')} placeholder="Ahmet Yılmaz" />
          </RowField>
          <RowField label="E-posta" error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register('email')} placeholder="ahmet@firma.com" />
          </RowField>
          <RowField label="GSM">
            <Input {...form.register('gsm')} placeholder="0532 123 45 67" />
          </RowField>
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

      {/* ── PF + DF KART ÇİFTİ (yan yana) ────────────────────────────── */}
      <div className="grid items-start gap-4 md:grid-cols-2">

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
              {/* — YÖNETİCİ — */}
              <RoleBox name="firma_yonetici" label="Yönetici" form={form}>
                {w.firma_yonetici && (
                  <NestedBox error={form.formState.errors.firma_yonetici_kademe?.message}>
                    <Controller
                      control={form.control}
                      name="firma_yonetici_kademe"
                      render={({ field }) => (
                        <RadioGroup
                          className="flex flex-col gap-1"
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v as 'ust' | 'orta')}
                        >
                          <RadioLabel value="ust">Üst Yönetici</RadioLabel>
                          <RadioLabel value="orta">Orta Kademe Yönetici</RadioLabel>
                        </RadioGroup>
                      )}
                    />
                  </NestedBox>
                )}
              </RoleBox>

              {/* — PROJE MÜHENDİSİ — */}
              <RoleBox name="firma_proje_muhendisi" label="Proje Mühendisi" form={form}>
                {w.firma_proje_muhendisi && (
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
                )}
              </RoleBox>

              {/* — ÇİZİM SORUMLUSU — */}
              <RoleBox name="firma_cizim_sorumlusu" label="Proje Çizim Sorumlusu" form={form} />

              {/* — TESİSAT USTASI — */}
              <RoleBox name="firma_tesisat_ustasi" label="Tesisat Ustası" form={form}>
                {w.firma_tesisat_ustasi && (
                  <NestedBox error={form.formState.errors.firma_tesisat_ustasi?.message}>
                    <UstaRow form={form} checkName="usta_montaj"      belgeName="usta_montaj_belge_no"      label="Montaj"      active={w.usta_montaj} />
                    <UstaRow form={form} checkName="usta_celik_kaynak" belgeName="usta_celik_kaynak_belge_no" label="Çelik Kaynak" active={w.usta_celik_kaynak} />
                    <UstaRow form={form} checkName="usta_pe_kaynak"   belgeName="usta_pe_kaynak_belge_no"   label="PE Kaynak"   active={w.usta_pe_kaynak} />
                  </NestedBox>
                )}
              </RoleBox>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── GDF KULLANICISI (DF) ─────────────────────────────────────── */}
      <Card>
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
              <RoleBox name="gdf_yonetici" label="Yönetici" form={form}>
                {w.gdf_yonetici && (
                  <NestedBox error={form.formState.errors.gdf_yonetici_kademe?.message}>
                    <Controller
                      control={form.control}
                      name="gdf_yonetici_kademe"
                      render={({ field }) => (
                        <RadioGroup
                          className="flex flex-col gap-1"
                          value={field.value ?? ''}
                          onValueChange={(v) => field.onChange(v as 'ust' | 'orta')}
                        >
                          <RadioLabel value="ust">Üst Yönetici</RadioLabel>
                          <RadioLabel value="orta">Orta Kademe Yönetici</RadioLabel>
                        </RadioGroup>
                      )}
                    />
                  </NestedBox>
                )}
              </RoleBox>

              <RoleBox name="gdf_onay_muhendisi" label="Onay Mühendisi" form={form}>
                {w.gdf_onay_muhendisi && (
                  <NestedBox>
                    <InlineField label="GDF Sicil No">
                      <Input className="h-8" {...form.register('onay_muh_gdf_sicil_no')} />
                    </InlineField>
                  </NestedBox>
                )}
              </RoleBox>

              <RoleBox name="gdf_gaz_acma_muhendisi" label="Gaz Açma Mühendisi" form={form}>
                {w.gdf_gaz_acma_muhendisi && (
                  <NestedBox>
                    <InlineField label="Ekip No">
                      <Input className="h-8" {...form.register('gaz_acma_muh_ekip_no')} />
                    </InlineField>
                  </NestedBox>
                )}
              </RoleBox>

              <RoleBox name="gdf_on_buro_yetkilisi" label="Ön Büro Yetkilisi" form={form} />
            </div>
          </CardContent>
        )}
      </Card>

      </div>

      {/* ── YETKİLİ OLDUĞU FİRMALAR + YÖNETİCİ ───────────────────────── */}
      {(w.firma_kullanicisi || w.gdf_kullanicisi) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Yetkili Olduğu Firmalar ({w.gdf_kullanicisi ? 'DF' : 'PF'})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Controller
              control={form.control}
              name="yetkili_firma_ids"
              render={({ field }) => (
                <FirmMultiSelect
                  options={firmaOptions}
                  value={field.value}
                  onChange={field.onChange}
                  comboboxLabel={w.gdf_kullanicisi ? 'DF Firmaları' : 'PF Firmaları'}
                  listboxLabel="Yetkili Olduğu Firmalar"
                  placeholder="Firma adıyla ara…"
                  emptyText={w.gdf_kullanicisi ? 'Tanımlı DF yok.' : 'Tanımlı PF yok.'}
                />
              )}
            />

            <Separator />

            <Field label="Bağlı Olduğu Yönetici">
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
                            ? 'Önce yetkili olduğunuz firmaları seçin'
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
            </Field>
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
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
      </div>
    </form>
  );
}

// ── KÜÇÜK HELPER'LAR ────────────────────────────────────────────────────────
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

function RoleBox({
  name,
  label,
  form,
  children,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  name: any;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-3">
      <label className="flex cursor-pointer items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Controller
          control={form.control}
          name={name}
          render={({ field }: { field: { value: boolean; onChange: (v: boolean) => void } }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          )}
        />
      </label>
      {children}
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CheckLabel({ control, name, label }: { control: any; name: any; label: string }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }: { field: { value: boolean; onChange: (v: boolean) => void } }) => (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
          <span>{label}</span>
        </label>
      )}
    />
  );
}

function RadioLabel({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <RadioGroupItem value={value} />
      <span>{children}</span>
    </label>
  );
}
