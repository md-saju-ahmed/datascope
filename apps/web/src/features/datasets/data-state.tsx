import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function DataLoading({
  variant = 'cards',
  count = 4,
}: {
  variant?: 'cards' | 'table' | 'rows';
  count?: number;
} = {}) {
  if (variant === 'table') {
    return (
      <div
        role="status"
        aria-label="Loading data"
        className="space-y-4 animate-pulse"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          {[1, 2, 3, 4, 5].map((n) => (
            <Skeleton key={n} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'rows') {
    return (
      <div
        role="status"
        aria-label="Loading data"
        className="space-y-3 animate-pulse"
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-surface p-4 space-y-2.5"
          >
            <Skeleton className="h-4 w-1/3 rounded" />
            <Skeleton className="h-3.5 w-2/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading data"
      className="space-y-4 animate-pulse"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-36 rounded" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-5 w-2/3 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Skeleton className="h-8 rounded" />
              <Skeleton className="h-8 rounded" />
            </div>
            <div className="flex gap-3 border-t border-border pt-4">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-32 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
export function DataFailure({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined;
  const denied = status === 403 || status === 404;
  return (
    <section
      role="alert"
      className="space-y-4 rounded-lg border border-border bg-surface p-6"
    >
      <h2 className="text-lg font-semibold">
        {denied ? 'Dataset unavailable' : 'Unable to load data'}
      </h2>
      <p className="text-muted-foreground">
        {denied
          ? 'This resource is unavailable or your access has changed.'
          : 'Check your connection and try again.'}
      </p>
      <div className="flex gap-4">
        <Button onClick={retry} variant="outline">
          Try again
        </Button>
        <Link
          href="/datasets"
          className="inline-flex min-h-10 items-center text-primary underline"
        >
          Dataset Library
        </Link>
      </div>
    </section>
  );
}
export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '\u2014';
  if (typeof value === 'string' || typeof value === 'number')
    return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return JSON.stringify(value);
}
