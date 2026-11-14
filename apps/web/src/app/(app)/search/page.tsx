import { requireSession } from '@/lib/session';
import { SearchLauncher } from '@/features/explorer/search-launcher';
export default async function Page() {
  await requireSession();
  return <SearchLauncher />;
}
