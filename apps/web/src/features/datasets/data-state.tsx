import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function DataLoading() {
  return (
    <div role="status" aria-label="Loading data" className="space-y-4">
      <Skeleton className="h-8 w-52" />
      {[1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-20 w-full" />
      ))}
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
