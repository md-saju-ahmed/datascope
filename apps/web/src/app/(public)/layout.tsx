import type { ReactNode } from 'react';
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-border bg-surface px-6 py-5">
        <a href="/" className="text-xl font-bold text-primary">
          DataScope
        </a>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-16">{children}</main>
    </>
  );
}
