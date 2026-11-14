import { requireSession } from '@/lib/session';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
export default async function Dashboard() {
  const user = await requireSession();
  return (
    <section className="max-w-4xl space-y-8">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">
          Your workspace
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-3 text-muted-foreground">
          A clear starting point for your next discovery.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <ShieldCheck aria-hidden="true" className="mb-5 text-primary" />
        <h2 className="text-lg font-semibold">You are signed in</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Your {user.role} account is connected. Dataset access is managed by
          your administrator.
        </p>
        <div className="mt-6 border-t border-border pt-6">
          <h3 className="font-medium">Next: your dataset workspace</h3>
          <p className="mb-5 mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            The dataset library and exploration tools are being prepared. No
            dataset counts or activity are available on this overview yet.
          </p>
          <Button asChild variant="outline">
            <a href="/datasets">
              Dataset Library <ArrowRight size={16} aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
