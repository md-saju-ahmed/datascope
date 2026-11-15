'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  useGetDatasetQuery,
  useGetDatasetsQuery,
} from '@/store/api/datasets-api';
import {
  useGetDatasetAnalyticsQuery,
  useGetPlatformAnalyticsQuery,
} from '@/store/api/management-api';
import { useAppSelector } from '@/store/hooks';
import { Button } from '@/components/ui/button';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Skeleton } from '@/components/ui/skeleton';
import { activityDays, breakdownRows } from './presentation';
import { Metric, AggregateWidget } from './widgets';

const freshness = { refetchOnFocus: true, refetchOnReconnect: true };
export function PlatformSummary() {
  const result = useGetPlatformAnalyticsQuery(undefined, freshness);
  return (
    <section aria-label="Platform summary" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Platform summary</h2>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh platform
        </Button>
      </div>
      {!result.currentData ? (
        result.isError ? (
          <DataFailure
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
        ) : (
          <DataLoading />
        )
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {result.isError
              ? 'Platform refresh failed. Showing previous values; try again.'
              : result.isFetching
                ? 'Refreshing platform...'
                : 'All platform datasets, including archived datasets. Admin only.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Platform records"
              value={result.currentData.data.totalRecords}
              note="Persisted records across the platform"
            />
            <Metric
              label="Platform datasets"
              value={result.currentData.data.datasets}
              note="Includes archived datasets"
            />
            <Metric
              label="Registered users"
              value={result.currentData.data.users}
              note="All registered accounts"
            />
            <Metric
              label="Active accounts"
              value={result.currentData.data.activeUsers}
              note="Enabled accounts; not online users"
            />
          </div>
        </>
      )}
    </section>
  );
}
export function Analytics({
  datasetId,
  days,
}: {
  datasetId: string | undefined;
  days: number;
}) {
  const [page, setPage] = useState(1);
  const router = useRouter();
  const user = useAppSelector((s) => s.auth.user);
  const list = useGetDatasetsQuery({ page, pageSize: 25 }, freshness);
  const eligible =
    list.currentData?.data.filter(
      (d) =>
        user?.role === 'admin' ||
        d.effectivePermission === 'analyze' ||
        d.effectivePermission === 'manage',
    ) ?? [];
  const navigate = (id: string, window: number) => {
    router.push(
      `/analytics?days=${String(window)}${id ? `&datasetId=${id}` : ''}`,
    );
  };
  return (
    <div className="space-y-7">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Understand your data
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-3 text-muted-foreground">
          Record distributions and recorded search activity for datasets you can
          analyze.
        </p>
      </header>
      {user?.role === 'admin' && <PlatformSummary />}
      <section
        aria-label="Analytics controls"
        className="space-y-4 rounded-xl border border-border bg-surface p-5"
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Dataset to analyze
            <select
              className="mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3"
              value={eligible.some((d) => d.id === datasetId) ? datasetId : ''}
              onChange={(event) => {
                navigate(event.target.value, days);
              }}
            >
              <option value="">Choose a dataset on this page</option>
              {eligible.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Activity and growth window
            <select
              className="mt-2 block min-h-11 w-full rounded-md border border-border bg-surface px-3"
              value={days}
              onChange={(event) => {
                navigate(datasetId ?? '', Number(event.target.value));
              }}
            >
              {[...new Set([7, 30, 90, 366, days])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <option key={n} value={n}>
                    Last {n} days (UTC)
                  </option>
                ))}
            </select>
          </label>
        </div>
        {list.isError ? (
          <DataFailure
            error={list.error}
            retry={() => {
              void list.refetch();
            }}
          />
        ) : !list.currentData ? (
          <DataLoading />
        ) : (
          <>
            {!eligible.length && (
              <p className="text-sm text-muted-foreground">
                No datasets with analytics access on this page. Browse other
                pages or ask your administrator for analyze access.
              </p>
            )}
            <nav
              aria-label="Analytics dataset pages"
              className="flex flex-wrap items-center gap-3"
            >
              <Button
                variant="outline"
                disabled={page === 1 || list.isFetching}
                onClick={() => {
                  setPage(page - 1);
                }}
              >
                Previous datasets
              </Button>
              <span className="text-sm">
                Page {page} of{' '}
                {Math.max(1, list.currentData.pageInfo.totalPages)}
              </span>
              <Button
                variant="outline"
                disabled={
                  !list.currentData.pageInfo.hasNextPage || list.isFetching
                }
                onClick={() => {
                  setPage(page + 1);
                }}
              >
                Next datasets
              </Button>
              <Button
                variant="outline"
                disabled={list.isFetching}
                onClick={() => {
                  void list.refetch();
                }}
              >
                Refresh dataset access
              </Button>
            </nav>
          </>
        )}
      </section>
      {datasetId ? (
        <DatasetReport key={datasetId} datasetId={datasetId} days={days} />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-8">
          Choose a dataset to view all six analytics categories.
        </p>
      )}
    </div>
  );
}
function DatasetReport({
  datasetId,
  days,
}: {
  datasetId: string;
  days: number;
}) {
  const user = useAppSelector((s) => s.auth.user);
  const metadata = useGetDatasetQuery(datasetId, freshness);
  const dataset = metadata.currentData?.data;
  const allowed =
    dataset &&
    (user?.role === 'admin' ||
      dataset.effectivePermission === 'analyze' ||
      dataset.effectivePermission === 'manage');
  const result = useGetDatasetAnalyticsQuery(
    allowed ? { datasetId, days } : skipToken,
    freshness,
  );
  if (metadata.isError)
    return (
      <DataFailure
        error={metadata.error}
        retry={() => {
          void metadata.refetch();
        }}
      />
    );
  if (!dataset) return <DataLoading />;
  if (!allowed)
    return (
      <p role="alert">Analytics requires analyze access to this dataset.</p>
    );
  const data = result.currentData?.data;
  const activity = data?.searchActivity;
  return (
    <section aria-label="Selected dataset analytics" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">{dataset.name}</h2>
          <Link
            href={`/datasets/${datasetId}/explore`}
            className="inline-flex min-h-11 items-center text-sm text-primary underline"
          >
            Explore data
          </Link>
        </div>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
            void metadata.refetch();
          }}
        >
          Refresh analytics
        </Button>
      </header>
      <p role="status" className="text-sm text-muted-foreground">
        {result.isError && data
          ? 'Analytics refresh failed. Showing previous values; try again.'
          : result.isFetching && data
            ? 'Refreshing analytics...'
            : data
              ? 'Counts reflect the latest successful aggregation.'
              : 'Loading aggregate data...'}
      </p>
      {!data || !activity ? (
        result.isError ? (
          <DataFailure
            error={result.error}
            retry={() => {
              void result.refetch();
            }}
          />
        ) : (
          <div
            aria-label="Loading analytics"
            role="status"
            className="grid gap-5 xl:grid-cols-2"
          >
            {[
              'Total records',
              'Records by category',
              'Records by status',
              'Data growth trends',
              'Search activity',
              'Most frequently used filters',
            ].map((title) => (
              <section
                key={title}
                className="space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <h2>{title}</h2>
                <Skeleton className="h-48 w-full" />
              </section>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <Metric
              label="Total records"
              value={data.totalRecords}
              note="All records in the selected dataset, across all dates"
            />
            <Metric
              label="Recorded searches"
              value={activity.total}
              note={
                activity.scope === 'own'
                  ? 'Your executed searches in the selected dataset and window'
                  : 'All users’ executed searches in the selected dataset and window'
              }
            />
          </div>
          <p className="break-words text-xs leading-6 text-muted-foreground">
            Search activity window: {activity.from} to {activity.to} (UTC).
            Growth uses the trailing {days} days at aggregation time.{' '}
            {activity.scope === 'own'
              ? 'Search scope: your own retained history.'
              : 'Search scope: all retained history for this dataset.'}{' '}
            History retention and duplicate suppression affect activity counts.
          </p>
          <div className="grid gap-5 xl:grid-cols-2">
            <AggregateWidget
              title="Records by category"
              note="All dates. Top 50 categories; remaining groups appear as Other. Unspecified means a null value."
              rows={breakdownRows(data.byCategory)}
              empty="No category data in this dataset."
            />
            <AggregateWidget
              title="Records by status"
              note="All dates. Top 50 statuses; remaining groups appear as Other. Unspecified means a null value."
              rows={breakdownRows(data.byStatus)}
              empty="No status data in this dataset."
            />
            <AggregateWidget
              title="Data growth trends"
              note="New records per UTC day in the selected window, not cumulative growth. Missing days have zero additions; boundary days are partial days."
              rows={activityDays({ ...activity, byDay: data.growth })}
              temporal
              empty="No records were created in this window."
            />
            <AggregateWidget
              title="Search activity"
              note="Executed searches per UTC day in the scope above. Missing days have zero searches; boundary days cover partial days."
              rows={activityDays(activity)}
              temporal
              empty="No searches have been recorded in this window."
            />
            <AggregateWidget
              title="Most frequently used filters"
              note="Top 50 filter keys in the search activity above. One search may use several filters; totals need not equal search count."
              rows={activity.filters}
              empty="No filter usage has been recorded in this window."
            />
          </div>
        </>
      )}
    </section>
  );
}
