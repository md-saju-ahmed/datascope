'use client';
import { useId, useState } from 'react';
import { useGetDatasetsQuery } from '@/store/api/datasets-api';
import { DataFailure, DataLoading } from './data-state';
import { Button } from '@/components/ui/button';
export function DatasetPicker({
  value,
  change,
  label = 'Dataset',
  none = 'Choose a dataset',
}: {
  value: string | null;
  change: (value: string | null) => void;
  label?: string;
  none?: string;
}) {
  const [page, setPage] = useState(1);
  const id = useId();
  const result = useGetDatasetsQuery({ page, pageSize: 25 });
  return (
    <div className="min-w-0 space-y-3">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
        <select
          id={id}
          aria-label={label}
          value={value ?? ''}
          onChange={(e) => {
            change(e.target.value || null);
          }}
          className="mt-2 min-h-11 w-full min-w-0 rounded-md border border-border bg-surface p-3"
        >
          <option value="">{none}</option>
          {value && !result.currentData?.data.some((d) => d.id === value) && (
            <option value={value}>Current selection: {value}</option>
          )}
          {result.currentData?.data.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
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
            <p className="text-sm text-muted-foreground">
              No datasets available to your account.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={page === 1 || result.isFetching}
              onClick={() => {
                setPage(page - 1);
              }}
            >
              Previous datasets
            </Button>
            <span className="text-sm">
              Page {page} of{' '}
              {Math.max(1, result.currentData.pageInfo.totalPages)}
            </span>
            <Button
              type="button"
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
          </div>
        </>
      )}
    </div>
  );
}
