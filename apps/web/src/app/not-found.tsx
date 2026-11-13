export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="my-4 text-muted-foreground">
        This address is not available.
      </p>
      <a href="/" className="text-primary underline">
        Back to DataScope
      </a>
    </main>
  );
}
