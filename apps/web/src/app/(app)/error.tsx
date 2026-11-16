'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Workspace error:', error);
  }, [error]);

  return (
    <section
      role="alert"
      aria-labelledby="workspace-error-title"
      className="mx-auto my-8 max-w-xl rounded-2xl border border-destructive/20 bg-surface p-8 text-center shadow-xs"
    >
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>

      <div className="mb-2 inline-flex items-center rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive">
        Workspace Error
      </div>

      <h1
        id="workspace-error-title"
        className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
      >
        Unable to load workspace data
      </h1>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        An error occurred while fetching or rendering this dataset view. You can
        retry or return to your library.
      </p>

      {error.digest && (
        <div className="mt-3 rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground select-all">
          Error digest: {error.digest}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          type="button"
          onClick={reset}
          className="min-h-10 px-4 cursor-pointer text-xs font-medium"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry action
        </Button>

        <Button
          asChild
          variant="outline"
          className="min-h-10 px-4 cursor-pointer text-xs"
        >
          <Link href="/dashboard">
            <Home className="size-3.5" aria-hidden="true" />
            Workspace Dashboard
          </Link>
        </Button>

        <Button
          asChild
          variant="outline"
          className="min-h-10 px-4 cursor-pointer text-xs"
        >
          <Link href="/datasets">
            <Database className="size-3.5" aria-hidden="true" />
            Dataset Library
          </Link>
        </Button>
      </div>
    </section>
  );
}
