'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, LogIn, Mail } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get('next') || '/dashboard';

  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    const supabase = supabaseBrowser();

    try {
      if (mode === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        setMsg({ type: 'info', text: 'E-postanıza giriş bağlantısı gönderildi.' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Giriş başarısız.';
      setMsg({ type: 'error', text: message });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LogIn className="h-6 w-6" />
          </div>
          <CardTitle>NGCAD Yönetim Paneli</CardTitle>
          <CardDescription>Devam etmek için giriş yapın</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@firma.com"
              />
            </div>

            {mode === 'password' && (
              <div className="space-y-2">
                <Label htmlFor="password">Şifre</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {msg && (
              <div
                className={
                  msg.type === 'error'
                    ? 'rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    : 'rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-800'
                }
              >
                {msg.text}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'password' ? 'Giriş Yap' : 'Bağlantı Gönder'}
            </Button>

            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setMsg(null);
                setMode(mode === 'password' ? 'magic' : 'password');
              }}
            >
              <Mail className="h-3 w-3" />
              {mode === 'password' ? 'Magic link ile gir' : 'Şifre ile gir'}
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
