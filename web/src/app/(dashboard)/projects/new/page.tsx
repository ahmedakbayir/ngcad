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

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setPending(true);
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase
        .from('projects')
        .insert({ proje_adi: name })
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
              <Label className="text-xs">Proje Adı</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Oluştur
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
