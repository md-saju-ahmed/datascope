import { requireSession } from '@/lib/session';
import { Settings } from '@/features/settings/preferences';
export default async function Page() {
  await requireSession();
  return <Settings />;
}
