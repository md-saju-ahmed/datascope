export default function LoginBoundary() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Sign in required</h1>
      <p className="mt-4 leading-7 text-muted-foreground">
        Sign-in is not available yet.
      </p>
      <a
        className="mt-6 inline-flex min-h-10 items-center text-primary underline"
        href="/"
      >
        Back to DataScope
      </a>
    </>
  );
}
