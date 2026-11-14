'use client';
import { useState } from 'react';
import { Database, ArrowRight } from 'lucide-react';
import { useGetDatasetsQuery } from '@/store/api/datasets-api';
import { useAppDispatch } from '@/store/hooks';
import { datasetSlice } from '@/store/slices/dataset-slice';
import { Button } from '@/components/ui/button';
import { DataLoading, DataFailure } from './data-state';

export function DatasetLibrary() {
  const [page, setPage] = useState(1);
  const dispatch = useAppDispatch();
  const result = useGetDatasetsQuery({ page, pageSize: 10 });
  const data = result.currentData;
  return (
    <section className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
            Discover your data
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Dataset Library
          </h1>
          <p className="mt-3 text-muted-foreground">
            Choose a dataset to explore. Only datasets available to your account
            appear here.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={result.isFetching}
          onClick={() => {
            void result.refetch();
          }}
        >
          Refresh datasets
        </Button>
      </header>
      {result.isError ? (
        <DataFailure
          error={result.error}
          retry={() => {
            void result.refetch();
          }}
        />
      ) : !data ? (
        <DataLoading />
      ) : (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {result.isFetching
              ? 'Refreshing datasets...'
              : `${String(data.pageInfo.total)} datasets available`}
          </p>
          {!data.data.length ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Database
                className="mx-auto mb-4 text-primary"
                aria-hidden="true"
              />
              <h2 className="text-lg font-semibold">
                No datasets available to your account
              </h2>
              <p className="mt-3 text-muted-foreground">
                Ask your administrator for dataset access, then refresh this
                page.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {data.data.map((dataset) => (
                <article
                  key={dataset.id}
                  className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-6"
                >
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <Database
                      size={22}
                      className="text-primary"
                      aria-hidden="true"
                    />
                    <span className="rounded bg-muted px-2 py-1 text-xs capitalize">
                      {dataset.effectivePermission} access
                    </span>
                  </div>
                  <h2 className="break-words text-lg font-semibold">
                    {dataset.name}
                  </h2>
                  <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                    {dataset.description || 'No description provided.'}
                  </p>
                  <dl className="my-6 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Records</dt>
                      <dd className="mt-1 font-medium">
                        {BigInt(dataset.recordCount).toLocaleString('en-US')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Category</dt>
                      <dd className="mt-1 break-words">{dataset.category}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Source</dt>
                      <dd className="mt-1 break-words">{dataset.source}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Updated (UTC)</dt>
                      <dd className="mt-1">{dataset.updatedAt.slice(0, 10)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Created (UTC)</dt>
                      <dd className="mt-1">{dataset.createdAt.slice(0, 10)}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex flex-wrap items-center gap-4 border-t border-border pt-5">
                    <Button asChild>
                      <a
                        href={`/datasets/${dataset.id}/explore`}
                        onClick={() => {
                          dispatch(
                            datasetSlice.actions.activeDatasetChanged(
                              dataset.id,
                            ),
                          );
                        }}
                      >
                        Explore dataset{' '}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                    </Button>
                    <a
                      href={`/datasets/${dataset.id}/fields`}
                      className="inline-flex min-h-11 items-center text-sm text-primary underline"
                    >
                      View field information
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav aria-label="Dataset pages" className="flex items-center gap-4">
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous datasets
            </Button>
            <span className="text-sm">
              Page {page} of {Math.max(1, data.pageInfo.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={!data.pageInfo.hasNextPage || result.isFetching}
              onClick={() => {
                setPage(page + 1);
              }}
            >
              Next datasets
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
