import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Database, Filter, ShieldCheck } from 'lucide-react';
export default function PublicEntry() {
  return (
    <>
      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-xs font-medium text-foreground">
        <img
          src="/logo.svg"
          alt=""
          width={16}
          height={16}
          className="h-4 w-4"
          aria-hidden="true"
        />
        <span>Enterprise Data Discovery Platform</span>
      </div>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Find the signal.
        <br />
        <span className="text-primary">Keep the context.</span>
      </h1>
      <p className="my-7 max-w-xl text-lg leading-8 text-muted-foreground">
        Explore enterprise data without downloading it all. A focused workspace
        for discovering records within your team permissions.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="min-h-11">
          <Link href="/login">
            Sign in <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/register">Create Viewer account</Link>
        </Button>
      </div>
      <div className="mt-14 grid gap-6 border-t border-border pt-8 sm:grid-cols-3">
        {[
          {
            icon: Database,
            title: 'Bounded by design',
            text: 'Server-side pagination keeps record transfers focused.',
          },
          {
            icon: Filter,
            title: 'Search with context',
            text: 'Structured conditions are validated and processed by the API.',
          },
          {
            icon: ShieldCheck,
            title: 'Permission-aware',
            text: 'The server checks session, role and dataset access.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <section key={title}>
            <Icon size={20} className="mb-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {text}
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
