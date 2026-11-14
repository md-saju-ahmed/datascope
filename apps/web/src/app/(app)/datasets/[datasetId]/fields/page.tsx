import { requireSession } from '@/lib/session';
import { FieldBrowser } from '@/features/datasets/field-browser';
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
  return <FieldBrowser datasetId={datasetId} />;
}
