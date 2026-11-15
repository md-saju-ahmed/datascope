'use client';
import Link from 'next/link';
import {
  useGetDatasetQuery,
  useGetFieldsQuery,
} from '@/store/api/datasets-api';
import { DataLoading, DataFailure } from './data-state';

export function FieldBrowser({ datasetId }: { datasetId: string }) {
  const dataset = useGetDatasetQuery(datasetId);
  const fields = useGetFieldsQuery(
    { datasetId },
    { skip: !dataset.currentData || dataset.isError },
  );
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
  if (!dataset.currentData || !fields.currentData) return <DataLoading />;
  return (
    <section className="space-y-6">
      <Link href="/datasets" className="text-sm text-primary underline">
        Back to Dataset Library
      </Link>
      <h1 className="break-words text-2xl font-semibold">
        {dataset.currentData.data.name}: field information
      </h1>
      <p className="text-muted-foreground">
        Field types and capabilities supplied by this dataset.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {fields.currentData.data
          .filter((field) => field.isVisible)
          .map((field) => (
            <article
              className="rounded-lg border border-border bg-surface p-5"
              key={field.id}
            >
              <h2 className="break-words font-semibold">{field.label}</h2>
              <p className="mt-2 break-words font-mono text-xs text-muted-foreground">
                {field.fieldKey} / {field.dataType}
              </p>
              <p className="mt-4 text-sm">
                {[
                  field.isSearchable ? 'Searchable' : null,
                  field.isFilterable ? 'Filterable' : null,
                  field.isSortable ? 'Sortable' : null,
                ]
                  .filter(Boolean)
                  .join(' / ') || 'Display only'}
              </p>
            </article>
          ))}
      </div>
      <Link
        href={`/datasets/${datasetId}/explore`}
        className="inline-flex min-h-11 items-center text-primary underline"
      >
        Explore dataset
      </Link>
    </section>
  );
}
