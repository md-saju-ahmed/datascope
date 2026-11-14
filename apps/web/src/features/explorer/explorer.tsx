'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type {
  Dataset,
  DatasetField,
  SearchRequest,
  SearchResponse,
} from '@datascope/contracts';
import { uuidParamSchema } from '@datascope/contracts';
import {
  useGetDatasetQuery,
  useGetFieldsQuery,
} from '@/store/api/datasets-api';
import { useSearchRecordsQuery } from '@/store/api/search-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { datasetSlice } from '@/store/slices/dataset-slice';
import { DataLoading, DataFailure } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { RecordTable } from '@/components/data-table/record-table';
import { readExplorerQuery, writeExplorerQuery } from './url-state';
import { RecordPeek } from './record-peek';
import { SearchControls } from './search-controls';
import { advancedQuery, canAuthorAdvanced } from './query-validation';
import { SaveView } from '@/features/saved-views/save-view';
import { SavedViewExplorer } from '@/features/saved-views/saved-view-explorer';
import { useGetPreferencesQuery } from '@/store/api/management-api';

export function Explorer({
  datasetId,
  initialDataset,
}: {
  datasetId: string;
  initialDataset: Dataset;
}) {
  const dispatch = useAppDispatch();
  const dataset = useGetDatasetQuery(datasetId);
  const fields = useGetFieldsQuery(
    { datasetId },
    { skip: !dataset.currentData || dataset.isError },
  );
  useEffect(() => {
    dispatch(datasetSlice.actions.activeDatasetChanged(datasetId));
  }, [datasetId, dispatch]);
  if (dataset.isError || fields.isError)
    return (
      <DataFailure
        error={dataset.error ?? fields.error}
        retry={() => {
          void dataset.refetch();
          if (!fields.isUninitialized) void fields.refetch();
        }}
      />
    );
  const metadata = dataset.currentData?.data ?? initialDataset;
  return (
    <section className="min-w-0 space-y-6">
      <header>
        <a className="text-sm text-primary underline" href="/datasets">
          Dataset Library
        </a>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Data Explorer
            </p>
            <h1 className="break-words text-2xl font-semibold">
              {metadata.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {BigInt(metadata.recordCount).toLocaleString('en-US')} records /{' '}
              {metadata.effectivePermission} access
            </p>
          </div>
          <a
            href={`/datasets/${datasetId}/fields`}
            className="text-sm text-primary underline"
          >
            Field information
          </a>
        </div>
      </header>
      {fields.currentData ? (
        <ExplorerQuery
          datasetId={datasetId}
          fields={fields.currentData.data}
          dataset={metadata}
        />
      ) : (
        <DataLoading />
      )}
    </section>
  );
}
function ExplorerQuery({
  datasetId,
  fields,
  dataset,
}: {
  datasetId: string;
  fields: DatasetField[];
  dataset: Dataset;
}) {
  const user = useAppSelector((s) => s.auth.user);
  const advanced = canAuthorAdvanced(user, dataset);
  const params = useSearchParams();
  const viewId = params.get('view');
  const preferences = useGetPreferencesQuery(undefined);
  const [useDefaults, setUseDefaults] = useState(false);
  const defaultSize = preferences.currentData?.data.defaultPageSize ?? 25;
  const parsed = useMemo(() => {
    try {
      return {
        query: readExplorerQuery(
          params.toString(),
          fields,
          viewId ? 25 : defaultSize,
        ),
      };
    } catch {
      return { query: null };
    }
  }, [params, fields, defaultSize, viewId]);
  useEffect(() => {
    if (
      !viewId &&
      !params.has('pageSize') &&
      parsed.query &&
      (preferences.currentData || useDefaults)
    )
      window.history.replaceState(
        null,
        '',
        `?${writeExplorerQuery(parsed.query)}${params.get('mode') === 'advanced' ? '&mode=advanced' : ''}`,
      );
  }, [params, parsed.query, viewId, preferences.currentData, useDefaults]);
  const change = useCallback(
    (query: SearchRequest) => {
      window.history.pushState(
        null,
        '',
        `?${writeExplorerQuery(query)}${viewId ? `&view=${viewId}` : ''}`,
      );
    },
    [viewId],
  );
  if (parsed.query && !viewId && !params.has('pageSize')) {
    if (preferences.isError && !useDefaults)
      return (
        <div className="space-y-4">
          <DataFailure
            error={preferences.error}
            retry={() => {
              void preferences.refetch();
            }}
          />
          <Button
            variant="outline"
            onClick={() => {
              setUseDefaults(true);
            }}
          >
            Use default page size
          </Button>
        </div>
      );
    return <DataLoading />;
  }
  if (
    !parsed.query ||
    (viewId !== null &&
      (!uuidParamSchema.safeParse(viewId).success ||
        params.getAll('view').length !== 1))
  )
    return (
      <section
        role="alert"
        className="space-y-4 rounded-lg border border-border p-6"
      >
        <h2 className="font-semibold">Invalid Explorer query</h2>
        <p>
          One or more URL values are invalid or unavailable for this dataset.
        </p>
        <Button
          onClick={() => {
            window.history.replaceState(null, '', window.location.pathname);
          }}
        >
          Reset query
        </Button>
      </section>
    );
  const query = parsed.query;
  if (viewId)
    return (
      <SavedViewExplorer
        viewId={viewId}
        datasetId={datasetId}
        fields={fields}
        query={query}
        change={change}
      >
        {(data) => (
          <ExplorerResults
            datasetId={datasetId}
            fields={fields}
            query={query}
            change={change}
            savedData={data}
            viewId={viewId}
            exportAllowed={advanced}
          />
        )}
      </SavedViewExplorer>
    );
  if (!advanced && advancedQuery(query))
    return (
      <section role="alert" className="space-y-3">
        <h2 className="font-semibold">Advanced search unavailable</h2>
        <p>
          This query requires advanced authoring access. Open an authorized
          saved view to run a shared advanced query.
        </p>
        <Button
          onClick={() => {
            change({ ...query, conditions: [], page: 1 });
          }}
        >
          Use basic search
        </Button>
      </section>
    );
  return (
    <div className="space-y-5">
      <SearchControls
        datasetId={datasetId}
        fields={fields}
        query={parsed.query}
        advanced={advanced}
        initialAdvanced={params.get('mode') === 'advanced'}
        change={change}
      />
      {['admin', 'analyst'].includes(user?.role ?? '') && (
        <SaveView datasetId={datasetId} query={query} />
      )}
      <ExplorerResults
        datasetId={datasetId}
        fields={fields}
        query={parsed.query}
        change={change}
        exportAllowed={advanced}
      />
    </div>
  );
}
function ExplorerResults({
  datasetId,
  fields,
  query,
  change,
  savedData,
  viewId,
  exportAllowed,
}: {
  datasetId: string;
  fields: DatasetField[];
  query: SearchRequest;
  change: (query: SearchRequest) => void;
  savedData?: SearchResponse;
  viewId?: string;
  exportAllowed: boolean;
}) {
  const result = useSearchRecordsQuery(
    { datasetId, query },
    { skip: !!viewId },
  );
  const data = savedData ?? result.currentData;
  const [record, setRecord] = useState<string | null>(null);
  const key = datasetId + writeExplorerQuery(query);
  if (result.isError)
    return (
      <DataFailure
        error={result.error}
        retry={() => {
          void result.refetch();
        }}
      />
    );
  return (
    <div className="space-y-5">
      {!viewId && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={result.isFetching}
            onClick={() => {
              void result.refetch();
            }}
          >
            Refresh records
          </Button>
          <details className="rounded-md border border-border bg-surface px-4 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Columns
            </summary>
            <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pb-2">
              {[
                { fieldKey: 'id', label: 'Record ID' },
                ...fields.filter((f) => f.isVisible),
              ].map((field) => {
                const visible = query.columns ?? [
                  'id',
                  ...fields.filter((f) => f.isVisible).map((f) => f.fieldKey),
                ];
                return (
                  <label
                    key={field.fieldKey}
                    className="flex min-h-10 items-center gap-3 text-sm"
                  >
                    {/* Keep the native toggle responsive while Next transitions
                        URL state; remount when the applied value changes. */}
                    <input
                      key={String(visible.includes(field.fieldKey))}
                      type="checkbox"
                      defaultChecked={visible.includes(field.fieldKey)}
                      disabled={
                        visible.length === 1 && visible.includes(field.fieldKey)
                      }
                      onChange={(event) => {
                        change({
                          ...query,
                          columns: event.target.checked
                            ? [...new Set([...visible, field.fieldKey])]
                            : visible.filter((k) => k !== field.fieldKey),
                        });
                      }}
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>
          </details>
          <details className="rounded-md border border-border bg-surface px-4 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Sort priority
            </summary>
            <div className="mt-3 space-y-3 pb-2">
              <p className="max-w-sm text-xs text-muted-foreground">
                Add up to three fields in priority order. The server adds a
                record ID tie-breaker.
              </p>
              {query.sort.map((sort, index) => (
                <div
                  key={sort.field}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span>
                    {index + 1}. {sort.field}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      change({
                        ...query,
                        page: 1,
                        sort: query.sort.map((s) =>
                          s.field === sort.field
                            ? {
                                ...s,
                                direction:
                                  s.direction === 'asc' ? 'desc' : 'asc',
                              }
                            : s,
                        ),
                      });
                    }}
                  >
                    {sort.direction}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Remove sort ${sort.field}`}
                    onClick={() => {
                      change({
                        ...query,
                        page: 1,
                        sort: query.sort.filter((s) => s.field !== sort.field),
                      });
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <label className="block text-sm">
                Add sort field
                <select
                  aria-label="Add sort field"
                  value=""
                  disabled={query.sort.length === 3}
                  onChange={(event) => {
                    if (event.target.value)
                      change({
                        ...query,
                        page: 1,
                        sort: [
                          ...query.sort,
                          { field: event.target.value, direction: 'asc' },
                        ],
                      });
                  }}
                  className="ml-3 min-h-10 max-w-full rounded border border-border bg-surface p-2"
                >
                  <option value="">Choose field</option>
                  {[
                    { fieldKey: 'id', label: 'Record ID', isSortable: true },
                    ...fields.filter((f) => f.isVisible),
                  ]
                    .filter(
                      (f) =>
                        f.isSortable &&
                        !query.sort.some((s) => s.field === f.fieldKey),
                    )
                    .map((f) => (
                      <option key={f.fieldKey} value={f.fieldKey}>
                        {f.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </details>
        </div>
      )}
      <p role="status" className="text-sm text-muted-foreground">
        {result.isFetching
          ? 'Loading records...'
          : data
            ? `${data.pageInfo.total.toLocaleString('en-US')} results`
            : ''}
        {query.q ? ` / Search: ${query.q}` : ''}
        {query.conditions.length
          ? ` / ${String(query.conditions.length)} applied filters`
          : ''}
      </p>
      {!data ? (
        <DataLoading />
      ) : !data.data.length ? (
        <div className="rounded-xl border border-dashed border-border p-10">
          <h2 className="text-lg font-semibold">
            {query.q || query.conditions.length
              ? 'No matching records'
              : 'No records available'}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {query.q || query.conditions.length
              ? 'Change the query or clear filters to browse this dataset.'
              : 'This dataset has no records on this page.'}
          </p>
          {!viewId && (
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => {
                change({ ...query, q: '', conditions: [], page: 1 });
              }}
            >
              Reset results
            </Button>
          )}
        </div>
      ) : (
        <RecordTable
          key={key + ':' + data.queryId}
          data={data.data}
          fields={fields}
          query={query}
          change={change}
          openRecord={setRecord}
          readOnly={!!viewId}
          datasetId={datasetId}
          exportAllowed={exportAllowed}
        />
      )}
      {data && (
        <Paging
          data={data}
          query={query}
          change={change}
          pending={result.isFetching}
        />
      )}
      {record && (
        <RecordPeek
          key={key + record}
          datasetId={datasetId}
          recordId={record}
          returnQuery={
            writeExplorerQuery(query) + (viewId ? `&view=${viewId}` : '')
          }
          close={() => {
            setRecord(null);
          }}
        />
      )}
    </div>
  );
}
function Paging({
  data,
  query,
  change,
  pending,
}: {
  data: SearchResponse;
  query: SearchRequest;
  change: (query: SearchRequest) => void;
  pending: boolean;
}) {
  const max = Math.min(
    4000,
    Math.floor(100000 / query.pageSize) + 1,
    Math.max(1, data.pageInfo.totalPages),
  );
  return (
    <nav
      aria-label="Record pages"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <label className="text-sm">
        Rows per page
        <select
          aria-label="Rows per page"
          className="ml-3 min-h-10 rounded border border-border bg-surface p-2"
          value={query.pageSize}
          disabled={pending}
          onChange={(event) => {
            change({
              ...query,
              page: 1,
              pageSize: Number(event.target.value) as SearchRequest['pageSize'],
            });
          }}
        >
          {[10, 25, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={query.page === 1 || pending}
          onClick={() => {
            change({ ...query, page: query.page - 1 });
          }}
        >
          Previous page
        </Button>
        <span className="text-sm">
          Page {query.page} of {Math.max(1, data.pageInfo.totalPages)}
        </span>
        <Button
          variant="outline"
          disabled={!data.pageInfo.hasNextPage || query.page >= max || pending}
          onClick={() => {
            change({ ...query, page: query.page + 1 });
          }}
        >
          Next page
        </Button>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const input = event.currentTarget.elements.namedItem('page');
          if (input instanceof HTMLInputElement && input.checkValidity())
            change({ ...query, page: Number(input.value) });
        }}
      >
        <label htmlFor="jump-page" className="text-sm">
          Go to page
        </label>
        <input
          id="jump-page"
          name="page"
          type="number"
          min={1}
          max={max}
          defaultValue={query.page}
          key={query.page}
          required
          className="min-h-10 w-20 rounded border border-border p-2"
        />
        <Button variant="outline" disabled={pending}>
          Go
        </Button>
      </form>
    </nav>
  );
}
