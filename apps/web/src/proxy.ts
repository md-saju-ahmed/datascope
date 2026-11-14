import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Overwrite incoming values. This is navigation context, never authorization.
  headers.set(
    'x-datascope-path',
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ['/((?!api|_next|favicon.ico).*)'] };
