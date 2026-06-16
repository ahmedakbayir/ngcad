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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, Trash2 } from 'lucide-react';
import type { FirmaRow, UserRow } from '@/lib/supabase/types';
import { FirmMultiSelect, type FirmOption } from '@/components/firm-multiselect';
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

interface FirmFormProps {
  kind: FirmKind;
  initial?: FirmaRow & {
    alt_firma_ids?: string[];
    // Bu firmanın alt birimi var mı? Varsa "üst firma" toggle'ı zorunlu açık.
    hasChildren?: boolean;
  };
  mode: 'create' | 'edit';
  yetkiliUsers: Pick<UserRow, 'id' | 'adi'>[];
  parentList: ParentEntry[];
  dfList?: DFListEntry[];
}

export function FirmForm({ kind, initial, mode, yetkiliUsers, parentList, dfList = [] }: FirmFormProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const form = useForm<FirmFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      firma_adi: initial?.firma_adi ?? '',
      parent_id: initial?.parent_id ?? null,
      firma_tel: initial?.firma_tel ?? '',
      firma_email: initial?.firma_email ?? '',
      vergi_dairesi: initial?.vergi_dairesi ?? '',
      vergi_no: initial?.vergi_no ?? '',
      adres: initial?.adres ?? '',
      yeterlilik_no: (initial && 'yeterlilik_no' in initial ? initial.yeterlilik_no : '') ?? '',
      yetkili_user_id: initial?.yetkili_user_id ?? null,
      df_id: (initial && 'df_id' in initial ? (initial as { df_id?: string | null }).df_id : null) ?? null,
      // Bayrak yoksa ama alt birim varsa, firma fiilen "üst firma"dır
      // (tablo da bu mantıkla ÜST FİRMA rozeti gösterir — tutarlı tutulur).
      ust_firma:
        (initial && 'ust_firma' in initial ? Boolean(initial.ust_firma) : false) ||
        Boolean(initial?.hasChildren),
      alt_firma_ids: initial?.alt_firma_ids ?? [],
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

  // ÜST FİRMA toggle reaktif izlenir; PF ve DF için ortak.
  const ustFirmaActive = form.watch('ust_firma') ?? false;

  async function onSubmit(values: FirmFormData) {
    setErr(null);
    setPending(true);
    try {
      const url =
        mode === 'edit'
          ? `/api/firms/${kind}/${initial!.id}`
          : `/api/firms/${kind}`;
      // DF tablosunda yeterlilik_no kolonu yok — DF kaydederken kaldır.
      const payload: Record<string, unknown> = { ...values };
      if (kind === 'df') {
        delete payload.yeterlilik_no;
        // df_id yalnız PF tablosunda var — DF payload'una sızmasın.
        delete payload.df_id;
        // Boş alanları null'a normalize et.
        if (payload.son_guncelleme === '') payload.son_guncelleme = null;
        if (payload.df_no === '') payload.df_no = null;
        if (payload.guncel_surum === '') payload.guncel_surum = null;
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
      await res.json();
      router.push(`/firms/${kind}`);
      router.refresh();
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
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
          <RowField label="ÜST FİRMA" className="sm:col-span-2">
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
                  <div className="text-xs text-muted-foreground">
                    {initial?.hasChildren
                      ? "Bu firmanın alt birimleri olduğu için üst firma işareti zorunlu. Önce alt birimleri kaldırın."
                      : kind === 'pf'
                        ? "İşaretliyse bu firma alt birim PF'lerin üst firmasıdır. DF bağı taşımaz; alt firmalar Alt Firmalar bölümünden seçilir."
                        : "İşaretliyse bu firma alt birim DF'lerin üst firmasıdır. PF'ler doğrudan buna bağlanamaz (alt birim DF'lere bağlanır)."}
                  </div>
                  {field.value && (
                    <Badge variant="info" className="ml-auto text-[10px]">ÜST FİRMA</Badge>
                  )}
                </div>
              )}
            />
          </RowField>

          <RowField
            label="Firma Adı"
            error={form.formState.errors.firma_adi?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register('firma_adi')} placeholder="Örn: AKRE ISI MÜHENDİSLİK" />
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

          <RowField label="Yetkili Kullanıcı">
            <Controller
              control={form.control}
              name="yetkili_user_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? '__none__'}
                  onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                  disabled={yetkiliUsers.length === 0}
                >
                  <SelectTrigger>
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
                      <SelectItem key={u.id} value={u.id}>{u.adi}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {yetkiliUsers.length === 0 && mode === 'edit' && (
              <p className="text-[11px] text-muted-foreground">
                Yetkili olarak seçilebilmesi için kullanıcının önce bu firmayı
                yetkili firmalar listesinde işaretlemesi gerekir.
              </p>
            )}
          </RowField>

          <RowField label="Telefon">
            <Input {...form.register('firma_tel')} placeholder="0212 555 11 22" />
          </RowField>
          <RowField label="E-posta">
            <Input type="email" {...form.register('firma_email')} placeholder="info@firma.com" />
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
              <RowField label="DfirmNo">
                <Input
                  type="number"
                  {...form.register('df_no')}
                  placeholder="Örn: 1, 2, 3…"
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
                      placeholder="100"
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

      {kind === 'pf' && !ustFirmaActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bağlı Dağıtım Firması (DF)</CardTitle>
            <p className="text-xs text-muted-foreground">Bu PF hangi GDF bölgesinde çalışıyor? Bir PF yalnız tek DF'ye bağlanır.</p>
          </CardHeader>
          <CardContent>
            <Controller
              control={form.control}
              name="df_id"
              render={({ field }) => {
                // Parent'lar üstte, alt birimleri girintili olacak şekilde sırala.
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
                        <SelectItem key={d.id} value={d.id}>
                          {depth === 1 ? `↳ ${d.firma_adi}` : d.firma_adi}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              }}
            />
          </CardContent>
        </Card>
      )}

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
                    placeholder="Firma adıyla ara…"
                    emptyText="Henüz başka firma tanımlanmamış."
                  />
                );
              }}
            />
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
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Kaydet
        </Button>
      </div>
    </form>
  );
}
