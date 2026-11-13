import { requireSession } from '@/lib/session';
import { FoundationPage } from '@/components/layout/route-state';
export default async function Dashboard() {
  await requireSession();
  return <FoundationPage title="Overview" />;
}
