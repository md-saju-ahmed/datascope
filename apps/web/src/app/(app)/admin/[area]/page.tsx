import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AccessDenied, FoundationPage } from '@/components/layout/route-state';
const titles: Record<string, string> = {
  users: 'User management',
  datasets: 'Dataset management',
  permissions: 'Dataset permissions',
  system: 'System settings',
};
export default async function AdminPage({
  params,
}: {
  params: Promise<{ area: string }>;
}) {
  const user = await requireSession();
  if (user.role !== 'admin') return <AccessDenied />;
  const { area } = await params;
  const title = titles[area];
  if (!title) notFound();
  return <FoundationPage title={title} />;
}
