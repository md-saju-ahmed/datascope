import { Button } from '@/components/ui/button';
export default function PublicEntry() {
  return (
    <>
      <p className="mb-3 text-sm font-medium text-primary">
        Enterprise data discovery
      </p>
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight">
        DataScope workspace
      </h1>
      <p className="my-6 max-w-lg leading-7 text-muted-foreground">
        A permission-aware foundation for exploring enterprise data. Public
        pages and sign-in flows are being prepared.
      </p>
      <Button asChild>
        <a href="/dashboard">Open workspace</a>
      </Button>
    </>
  );
}
