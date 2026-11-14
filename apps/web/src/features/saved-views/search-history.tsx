'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { searchRequestSchema, savedQuery } from '@datascope/contracts';
import type { historyResponseSchema } from '@datascope/contracts';
import { useGetSearchHistoryQuery } from '@/store/api/views-api';
import { datasetsApi } from '@/store/api/datasets-api';
import { searchApi } from '@/store/api/search-api';
import { useAppDispatch, useAppSelector, useAppStore } from '@/store/hooks';
import { Button } from '@/components/ui/button';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { DetailPages } from '@/features/explorer/record-detail';
import {
  readExplorerQuery,
  writeExplorerQuery,
} from '@/features/explorer/url-state';
import {
  advancedQuery,
  canAuthorAdvanced,
} from '@/features/explorer/query-validation';
type Entry = ReturnType<typeof historyResponseSchema.parse>['data'][number];
export function SearchHistory() {
  const [page, setPage] = useState(1);
  const result = useGetSearchHistoryQuery({ page, pageSize: 10 });
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Search History</h1>
          <p className="mt-3 text-muted-foreground">
            Your executed searches, newest first. Ordinary browsing and
            background refresh do not create history.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh history
        </Button>
      </header>
      {result.isError ? (
        <DataFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : !result.currentData ? (
        <DataLoading />
      ) : (
        <>
          {!result.currentData.data.length && (
            <p>No queries have been executed yet.</p>
          )}
          <ol className="space-y-4">
            {result.currentData.data.map((entry) => (
              <li
                key={entry.id}
                className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <p className="break-words text-sm">
                  {entry.normalizedQuery.q || 'All indexed text'}
                  {entry.normalizedQuery.conditions.map(
                    (c) =>
                      ` · ${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(' – ') : String(c.value)}`,
                  )}
                </p>
                <p className="break-words text-xs text-muted-foreground">
                  Dataset {entry.datasetId} ·{' '}
                  <time dateTime={entry.executedAt}>
                    {entry.executedAt} (UTC)
                  </time>
                </p>
                <RunAgain entry={entry} />
              </li>
            ))}
          </ol>
          <DetailPages
            info={result.currentData.pageInfo}
            pending={result.isFetching}
            change={setPage}
            label="history"
          />
        </>
      )}
    </section>
  );
}
function RunAgain({ entry }: { entry: Entry }) {
  const router = useRouter(),
    dispatch = useAppDispatch(),
    store = useAppStore();
  const user = useAppSelector((s) => s.auth.user);
  const alive = useRef(true),
    lock = useRef(false);
  const stillHere = () => alive.current;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (lock.current) return;
          lock.current = true;
          setPending(true);
          setError('');
          void (async () => {
            const datasetRequest = dispatch(
              datasetsApi.endpoints.getDataset.initiate(entry.datasetId, {
                subscribe: false,
                forceRefetch: true,
              }),
            );
            const fieldRequest = dispatch(
              datasetsApi.endpoints.getFields.initiate(
                { datasetId: entry.datasetId },
                { subscribe: false, forceRefetch: true },
              ),
            );
            try {
              const [dataset, fields] = await Promise.all([
                datasetRequest.unwrap(),
                fieldRequest.unwrap(),
              ]);
              if (
                !alive.current ||
                store.getState().auth.user?.id !== user?.id ||
                !user
              )
                return;
              const query = readExplorerQuery(
                writeExplorerQuery(
                  searchRequestSchema.parse(savedQuery(entry.normalizedQuery)),
                ),
                fields.data,
              );
              if (
                advancedQuery(query) &&
                !canAuthorAdvanced(user, dataset.data) &&
                !entry.normalizedQuery.savedViewId
              )
                throw new Error('Authoring access changed');
              const view = entry.normalizedQuery.savedViewId;
              if (!view) {
                const args = { datasetId: entry.datasetId, query };
                const request = dispatch(
                  searchApi.endpoints.executeSearch.initiate(args),
                );
                try {
                  const data = await request.unwrap();
                  if (
                    searchApi.endpoints.executeSearch.select(request.requestId)(
                      store.getState(),
                    ).data !== data
                  )
                    return;
                  await dispatch(
                    searchApi.util.upsertQueryData('searchRecords', args, data),
                  );
                  if (
                    searchApi.endpoints.executeSearch.select(request.requestId)(
                      store.getState(),
                    ).data !== data
                  )
                    return;
                } finally {
                  request.reset();
                }
              }
              if (!stillHere()) return;
              router.push(
                `/datasets/${entry.datasetId}/explore?${writeExplorerQuery(query)}${view ? `&view=${view}` : ''}`,
              );
            } catch {
              setError(
                'This search is unavailable or its fields/access changed. Choose an authorized dataset or saved view.',
              );
            } finally {
              lock.current = false;
              setPending(false);
            }
          })();
        }}
      >
        Run again
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
