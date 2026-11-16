import type { ReactNode } from 'react';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { PublicHeader } from '@/components/layout/public-header';

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSession();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader user={user} />

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
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="font-medium text-primary transition-colors hover:text-foreground"
                >
                  Dashboard
                </Link>
                <Link
                  href="/datasets"
                  className="transition-colors hover:text-foreground"
                >
                  Datasets
                </Link>
                <Link
                  href="/search"
                  className="transition-colors hover:text-foreground"
                >
                  Explorer
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
