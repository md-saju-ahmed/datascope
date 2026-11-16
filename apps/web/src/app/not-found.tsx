import Link from 'next/link';
import { Compass, Home, Database, ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top navigation header */}
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 font-bold text-lg tracking-tight hover:opacity-90 transition-opacity"
          >
            <img
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7"
              aria-hidden="true"
            />
            <span>DataScope</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      {/* Main error content */}
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="mx-auto max-w-lg text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-xs">
            <Compass className="size-8" aria-hidden="true" />
          </div>

          <div className="mb-3 inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
            404 Error • Page Not Found
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Lost in the data lake?
          </h1>

          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            The page or resource you requested doesn't exist, has been
            relocated, or the link contains a typo.
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="min-h-11 px-5 font-medium cursor-pointer">
              <Link href="/dashboard">
                <Home className="size-4" aria-hidden="true" />
                Go to Dashboard
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="min-h-11 px-5 cursor-pointer"
            >
              <Link href="/datasets">
                <Database className="size-4" aria-hidden="true" />
                Browse Datasets
              </Link>
            </Button>
          </div>

          {/* Helpful suggestions card */}
          <div className="mt-10 rounded-xl border border-border bg-surface p-5 text-left text-xs shadow-xs">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Search className="size-3.5 text-primary" aria-hidden="true" />
              Helpful destinations
            </h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted-foreground">
              <li>
                <Link
                  href="/dashboard"
                  className="hover:text-primary underline underline-offset-2 transition-colors"
                >
                  → Workspace Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/datasets"
                  className="hover:text-primary underline underline-offset-2 transition-colors"
                >
                  → Dataset Directory
                </Link>
              </li>
              <li>
                <Link
                  href="/search"
                  className="hover:text-primary underline underline-offset-2 transition-colors"
                >
                  → Full-text Data Search
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="hover:text-primary underline underline-offset-2 transition-colors"
                >
                  → Sign In / Switch Account
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </main>

      {/* Simple footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        DataScope Enterprise Discovery &bull; High-Performance Data Intelligence
      </footer>
    </div>
  );
}
