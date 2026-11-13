'use client';
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main>
          <h1>Unable to load DataScope</h1>
          <p>Please try loading the application again.</p>
          <button onClick={reset}>Try again</button>
          <a href="/">Back to DataScope</a>
        </main>
      </body>
    </html>
  );
}
