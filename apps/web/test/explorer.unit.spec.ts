import {
  readExplorerQuery,
  writeExplorerQuery,
} from '../src/features/explorer/url-state.ts';
import { searchRequestSchema, type DatasetField } from '@datascope/contracts';
const fields: DatasetField[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    datasetId: '00000000-0000-4000-8000-000000000002',
    fieldKey: 'name',
    label: 'Name',
    dataType: 'string',
    operators: ['eq', 'contains'],
    isSearchable: true,
    isFilterable: true,
    isSortable: true,
    isVisible: true,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];
test('URL table state roundtrips query/sort/columns/decimal values without losing context', () => {
  const q = searchRequestSchema.parse({
    q: 'Example',
    conditions: [{ field: 'name', op: 'eq', value: 'Example' }],
    sort: [
      { field: 'name', direction: 'desc' },
      { field: 'id', direction: 'asc' },
    ],
    page: 2,
    pageSize: 10,
    columns: ['name', 'id'],
  });
  expect(readExplorerQuery(writeExplorerQuery(q), fields)).toEqual(q);
});
test.each([
  'page=0',
  'page=1&page=2',
  'pageSize=100000',
  'sort=%7B',
  'columns=%5B%5D',
  'columns=%5B%22passwordHash%22%5D',
  'filters=%5B%7B%22field%22%3A%22unknown%22%2C%22op%22%3A%22eq%22%2C%22value%22%3A%22x%22%7D%5D',
])('invalid URL %s fails closed', (url) => {
  expect(() => readExplorerQuery(url, fields)).toThrow();
});
test('default query is bounded; hidden/nonsortable columns never advertised', () => {
  expect(readExplorerQuery('', fields).pageSize).toBe(25);
  expect(() =>
    readExplorerQuery(
      'sort=' +
        encodeURIComponent(
          JSON.stringify([{ field: 'name', direction: 'asc' }]),
        ),
      fields.map((f) => ({ ...f, isSortable: false })),
    ),
  ).toThrow();
  expect(() =>
    readExplorerQuery(
      'columns=' + encodeURIComponent('["name"]'),
      fields.map((f) => ({ ...f, isVisible: false })),
    ),
  ).toThrow();
});
test('persisted page defaults apply only when the URL omits pageSize', () => {
  expect(readExplorerQuery('', fields, 10).pageSize).toBe(10);
  expect(readExplorerQuery('pageSize=50', fields, 10).pageSize).toBe(50);
  expect(
    readExplorerQuery(
      writeExplorerQuery(searchRequestSchema.parse({ pageSize: 100 })),
      fields,
      10,
    ).pageSize,
  ).toBe(100);
});
