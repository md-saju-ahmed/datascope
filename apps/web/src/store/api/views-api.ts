import * as c from '@datascope/contracts';
import { baseApi } from './base-api.ts';
import { savedViewRemoved } from '../lifecycle.ts';
import type { TransportExtra } from './transport.ts';
type Page = Partial<c.PageQuery> & { datasetId?: string };
export const viewsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSavedViews: build.query<
      ReturnType<typeof c.viewListResponseSchema.parse>,
      Page | undefined
    >({
      query: (args) => ({
        url: 'saved-views',
        params: { page: 1, pageSize: 25, ...args },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        ...queryArgs,
      }),
      rawResponseSchema: c.viewListResponseSchema,
      transformResponse: (response: unknown) =>
        c.viewListResponseSchema.parse(response),
      providesTags: ['Views'],
    }),
    getSavedView: build.query<
      ReturnType<typeof c.viewResponseSchema.parse>,
      string
    >({
      query: (id) => ({ url: `saved-views/${id}` }),
      rawResponseSchema: c.viewResponseSchema,
      transformResponse: (response: unknown) =>
        c.viewResponseSchema.parse(response),
      providesTags: (_r, _e, id) => [{ type: 'View', id }],
    }),
    createSavedView: build.mutation<
      ReturnType<typeof c.viewResponseSchema.parse>,
      c.ViewCreate
    >({
      query: (body) => ({ url: 'saved-views', method: 'POST', body }),
      rawResponseSchema: c.viewResponseSchema,
      transformResponse: (response: unknown) =>
        c.viewResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['Views'] : []),
    }),
    updateSavedView: build.mutation<
      ReturnType<typeof c.viewResponseSchema.parse>,
      { viewId: string; changes: c.ViewPatch }
    >({
      query: ({ viewId, changes }) => ({
        url: `saved-views/${viewId}`,
        method: 'PATCH',
        body: changes,
      }),
      rawResponseSchema: c.viewResponseSchema,
      transformResponse: (response: unknown) =>
        c.viewResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r ? ['Views', { type: 'View', id: a.viewId }] : [],
    }),
    deleteSavedView: build.mutation<
      ReturnType<typeof c.deletedResponseSchema.parse>,
      string
    >({
      query: (id) => ({ url: `saved-views/${id}`, method: 'DELETE', body: {} }),
      rawResponseSchema: c.deletedResponseSchema,
      transformResponse: (response: unknown) =>
        c.deletedResponseSchema.parse(response),
      invalidatesTags: (r) =>
        r ? ['Views', 'History', 'Activity', 'Analytics'] : [],
      async onQueryStarted(id, { dispatch, queryFulfilled, extra }) {
        const transport = (extra as TransportExtra).transport;
        const version = transport.version();
        try {
          await queryFulfilled;
          if (version === transport.version()) dispatch(savedViewRemoved(id));
        } catch {
          /* Retain the existing detail after an unsuccessful delete. */
        }
      },
    }),
    shareSavedView: build.mutation<
      ReturnType<typeof c.shareResponseSchema.parse>,
      { viewId: string; userId: string }
    >({
      query: ({ viewId, userId }) => ({
        url: `saved-views/${viewId}/shares`,
        method: 'POST',
        body: { userId },
      }),
      rawResponseSchema: c.shareResponseSchema,
      transformResponse: (response: unknown) =>
        c.shareResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r ? ['Views', { type: 'View', id: a.viewId }] : [],
    }),
    revokeSavedViewShare: build.mutation<
      ReturnType<typeof c.deletedResponseSchema.parse>,
      { viewId: string; userId: string }
    >({
      query: ({ viewId, userId }) => ({
        url: `saved-views/${viewId}/shares/${userId}`,
        method: 'DELETE',
        body: {},
      }),
      rawResponseSchema: c.deletedResponseSchema,
      transformResponse: (response: unknown) =>
        c.deletedResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r
          ? [
              'Views',
              { type: 'View', id: a.viewId },
              'History',
              'Activity',
              'Analytics',
            ]
          : [],
    }),
    getSearchHistory: build.query<
      ReturnType<typeof c.historyResponseSchema.parse>,
      Page | undefined
    >({
      query: (args) => ({
        url: 'search-history',
        params: { page: 1, pageSize: 25, ...args },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        ...queryArgs,
      }),
      rawResponseSchema: c.historyResponseSchema,
      transformResponse: (response: unknown) =>
        c.historyResponseSchema.parse(response),
      providesTags: ['History'],
    }),
    clearSearchHistory: build.mutation<
      ReturnType<typeof c.historyClearResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'search-history', method: 'DELETE', body: {} }),
      rawResponseSchema: c.historyClearResponseSchema,
      transformResponse: (response: unknown) =>
        c.historyClearResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['History', 'Activity', 'Analytics'] : []),
    }),
  }),
});
export const {
  useGetSavedViewsQuery,
  useGetSavedViewQuery,
  useCreateSavedViewMutation,
  useUpdateSavedViewMutation,
  useDeleteSavedViewMutation,
  useShareSavedViewMutation,
  useRevokeSavedViewShareMutation,
  useGetSearchHistoryQuery,
  useClearSearchHistoryMutation,
} = viewsApi;
