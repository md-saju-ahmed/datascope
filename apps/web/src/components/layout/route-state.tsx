import { ShieldAlert } from 'lucide-react';
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
        <a href="/dashboard">Back to overview</a>
      </Button>
    </section>
  );
}
export function RouteLoading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <span className="sr-only">Loading page…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-48 w-full" />
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
