'use client';
import { LogoutButton } from '@/features/auth/logout-button';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { useAppSelector } from '@/store/hooks';
import { datasetSlice } from '@/store/slices/dataset-slice';
import { authSlice } from '@/store/slices/auth-slice';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { PreferencesBridge } from '@/features/settings/preferences';
import { ThemeToggle } from './theme-toggle';
import { Footer } from './footer';

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
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const user = useAppSelector(authSlice.selectors.selectUser);
  const selectedDataset = useAppSelector(
    datasetSlice.selectors.selectActiveDatasetId,
  );
  const defaultDataset = useAppSelector(
    (s) => s.uiPreferences.defaultDatasetId,
  );
  const routeDataset = /^\/datasets\/([a-f0-9-]{36})\//i.exec(pathname)?.[1];
  const activeDataset = routeDataset ?? selectedDataset ?? defaultDataset;
  if (!user)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-semibold">Sign in required</h1>
        <Link
          href="/login"
          className="mt-4 inline-flex min-h-10 items-center text-primary underline"
        >
          Go to sign in
        </Link>
      </main>
    );
  const currentUser = user;
  const items = navigation.filter(
    (item) => item.href !== '/analytics' || currentUser.role !== 'viewer',
  );
  const current =
    [...navigation, ...administration].find((item) => pathname === item.href)
      ?.label ??
    (routeDataset
      ? pathname.endsWith('/fields')
        ? 'Field information'
        : 'Data Explorer'
      : 'Workspace');
  function links(list: typeof navigation, onNavigate?: () => void) {
    return list.map(({ href, label, icon: Icon }) => (
      <Link
        key={href}
        href={
          href === '/search'
            ? activeDataset
              ? `/datasets/${activeDataset}/explore`
              : '/datasets'
            : href
        }
        {...(onNavigate ? { onClick: onNavigate } : {})}
        aria-current={
          pathname === href ||
          (href === '/search' &&
            !!routeDataset &&
            pathname.endsWith('/explore'))
            ? 'page'
            : undefined
        }
        className={cn(
          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
          (pathname === href ||
            (href === '/search' &&
              !!routeDataset &&
              pathname.endsWith('/explore'))) &&
            'bg-primary/10 font-medium text-primary',
        )}
      >
        <Icon size={18} aria-hidden="true" />
        {label}
      </Link>
    ));
  }
  function renderNav(onNavigate?: () => void) {
    return (
      <nav aria-label="Main navigation" className="space-y-1">
        {links(items, onNavigate)}
        {currentUser.role !== 'viewer' && (
          <Link
            href="/search?mode=advanced"
            {...(onNavigate ? { onClick: onNavigate } : {})}
            className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            <SlidersHorizontal size={18} aria-hidden="true" />
            Advanced Search
          </Link>
        )}
        {currentUser.role === 'admin' && (
          <>
            <p className="px-3 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administration
            </p>
            {links(administration, onNavigate)}
          </>
        )}
      </nav>
    );
  }
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <PreferencesBridge />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-surface focus:p-3"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-border bg-surface p-4 lg:flex">
        <Link
          href="/dashboard"
          className="mb-8 flex min-h-10 items-center gap-3 px-3 text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90"
        >
          <img
            src="/logo.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
            aria-hidden="true"
          />
          DataScope
        </Link>
        {renderNav()}
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
                <div className="mb-6 flex items-center gap-2.5 px-3">
                  <img
                    src="/logo.svg"
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6"
                    aria-hidden="true"
                  />
                  <span className="text-lg font-bold">DataScope</span>
                </div>
                {renderNav(() => {
                  setOpen(false);
                })}
              </Sheet>
            </div>
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.svg"
                alt=""
                width={22}
                height={22}
                className="h-5.5 w-5.5 lg:hidden"
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{current}</span>
            </div>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3 sm:gap-4">
            <ThemeToggle />
            <div className="text-right">
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
            <LogoutButton />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 p-4 outline-none sm:p-6 lg:p-8"
        >
          {children}
        </main>
        <Footer
          containerClassName="max-w-full px-0 sm:px-0 lg:px-0"
          className="border-t border-border px-4 py-4 sm:px-6"
        />
      </div>
    </div>
  );
}
