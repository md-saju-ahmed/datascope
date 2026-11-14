import { analyticsQuerySchema, uuidParamSchema } from '@datascope/contracts';
import { requireSession } from '@/lib/session';
import { AccessDenied } from '@/components/layout/route-state';
import { Analytics } from '@/features/analytics/analytics';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSession();
  if (user.role === 'viewer') return <AccessDenied />;
  const params = await searchParams;
  const selection = uuidParamSchema.optional().safeParse(params.datasetId);
  const window = analyticsQuerySchema.safeParse({ days: params.days });
  if (!selection.success || !window.success)
    return (
      <section role="alert" className="space-y-4">
        <h1 className="text-2xl font-semibold">Invalid analytics selection</h1>
        <p>Choose a dataset and a window between 1 and 366 days.</p>
        <a href="/analytics" className="text-primary underline">
          Reset analytics
        </a>
      </section>
    );
  return <Analytics datasetId={selection.data} days={window.data.days} />;
}
