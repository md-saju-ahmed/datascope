'use client';
import { useEffect, useRef, useState } from 'react';
import {
  savedQuery,
  searchRequestSchema,
  type DatasetField,
  type SearchRequest,
  type SearchResponse,
} from '@datascope/contracts';
import { useGetSavedViewQuery } from '@/store/api/views-api';
import { useApplySavedViewMutation } from '@/store/api/search-api';
import { useAppDispatch } from '@/store/hooks';
import { savedViewsSlice } from '@/store/slices/saved-views-slice';
import { DataLoading, DataFailure } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import {
  readExplorerQuery,
  writeExplorerQuery,
} from '@/features/explorer/url-state';

export function SavedViewExplorer({
  viewId,
  datasetId,
  fields,
  query,
  change,
  children,
}: {
  viewId: string;
  datasetId: string;
  fields: DatasetField[];
  query: SearchRequest;
  change: (query: SearchRequest) => void;
  children: (data: SearchResponse) => React.ReactNode;
}) {
  const view = useGetSavedViewQuery(viewId, {
    refetchOnMountOrArgChange: true,
  });
  if (view.isError)
    return (
      <DataFailure
        error={view.error}
        retry={() => {
          void view.refetch();
        }}
      />
    );
  if (!view.currentData) return <DataLoading />;
  if (view.currentData.data.datasetId !== datasetId)
    return <p role="alert">This view is unavailable for this dataset.</p>;
  let expected: SearchRequest;
  try {
    expected = searchRequestSchema.parse({
      ...savedQuery(view.currentData.data.config),
      page: query.page,
      pageSize: query.pageSize,
    });
    readExplorerQuery(writeExplorerQuery(expected), fields);
  } catch {
    return (
      <p role="alert">
        This saved configuration is no longer valid for the dataset fields.
      </p>
    );
  }
  if (writeExplorerQuery(query) !== writeExplorerQuery(expected))
    return (
      <section className="space-y-4">
        <h2 className="font-semibold">Restore saved configuration</h2>
        <p>
          This link differs from the current saved view. Load its authorized
          configuration before running it.
        </p>
        <Button
          onClick={() => {
            change({
              ...expected,
              page: 1,
              pageSize:
                view.currentData?.data.config.pageSize ?? expected.pageSize,
            });
          }}
        >
          Load saved configuration
        </Button>
      </section>
    );
  const version = view.currentData.data.updatedAt;
  const config = JSON.stringify(view.currentData.data.config);
  return (
    <RunView
      key={`${viewId}:${version}:${writeExplorerQuery(expected)}`}
      viewId={viewId}
      name={view.currentData.data.name}
      query={expected}
      verify={async () => {
        const latest = (await view.refetch().unwrap()).data;
        return (
          latest.updatedAt === version &&
          JSON.stringify(latest.config) === config
        );
      }}
    >
      {children}
    </RunView>
  );
}
function RunView({
  viewId,
  name,
  query,
  verify,
  children,
}: {
  viewId: string;
  name: string;
  query: SearchRequest;
  verify: () => Promise<boolean>;
  children: (data: SearchResponse) => React.ReactNode;
}) {
  const [apply, result] = useApplySavedViewMutation();
  const dispatch = useAppDispatch();
  const lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [checking, setChecking] = useState(false),
    [error, setError] = useState(false);
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5">
        <h2 className="break-words text-lg font-semibold">
          Saved view: {name}
        </h2>
        <p className="text-sm text-muted-foreground">
          Read-only saved configuration. Each Run saved view action checks
          current sharing and dataset access and records search intent.
          Refreshing this page does not execute it.
        </p>
        <p className="break-words text-sm">
          {query.q ? `Search: ${query.q} · ` : ''}
          {query.conditions
            .map(
              (c) =>
                `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(' – ') : String(c.value)}`,
            )
            .join(' AND ') || 'No filters'}
        </p>
        <Button
          disabled={result.isLoading || checking}
          onClick={() => {
            if (lock.current) return;
            lock.current = true;
            setChecking(true);
            setError(false);
            void (async () => {
              try {
                if ((await verify()) && alive.current) {
                  dispatch(savedViewsSlice.actions.viewSelected(viewId));
                  await apply({
                    viewId,
                    paging: { page: query.page, pageSize: query.pageSize },
                  }).unwrap();
                  if (!(await verify())) result.reset();
                }
              } catch {
                setError(true);
              } finally {
                lock.current = false;
                setChecking(false);
              }
            })();
          }}
        >
          {result.isLoading || checking
            ? 'Running saved view...'
            : 'Run saved view'}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            The saved view could not be run. Check access and try again.
          </p>
        )}
      </section>
      {result.isError ? (
        <DataFailure
          error={result.error}
          retry={() => {
            result.reset();
          }}
        />
      ) : result.data && !checking ? (
        children(result.data)
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Run the saved view to load page {query.page}.
        </p>
      )}
    </div>
  );
}
