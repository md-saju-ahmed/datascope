import * as c from '@datascope/contracts';
import { baseApi } from './base-api.ts';
import { authSlice } from '../slices/auth-slice.ts';
import { clientStateCleared } from '../lifecycle.ts';
import type { TransportExtra } from './transport.ts';

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSession: build.query<c.AuthUserResponse, undefined>({
      query: () => ({ url: 'auth/me' }),
      rawResponseSchema: c.authUserResponseSchema,
      transformResponse: (response: unknown) =>
        c.authUserResponseSchema.parse(response),
      providesTags: ['Session'],
      keepUnusedDataFor: 0,
      async onQueryStarted(_arg, { dispatch, queryFulfilled, extra }) {
        const transport = (extra as TransportExtra).transport;
        const version = transport.version();
        try {
          const { data } = await queryFulfilled;
          if (version !== transport.version()) return;
          dispatch(authSlice.actions.sessionReceived(data.data));
        } catch {
          /* Transport handles session expiry; network failures remain retryable. */
        }
      },
    }),
    login: build.mutation<c.AuthUserResponse, c.LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
      rawResponseSchema: c.loginResponseSchema,
      transformResponse: (response: c.LoginResponse) => ({
        data: response.data,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled, extra }) {
        const transport = (extra as TransportExtra).transport;
        const version = transport.version();
        try {
          const { data } = await queryFulfilled;
          if (version !== transport.version()) return;
          dispatch(clientStateCleared());
          dispatch(authSlice.actions.sessionReceived(data.data));
        } catch {
          /* Caller receives actual failure. */
        }
      },
    }),
    register: build.mutation<c.AuthUserResponse, c.RegisterRequest>({
      query: (body) => ({ url: 'auth/register', method: 'POST', body }),
      rawResponseSchema: c.authUserResponseSchema,
      transformResponse: (response: unknown) =>
        c.authUserResponseSchema.parse(response),
    }),
    logout: build.mutation<{ data: { loggedOut: true } }, undefined>({
      query: () => ({ url: 'auth/logout', method: 'POST', body: {} }),
      rawResponseSchema: c.logoutResponseSchema,
      transformResponse: (response: c.LogoutResponse) => ({
        data: response.data,
      }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled, extra }) {
        const transport = (extra as TransportExtra).transport;
        const version = transport.version();
        try {
          await queryFulfilled;
          if (version !== transport.version()) return;
          dispatch(clientStateCleared());
        } catch {
          /* 401 is also handled by transport. */
        }
      },
    }),
    getLiveness: build.query<
      ReturnType<typeof c.livenessResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'health/live' }),
      rawResponseSchema: c.livenessResponseSchema,
      transformResponse: (response: unknown) =>
        c.livenessResponseSchema.parse(response),
    }),
    getReadiness: build.query<
      ReturnType<typeof c.readinessResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'health/ready' }),
      rawResponseSchema: c.readinessResponseSchema,
      transformResponse: (response: unknown) =>
        c.readinessResponseSchema.parse(response),
    }),
  }),
});
export const {
  useGetSessionQuery,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
} = authApi;
