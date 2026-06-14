import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { AppTopbar } from '@/components/app-topbar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // public.users'tan adi alanını çek (varsa)
  const { data: row } = await supabase
    .from('users')
    .select('adi, email')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar email={user.email ?? ''} adi={row?.adi ?? null} />
        <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
