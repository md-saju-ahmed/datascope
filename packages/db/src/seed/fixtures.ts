export const seedVersion = 'datascope-seed-v1';
export const seedKey = 'local_seed_v1';
export const primarySize = 100000;
export const secondarySize = 128;
export const recordBase = 1000000000000n;
export const fixedDate = new Date('2026-11-01T00:00:00.000Z');
export const seedIds = {
  admin: 'dada0004-0000-4000-8000-000000000001',
  analyst: 'dada0004-0000-4000-8000-000000000002',
  viewer: 'dada0004-0000-4000-8000-000000000003',
  primary: 'dada0004-0000-4000-8000-000000000101',
  restricted: 'dada0004-0000-4000-8000-000000000102',
} as const;

export const seedDatasets = [
  {
    id: seedIds.primary,
    slug: 'business-directory-v1',
    name: 'Business Directory',
    description: 'Deterministic 100,000-row business evaluation dataset.',
    category: 'Business',
    source: seedVersion,
    recordCount: BigInt(primarySize),
    createdAt: fixedDate,
    updatedAt: fixedDate,
  },
  {
    id: seedIds.restricted,
    slug: 'restricted-partners-v1',
    name: 'Restricted Partners',
    description: 'Small dataset for cross-dataset authorization checks.',
    category: 'Partners',
    source: seedVersion,
    recordCount: BigInt(secondarySize),
    createdAt: fixedDate,
    updatedAt: fixedDate,
  },
];

// Explicit boundaries: combined AND fixture query must return only 1, 7 and 8.
const fixtures = [
  ['Known Match Alpha', 'Active', 'Germany', '10000.01', '2026-10-01'],
  ['Revenue Boundary', 'Active', 'Germany', '10000.00', '2026-10-01'],
  ['Wrong Status', 'Inactive', 'Germany', '20000.00', '2026-10-01'],
  ['Wrong Country', 'Active', 'France', '20000.00', '2026-10-01'],
  ['Old Date', 'Active', 'Germany', '20000.00', '2025-12-31'],
  ['Missing Revenue', 'Active', 'Germany', null, '2026-10-01'],
  ['Known Match Beta', 'Active', 'Germany', '15000.00', '2026-01-01'],
  ['Known Match Gamma', 'Active', 'Germany', '99999.99', '2026-10-31'],
  ['Blank Fields', '', '', null, '2026-10-01'],
  ['Null Fields', null, null, null, '2026-10-01'],
] as const;

function mix(value: number): number {
  let result = value ^ 0xdecafbad;
  result = Math.imul(result ^ (result >>> 16), 0x7feb352d);
  result = Math.imul(result ^ (result >>> 15), 0x846ca68b);
  return (result ^ (result >>> 16)) >>> 0;
}

const statuses = ['Active', 'Pending', 'Inactive', 'Suspended'] as const;
const countries = ['Germany', 'France', 'USA', 'Japan', 'Bangladesh'] as const;
const categories = [
  'Technology',
  'Finance',
  'Retail',
  'Healthcare',
  'Energy',
] as const;

export function seedRecord(index: number, secondary = false) {
  const size = secondary ? secondarySize : primarySize;
  if (!Number.isInteger(index) || index < 0 || index >= size)
    throw new Error('Seed index out of bounds');
  const number = secondary ? index + primarySize : index;
  const fixture = secondary ? undefined : fixtures[index];
  const cents = 10000 + (mix(number) % 99990001);
  const createdAt = fixture
    ? new Date(`${fixture[4]}T00:00:00.000Z`)
    : new Date(fixedDate.getTime() - (mix(number + 7) % 1400) * 86400000);
  return {
    id: recordBase + BigInt(number + 1),
    datasetId: secondary ? seedIds.restricted : seedIds.primary,
    name:
      fixture?.[0] ??
      `${secondary ? 'Partner' : 'Company'} ${(index + 1).toString().padStart(6, '0')}`,
    status: fixture
      ? fixture[1]
      : (statuses[mix(number + 1) % statuses.length] ?? 'Active'),
    country: fixture
      ? fixture[2]
      : (countries[mix(number + 2) % countries.length] ?? 'Germany'),
    category: categories[mix(number + 3) % categories.length] ?? 'Technology',
    revenue: fixture
      ? fixture[3]
      : `${Math.floor(cents / 100).toString()}.${(cents % 100).toString().padStart(2, '0')}`,
    attributes: {
      seedVersion,
      seedOrdinal: index + 1,
      fixture: fixture !== undefined,
      employeeCount: 1 + (mix(number + 4) % 10000),
      verified: mix(number + 5) % 2 === 0,
      industry: categories[mix(number + 6) % categories.length] ?? 'Technology',
    },
    createdAt,
    updatedAt: createdAt,
  };
}

export const fieldDefinitions = [
  {
    fieldKey: 'name',
    label: 'Name',
    dataType: 'string',
    operators: ['eq', 'contains'],
    isSearchable: true,
  },
  {
    fieldKey: 'status',
    label: 'Status',
    dataType: 'enum',
    operators: ['eq', 'in'],
    isSearchable: true,
  },
  {
    fieldKey: 'country',
    label: 'Country',
    dataType: 'enum',
    operators: ['eq', 'in'],
    isSearchable: true,
  },
  {
    fieldKey: 'category',
    label: 'Category',
    dataType: 'enum',
    operators: ['eq', 'in'],
    isSearchable: true,
  },
  {
    fieldKey: 'revenue',
    label: 'Revenue',
    dataType: 'number',
    operators: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  },
  {
    fieldKey: 'createdAt',
    label: 'Created',
    dataType: 'date',
    operators: ['eq', 'gte', 'lte', 'between'],
  },
  {
    fieldKey: 'employeeCount',
    label: 'Employees',
    dataType: 'number',
    operators: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  },
  {
    fieldKey: 'verified',
    label: 'Verified',
    dataType: 'boolean',
    operators: ['eq'],
  },
  {
    fieldKey: 'industry',
    label: 'Industry',
    dataType: 'string',
    operators: ['eq', 'contains'],
    isSearchable: false,
  },
] as const;
