import { z } from 'zod';
import { fieldCreateSchema } from '@datascope/contracts';
import type {
  DatasetField,
  SearchRequest,
  SearchCondition,
} from '@datascope/contracts';
import { AuthFailure } from '../auth/auth-http.js';

export type SearchField = Pick<
  DatasetField,
  | 'fieldKey'
  | 'dataType'
  | 'isSearchable'
  | 'isFilterable'
  | 'isSortable'
  | 'isVisible'
  | 'sortOrder'
> & { operators: readonly string[] };
export function invalid(field: string): never {
  throw new AuthFailure(
    400,
    'VALIDATION_ERROR',
    'Invalid search configuration',
    [{ field, message: 'Invalid or unsupported value' }],
  );
}
const numeric = /^-?(?:0|[1-9][0-9]{0,37})(?:\.[0-9]{1,18})?$/;
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function decimal(value: string): string {
  const [integer = '0', fraction = ''] = value.split('.');
  const result = `${integer}.${fraction.padEnd(18, '0')}`;
  return BigInt(result.replace('.', '')).toString();
}
function normalizeValue(
  field: SearchField,
  value: string | boolean,
): string | boolean {
  switch (field.dataType) {
    case 'string':
    case 'enum':
      if (typeof value !== 'string' || value.includes('\0'))
        invalid(field.fieldKey);
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') invalid(field.fieldKey);
      return value;
    case 'number': {
      if (typeof value !== 'string' || !numeric.test(value))
        invalid(field.fieldKey);
      const negative = value.startsWith('-');
      const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
      const trimmed = fraction.replace(/0+$/, '');
      return `${negative && decimal(value) !== '0' ? '-' : ''}${whole}${trimmed ? `.${trimmed}` : ''}`;
    }
    case 'date': {
      const result = z.iso.datetime({ offset: true }).safeParse(value);
      if (!result.success || !Number.isFinite(Date.parse(result.data)))
        invalid(field.fieldKey);
      return new Date(result.data).toISOString();
    }
  }
}
export function validateSearch(query: SearchRequest, fields: SearchField[]) {
  for (const field of fields) {
    const {
      fieldKey,
      dataType,
      operators,
      isSearchable,
      isFilterable,
      isSortable,
      isVisible,
      sortOrder,
    } = field;
    if (
      !fieldCreateSchema.safeParse({
        fieldKey,
        label: fieldKey,
        dataType,
        operators,
        isSearchable,
        isFilterable,
        isSortable,
        isVisible,
        sortOrder,
      }).success
    )
      invalid(fieldKey);
  }
  const registry = new Map(fields.map((field) => [field.fieldKey, field]));
  const conditions = query.conditions.map((condition): SearchCondition => {
    const field = registry.get(condition.field);
    if (!field?.isFilterable || !field.operators.includes(condition.op))
      invalid(condition.field);
    const array = Array.isArray(condition.value);
    if ((condition.op === 'in' || condition.op === 'between') !== array)
      invalid(condition.field);
    const values = (
      Array.isArray(condition.value) ? condition.value : [condition.value]
    ).map((value) => normalizeValue(field, value));
    if (condition.op === 'between') {
      if (values.length !== 2 || !['number', 'date'].includes(field.dataType))
        invalid(condition.field);
      const [min, max] = values;
      if (typeof min !== 'string' || typeof max !== 'string')
        invalid(condition.field);
      if (
        field.dataType === 'number'
          ? BigInt(decimal(min)) > BigInt(decimal(max))
          : min > max
      )
        invalid(condition.field);
    }
    if (condition.op === 'in')
      values.sort((a, b) => compare(String(a), String(b)));
    return {
      ...condition,
      value: array
        ? condition.op === 'in'
          ? [...new Set(values)]
          : values
        : (values[0] ?? invalid(condition.field)),
    };
  });
  conditions.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  for (const sort of query.sort)
    if (sort.field !== 'id' && !registry.get(sort.field)?.isSortable)
      invalid(sort.field);
  const columns =
    query.columns ??
    fields
      .filter((field) => field.isVisible)
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || compare(a.fieldKey, b.fieldKey),
      )
      .map((field) => field.fieldKey);
  for (const column of columns)
    if (column !== 'id' && !registry.has(column)) invalid(column);
  const sort = query.sort.length
    ? [...query.sort]
    : [{ field: 'createdAt', direction: 'desc' as const }];
  // The immutable common timestamp and unique ID remain available for default ordering.
  if (!sort.some((entry) => entry.field === 'id'))
    sort.push({ field: 'id', direction: query.sort.length ? 'asc' : 'desc' });
  return {
    ...query,
    conditions,
    columns: ['id', ...columns.filter((column) => column !== 'id')],
    sort,
  };
}
export type ValidatedSearch = ReturnType<typeof validateSearch>;
export function isAdvanced(query: SearchRequest): boolean {
  return query.conditions.some(
    (condition) =>
      !['status', 'country', 'category'].includes(condition.field) ||
      !['eq', 'in'].includes(condition.op),
  );
}
