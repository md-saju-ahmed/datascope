'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to client console or monitoring service
    console.error('Unhandled route error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section
        role="alert"
        aria-labelledby="error-title"
        className="mx-auto max-w-lg rounded-2xl border border-destructive/20 bg-surface p-8 text-center shadow-sm"
      >
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/10 text-destructive">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </div>

        <div className="mb-3 inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
          500 Error • Application Exception
        </div>

        <h1
          id="error-title"
          className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          Something went wrong
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          An unexpected error interrupted this request. You can try recovering
          the current page or return to the dashboard.
        </p>

        {error.digest && (
          <div className="mt-4 rounded-md border border-border bg-muted/50 p-2 font-mono text-[11px] text-muted-foreground select-all">
            Reference code: {error.digest}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={reset}
            className="min-h-11 px-5 cursor-pointer font-medium"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>

          <Button
            asChild
            variant="outline"
            className="min-h-11 px-5 cursor-pointer"
          >
            <Link href="/dashboard">
              <Home className="size-4" aria-hidden="true" />
              Go to Dashboard
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
