'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Database, ArrowRight } from 'lucide-react';
import { useGetDatasetsQuery } from '@/store/api/datasets-api';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { datasetSlice } from '@/store/slices/dataset-slice';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { canAuthorAdvanced } from './query-validation';

export function SearchLauncher() {
  const [page, setPage] = useState(1);
  const dispatch = useAppDispatch();
  const result = useGetDatasetsQuery({ page, pageSize: 25 });
  const user = useAppSelector((s) => s.auth.user);
  return (
    <section className="space-y-6">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Data Explorer
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Search datasets
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose an authorized dataset. Search opens the shared Data Explorer
          with its fields and current access.
        </p>
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
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Database
                className="mx-auto mb-4 text-primary"
                aria-hidden="true"
              />
              <h2 className="text-lg font-semibold">
                No datasets available to your account
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask your administrator for access, then refresh this page.
              </p>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {result.currentData.data.map((dataset) => (
              <article
                key={dataset.id}
                className="flex min-w-0 flex-col rounded-xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm"
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <Database
                    size={20}
                    className="text-primary"
                    aria-hidden="true"
                  />
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                    {dataset.effectivePermission} access
                  </span>
                </div>
                <h2 className="break-words text-lg font-semibold text-foreground">
                  {dataset.name}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {BigInt(dataset.recordCount).toLocaleString('en-US')} records
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {canAuthorAdvanced(user, dataset)
                    ? 'Build typed AND filters, sort priority, or search indexed text.'
                    : 'Search indexed text and apply basic filters.'}
                </p>
                <div className="mt-auto pt-5">
                  <Button asChild className="cursor-pointer">
                    <Link
                      prefetch={false}
                      href={`/datasets/${dataset.id}/explore${canAuthorAdvanced(user, dataset) ? '?mode=advanced' : ''}`}
                      onClick={() => {
                        dispatch(
                          datasetSlice.actions.activeDatasetChanged(dataset.id),
                        );
                      }}
                    >
                      {canAuthorAdvanced(user, dataset)
                        ? 'Build search'
                        : 'Open basic search'}
                      <ArrowRight size={15} aria-hidden="true" className="ml-1.5" />
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <nav
            aria-label="Search dataset pages"
            className="flex flex-wrap items-center gap-3 pt-2"
          >
            <Button
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous datasets
            </Button>
            <span className="self-center text-sm font-medium">Page {page}</span>
            <Button
              variant="outline"
              disabled={
                !result.currentData.pageInfo.hasNextPage || result.isFetching
              }
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
