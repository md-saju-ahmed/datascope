import { requireSession } from '@/lib/session';
import { SavedViewLibrary } from '@/features/saved-views/saved-view-library';
export default async function Page() {
  await requireSession();
  return <SavedViewLibrary />;
}
