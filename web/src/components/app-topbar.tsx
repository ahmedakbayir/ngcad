'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function AppTopbar({ email, adi }: { email: string; adi?: string | null }) {
  const router = useRouter();

  async function signOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4">
      <div />
      <div className="flex items-center gap-3">
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
