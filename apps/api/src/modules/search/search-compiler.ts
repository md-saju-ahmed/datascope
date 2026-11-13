import { schema, sql } from '@datascope/db';
import type { SearchCondition } from '@datascope/contracts';
import type { SearchField, ValidatedSearch } from './search-validation.js';
import { invalid } from './search-validation.js';

const records = schema.datasetRecords;
const common = {
  id: records.id,
  name: records.name,
  status: records.status,
  country: records.country,
  category: records.category,
  revenue: records.revenue,
  createdAt: records.createdAt,
  updatedAt: records.updatedAt,
};
export function fieldExpression(key: string, fields: SearchField[]) {
  if (Object.hasOwn(common, key)) {
    const column = common[key as keyof typeof common];
    return sql`${column}`;
  }
  const field = fields.find((entry) => entry.fieldKey === key);
  if (!field) invalid(key);
  const json = sql`${records.attributes} -> ${key}`;
  const text = sql`${records.attributes} ->> ${key}`;
  switch (field.dataType) {
    case 'string':
    case 'enum':
      return sql`case when jsonb_typeof(${json}) = 'string' then ${text} end`;
    case 'number':
      return sql`case when jsonb_typeof(${json}) = 'number' then (${text})::numeric end`;
    case 'boolean':
      return sql`case when jsonb_typeof(${json}) = 'boolean' then (${text})::boolean end`;
    case 'date':
      return sql`case when jsonb_typeof(${json}) = 'string' and ${text} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' and pg_input_is_valid(${text}, 'timestamp with time zone') then (${text})::timestamptz end`;
  }
}
function predicate(condition: SearchCondition, fields: SearchField[]) {
  const expression = fieldExpression(condition.field, fields);
  const value = condition.value;
  switch (condition.op) {
    case 'eq':
      return sql`${expression} = ${value}`;
    case 'neq':
      return sql`${expression} <> ${value}`;
    case 'gt':
      return sql`${expression} > ${value}`;
    case 'gte':
      return sql`${expression} >= ${value}`;
    case 'lt':
      return sql`${expression} < ${value}`;
    case 'lte':
      return sql`${expression} <= ${value}`;
    case 'contains': {
      if (typeof value !== 'string') invalid(condition.field);
      const pattern = `%${value.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      return sql`lower(${expression}) like lower(${pattern}) escape '\\'`;
    }
    case 'between':
      if (!Array.isArray(value)) invalid(condition.field);
      return sql`${expression} between ${value[0]} and ${value[1]}`;
    case 'in':
      if (!Array.isArray(value)) invalid(condition.field);
      return sql`${expression} in (${sql.join(
        value.map((item) => sql`${item}`),
        sql`, `,
      )})`;
  }
}
export function compileSearch(
  datasetId: string,
  query: ValidatedSearch,
  fields: SearchField[],
  visibility: ReturnType<typeof sql>,
  selectedIds?: string[],
) {
  const predicates = [sql`${records.datasetId} = ${datasetId}`, visibility];
  if (selectedIds)
    predicates.push(
      sql`${records.id} in (${sql.join(
        selectedIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    );
  if (query.q)
    predicates.push(
      sql`${records.searchVector} @@ websearch_to_tsquery('simple', ${query.q})`,
    );
  predicates.push(
    ...query.conditions.map((condition) => predicate(condition, fields)),
  );
  const where = sql.join(
    predicates.map((part) => sql`(${part})`),
    sql` and `,
  );
  const order = sql.join(
    query.sort.map((sort) => {
      const field = fields.find((entry) => entry.fieldKey === sort.field);
      const expression = fieldExpression(sort.field, fields);
      const ordered =
        field && ['string', 'enum'].includes(field.dataType)
          ? sql`${expression} collate "C"`
          : expression;
      return sort.direction === 'asc'
        ? sql`${ordered} asc nulls last`
        : sql`${ordered} desc nulls last`;
    }),
    sql`, `,
  );
  const projection = Object.fromEntries(
    query.columns.map((key) => {
      const field = fields.find((entry) => entry.fieldKey === key);
      const expression = fieldExpression(key, fields);
      // Bind JSON output keys as values too. No client-controlled identifiers.
      const value =
        key === 'id' || field?.dataType === 'number'
          ? sql`(${expression})::text`
          : field?.dataType === 'date'
            ? sql`to_char(${expression} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
            : expression;
      return [key, value];
    }),
  );
  const pairs = Object.entries(projection).flatMap(([key, value]) => [
    sql`${key}::text`,
    value,
  ]);
  return {
    rows: sql`select jsonb_build_object(${sql.join(pairs, sql`, `)}) as record from ${records} where ${where} order by ${order} limit ${selectedIds?.length ?? query.pageSize} offset ${(query.page - 1) * query.pageSize}`,
    count: sql`select count(*)::text as total from ${records} where ${where}`,
  };
}
