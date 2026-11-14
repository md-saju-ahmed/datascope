import { notFound } from 'next/navigation';
import { recordIdSchema, uuidParamSchema } from '@datascope/contracts';
import { datasetMetadata } from '@/lib/dataset-metadata';
import { requireSession } from '@/lib/session';
import { RecordDetailScreen } from '@/features/explorer/record-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ datasetId: string; recordId: string }>;
}) {
  await requireSession();
  const { datasetId, recordId } = await params;
  if (
    !uuidParamSchema.safeParse(datasetId).success ||
    !recordIdSchema.safeParse(recordId).success
  )
    notFound();
  await datasetMetadata(datasetId);
  return <RecordDetailScreen datasetId={datasetId} recordId={recordId} />;
}
