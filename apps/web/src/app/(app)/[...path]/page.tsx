import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AccessDenied, FoundationPage } from '@/components/layout/route-state';
const routes: Record<string, string> = {
  datasets: 'Dataset Library',
  search: 'Data Explorer',
  'saved-views': 'Saved Views',
  history: 'Search History',
  analytics: 'Analytics',
  settings: 'Settings',
};
export default async function WorkspaceRoute({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const user = await requireSession();
  const { path } = await params;
  const key = path.join('/');
  const route = routes[key];
  if (!route) notFound();
  if (key === 'analytics' && user.role === 'viewer') return <AccessDenied />;
  return <FoundationPage title={route} />;
}
