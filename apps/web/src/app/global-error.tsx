'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Application Error | DataScope</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          :root {
            --bg: #f8fafc;
            --fg: #0f172a;
            --surface: #ffffff;
            --border: #e2e8f0;
            --primary: #0f766e;
            --muted: #64748b;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #090d16;
              --fg: #f8fafc;
              --surface: #0f172a;
              --border: #1e293b;
              --primary: #14b8a6;
              --muted: #94a3b8;
            }
          }
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: var(--bg);
            color: var(--fg);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
          }
          .card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 40px;
            max-width: 480px;
            width: 100%;
            text-align: center;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }
          .brand {
            font-weight: 700;
            font-size: 20px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          h1 {
            font-size: 24px;
            margin: 0 0 12px 0;
            letter-spacing: -0.02em;
          }
          p {
            color: var(--muted);
            font-size: 14px;
            line-height: 1.6;
            margin: 0 0 24px 0;
          }
          .actions {
            display: flex;
            gap: 12px;
            justify-content: center;
            flex-wrap: wrap;
          }
          .btn-primary {
            background: var(--primary);
            color: #ffffff;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
          }
          .btn-secondary {
            background: transparent;
            color: var(--fg);
            border: 1px solid var(--border);
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            text-decoration: none;
          }
        `}</style>
      </head>
      <body>
        <main className="card">
          <div className="brand">DataScope</div>
          <h1>System temporarily unavailable</h1>
          <p>
            An unexpected error occurred while loading the application core.
            Please retry loading your session.
          </p>
          <div className="actions">
            <button className="btn-primary" onClick={reset}>
              Try again
            </button>
            <a className="btn-secondary" href="/">
              Return home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
