'use client';
import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  Database,
  LayoutDashboard,
  Search,
  Bookmark,
  History,
  ChartNoAxesCombined,
  Settings,
  Users,
  Shield,
  SlidersHorizontal,
  Menu,
  ArrowUpRight,
} from 'lucide-react';
import type { CurrentUser } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/datasets', label: 'Dataset Library', icon: Database },
  { href: '/search', label: 'Data Explorer', icon: Search },
  { href: '/saved-views', label: 'Saved Views', icon: Bookmark },
  { href: '/history', label: 'Search History', icon: History },
  { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { href: '/settings', label: 'Settings', icon: Settings },
];
const administration = [
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/datasets', label: 'Datasets', icon: Database },
  { href: '/admin/permissions', label: 'Permissions', icon: Shield },
  { href: '/admin/system', label: 'System', icon: SlidersHorizontal },
];
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = navigation.filter(
    (item) => item.href !== '/analytics' || user.role !== 'viewer',
  );
  const current =
    [...navigation, ...administration].find((item) => pathname === item.href)
      ?.label ?? 'Workspace';
  function links(list: typeof navigation) {
    return list.map(({ href, label, icon: Icon }) => (
      <a
        key={href}
        href={href}
        aria-current={pathname === href ? 'page' : undefined}
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
          pathname === href && 'bg-primary/10 font-medium text-primary',
        )}
      >
        <Icon size={18} aria-hidden="true" />
        {label}
      </a>
    ));
  }
  const nav = (
    <nav aria-label="Main navigation" className="space-y-1">
      {links(items)}
      {user.role !== 'viewer' && (
        <a
          href="/search?mode=advanced"
          className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
        >
          <SlidersHorizontal size={18} aria-hidden="true" />
          Advanced Search
        </a>
      )}
      {user.role === 'admin' && (
        <>
          <p className="px-3 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Administration
          </p>
          {links(administration)}
        </>
      )}
    </nav>
  );
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-surface focus:p-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface p-4 lg:flex">
        <a
          href="/dashboard"
          className="mb-8 flex min-h-10 items-center gap-3 px-3 text-xl font-bold tracking-tight"
        >
          <Database className="text-primary" aria-hidden="true" />
          DataScope
        </a>
        {nav}
        <p className="mt-auto px-3 pt-8 text-xs leading-5 text-muted-foreground">
          Enterprise data discovery
          <br />
          Permission-aware workspace
        </p>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-18 flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden">
              <Sheet
                open={open}
                onOpenChange={setOpen}
                trigger={
                  <Button variant="outline" aria-label="Open navigation">
                    <Menu size={20} />
                  </Button>
                }
              >
                {nav}
              </Sheet>
            </div>
            <span className="text-sm font-medium">{current}</span>
          </div>
          <div className="min-w-0 max-w-full text-right">
            <p
              className="max-w-52 truncate text-sm font-medium"
              title={user.email}
            >
              {user.email}
            </p>
            <p className="text-xs capitalize text-muted-foreground">
              {user.role}
            </p>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 p-4 outline-none sm:p-6 lg:p-8"
        >
          {children}
        </main>
        <footer className="px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <a className="inline-flex min-h-10 items-center gap-1" href="/">
            DataScope <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </footer>
      </div>
    </div>
  );
}
