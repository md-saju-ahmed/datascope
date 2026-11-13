'use client';
import { Button } from '@/components/ui/button';
export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section
      role="alert"
      className="mx-auto my-8 max-w-xl rounded-xl border border-border bg-surface p-8"
    >
      <h1 className="text-2xl font-semibold">Unable to load this page</h1>
      <p className="my-4 text-muted-foreground">
        The service may be unavailable. Try again to check your session and
        reload the page.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <a href="/">Back to DataScope</a>
        </Button>
      </div>
    </section>
  );
}
