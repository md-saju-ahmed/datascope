'use client';
import Link from 'next/link';
import { useGetDatasetsQuery } from '@/store/api/datasets-api';
import {
  useGetSearchHistoryQuery,
  useGetSavedViewsQuery,
} from '@/store/api/views-api';
import { useAppSelector } from '@/store/hooks';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PlatformSummary } from './analytics';
import { Metric } from './widgets';

const freshness = { refetchOnFocus: true, refetchOnReconnect: true };
export function Overview() {
  const user = useAppSelector((s) => s.auth.user);
  const datasets = useGetDatasetsQuery({ page: 1, pageSize: 10 }, freshness);
  const history = useGetSearchHistoryQuery(
    { page: 1, pageSize: 10 },
    freshness,
  );
  const views = useGetSavedViewsQuery({ page: 1, pageSize: 10 }, freshness);
  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Your workspace
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-3 text-muted-foreground">
            Pick up your data work with authorized datasets, views and searches.
          </p>
        </div>
        <Button asChild>
          <Link href="/datasets" prefetch={false}>
            Explore data
          </Link>
        </Button>
      </header>
      {user?.role === 'admin' && <PlatformSummary />}
      <div className="grid gap-4 md:grid-cols-3">
        {datasets.currentData ? (
          <Metric
            label="Available datasets"
            value={String(datasets.currentData.pageInfo.total)}
            note="Datasets currently available to your account"
          />
        ) : (
          <section
            aria-label="Loading available datasets"
            className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5 animate-pulse"
          >
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-9 w-20 rounded" />
            <Skeleton className="h-3.5 w-48 rounded" />
          </section>
        )}
        {views.currentData ? (
          <Metric
            label="Available saved views"
            value={String(views.currentData.pageInfo.total)}
            note="Owned and authorized shared views"
          />
        ) : (
          <section
            aria-label="Loading available saved views"
            className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5 animate-pulse"
          >
            <Skeleton className="h-4 w-36 rounded" />
            <Skeleton className="h-9 w-20 rounded" />
            <Skeleton className="h-3.5 w-44 rounded" />
          </section>
        )}
        {history.currentData ? (
          <Metric
            label="Recent executed searches"
            value={String(history.currentData.pageInfo.total)}
            note="Your retained search history, not a lifetime total"
          />
        ) : (
          <section
            aria-label="Loading recent searches"
            className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5 animate-pulse"
          >
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-9 w-20 rounded" />
            <Skeleton className="h-3.5 w-52 rounded" />
          </section>
        )}
      </div>
      <section aria-label="Dataset shortcuts" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Explore a dataset</h2>
          <Button
            variant="outline"
            disabled={datasets.isFetching}
            onClick={() => {
              void datasets.refetch();
            }}
          >
            Refresh datasets
          </Button>
        </div>
        {datasets.isError ? (
          <DataFailure
            error={datasets.error}
            retry={() => {
              void datasets.refetch();
            }}
          />
        ) : !datasets.currentData ? (
          <DataLoading count={2} />
        ) : (
          <>
            {!datasets.currentData.data.length && (
              <p>
                No datasets available to your account. Ask your administrator
                for access.
              </p>
            )}
            <div className="grid gap-4 xl:grid-cols-2">
              {datasets.currentData.data.map((dataset) => (
                <article
                  key={dataset.id}
                  className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-5"
                >
                  <h3 className="break-words font-semibold">{dataset.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {BigInt(dataset.recordCount).toLocaleString('en-US')}{' '}
                    records · {dataset.effectivePermission} access
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Link
                      href={`/datasets/${dataset.id}/explore`}
                      prefetch={false}
                      className="inline-flex min-h-11 items-center text-sm text-primary underline"
                    >
                      Open Explorer
                    </Link>
                    {(user?.role === 'admin' ||
                      dataset.effectivePermission === 'analyze' ||
                      dataset.effectivePermission === 'manage') && (
                      <Link
                        href={`/analytics?datasetId=${dataset.id}`}
                        prefetch={false}
                        className="inline-flex min-h-11 items-center text-sm text-primary underline"
                      >
                        View analytics
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Link
              href="/datasets"
              prefetch={false}
              className="inline-flex min-h-11 items-center text-sm text-primary underline"
            >
              Browse all datasets
            </Link>
          </>
        )}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section
          aria-label="Recent searches"
          className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-lg font-semibold">Recent searches</h2>
          {history.isError ? (
            <DataFailure
              error={history.error}
              retry={() => {
                void history.refetch();
              }}
            />
          ) : !history.currentData ? (
            <DataLoading variant="rows" count={3} />
          ) : (
            <>
              {!history.currentData.data.length && (
                <p>No queries have been executed yet.</p>
              )}
              <ol className="space-y-3">
                {history.currentData.data.slice(0, 5).map((entry) => (
                  <li
                    key={entry.id}
                    className="min-w-0 border-b border-border pb-3"
                  >
                    <p className="break-words text-sm">
                      {entry.normalizedQuery.q || 'All indexed text'} ·{' '}
                      {entry.normalizedQuery.conditions.length} filters
                    </p>
                    <time
                      className="break-words text-xs text-muted-foreground"
                      dateTime={entry.executedAt}
                    >
                      {entry.executedAt} (UTC)
                    </time>
                  </li>
                ))}
              </ol>
            </>
          )}
          <Link
            href="/history"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-sm text-primary underline"
          >
            Open search history to run again
          </Link>
        </section>
        <section
          aria-label="Saved view shortcuts"
          className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <h2 className="text-lg font-semibold">Available saved views</h2>
          {views.isError ? (
            <DataFailure
              error={views.error}
              retry={() => {
                void views.refetch();
              }}
            />
          ) : !views.currentData ? (
            <DataLoading variant="rows" count={3} />
          ) : (
            <>
              {!views.currentData.data.length && (
                <p>No saved views are available yet.</p>
              )}
              <ul className="space-y-3">
                {views.currentData.data.slice(0, 5).map((view) => (
                  <li
                    key={view.id}
                    className="break-words border-b border-border pb-3 text-sm"
                  >
                    {view.name}
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link
            href="/saved-views"
            prefetch={false}
            className="inline-flex min-h-11 items-center text-sm text-primary underline"
          >
            Open saved views
          </Link>
        </section>
      </div>
    </section>
  );
}
