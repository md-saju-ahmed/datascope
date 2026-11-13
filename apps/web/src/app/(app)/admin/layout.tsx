import type { ReactNode } from 'react';
import { requireSession } from '@/lib/session';
import { AccessDenied } from '@/components/layout/route-state';
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireSession();
  return user.role === 'admin' ? children : <AccessDenied />;
}
