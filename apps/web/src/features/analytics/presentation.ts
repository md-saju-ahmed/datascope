import type { datasetAnalyticsResponseSchema } from '@datascope/contracts';

export type DatasetAnalytics = ReturnType<
  typeof datasetAnalyticsResponseSchema.parse
>['data'];
export type Bucket = DatasetAnalytics['growth'][number];

export const countText = (count: string) =>
  BigInt(count).toLocaleString('en-US');
export const bucketLabel = (key: string | null) =>
  key === null ? 'Unspecified' : key === '' ? 'Empty string' : key;
// Chart geometry uses JS numbers; exact text/table values always keep API strings.
export function chartRows(buckets: Bucket[]) {
  if (
    buckets.some((row) => BigInt(row.count) > BigInt(Number.MAX_SAFE_INTEGER))
  )
    return undefined;
  return buckets.map((row) => ({
    label: bucketLabel(row.key),
    count: Number(row.count),
    exact: row.count,
  }));
}
export function breakdownRows(value: DatasetAnalytics['byCategory']): Bucket[] {
  return [
    ...value.buckets,
    ...(value.otherCount !== '0'
      ? [{ key: 'Other (remaining groups)', count: value.otherCount }]
      : []),
  ];
}
export function activityDays(activity: DatasetAnalytics['searchActivity']) {
  const counts = new Map(activity.byDay.map((row) => [row.key, row.count]));
  const end = activity.to.slice(0, 10);
  const rows: Bucket[] = [];
  for (
    let day = activity.from.slice(0, 10);
    day <= end && rows.length < 367;
    day = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000)
      .toISOString()
      .slice(0, 10)
  )
    rows.push({ key: day, count: counts.get(day) ?? '0' });
  return rows;
}
