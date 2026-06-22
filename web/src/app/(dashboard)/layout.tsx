import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { AppSidebar } from '@/components/app-sidebar';
import { AppTopbar } from '@/components/app-topbar';
import { deriveUnvanFromRoles } from '@/lib/user-roles';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: row } = await supabase
    .from('users')
    .select(`
      adi, email, unvan, is_admin,
      firma_kullanicisi, firma_yonetici, firma_yonetici_kademe,
      firma_proje_muhendisi, firma_cizim_sorumlusu, firma_tesisat_ustasi,
      gdf_kullanicisi, gdf_yonetici, gdf_yonetici_kademe,
      gdf_onay_muhendisi, gdf_gaz_acma_muhendisi, gdf_on_buro_yetkilisi
    `)
    .eq('id', user.id)
    .maybeSingle();

  const channel: 'Admin' | 'PF' | 'DF' | 'PF/DF' | '' =
    row?.is_admin ? 'Admin'
    : (row?.firma_kullanicisi && row?.gdf_kullanicisi) ? 'PF/DF'
    : row?.firma_kullanicisi ? 'PF'
    : row?.gdf_kullanicisi ? 'DF'
    : '';

  const unvan = row?.unvan?.trim() || (row ? deriveUnvanFromRoles(row) : '');

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          email={user.email ?? ''}
          adi={row?.adi ?? null}
          channel={channel}
          unvan={unvan}
        />
        <main className="flex-1 overflow-auto bg-muted/20 p-6">{children}</main>
      </div>
    </div>
  );
}
