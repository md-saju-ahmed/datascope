import * as c from '@datascope/contracts';
import { baseApi } from './base-api.ts';
import { normalizeSearch, searchKey, type SearchArgs } from './query-args.ts';
import type { TransportExtra } from './transport.ts';

export const searchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchRecords: build.query<c.SearchResponse, SearchArgs>({
      query: ({ datasetId, query }) => ({
        url: `datasets/${datasetId}/search`,
        method: 'POST',
        body: normalizeSearch(query),
      }),
      serializeQueryArgs: ({ queryArgs }) => searchKey(queryArgs),
      rawResponseSchema: c.searchResponseSchema,
      transformResponse: (response: unknown) =>
        c.searchResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Search', id: a.datasetId }],
      // Explicit focus/reconnect opt-in by consumers, no heavy-query polling.
    }),
    executeSearch: build.mutation<c.SearchResponse, SearchArgs>({
      query: ({ datasetId, query }) => ({
        url: `datasets/${datasetId}/search`,
        method: 'POST',
        headers: { 'X-Search-Intent': 'apply' },
        body: normalizeSearch(query),
      }),
      rawResponseSchema: c.searchResponseSchema,
      transformResponse: (response: unknown) =>
        c.searchResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['History', 'Activity', 'Analytics'] : []),
      async onQueryStarted(args, { dispatch, queryFulfilled, extra }) {
        const transport = (extra as TransportExtra).transport;
        const version = transport.version();
        try {
          const { data } = await queryFulfilled;
          if (version !== transport.version()) return;
          await dispatch(
            searchApi.util.upsertQueryData('searchRecords', args, data),
          );
        } catch {
          /* Failed/canceled executions must not populate the read cache. */
        }
      },
    }),
    // The frozen Apply endpoint always records intent. It must never auto-refetch.
    applySavedView: build.mutation<
      c.SearchResponse,
      { viewId: string; paging: c.ViewApply }
    >({
      query: ({ viewId, paging }) => ({
        url: `saved-views/${viewId}/apply`,
        method: 'POST',
        body: paging,
      }),
      rawResponseSchema: c.searchResponseSchema,
      transformResponse: (response: unknown) =>
        c.searchResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['History', 'Activity', 'Analytics'] : []),
    }),
    exportSelected: build.mutation<
      string,
      { datasetId: string; selection: c.SelectedExport }
    >({
      query: ({ datasetId, selection }) => ({
        url: `datasets/${datasetId}/exports/selected`,
        method: 'POST',
        body: selection,
        responseHandler: async (response): Promise<unknown> => {
          if (response.ok) return response.text();
          const error: unknown = await response.json();
          return error;
        },
      }),
    }),
  }),
});
export const {
  useSearchRecordsQuery,
  useLazySearchRecordsQuery,
  useExecuteSearchMutation,
  useApplySavedViewMutation,
  useExportSelectedMutation,
} = searchApi;
