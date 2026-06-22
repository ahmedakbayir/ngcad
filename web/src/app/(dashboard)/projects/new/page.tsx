'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Loader2, Save } from 'lucide-react';

type Firm = { pf_id: string; pf_adi: string; df_id: string | null; df_adi: string | null };

type UserPfRow = {
  pf_id: string;
  proje_firmalari: {
    id: string;
    firma_adi: string;
    df_id: string | null;
    dagitim_firmalari: { id: string; firma_adi: string } | null;
  } | null;
};

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [firms, setFirms] = React.useState<Firm[]>([]);
  const [pfId, setPfId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }
        const { data, error } = await supabase
          .from('user_pf')
          .select(`
            pf_id,
            proje_firmalari!inner(
              id, firma_adi, df_id,
              dagitim_firmalari(id, firma_adi)
            )
          `)
          .eq('user_id', user.id);
        if (error) throw error;
        const rows = (data ?? []) as unknown as UserPfRow[];
        const list: Firm[] = rows
          .map((row) => {
            const pf = row.proje_firmalari;
            if (!pf) return null;
            // DF opsiyonel — TEKİL/ÜST FİRMA PF'leri df_id NULL olabilir.
            const df = pf.dagitim_firmalari;
            return {
              pf_id: pf.id,
              pf_adi: pf.firma_adi,
              df_id: df?.id ?? null,
              df_adi: df?.firma_adi ?? null,
            };
          })
          .filter((x): x is Firm => x !== null)
          .sort((a, b) => a.pf_adi.localeCompare(b.pf_adi, 'tr'));
        setFirms(list);
        if (list.length === 1) setPfId(list[0].pf_id);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : 'Firmalar yüklenemedi.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!pfId) { setErr('Hangi firma için proje açtığınızı seçin.'); return; }
    const firm = firms.find((f) => f.pf_id === pfId);
    if (!firm) { setErr('Geçersiz firma.'); return; }
    setPending(true);
    try {
      const supabase = supabaseBrowser();
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr || !user) throw userErr ?? new Error('Oturum bulunamadı.');
      const { data, error } = await supabase
        .from('projects')
        .insert({
          proje_adi: name,
          owner_user_id: user.id,
          pf_id: firm.pf_id,
          df_id: firm.df_id,
        })
        .select('id')
        .single();
      if (error) throw error;
      router.push(`/projects/${data.id}`);
      router.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Kaydedilemedi.');
    } finally {
      setPending(false);
    }
  }

  if (!loading && firms.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/projects"><ArrowLeft className="h-3 w-3" /> Projeler</Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Yeni Proje</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">
              Hiçbir PF üyeliğiniz yok. Yöneticinize danışın.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const singleFirm = firms.length === 1 ? firms[0] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/projects"><ArrowLeft className="h-3 w-3" /> Projeler</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Yeni Proje</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Firma (PF · DF)</Label>
              {loading ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Yükleniyor…
                </div>
              ) : singleFirm ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <span className="font-medium">{singleFirm.pf_adi}</span>
                  <span className="text-muted-foreground"> · {singleFirm.df_adi ?? 'DF bağlı değil'}</span>
                </div>
              ) : (
                <select
                  value={pfId}
                  onChange={(e) => setPfId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                >
                  <option value="" disabled>Hangi firma için proje açıyorsunuz?</option>
                  {firms.map((f) => (
                    <option key={f.pf_id} value={f.pf_id}>
                      {f.pf_adi}{f.df_adi ? ` · ${f.df_adi}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Proje Adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            <Button type="submit" disabled={pending || loading || !name.trim() || !pfId}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Oluştur
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
