import * as c from '@datascope/contracts';
import { baseApi } from './base-api.ts';
export const managementApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDatasetAnalytics: build.query<
      ReturnType<typeof c.datasetAnalyticsResponseSchema.parse>,
      { datasetId: string; days?: number }
    >({
      query: ({ datasetId, ...params }) => ({
        url: `datasets/${datasetId}/analytics`,
        params: { days: 30, ...params },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({ days: 30, ...queryArgs }),
      rawResponseSchema: c.datasetAnalyticsResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetAnalyticsResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Analytics', id: a.datasetId }],
      keepUnusedDataFor: 30,
    }),
    getPlatformAnalytics: build.query<
      ReturnType<typeof c.platformAnalyticsResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'analytics/platform' }),
      rawResponseSchema: c.platformAnalyticsResponseSchema,
      transformResponse: (response: unknown) =>
        c.platformAnalyticsResponseSchema.parse(response),
      providesTags: ['Platform'],
      keepUnusedDataFor: 30,
    }),
    getSearchActivity: build.query<
      ReturnType<typeof c.activityResponseSchema.parse>,
      Partial<c.ActivityQuery> | undefined
    >({
      query: (args) => ({
        url: 'analytics/search-activity',
        params: { days: 30, ...args },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({ days: 30, ...queryArgs }),
      rawResponseSchema: c.activityResponseSchema,
      transformResponse: (response: unknown) =>
        c.activityResponseSchema.parse(response),
      providesTags: ['Activity'],
      keepUnusedDataFor: 30,
    }),
    getPreferences: build.query<
      ReturnType<typeof c.preferencesResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'preferences/me' }),
      rawResponseSchema: c.preferencesResponseSchema,
      transformResponse: (response: unknown) =>
        c.preferencesResponseSchema.parse(response),
      providesTags: ['Preferences'],
    }),
    updatePreferences: build.mutation<
      ReturnType<typeof c.preferencesResponseSchema.parse>,
      c.PreferencePatch
    >({
      query: (body) => ({ url: 'preferences/me', method: 'PATCH', body }),
      rawResponseSchema: c.preferencesResponseSchema,
      transformResponse: (response: unknown) =>
        c.preferencesResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['Preferences'] : []),
    }),
    getUsers: build.query<
      ReturnType<typeof c.usersResponseSchema.parse>,
      Partial<c.UsersQuery> | undefined
    >({
      query: (args) => ({
        url: 'users',
        params: { page: 1, pageSize: 25, q: '', ...args },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        q: '',
        ...queryArgs,
      }),
      rawResponseSchema: c.usersResponseSchema,
      transformResponse: (response: unknown) =>
        c.usersResponseSchema.parse(response),
      providesTags: ['Users'],
    }),
    updateUser: build.mutation<
      ReturnType<typeof c.userResponseSchema.parse>,
      { userId: string; changes: c.UserPatch }
    >({
      query: ({ userId, changes }) => ({
        url: `users/${userId}`,
        method: 'PATCH',
        body: changes,
      }),
      rawResponseSchema: c.userResponseSchema,
      transformResponse: (response: unknown) =>
        c.userResponseSchema.parse(response),
      invalidatesTags: (r) =>
        r
          ? [
              'Users',
              'Session',
              'Datasets',
              'Dataset',
              'Fields',
              'Permissions',
              'Search',
              'Record',
              'Views',
              'View',
              'History',
              'Activity',
              'Analytics',
              'Platform',
              'Preferences',
            ]
          : [],
    }),
    getSettings: build.query<
      ReturnType<typeof c.settingsResponseSchema.parse>,
      undefined
    >({
      query: () => ({ url: 'system/settings' }),
      rawResponseSchema: c.settingsResponseSchema,
      transformResponse: (response: unknown) =>
        c.settingsResponseSchema.parse(response),
      providesTags: ['Settings'],
    }),
    updateSettings: build.mutation<
      ReturnType<typeof c.settingsResponseSchema.parse>,
      c.SettingsPatch
    >({
      query: (body) => ({ url: 'system/settings', method: 'PATCH', body }),
      rawResponseSchema: c.settingsResponseSchema,
      transformResponse: (response: unknown) =>
        c.settingsResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['Settings'] : []),
    }),
  }),
});
export const {
  useGetDatasetAnalyticsQuery,
  useGetPlatformAnalyticsQuery,
  useGetSearchActivityQuery,
  useGetPreferencesQuery,
  useUpdatePreferencesMutation,
  useGetUsersQuery,
  useUpdateUserMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
} = managementApi;
