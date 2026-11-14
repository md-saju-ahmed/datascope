import { datasetMetadata } from '@/lib/dataset-metadata';
import { requireSession } from '@/lib/session';
import { Explorer } from '@/features/explorer/explorer';
import { notFound } from 'next/navigation';
import { uuidParamSchema } from '@datascope/contracts';
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  await requireSession();
  const { datasetId } = await params;
  if (!uuidParamSchema.safeParse(datasetId).success) notFound();
  return (
    <Explorer
      datasetId={datasetId}
      initialDataset={await datasetMetadata(datasetId)}
    />
  );
}
