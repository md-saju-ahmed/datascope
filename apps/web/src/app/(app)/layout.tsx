import { SessionBoundary } from '@/features/auth/session-boundary';
import type { ReactNode } from 'react';
import { requireSession } from '@/lib/session';
import { AppShell } from '@/components/layout/app-shell';
import { StoreProvider } from '@/store/provider';
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSession();
  return (
    <StoreProvider
      key={`${user.id}:${user.role}:${user.email}`}
      initialUser={user}
    >
      <SessionBoundary>
        <AppShell>{children}</AppShell>
      </SessionBoundary>
    </StoreProvider>
  );
}
