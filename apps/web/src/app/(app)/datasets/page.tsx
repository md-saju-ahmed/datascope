import { requireSession } from '@/lib/session';
import { DatasetLibrary } from '@/features/datasets/dataset-library';
export default async function Page() {
  await requireSession();
  return <DatasetLibrary />;
}
