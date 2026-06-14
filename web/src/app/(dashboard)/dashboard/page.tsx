import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Truck, FolderKanban } from 'lucide-react';

async function getCounts() {
  const supabase = await supabaseServer();
  const [u, pf, df, p] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('proje_firmalari').select('id', { count: 'exact', head: true }),
    supabase.from('dagitim_firmalari').select('id', { count: 'exact', head: true }),
    supabase.from('projects').select('id', { count: 'exact', head: true }),
  ]);
  return {
    users: u.count ?? 0,
    pf: pf.count ?? 0,
    df: df.count ?? 0,
    projects: p.count ?? 0,
  };
}

export default async function DashboardHome() {
  const counts = await getCounts();

  const cards = [
    { href: '/users',    label: 'Kullanıcılar',           value: counts.users,    icon: Users,         hint: 'Admin / PFUser / DFUser / General' },
    { href: '/firms/pf', label: 'Proje Firmaları (PF)',   value: counts.pf,       icon: Building2,     hint: 'Proje çizimini hazırlayan firmalar' },
    { href: '/firms/df', label: 'Dağıtım Firmaları (DF)', value: counts.df,       icon: Truck,         hint: 'Gaz dağıtım firmaları (GDF)' },
    { href: '/projects', label: 'Projeler',               value: counts.projects, icon: FolderKanban,  hint: 'CAD çizim projeleri' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Genel Bakış</h1>
        <p className="text-sm text-muted-foreground">
          AANGCAD yönetim paneline hoş geldiniz. Soldaki menüden bölümlere geçebilirsiniz.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href} className="block">
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardDescription className="uppercase tracking-wide text-xs">{c.label}</CardDescription>
                      <CardTitle className="text-3xl">{c.value}</CardTitle>
                    </div>
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{c.hint}</CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
