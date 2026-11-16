import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function AccessDenied() {
  return (
    <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-8">
      <ShieldAlert className="mb-4 text-destructive" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="my-4 text-muted-foreground">
        Your account does not have access to this area.
      </p>
      <Button asChild>
        <Link href="/dashboard">Back to overview</Link>
      </Button>
    </section>
  );
}
export function RouteLoading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="space-y-7 animate-pulse"
    >
      <span className="sr-only">Loading page…</span>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-full rounded" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </header>

      {/* Metric Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-3.5 w-44 rounded" />
          </div>
        ))}
      </div>

      {/* Content Grid Skeleton */}
      <div className="grid gap-5 xl:grid-cols-2">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="rounded-xl border border-border bg-surface p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-5 w-2/3 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <div className="grid grid-cols-2 gap-4 py-2">
              <Skeleton className="h-8 rounded" />
              <Skeleton className="h-8 rounded" />
            </div>
            <div className="flex gap-3 border-t border-border pt-4">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-36 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export function FoundationPage({ title }: { title: string }) {
  return (
    <section className="max-w-3xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
        Workspace
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="font-semibold">Workspace foundation</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          This area is not available yet.
        </p>
      </div>
    </section>
  );
}
