import * as c from '@datascope/contracts';
import { baseApi } from './base-api.ts';

export interface DatasetArg {
  datasetId: string;
}
type Page = Partial<c.PageQuery>;
export const datasetsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDatasets: build.query<
      ReturnType<typeof c.datasetListResponseSchema.parse>,
      (Page & { includeArchived?: boolean }) | undefined
    >({
      query: (args) => ({
        url: 'datasets',
        params: { page: 1, pageSize: 25, includeArchived: false, ...args },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        includeArchived: false,
        ...queryArgs,
      }),
      rawResponseSchema: c.datasetListResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetListResponseSchema.parse(response),
      providesTags: ['Datasets'],
    }),
    getDataset: build.query<
      ReturnType<typeof c.datasetResponseSchema.parse>,
      string
    >({
      query: (id) => ({ url: `datasets/${id}` }),
      rawResponseSchema: c.datasetResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetResponseSchema.parse(response),
      providesTags: (_r, _e, id) => [{ type: 'Dataset', id }],
    }),
    createDataset: build.mutation<
      ReturnType<typeof c.datasetResponseSchema.parse>,
      c.DatasetCreate
    >({
      query: (body) => ({ url: 'datasets', method: 'POST', body }),
      rawResponseSchema: c.datasetResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetResponseSchema.parse(response),
      invalidatesTags: (r) => (r ? ['Datasets', 'Platform'] : []),
    }),
    updateDataset: build.mutation<
      ReturnType<typeof c.datasetResponseSchema.parse>,
      DatasetArg & { changes: c.DatasetPatch }
    >({
      query: ({ datasetId, changes }) => ({
        url: `datasets/${datasetId}`,
        method: 'PATCH',
        body: changes,
      }),
      rawResponseSchema: c.datasetResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r
          ? [
              'Datasets',
              { type: 'Dataset', id: a.datasetId },
              { type: 'Search', id: a.datasetId },
            ]
          : [],
    }),
    archiveDataset: build.mutation<
      ReturnType<typeof c.datasetResponseSchema.parse>,
      string
    >({
      query: (id) => ({ url: `datasets/${id}`, method: 'DELETE', body: {} }),
      rawResponseSchema: c.datasetResponseSchema,
      transformResponse: (response: unknown) =>
        c.datasetResponseSchema.parse(response),
      invalidatesTags: (r) =>
        r
          ? [
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
    getFields: build.query<
      ReturnType<typeof c.fieldListResponseSchema.parse>,
      DatasetArg & Page
    >({
      query: ({ datasetId, ...params }) => ({
        url: `datasets/${datasetId}/fields`,
        params: { page: 1, pageSize: 100, ...params },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 100,
        ...queryArgs,
      }),
      rawResponseSchema: c.fieldListResponseSchema,
      transformResponse: (response: unknown) =>
        c.fieldListResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Fields', id: a.datasetId }],
    }),
    createField: build.mutation<
      ReturnType<typeof c.fieldResponseSchema.parse>,
      DatasetArg & { field: c.FieldCreate }
    >({
      query: ({ datasetId, field }) => ({
        url: `datasets/${datasetId}/fields`,
        method: 'POST',
        body: field,
      }),
      rawResponseSchema: c.fieldResponseSchema,
      transformResponse: (response: unknown) =>
        c.fieldResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r
          ? [
              { type: 'Fields', id: a.datasetId },
              { type: 'Search', id: a.datasetId },
              'Views',
              'View',
            ]
          : [],
    }),
    updateField: build.mutation<
      ReturnType<typeof c.fieldResponseSchema.parse>,
      DatasetArg & { fieldId: string; changes: c.FieldPatch }
    >({
      query: ({ datasetId, fieldId, changes }) => ({
        url: `datasets/${datasetId}/fields/${fieldId}`,
        method: 'PATCH',
        body: changes,
      }),
      rawResponseSchema: c.fieldResponseSchema,
      transformResponse: (response: unknown) =>
        c.fieldResponseSchema.parse(response),
      invalidatesTags: (r, _e, a) =>
        r
          ? [
              { type: 'Fields', id: a.datasetId },
              { type: 'Search', id: a.datasetId },
              'Views',
              'View',
            ]
          : [],
    }),
    getPermissions: build.query<
      ReturnType<typeof c.grantListResponseSchema.parse>,
      DatasetArg & Page
    >({
      query: ({ datasetId, ...params }) => ({
        url: `datasets/${datasetId}/permissions`,
        params: { page: 1, pageSize: 25, ...params },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        ...queryArgs,
      }),
      rawResponseSchema: c.grantListResponseSchema,
      transformResponse: (response: unknown) =>
        c.grantListResponseSchema.parse(response),
      providesTags: ['Permissions'],
    }),
    setPermission: build.mutation<
      ReturnType<typeof c.grantResponseSchema.parse>,
      DatasetArg & { userId: string; permission: c.Permission }
    >({
      query: ({ datasetId, userId, permission }) => ({
        url: `datasets/${datasetId}/permissions/${userId}`,
        method: 'PUT',
        body: { permission },
      }),
      rawResponseSchema: c.grantResponseSchema,
      transformResponse: (response: unknown) =>
        c.grantResponseSchema.parse(response),
      invalidatesTags: (r) =>
        r
          ? [
              'Permissions',
              'Datasets',
              'Dataset',
              'Fields',
              'Search',
              'Record',
              'Views',
              'View',
              'History',
              'Activity',
              'Analytics',
              'Preferences',
            ]
          : [],
    }),
    revokePermission: build.mutation<
      ReturnType<typeof c.revokedResponseSchema.parse>,
      DatasetArg & { userId: string }
    >({
      query: ({ datasetId, userId }) => ({
        url: `datasets/${datasetId}/permissions/${userId}`,
        method: 'DELETE',
        body: {},
      }),
      rawResponseSchema: c.revokedResponseSchema,
      transformResponse: (response: unknown) =>
        c.revokedResponseSchema.parse(response),
      invalidatesTags: (r) =>
        r
          ? [
              'Permissions',
              'Datasets',
              'Dataset',
              'Fields',
              'Search',
              'Record',
              'Views',
              'View',
              'History',
              'Activity',
              'Analytics',
              'Preferences',
            ]
          : [],
    }),
    getRecord: build.query<
      ReturnType<typeof c.recordResponseSchema.parse>,
      DatasetArg & { recordId: string }
    >({
      query: ({ datasetId, recordId }) => ({
        url: `datasets/${datasetId}/records/${recordId}`,
      }),
      rawResponseSchema: c.recordResponseSchema,
      transformResponse: (response: unknown) =>
        c.recordResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Record', id: a.datasetId }],
    }),
    getRelatedRecords: build.query<
      ReturnType<typeof c.relatedListResponseSchema.parse>,
      DatasetArg & { recordId: string } & Page
    >({
      query: ({ datasetId, recordId, ...params }) => ({
        url: `datasets/${datasetId}/records/${recordId}/related`,
        params: { page: 1, pageSize: 25, ...params },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        ...queryArgs,
      }),
      rawResponseSchema: c.relatedListResponseSchema,
      transformResponse: (response: unknown) =>
        c.relatedListResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Record', id: a.datasetId }],
    }),
    getRecordChanges: build.query<
      ReturnType<typeof c.changesResponseSchema.parse>,
      DatasetArg & { recordId: string } & Page
    >({
      query: ({ datasetId, recordId, ...params }) => ({
        url: `datasets/${datasetId}/records/${recordId}/changes`,
        params: { page: 1, pageSize: 25, ...params },
      }),
      serializeQueryArgs: ({ queryArgs }) => ({
        page: 1,
        pageSize: 25,
        ...queryArgs,
      }),
      rawResponseSchema: c.changesResponseSchema,
      transformResponse: (response: unknown) =>
        c.changesResponseSchema.parse(response),
      providesTags: (_r, _e, a) => [{ type: 'Record', id: a.datasetId }],
    }),
  }),
});
export const {
  useGetDatasetsQuery,
  useGetDatasetQuery,
  useGetFieldsQuery,
  useGetRecordQuery,
  useGetRelatedRecordsQuery,
  useGetRecordChangesQuery,
  useGetPermissionsQuery,
  useCreateDatasetMutation,
  useUpdateDatasetMutation,
  useArchiveDatasetMutation,
  useCreateFieldMutation,
  useUpdateFieldMutation,
  useSetPermissionMutation,
  useRevokePermissionMutation,
} = datasetsApi;
