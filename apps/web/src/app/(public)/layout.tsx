import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
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
          <nav
            aria-label="Public Navigation"
            className="flex items-center gap-3 sm:gap-4"
          >
            <Link
              href="/"
              className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
            >
              Overview
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Button asChild className="min-h-9 px-3">
              <Link href="/register">Sign up</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {children}
      </main>
      <footer className="border-t border-border bg-surface py-6 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <img
              src="/logo.svg"
              alt=""
              width={18}
              height={18}
              className="h-4.5 w-4.5"
            />
            <span className="font-medium text-foreground">DataScope</span>
            <span>&mdash; Enterprise Data Discovery Platform</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="transition-colors hover:text-foreground"
            >
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
