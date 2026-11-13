import {
  fieldCreateSchema,
  fieldPatchSchema,
  datasetCreateSchema,
  datasetPatchSchema,
  datasetListQuerySchema,
  pageQuerySchema,
  recordIdSchema,
} from '@datascope/contracts';
import type { CurrentUser, Permission } from '@datascope/contracts';
import { permits } from '../src/modules/permissions/permissions.service.js';

describe('role and grant contract', () => {
  const cases: {
    role: CurrentUser['role'];
    grant: Permission | undefined;
    expected: Permission[];
  }[] = [
    {
      role: 'admin',
      grant: undefined,
      expected: ['read', 'analyze', 'manage'],
    },
    { role: 'viewer', grant: undefined, expected: [] },
    { role: 'viewer', grant: 'read', expected: ['read'] },
    { role: 'viewer', grant: 'analyze', expected: ['read'] },
    { role: 'viewer', grant: 'manage', expected: ['read'] },
    { role: 'analyst', grant: undefined, expected: [] },
    { role: 'analyst', grant: 'read', expected: ['read'] },
    { role: 'analyst', grant: 'analyze', expected: ['read', 'analyze'] },
    {
      role: 'analyst',
      grant: 'manage',
      expected: ['read', 'analyze', 'manage'],
    },
  ];
  it.each(cases)(
    '$role with $grant has only the specified effective actions',
    ({ role, grant, expected }) => {
      expect(
        (['read', 'analyze', 'manage'] as const).filter((action) =>
          permits(role, grant, action),
        ),
      ).toEqual(expected);
    },
  );
});

describe('dataset, field and identifier validation', () => {
  it('defaults new datasets without accepting server-controlled counts', () => {
    expect(
      datasetCreateSchema.parse({
        name: ' Test ',
        slug: 'test',
        source: 'Local',
      }),
    ).toEqual({
      name: 'Test',
      slug: 'test',
      source: 'Local',
      description: '',
      category: 'uncategorized',
    });
    expect(
      datasetCreateSchema.safeParse({
        name: 'Test',
        slug: 'test',
        source: 'Local',
        recordCount: '10',
      }).success,
    ).toBe(false);
  });
  it('does not insert defaults into patch requests or accept an empty update', () => {
    expect(datasetPatchSchema.parse({ name: 'Renamed' })).toEqual({
      name: 'Renamed',
    });
    expect(fieldPatchSchema.parse({ label: 'Renamed' })).toEqual({
      label: 'Renamed',
    });
    expect(datasetPatchSchema.safeParse({}).success).toBe(false);
    expect(fieldPatchSchema.safeParse({}).success).toBe(false);
  });
  it.each([
    'id',
    'datasetId',
    'attributes',
    'searchVector',
    'passwordHash',
    'tokenHash',
    'constructor',
    'prototype',
    '__proto__',
    'created_at',
    'name;drop',
    'a.b',
  ])('rejects reserved or unsafe field key %s', (fieldKey) => {
    expect(
      fieldCreateSchema.safeParse({
        fieldKey,
        label: 'Unsafe',
        dataType: 'string',
      }).success,
    ).toBe(false);
  });
  it.each([
    { fieldKey: 'revenue', dataType: 'string' },
    { fieldKey: 'name', dataType: 'number' },
    { fieldKey: 'amount', dataType: 'number', isSearchable: true },
    {
      fieldKey: 'amount',
      dataType: 'number',
      isFilterable: true,
      operators: ['contains'],
    },
    {
      fieldKey: 'when',
      dataType: 'date',
      isFilterable: true,
      operators: ['contains'],
    },
    {
      fieldKey: 'verified',
      dataType: 'boolean',
      isFilterable: true,
      operators: ['gt'],
    },
    { fieldKey: 'amount', dataType: 'number', operators: ['eq'] },
    { fieldKey: 'amount', dataType: 'number', isFilterable: true },
    {
      fieldKey: 'amount',
      dataType: 'number',
      isFilterable: true,
      operators: ['eq', 'eq'],
    },
  ])(
    'rejects incompatible type/capability/operator combinations %#',
    (body) => {
      expect(
        fieldCreateSchema.safeParse({ label: 'Field', ...body }).success,
      ).toBe(false);
    },
  );
  it('accepts typed dynamic field metadata and compatible common-field definitions', () => {
    expect(
      fieldCreateSchema.parse({
        fieldKey: 'customAmount',
        label: 'Amount',
        dataType: 'number',
        isFilterable: true,
        isSortable: true,
        operators: ['eq', 'between'],
      }).isSortable,
    ).toBe(true);
    expect(
      fieldCreateSchema.parse({
        fieldKey: 'status',
        label: 'Status',
        dataType: 'enum',
        isSearchable: true,
      }).isVisible,
    ).toBe(true);
  });
  it.each([
    { page: 0 },
    { page: 4001 },
    { pageSize: 101 },
    { pageSize: 1 },
    { page: 'x' },
    { pageSize: ['10', '100'] },
    { page: '1;select' },
  ])('rejects invalid pagination %#', (query) => {
    expect(pageQuerySchema.safeParse(query).success).toBe(false);
  });
  it('normalizes bounded page parameters and explicit archived flags', () => {
    expect(
      datasetListQuerySchema.parse({
        page: '2',
        pageSize: '10',
        includeArchived: 'false',
      }),
    ).toEqual({ page: 2, pageSize: 10, includeArchived: false });
    expect(datasetListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 25,
      includeArchived: false,
    });
    expect(
      datasetListQuerySchema.safeParse({ includeArchived: 'anything' }).success,
    ).toBe(false);
  });
  it.each([
    '0',
    '-1',
    '01',
    '1.5',
    '1e3',
    '9223372036854775808',
    '1;DROP TABLE users',
  ])('rejects malformed/out-of-range bigint IDs %s', (id) => {
    expect(recordIdSchema.safeParse(id).success).toBe(false);
  });
  it('preserves bigint IDs above the JavaScript safe integer boundary', () => {
    expect(recordIdSchema.parse('9007199254740993')).toBe('9007199254740993');
    expect(recordIdSchema.parse('9223372036854775807')).toBe(
      '9223372036854775807',
    );
  });
});
