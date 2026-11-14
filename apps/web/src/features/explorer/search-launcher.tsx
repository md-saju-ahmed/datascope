'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useGetDatasetsQuery } from '@/store/api/datasets-api';
import { useAppSelector } from '@/store/hooks';
import { DataFailure, DataLoading } from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { canAuthorAdvanced } from './query-validation';

export function SearchLauncher() {
  const [page, setPage] = useState(1);
  const result = useGetDatasetsQuery({ page, pageSize: 25 });
  const user = useAppSelector((s) => s.auth.user);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Search datasets</h1>
        <p className="mt-3 text-muted-foreground">
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
            <p>No datasets available to your account.</p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {result.currentData.data.map((dataset) => (
              <article
                key={dataset.id}
                className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
              >
                <h2 className="break-words font-semibold">{dataset.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {canAuthorAdvanced(user, dataset)
                    ? 'Build typed AND filters or search indexed text.'
                    : 'Search indexed text and apply basic filters.'}
                </p>
                <Button asChild>
                  <Link
                    prefetch={false}
                    href={`/datasets/${dataset.id}/explore${canAuthorAdvanced(user, dataset) ? '?mode=advanced' : ''}`}
                  >
                    {canAuthorAdvanced(user, dataset)
                      ? 'Build search'
                      : 'Open basic search'}
                  </Link>
                </Button>
              </article>
            ))}
          </div>
          <nav
            aria-label="Search dataset pages"
            className="flex flex-wrap gap-3"
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
            <span className="self-center text-sm">Page {page}</span>
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
