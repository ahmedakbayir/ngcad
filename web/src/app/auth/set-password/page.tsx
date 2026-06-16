'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, Loader2 } from 'lucide-react';

// Recovery linkinden gelen kullanıcı şifresini burada belirler. Callback
// rotası code'u session'a çevirip buraya yönlendirdiği için bu noktada
// kullanıcı zaten oturum açık durumda — updateUser ile şifre atanır.
export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [ready, setReady] = React.useState(false);

  // Sayfaya gelir gelmez oturum kontrolü; yoksa /login'e yönlendir.
  React.useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace('/login');
      } else {
        setReady(true);
      }
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password.length < 6) {
      setMsg({ type: 'error', text: 'Şifre en az 6 karakter olmalı.' });
      return;
    }
    if (password !== confirm) {
      setMsg({ type: 'error', text: 'Şifreler eşleşmiyor.' });
      return;
    }
    setPending(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw error;
      setMsg({ type: 'info', text: 'Şifreniz belirlendi. Yönlendiriliyorsunuz…' });
      router.replace('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const text = err instanceof Error ? err.message : 'Şifre belirlenemedi.';
      setMsg({ type: 'error', text });
    } finally {
      setPending(false);
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle>Şifrenizi Belirleyin</CardTitle>
          <CardDescription>İlk kez giriş için bir şifre oluşturun</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Yeni Şifre</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 6 karakter"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Şifre Tekrar</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {msg && (
              <div
                className={
                  msg.type === 'error'
                    ? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    : 'rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                }
              >
                {msg.text}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Şifreyi Kaydet
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
