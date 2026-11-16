'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { CurrentUser } from '@datascope/contracts';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import {
  Menu,
  LayoutDashboard,
  Database,
  Search,
  LogOut,
  ArrowRight,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function PublicHeader({ user }: { user: CurrentUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const csrfRes = await fetch('/api/v1/auth/csrf');
      const csrf = (await csrfRes.json()) as { csrfToken?: string };
      if (csrf.csrfToken) {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf.csrfToken,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // Allow local redirection even if network fails
    } finally {
      window.location.replace('/login');
    }
  }

  const brandHref = user ? '/dashboard' : '/';

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href={brandHref}
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90"
        >
          <img
            src="/logo.svg"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8"
          />
          <span>DataScope</span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="Public Navigation"
          className="hidden items-center gap-3 sm:flex sm:gap-4"
        >
          <Link
            href="/"
            className={cn(
              'text-sm font-medium transition-colors hover:text-foreground',
              pathname === '/'
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
          >
            Overview
          </Link>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <User
                  size={13}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
                <span
                  className="max-w-44 truncate font-medium text-foreground"
                  title={user.email}
                >
                  {user.email}
                </span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  {user.role}
                </span>
              </div>
              <Button asChild className="min-h-9 px-3">
                <Link href="/dashboard">
                  Dashboard{' '}
                  <ArrowRight size={14} className="ml-1" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                variant="outline"
                disabled={signingOut}
                onClick={() => {
                  void handleSignOut();
                }}
                className="min-h-9 cursor-pointer px-3"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Sign in
              </Link>
              <Button asChild className="min-h-9 px-3">
                <Link href="/register">Sign up</Link>
              </Button>
            </div>
          )}

          <ThemeToggle />
        </nav>

        {/* Mobile Navigation Header Controls */}
        <div className="flex items-center gap-2 sm:hidden">
          <ThemeToggle />
          <Sheet
            open={open}
            onOpenChange={setOpen}
            trigger={
              <Button
                variant="outline"
                aria-label="Open navigation"
                className="min-h-9 min-w-9 p-0"
              >
                <Menu size={18} />
              </Button>
            }
          >
            <div className="flex flex-1 flex-col justify-between py-2">
              <div className="space-y-4">
                {user && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User size={14} aria-hidden="true" />
                      <span>Signed in as</span>
                    </div>
                    <p
                      className="mt-1 truncate text-sm font-semibold text-foreground"
                      title={user.email}
                    >
                      {user.email}
                    </p>
                    <span className="mt-1.5 inline-block rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {user.role}
                    </span>
                  </div>
                )}

                <nav aria-label="Mobile Navigation" className="space-y-1">
                  <Link
                    href="/"
                    onClick={() => {
                      setOpen(false);
                    }}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted hover:text-foreground',
                      pathname === '/'
                        ? 'bg-primary/10 font-semibold text-primary'
                        : 'text-muted-foreground',
                    )}
                  >
                    Overview
                  </Link>

                  {user ? (
                    <>
                      <Link
                        href="/dashboard"
                        onClick={() => {
                          setOpen(false);
                        }}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted hover:text-foreground',
                          pathname === '/dashboard'
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground',
                        )}
                      >
                        <LayoutDashboard size={18} aria-hidden="true" />
                        Dashboard
                      </Link>
                      <Link
                        href="/datasets"
                        onClick={() => {
                          setOpen(false);
                        }}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted hover:text-foreground',
                          pathname === '/datasets'
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground',
                        )}
                      >
                        <Database size={18} aria-hidden="true" />
                        Dataset Library
                      </Link>
                      <Link
                        href="/search"
                        onClick={() => {
                          setOpen(false);
                        }}
                        className={cn(
                          'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors hover:bg-muted hover:text-foreground',
                          pathname === '/search'
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground',
                        )}
                      >
                        <Search size={18} aria-hidden="true" />
                        Data Explorer
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        onClick={() => {
                          setOpen(false);
                        }}
                        className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/register"
                        onClick={() => {
                          setOpen(false);
                        }}
                        className="flex min-h-11 items-center gap-3 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Sign up
                      </Link>
                    </>
                  )}
                </nav>
              </div>

              {user && (
                <div className="border-t border-border pt-4">
                  <Button
                    variant="outline"
                    disabled={signingOut}
                    onClick={() => {
                      void handleSignOut();
                    }}
                    className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2"
                  >
                    <LogOut size={16} aria-hidden="true" />
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </Button>
                </div>
              )}
            </div>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
