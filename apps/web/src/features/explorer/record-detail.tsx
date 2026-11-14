'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { uuidParamSchema, type PageInfo } from '@datascope/contracts';
import {
  useGetFieldsQuery,
  useGetRecordQuery,
  useGetRelatedRecordsQuery,
  useGetRecordChangesQuery,
} from '@/store/api/datasets-api';
import {
  DataFailure,
  DataLoading,
  displayValue,
} from '@/features/datasets/data-state';
import { Button } from '@/components/ui/button';
import { RecordFields } from './record-fields';
import { readExplorerQuery, writeExplorerQuery } from './url-state';

export function RecordDetailScreen({
  datasetId,
  recordId,
}: {
  datasetId: string;
  recordId: string;
}) {
  const params = useSearchParams();
  const record = useGetRecordQuery({ datasetId, recordId });
  const fields = useGetFieldsQuery(
    { datasetId },
    { skip: !record.currentData || record.isError },
  );
  const returnQuery = useMemo(() => {
    const raw = params.get('return');
    if (!raw || !fields.currentData || params.getAll('return').length !== 1)
      return '';
    try {
      const context = new URLSearchParams(raw);
      if (
        [...context.keys()].some(
          (key) =>
            ![
              'q',
              'filters',
              'sort',
              'page',
              'pageSize',
              'columns',
              'mode',
              'view',
            ].includes(key),
        )
      )
        return '';
      const query = readExplorerQuery(raw, fields.currentData.data);
      const view = new URLSearchParams(raw).get('view');
      if (view && !uuidParamSchema.safeParse(view).success) return '';
      return writeExplorerQuery(query) + (view ? `&view=${view}` : '');
    } catch {
      return '';
    }
  }, [params, fields.currentData]);
  const back = `/datasets/${datasetId}/explore${returnQuery ? `?${returnQuery}` : ''}`;
  if (record.isError || fields.isError)
    return (
      <DataFailure
        error={record.error ?? fields.error}
        retry={() => {
          void record.refetch();
          if (!fields.isUninitialized) void fields.refetch();
        }}
      />
    );
  if (!record.currentData || !fields.currentData) return <DataLoading />;
  return (
    <section className="min-w-0 space-y-6">
      <Link
        prefetch={false}
        className="inline-flex min-h-11 items-center text-sm text-primary underline"
        href={back}
      >
        Back to results
      </Link>
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Record details
        </p>
        <h1 className="break-words text-2xl font-semibold">
          {record.currentData.data.name}
        </h1>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          Record {recordId} · {record.currentData.data.status ?? 'No status'}
        </p>
      </header>
      {params.has('return') && !returnQuery && (
        <p role="status" className="text-sm text-muted-foreground">
          The return query was unavailable or invalid. Back to results opens
          this dataset safely.
        </p>
      )}
      <section
        aria-label="Complete record fields"
        className="min-w-0 rounded-xl border border-border bg-surface p-5"
      >
        <RecordFields
          record={record.currentData.data}
          fields={fields.currentData.data}
        />
      </section>
      <Related
        key={`related:${datasetId}:${recordId}`}
        datasetId={datasetId}
        recordId={recordId}
      />
      <Changes
        key={`changes:${datasetId}:${recordId}`}
        datasetId={datasetId}
        recordId={recordId}
      />
    </section>
  );
}
export function DetailPages({
  info,
  pending,
  change,
  label,
}: {
  info: PageInfo;
  pending: boolean;
  change: (page: number) => void;
  label: string;
}) {
  return (
    <nav
      aria-label={`${label} pages`}
      className="flex flex-wrap items-center gap-3"
    >
      <Button
        variant="outline"
        disabled={pending || info.page === 1}
        onClick={() => {
          change(info.page - 1);
        }}
      >
        Previous {label}
      </Button>
      <span className="text-sm">
        Page {info.page} of {Math.max(1, info.totalPages)} · {info.total} total
      </span>
      <Button
        variant="outline"
        disabled={pending || !info.hasNextPage || info.page >= 4000}
        onClick={() => {
          change(info.page + 1);
        }}
      >
        Next {label}
      </Button>
    </nav>
  );
}
function Related({
  datasetId,
  recordId,
}: {
  datasetId: string;
  recordId: string;
}) {
  const [page, setPage] = useState(1);
  const result = useGetRelatedRecordsQuery({
    datasetId,
    recordId,
    page,
    pageSize: 10,
  });
  return (
    <section
      aria-label="Related records"
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-lg font-semibold">Related records</h2>
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
          {!result.currentData.data.length ? (
            <p className="text-sm text-muted-foreground">
              No related records available.
            </p>
          ) : (
            <ul className="space-y-3">
              {result.currentData.data.map((item) => (
                <li
                  key={`${item.relationId}:${item.direction}`}
                  className="break-words text-sm"
                >
                  <Link
                    prefetch={false}
                    href={`/datasets/${item.record.datasetId}/records/${item.record.id}`}
                    className="inline-flex min-h-11 items-center text-primary underline"
                  >
                    {item.record.name}
                  </Link>
                  <p className="text-muted-foreground">
                    {item.relationType} · {item.direction}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <DetailPages
            info={result.currentData.pageInfo}
            pending={result.isFetching}
            change={setPage}
            label="relationships"
          />
        </>
      )}
    </section>
  );
}
function Changes({
  datasetId,
  recordId,
}: {
  datasetId: string;
  recordId: string;
}) {
  const [page, setPage] = useState(1);
  const result = useGetRecordChangesQuery({
    datasetId,
    recordId,
    page,
    pageSize: 10,
  });
  return (
    <section
      aria-label="Change history"
      className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-lg font-semibold">Change history</h2>
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
          {!result.currentData.data.length ? (
            <p className="text-sm text-muted-foreground">
              No history available.
            </p>
          ) : (
            <ol className="space-y-3">
              {result.currentData.data.map((item) => (
                <li
                  key={item.id}
                  className="min-w-0 rounded-lg border border-border p-4"
                >
                  <time className="text-sm" dateTime={item.changedAt}>
                    {item.changedAt} (UTC)
                  </time>
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    Actor: {item.actorUserId ?? 'Not available'}
                  </p>
                  <ChangeValue value={item.changes} />
                </li>
              ))}
            </ol>
          )}
          <DetailPages
            info={result.currentData.pageInfo}
            pending={result.isFetching}
            change={setPage}
            label="changes"
          />
        </>
      )}
    </section>
  );
}
function ChangeValue({ value }: { value: unknown }) {
  const [length, setLength] = useState(2000);
  const text = displayValue(value);
  return (
    <div className="mt-3 min-w-0">
      <pre className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">
        {text.slice(0, length)}
      </pre>
      {text.length > length && (
        <Button
          variant="outline"
          onClick={() => {
            setLength(length + 4000);
          }}
        >
          Show more changes
        </Button>
      )}
    </div>
  );
}
