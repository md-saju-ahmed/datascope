import 'server-only';
import { cache } from 'react';
import { safeReturnPath, signInPath } from '../features/auth/navigation';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authUserResponseSchema } from '@datascope/contracts';

// React cache deduplicates within one server render, never across users/requests.
export const requireSession = cache(async () => {
  const target = safeReturnPath((await headers()).get('x-datascope-path'));
  const login = signInPath(target);
  const jar = await cookies();
  const name =
    process.env.API_SESSION_COOKIE_NAME ??
    (process.env.NODE_ENV === 'production'
      ? '__Host-datascope_session'
      : 'datascope_session');
  if (!['datascope_session', '__Host-datascope_session'].includes(name))
    throw new Error('Invalid session cookie configuration');
  const sessions = jar.getAll(name);
  const token = sessions.length === 1 ? sessions[0]?.value : undefined;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) redirect(login);
  const origin = new URL(
    process.env.API_INTERNAL_ORIGIN ?? 'http://127.0.0.1:4000',
  );
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Invalid API origin configuration');
  let response: Response;
  try {
    response = await fetch(new URL('/api/v1/auth/me', origin), {
      headers: { Cookie: `${name}=${token}` },
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('Session verification unavailable');
  }
  if (response.status === 401) redirect(login);
  if (!response.ok) throw new Error('Session verification unavailable');
  const parsed = authUserResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Session verification unavailable');
  return parsed.data.data;
});
