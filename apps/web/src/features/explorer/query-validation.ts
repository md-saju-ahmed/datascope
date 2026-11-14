import type {
  Dataset,
  DatasetField,
  SearchCondition,
  SearchRequest,
  SavedConfig,
  CurrentUser,
} from '@datascope/contracts';

export function advancedQuery(query: Pick<SearchRequest, 'conditions'>) {
  return query.conditions.some(
    (c) =>
      !['status', 'country', 'category'].includes(c.field) ||
      !['eq', 'in'].includes(c.op),
  );
}
export function canAuthorAdvanced(user: CurrentUser | null, dataset: Dataset) {
  return (
    user?.role === 'admin' ||
    (user?.role === 'analyst' &&
      ['analyze', 'manage'].includes(dataset.effectivePermission))
  );
}
export function queryConfig(query: SearchRequest): SavedConfig {
  return {
    version: 1,
    q: query.q,
    conditions: query.conditions,
    sort: query.sort,
    pageSize: query.pageSize,
    ...(query.columns ? { columns: query.columns } : {}),
  };
}
const decimalPattern = /^-?(?:0|[1-9][0-9]{0,37})(?:\.[0-9]{1,18})?$/;
function scaledDecimal(value: string) {
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = value.replace(/^-/, '').split('.');
  return BigInt(`${negative ? '-' : ''}${whole}${fraction.padEnd(18, '0')}`);
}
export function conditionError(
  condition: SearchCondition,
  fields: DatasetField[],
): string | null {
  const field = fields.find(
    (f) => f.fieldKey === condition.field && f.isVisible && f.isFilterable,
  );
  if (!field || !field.operators.includes(condition.op))
    return 'Choose an available field and compatible operator.';
  const array = Array.isArray(condition.value);
  if ((condition.op === 'between' || condition.op === 'in') !== array)
    return 'Choose the required values.';
  const values = Array.isArray(condition.value)
    ? condition.value
    : [condition.value];
  if (
    !values.length ||
    values.length > 50 ||
    (condition.op === 'between' && values.length !== 2)
  )
    return 'Enter both range endpoints or one to fifty list values.';
  for (const value of values) {
    if (field.dataType === 'boolean') {
      if (typeof value !== 'boolean') return 'Choose true or false.';
    } else {
      if (
        typeof value !== 'string' ||
        !value.length ||
        value.length > 500 ||
        value.includes('\0')
      )
        return 'Enter a value (up to 500 characters).';
      if (field.dataType === 'number' && !decimalPattern.test(value))
        return 'Enter a decimal number without exponent notation.';
      if (
        field.dataType === 'date' &&
        (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
          value,
        ) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
            .toISOString()
            .slice(0, 10) !== value.slice(0, 10))
      )
        return 'Enter a valid UTC date and time.';
    }
  }
  if (condition.op === 'between') {
    const [min, max] = values;
    if (
      typeof min !== 'string' ||
      typeof max !== 'string' ||
      !['number', 'date'].includes(field.dataType)
    )
      return 'Choose a numeric or date range.';
    if (
      field.dataType === 'number'
        ? scaledDecimal(min) > scaledDecimal(max)
        : Date.parse(min) > Date.parse(max)
    )
      return 'Range start must be at or before its end.';
  }
  return null;
}
export function utcInput(value: string): string {
  if (!value) return '';
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Date(time).toISOString().slice(0, 23)
    : value;
}
export function utcValue(value: string): string {
  return value
    ? `${value}${value.length === 16 ? ':00.000' : value.length === 19 ? '.000' : ''}Z`
    : '';
}
export function lastThirtyDays(now = new Date()): [string, string] {
  return [
    new Date(now.getTime() - 30 * 86400000).toISOString(),
    now.toISOString(),
  ];
}
