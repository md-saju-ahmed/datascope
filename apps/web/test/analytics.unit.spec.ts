import {
  activityDays,
  breakdownRows,
  chartRows,
  countText,
} from '../src/features/analytics/presentation.ts';
it('preserves exact counts and declines unsafe chart geometry', () => {
  expect(countText('9007199254740993')).toBe('9,007,199,254,740,993');
  expect(
    chartRows([{ key: 'Large', count: '9007199254740993' }]),
  ).toBeUndefined();
  expect(chartRows([{ key: null, count: '12' }])).toEqual([
    { label: 'Unspecified', count: 12, exact: '12' },
  ]);
});
it('keeps top buckets, nulls and backend remainder without recomputing totals', () => {
  expect(
    breakdownRows({ buckets: [{ key: null, count: '2' }], otherCount: '8' }),
  ).toEqual([
    { key: null, count: '2' },
    { key: 'Other (remaining groups)', count: '8' },
  ]);
  expect(breakdownRows({ buckets: [], otherCount: '0' })).toEqual([]);
});
it('fills only UTC days inside the actual activity window, including partial days', () => {
  expect(
    activityDays({
      scope: 'own',
      from: '2026-11-01T12:00:00.000Z',
      to: '2026-11-03T12:00:00.000Z',
      total: '2',
      byDay: [{ key: '2026-11-02', count: '2' }],
      filters: [],
    }),
  ).toEqual([
    { key: '2026-11-01', count: '0' },
    { key: '2026-11-02', count: '2' },
    { key: '2026-11-03', count: '0' },
  ]);
});
