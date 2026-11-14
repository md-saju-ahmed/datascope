import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AccessDenied } from '@/components/layout/route-state';
import { UsersManager } from '@/features/admin/users';
import { DatasetsManager } from '@/features/admin/datasets';
import { PermissionsManager } from '@/features/admin/permissions';
import { SystemSettings } from '@/features/admin/system';
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
  if (area === 'users') return <UsersManager />;
  if (area === 'datasets') return <DatasetsManager />;
  if (area === 'permissions') return <PermissionsManager />;
  return <SystemSettings />;
}
