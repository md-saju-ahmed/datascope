import { requireSession } from '@/lib/session';
import { Overview } from '@/features/analytics/dashboard';
export default async function Dashboard() {
  await requireSession();
  return <Overview />;
}
