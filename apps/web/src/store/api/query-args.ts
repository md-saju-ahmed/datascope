import { searchRequestSchema, type SearchRequest } from '@datascope/contracts';
export interface SearchArgs {
  datasetId: string;
  query: SearchRequest;
}
export function normalizeSearch(input: SearchRequest): SearchRequest {
  const query = searchRequestSchema.parse(input);
  return {
    ...query,
    // AND and IN ordering is immaterial; sort priority and display columns are meaningful.
    conditions: query.conditions
      .map((condition) => ({
        ...condition,
        value:
          condition.op === 'in' && Array.isArray(condition.value)
            ? [...condition.value].sort((a, b) =>
                JSON.stringify(a).localeCompare(JSON.stringify(b)),
              )
            : condition.value,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
}
export const searchKey = (args: SearchArgs) => ({
  datasetId: args.datasetId,
  query: normalizeSearch(args.query),
});
// Hooks support skipToken/skip. Pages must use currentData when args change.
export { skipToken } from '@reduxjs/toolkit/query';
