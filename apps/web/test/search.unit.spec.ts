import {
  conditionError,
  advancedQuery,
  lastThirtyDays,
  queryConfig,
  utcInput,
  utcValue,
} from '../src/features/explorer/query-validation.ts';
import {
  readExplorerQuery,
  writeExplorerQuery,
} from '../src/features/explorer/url-state.ts';
import { searchRequestSchema, type DatasetField } from '@datascope/contracts';
const fields: DatasetField[] = [
  'name',
  'revenue',
  'createdAt',
  'verified',
  'status',
].map((fieldKey, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  datasetId: '00000000-0000-4000-8000-000000000100',
  fieldKey,
  label: fieldKey,
  dataType:
    fieldKey === 'revenue'
      ? 'number'
      : fieldKey === 'createdAt'
        ? 'date'
        : fieldKey === 'verified'
          ? 'boolean'
          : 'string',
  operators:
    fieldKey === 'name'
      ? ['eq', 'contains']
      : fieldKey === 'verified'
        ? ['eq']
        : fieldKey === 'status'
          ? ['eq', 'in']
          : ['eq', 'gt', 'gte', 'between'],
  isSearchable: true,
  isFilterable: true,
  isSortable: true,
  isVisible: true,
  sortOrder: index,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}));
test.each([
  { field: 'revenue', op: 'between' as const, value: ['10000.00', '9999.99'] },
  { field: 'revenue', op: 'eq' as const, value: '1e6' },
  { field: 'revenue', op: 'eq' as const, value: 1000 },
  { field: 'createdAt', op: 'eq' as const, value: '2026-02-30T00:00:00Z' },
  {
    field: 'createdAt',
    op: 'between' as const,
    value: ['2026-11-01T00:00:00Z', '2026-10-31T00:00:00Z'],
  },
  { field: 'verified', op: 'eq' as const, value: 'true' },
  { field: 'name', op: 'contains' as const, value: ['text'] },
  { field: 'unknown', op: 'eq' as const, value: 'text' },
])('typed malformed URL condition fails closed: %j', (condition) => {
  const encoded = new URLSearchParams({
    filters: JSON.stringify([condition]),
  }).toString();
  expect(() => readExplorerQuery(encoded, fields)).toThrow();
});
test('decimal boundaries stay exact above safe integer precision including negative ranges', () => {
  expect(
    conditionError(
      {
        field: 'revenue',
        op: 'between',
        value: ['9999999999999999.98', '9999999999999999.99'],
      },
      fields,
    ),
  ).toBeNull();
  expect(
    conditionError(
      { field: 'revenue', op: 'between', value: ['-2', '-1'] },
      fields,
    ),
  ).toBeNull();
  expect(
    conditionError(
      { field: 'revenue', op: 'between', value: ['-1', '-2'] },
      fields,
    ),
  ).toMatch(/Range start/);
});
test('UTC date input and last30days resolve to a fixed inclusive interval', () => {
  expect(utcValue('2026-11-14T13:42')).toBe('2026-11-14T13:42:00.000Z');
  expect(utcInput('2026-11-14T13:42:00+06:00')).toBe('2026-11-14T07:42:00.000');
  expect(lastThirtyDays(new Date('2026-11-14T12:00:00Z'))).toEqual([
    '2026-10-15T12:00:00.000Z',
    '2026-11-14T12:00:00.000Z',
  ]);
  expect(
    conditionError(
      { field: 'createdAt', op: 'eq', value: '2026-11-14T00:00:00+06:00' },
      fields,
    ),
  ).toBeNull();
});
test('Viewer basic policy matches actual server field/operator boundary', () => {
  expect(
    advancedQuery({
      conditions: [
        { field: 'status', op: 'in', value: ['Active', 'Pending'] },
        { field: 'country', op: 'eq', value: 'Germany' },
      ],
    }),
  ).toBe(false);
  expect(
    advancedQuery({
      conditions: [{ field: 'status', op: 'neq', value: 'Active' }],
    }),
  ).toBe(true);
  expect(
    advancedQuery({
      conditions: [{ field: 'name', op: 'eq', value: 'Known Match Alpha' }],
    }),
  ).toBe(true);
});
test('saved projection excludes page and unknown response data; typed URL preserves filters/sort/columns', () => {
  const query = searchRequestSchema.parse({
    page: 9,
    conditions: [
      { field: 'revenue', op: 'between', value: ['10000.00', '10000.01'] },
    ],
    columns: ['id', 'name'],
    sort: [{ field: 'revenue', direction: 'desc' }],
  });
  const config = queryConfig(query);
  expect(config).not.toHaveProperty('page');
  expect(config.version).toBe(1);
  expect(readExplorerQuery(writeExplorerQuery(query), fields)).toEqual(query);
  expect(() => readExplorerQuery('mode=raw', fields)).toThrow();
});
