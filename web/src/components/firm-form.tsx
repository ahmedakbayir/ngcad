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
  // sadece PF için: bağlı DF'ler
  df_ids: z.array(z.string()).optional(),
});

export type FirmFormData = z.input<typeof schema>;

export type FirmKind = 'pf' | 'df';

interface FirmFormProps {
  kind: FirmKind;
  initial?: FirmaRow & { df_ids?: string[] };
  mode: 'create' | 'edit';
  yetkiliUsers: Pick<UserRow, 'id' | 'adi'>[];
  parentList: Pick<FirmaRow, 'id' | 'firma_adi'>[];
  dfList?: Pick<FirmaRow, 'id' | 'firma_adi' | 'parent_id'>[]; // sadece kind=pf için
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
      df_ids: initial?.df_ids ?? [],
    },
  });

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
      if (kind === 'df') delete payload.yeterlilik_no;
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const out = await res.json();
      router.push(`/firms/${kind}/${out.id ?? initial?.id}`);
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
          <RowField
            label="Firma Adı"
            error={form.formState.errors.firma_adi?.message}
            className="sm:col-span-2"
          >
            <Input {...form.register('firma_adi')} placeholder="Örn: AKRE ISI MÜHENDİSLİK" />
          </RowField>

          <RowField label="Üst Firma">
            <Controller
              control={form.control}
              name="parent_id"
              render={({ field }) => (
                <Select value={field.value ?? '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Üst yok" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Üst yok —</SelectItem>
                    {parentList
                      .filter((p) => p.id !== initial?.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.firma_adi}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
          </RowField>

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

          <RowField label="Adres" className="sm:col-span-2">
            <Input {...form.register('adres')} />
          </RowField>
        </CardContent>
      </Card>

      {kind === 'pf' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bağlı Dağıtım Firmaları (DF)</CardTitle>
            <p className="text-xs text-muted-foreground">Bu PF hangi GDF'lerde yetkili çalışıyor?</p>
          </CardHeader>
          <CardContent>
            <Controller
              control={form.control}
              name="df_ids"
              render={({ field }) => {
                const dfOptions: FirmOption[] = dfList.map((d) => ({
                  id: d.id,
                  firma_adi: d.firma_adi,
                  parent_id: d.parent_id ?? null,
                }));
                return (
                  <FirmMultiSelect
                    options={dfOptions}
                    value={field.value ?? []}
                    onChange={field.onChange}
                    comboboxLabel="DF Firmaları"
                    listboxLabel="Bağlı DF'ler"
                    placeholder="DF adıyla ara…"
                    emptyText="Henüz DF tanımlanmamış."
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
