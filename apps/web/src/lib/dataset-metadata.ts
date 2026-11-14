import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { datasetResponseSchema } from '@datascope/contracts';
import { apiOrigin } from './api-origin';
import { requireSession } from './session';

export async function datasetMetadata(datasetId: string) {
  await requireSession();
  const name =
    process.env.API_SESSION_COOKIE_NAME ??
    (process.env.NODE_ENV === 'production'
      ? '__Host-datascope_session'
      : 'datascope_session');
  const token = (await cookies()).get(name)?.value;
  const response = await fetch(
    new URL(`/api/v1/datasets/${datasetId}`, apiOrigin()),
    {
      headers: { Cookie: `${name}=${token ?? ''}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (response.status === 401) redirect('/login');
  if (response.status === 403 || response.status === 404) notFound();
  if (!response.ok) throw new Error('Dataset metadata unavailable');
  return datasetResponseSchema.parse(await response.json()).data;
}
