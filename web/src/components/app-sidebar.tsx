'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  FolderKanban,
  ChevronRight,
} from 'lucide-react';

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const ITEMS: Item[] = [
  { href: '/dashboard', label: 'Dashboard',     icon: LayoutDashboard },
  { href: '/users',     label: 'Kullanıcılar',  icon: Users },
  { href: '/firms/pf',  label: 'Proje Firmaları (PF)', icon: Building2 },
  { href: '/firms/df',  label: 'Dağıtım Firmaları (DF)', icon: Truck },
  { href: '/projects',  label: 'Projeler',      icon: FolderKanban },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r bg-card md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
          AC
        </div>
        <span className="text-sm font-semibold">NGCAD</span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {active && <ChevronRight className="h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3 text-xs text-muted-foreground">
        v0.1 · MVP
      </div>
    </aside>
  );
}
