import { searchRequestSchema, fieldCreateSchema } from '@datascope/contracts';
import {
  validateSearch,
  isAdvanced,
} from '../src/modules/search/search-validation.js';
const fields = [
  { fieldKey: 'status', dataType: 'enum', operators: ['eq', 'in'] },
  {
    fieldKey: 'revenue',
    dataType: 'number',
    operators: ['eq', 'gt', 'between', 'in'],
  },
  { fieldKey: 'createdAt', dataType: 'date', operators: ['gte', 'between'] },
  { fieldKey: 'verified', dataType: 'boolean', operators: ['eq'] },
  { fieldKey: 'name', dataType: 'string', operators: ['eq', 'contains'] },
].map((field) =>
  fieldCreateSchema.parse({
    label: field.fieldKey,
    isFilterable: true,
    isSortable: true,
    ...field,
  }),
);
const parse = (input: unknown) =>
  validateSearch(searchRequestSchema.parse(input), fields);
describe('BE-10 search contracts and metadata validation', () => {
  it('normalizes exact decimal/date values without floating point and preserves equal range ends', () => {
    const query = parse({
      conditions: [
        {
          field: 'revenue',
          op: 'between',
          value: ['9999999999999999.99', '9999999999999999.99'],
        },
        { field: 'createdAt', op: 'gte', value: '2026-11-01T06:00:00+06:00' },
      ],
    });
    expect(
      query.conditions.find((condition) => condition.field === 'revenue')
        ?.value,
    ).toEqual(['9999999999999999.99', '9999999999999999.99']);
    expect(
      query.conditions.find((condition) => condition.field === 'createdAt')
        ?.value,
    ).toBe('2026-11-01T00:00:00.000Z');
  });
  it('canonicalizes equivalent AND/in sets, preserves sort/column priority and appends ID', () => {
    const a = {
      field: 'status',
      op: 'in',
      value: ['Active', 'Pending', 'Active'],
    };
    const b = { field: 'revenue', op: 'eq', value: '-0.000' };
    expect(parse({ conditions: [a, b] }).conditions).toEqual(
      parse({ conditions: [b, { ...a, value: ['Pending', 'Active'] }] })
        .conditions,
    );
    const query = parse({
      columns: ['revenue', 'name'],
      sort: [
        { field: 'revenue', direction: 'desc' },
        { field: 'name', direction: 'asc' },
      ],
    });
    expect(query.columns).toEqual(['id', 'revenue', 'name']);
    expect(query.sort).toEqual([
      { field: 'revenue', direction: 'desc' },
      { field: 'name', direction: 'asc' },
      { field: 'id', direction: 'asc' },
    ]);
  });
  it.each([
    { page: 0 },
    { page: 4001 },
    { page: 1002, pageSize: 100 },
    { pageSize: 1 },
    { page: '1' },
    { q: 'a'.repeat(201) },
    { q: '\0' },
    { columns: [] },
    { columns: ['id', 'id'] },
    { columns: ['attributes'] },
    { columns: ['name;drop'] },
    { sql: 'select 1' },
    {
      conditions: Array.from({ length: 13 }, () => ({
        field: 'status',
        op: 'eq',
        value: 'Active',
      })),
    },
    {
      sort: Array.from({ length: 4 }, () => ({
        field: 'id',
        direction: 'asc',
      })),
    },
    {
      sort: [
        { field: 'name', direction: 'asc' },
        { field: 'name', direction: 'desc' },
      ],
    },
    {
      conditions: [
        {
          field: 'status',
          op: 'in',
          value: Array.from({ length: 51 }, () => 'A'),
        },
      ],
    },
  ])('rejects malformed/oversized structural request %#', (input) => {
    expect(searchRequestSchema.safeParse(input).success).toBe(false);
  });
  it.each([
    ['unknown', 'eq', 'x'],
    ['revenue', 'contains', '1'],
    ['revenue', 'gt', 'NaN'],
    ['revenue', 'eq', '1e3'],
    ['revenue', 'eq', true],
    ['verified', 'eq', 'true'],
    ['createdAt', 'gte', '2026-02-30T00:00:00Z'],
    ['createdAt', 'gte', '2026-11-01'],
    ['createdAt', 'between', ['2026-11-02T00:00:00Z', '2026-11-01T00:00:00Z']],
    ['revenue', 'between', ['1.000000000000000001', '1.000000000000000000']],
    ['revenue', 'between', ['-1', '-2']],
    ['revenue', 'between', ['1']],
    ['name', 'eq', ['A']],
    ['status', 'in', 'Active'],
    ['status', 'eq', '\0'],
  ])('rejects metadata/type/shape/range mismatch %#', (field, op, value) => {
    expect(() => parse({ conditions: [{ field, op, value }] })).toThrow();
  });
  it('enforces metadata capabilities and basic/advanced policy independently of client mode', () => {
    expect(() => parse({ columns: ['tokenHash'] })).toThrow();
    expect(() =>
      parse({ sort: [{ field: 'unknown', direction: 'asc' }] }),
    ).toThrow();
    expect(
      isAdvanced(
        searchRequestSchema.parse({
          conditions: [{ field: 'status', op: 'eq', value: 'Active' }],
        }),
      ),
    ).toBe(false);
    expect(
      isAdvanced(
        searchRequestSchema.parse({
          conditions: [{ field: 'revenue', op: 'gt', value: '1' }],
        }),
      ),
    ).toBe(true);
    expect(() =>
      validateSearch(
        searchRequestSchema.parse({
          conditions: [{ field: 'name', op: 'eq', value: 'A' }],
        }),
        fields.map((field) => ({
          ...field,
          isFilterable: false,
          operators: [],
        })),
      ),
    ).toThrow();
  });
});
