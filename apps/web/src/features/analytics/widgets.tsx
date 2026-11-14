'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { bucketLabel, countText, type Bucket } from './presentation';
const AggregateChart = dynamic(() => import('./aggregate-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-64 w-full" />,
});

export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <section
      aria-label={label}
      className="min-w-0 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <p className="mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums">
        {countText(value)}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{note}</p>
    </section>
  );
}
export function AggregateWidget({
  title,
  note,
  rows,
  temporal = false,
  empty,
}: {
  title: string;
  note: string;
  rows: Bucket[];
  temporal?: boolean;
  empty: string;
}) {
  return (
    <section
      aria-label={title}
      className="min-w-0 space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm leading-6 text-muted-foreground">{note}</p>
      {rows.length > 0 && rows.some((row) => row.count !== '0') ? (
        <AggregateChart rows={rows} temporal={temporal} title={title} />
      ) : (
        <p className="flex min-h-32 items-center text-sm text-muted-foreground">
          {empty}
        </p>
      )}
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-primary">
          View exact data for {title.toLowerCase()}
        </summary>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">{title} exact values</caption>
            <thead>
              <tr>
                <th scope="col" className="py-2">
                  {temporal ? 'Date (UTC)' : 'Group'}
                </th>
                <th scope="col" className="py-2 text-right">
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  <th scope="row" className="break-words py-2 pr-3 font-normal">
                    {bucketLabel(row.key)}
                  </th>
                  <td className="break-words py-2 text-right tabular-nums">
                    {countText(row.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="py-3 text-sm">No aggregate buckets in this window.</p>
          )}
        </div>
      </details>
    </section>
  );
}
