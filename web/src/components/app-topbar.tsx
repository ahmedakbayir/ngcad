'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function AppTopbar({
  email,
  adi,
  channel,
  unvan,
}: {
  email: string;
  adi?: string | null;
  channel?: 'Admin' | 'PF' | 'DF' | 'PF/DF' | '';
  unvan?: string;
}) {
  const router = useRouter();

  React.useEffect(() => {
    const supabase = supabaseBrowser();
    const currentEmail = email;

    const recheck = async () => {
      // getSession cookie'den taze okur; getUser cached token ile yanılabilir.
      const { data } = await supabase.auth.getSession();
      const newEmail = data?.session?.user?.email ?? null;
      if (newEmail !== currentEmail) {
        if (!newEmail) router.replace('/login');
        else router.refresh();
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const newEmail = session?.user?.email ?? null;
      if (newEmail !== currentEmail) {
        if (!newEmail) router.replace('/login');
        else router.refresh();
      }
    });

    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('aangcad:auth'); } catch {}
    const onMsg = () => recheck();
    bc?.addEventListener('message', onMsg);

    const onVis = () => { if (document.visibilityState === 'visible') recheck(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      try { sub.subscription.unsubscribe(); } catch {}
      bc?.removeEventListener('message', onMsg);
      try { bc?.close(); } catch {}
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [email, router]);

  async function signOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    try { new BroadcastChannel('aangcad:auth').postMessage({ type: 'sign-out' }); } catch {}
    router.replace('/login');
    router.refresh();
  }

  const channelVariant: 'destructive' | 'info' | 'success' | 'secondary' | 'outline' =
    channel === 'Admin' ? 'destructive'
    : channel === 'PF' ? 'info'
    : channel === 'DF' ? 'success'
    : channel === 'PF/DF' ? 'secondary'
    : 'outline';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <div />
      <div className="flex items-center gap-3">
        {channel && (
          <div className="hidden items-center gap-1.5 md:flex">
            <Badge variant={channelVariant}>{channel}</Badge>
            {unvan && <span className="text-xs text-muted-foreground">{unvan}</span>}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Avatar name={adi ?? email} size={32} />
          <div className="hidden text-right md:block">
            <div className="text-sm font-medium leading-tight">{adi ?? email}</div>
            {adi && <div className="text-xs text-muted-foreground">{email}</div>}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Çıkış">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
