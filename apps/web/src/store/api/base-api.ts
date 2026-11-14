import { createApi } from '@reduxjs/toolkit/query/react';
import { scopedBaseQuery } from './transport.ts';

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: scopedBaseQuery,
  catchSchemaFailure: () => ({
    status: 'CUSTOM_ERROR' as const,
    error: 'Invalid API response; try again',
  }),
  tagTypes: [
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
    'Users',
    'Settings',
    'Session',
  ],
  keepUnusedDataFor: 60,
  refetchOnMountOrArgChange: 30,
  refetchOnFocus: false,
  refetchOnReconnect: false,
  endpoints: () => ({}),
});
