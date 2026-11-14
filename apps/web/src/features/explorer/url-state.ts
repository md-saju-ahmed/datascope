import {
  searchRequestSchema,
  type DatasetField,
  type SearchRequest,
} from '@datascope/contracts';

export function readExplorerQuery(
  search: string,
  fields: DatasetField[],
): SearchRequest {
  if (search.length > 8000) throw new Error('The query URL is too long.');
  const params = new URLSearchParams(search);
  for (const key of ['q', 'filters', 'sort', 'page', 'pageSize', 'columns'])
    if (params.getAll(key).length > 1)
      throw new Error('Duplicate query parameters.');
  const json = (key: string): unknown => JSON.parse(params.get(key) ?? '[]');
  const query = searchRequestSchema.parse({
    q: params.get('q') ?? '',
    conditions: json('filters'),
    sort: json('sort'),
    page: Number(params.get('page') ?? 1),
    pageSize: Number(params.get('pageSize') ?? 25),
    ...(params.has('columns') ? { columns: json('columns') } : {}),
  });
  const visible = fields.filter((f) => f.isVisible);
  if (
    query.columns?.some(
      (key) => key !== 'id' && !visible.some((f) => f.fieldKey === key),
    )
  )
    throw new Error('A selected column is unavailable.');
  if (
    query.sort.some(
      (sort) =>
        sort.field !== 'id' &&
        !visible.some((f) => f.fieldKey === sort.field && f.isSortable),
    )
  )
    throw new Error('A sort field is unavailable.');
  if (
    query.conditions.some(
      (condition) =>
        !visible.some(
          (f) =>
            f.fieldKey === condition.field &&
            f.isFilterable &&
            f.operators.includes(condition.op),
        ),
    )
  )
    throw new Error('A filter field is unavailable.');
  return query;
}
export function writeExplorerQuery(query: SearchRequest): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.conditions.length)
    params.set('filters', JSON.stringify(query.conditions));
  if (query.sort.length) params.set('sort', JSON.stringify(query.sort));
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.columns) params.set('columns', JSON.stringify(query.columns));
  return params.toString();
}
