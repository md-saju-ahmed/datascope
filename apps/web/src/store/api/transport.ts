import {
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query';
import {
  csrfResponseSchema,
  loginResponseSchema,
  logoutResponseSchema,
  apiErrorSchema,
} from '@datascope/contracts';
import { sessionExpired, protectedAccessLost } from '../lifecycle.ts';

export interface TransportOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}
// One closure per store. Neither CSRF tokens nor cookies are stored in Redux.
export function createTransport(options: TransportOptions = {}) {
  const raw = fetchBaseQuery({
    baseUrl: options.baseUrl ?? '/api/v1',
    credentials: 'include',
    timeout: 15000,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
  });
  let generation = 0;
  let controller = new AbortController();
  let token: string | undefined;
  let bootstrap: Promise<string | undefined> | undefined;
  const clear = () => {
    generation++;
    controller.abort();
    controller = new AbortController();
    token = undefined;
    bootstrap = undefined;
  };
  const run: BaseQueryFn<FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    api,
    extra,
  ) => {
    const epoch = generation;
    const obsolete = () => epoch !== generation || api.signal.aborted;
    const canceled = (): { error: FetchBaseQueryError } => ({
      error: {
        status: 'CUSTOM_ERROR',
        error: 'Request canceled or session changed',
      },
    });
    const scoped = {
      ...api,
      signal: AbortSignal.any([api.signal, controller.signal]),
    };
    const method = args.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      if (!token) {
        bootstrap ??= (async () => {
          // Shared bootstrap outlives an individual subscriber's cancellation.
          const result = await raw(
            { url: 'auth/csrf' },
            { ...api, signal: controller.signal },
            extra,
          );
          const parsed = csrfResponseSchema.safeParse(result.data);
          if (epoch === generation && parsed.success)
            token = parsed.data.csrfToken;
          return epoch === generation ? token : undefined;
        })().finally(() => {
          if (epoch === generation) bootstrap = undefined;
        });
        await bootstrap;
      }
      if (obsolete()) return canceled();
      if (!token)
        return {
          error: {
            status: 'CUSTOM_ERROR',
            error: 'Unable to verify request; try again',
          },
        };
    }
    const headers = new Headers();
    if (args.headers instanceof Headers)
      args.headers.forEach((value, key) => {
        headers.set(key, value);
      });
    else if (Array.isArray(args.headers)) {
      for (const [key, value] of args.headers)
        if (key && value !== undefined) headers.set(key, value);
    } else {
      for (const [key, value] of Object.entries(args.headers ?? {}))
        if (value !== undefined) headers.set(key, value);
    }
    const request = () =>
      raw(
        {
          ...args,
          headers: {
            ...Object.fromEntries(headers),
            ...(method !== 'GET' && method !== 'HEAD'
              ? { 'X-CSRF-Token': token ?? '' }
              : {}),
          },
        },
        scoped,
        extra,
      );
    let result = await request();
    if (obsolete()) return canceled();
    // CSRF rejection occurs before domain execution. Do not retry other failures/mutations.
    const error = apiErrorSchema.safeParse(result.error?.data);
    if (
      result.error?.status === 403 &&
      error.success &&
      error.data.code === 'CSRF_REJECTED'
    ) {
      token = undefined;
      const refreshed = await raw({ url: 'auth/csrf' }, scoped, extra);
      const parsed = csrfResponseSchema.safeParse(refreshed.data);
      if (obsolete()) return canceled();
      if (parsed.success) {
        token = parsed.data.csrfToken;
        result = await request();
      }
    }
    if (obsolete()) return canceled();
    if (args.url === 'auth/login' && !result.error) {
      const parsed = loginResponseSchema.safeParse(result.data);
      if (parsed.success) token = parsed.data.csrfToken;
    }
    if (args.url === 'auth/logout' && !result.error) {
      const parsed = logoutResponseSchema.safeParse(result.data);
      if (parsed.success) token = parsed.data.csrfToken;
    }
    if (result.error?.status === 401 && args.url !== 'auth/login')
      api.dispatch(sessionExpired());
    if (result.error?.status === 403 || result.error?.status === 404) {
      // Preserve subscriptions/error state, remove previously authorized data. No retry loop.
      api.dispatch(protectedAccessLost());
    }
    return result;
  };
  return { run, clear, version: () => generation };
}
export interface TransportExtra {
  transport: ReturnType<typeof createTransport>;
}

export const scopedBaseQuery: BaseQueryFn<
  FetchArgs,
  unknown,
  FetchBaseQueryError
> = (args, api, extra) => {
  const state = api.getState() as { auth: { status: string } };
  const publicRequest = [
    'auth/login',
    'auth/register',
    'auth/me',
    'health/live',
    'health/ready',
  ].includes(args.url);
  if (!publicRequest && state.auth.status !== 'authenticated')
    return {
      error: { status: 401, data: { message: 'Authentication required' } },
    };
  return (api.extra as TransportExtra).transport.run(args, api, extra);
};
