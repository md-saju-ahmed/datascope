import { apiOrigin } from '../../../../lib/api-origin';

export const dynamic = 'force-dynamic';
async function proxy(request: Request) {
  const incoming = new URL(request.url);
  const headers = new Headers();
  for (const name of [
    'cookie',
    'origin',
    'referer',
    'sec-fetch-site',
    'content-type',
    'accept',
    'x-csrf-token',
    'x-search-intent',
    'x-request-id',
  ]) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  try {
    const target = new URL(apiOrigin());
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    const init = {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      duplex: 'half',
      cache: 'no-store' as const,
      redirect: 'error' as const,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    };
    const upstream = await fetch(target, init);
    const outgoing = new Headers({ 'Cache-Control': 'no-store' });
    for (const name of [
      'content-type',
      'content-disposition',
      'retry-after',
      'x-request-id',
    ]) {
      const value = upstream.headers.get(name);
      if (value !== null) outgoing.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie())
      outgoing.append('set-cookie', cookie);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { message: 'API unavailable; try again' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
  proxy as HEAD,
};
