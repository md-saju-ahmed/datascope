import { requireSession } from '@/lib/session';
import { SearchHistory } from '@/features/saved-views/search-history';
export default async function Page() {
  await requireSession();
  return <SearchHistory />;
}
