import type { ReactNode } from 'react';
import { requireSession } from '@/lib/session';
import { AppShell } from '@/components/layout/app-shell';
export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSession();
  return <AppShell user={user}>{children}</AppShell>;
}
