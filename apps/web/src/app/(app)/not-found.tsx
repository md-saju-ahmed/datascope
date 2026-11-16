import Link from 'next/link';
import { Compass, Database, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WorkspaceNotFound() {
  return (
    <section
      role="status"
      aria-labelledby="not-found-heading"
      className="mx-auto my-12 max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-xs"
    >
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
        <Compass className="size-6" aria-hidden="true" />
      </div>

      <div className="mb-2 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
        Resource Not Found
      </div>

      <h1
        id="not-found-heading"
        className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
      >
        Dataset or resource unavailable
      </h1>

      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        The requested dataset, view, or record could not be found. It may have
        been deleted or you may not have permission to view it.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          asChild
          className="min-h-10 px-4 cursor-pointer text-xs font-medium"
        >
          <Link href="/datasets">
            <Database className="size-3.5" aria-hidden="true" />
            Browse Datasets
          </Link>
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
      </div>
    </section>
  );
}
