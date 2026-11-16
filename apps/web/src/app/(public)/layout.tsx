import type { ReactNode } from 'react';
import { getSession } from '@/lib/session';
import { PublicHeader } from '@/components/layout/public-header';
import { Footer } from '@/components/layout/footer';

export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSession();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader user={user} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        {children}
      </main>

      <Footer />
    </div>
  );
}
