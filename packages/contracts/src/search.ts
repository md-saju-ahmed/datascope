import { z } from 'zod';
import {
  fieldOperatorSchema,
  pageInfoSchema,
  recordIdSchema,
} from './datasets.js';

export const searchFieldKeySchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
  .refine(
    (key) =>
      ![
        '__proto__',
        'prototype',
        'constructor',
        'attributes',
        'datasetId',
        'searchVector',
      ].includes(key),
  );
const scalar = z.union([z.string().max(500), z.boolean()]);
export const searchConditionSchema = z.strictObject({
  field: searchFieldKeySchema,
  op: fieldOperatorSchema,
  value: z.union([scalar, z.array(scalar).min(1).max(50)]),
});
export const searchSortSchema = z.strictObject({
  field: searchFieldKeySchema,
  direction: z.enum(['asc', 'desc']),
});
export const searchRequestSchema = z
  .strictObject({
    q: z
      .string()
      .trim()
      .max(200)
      .refine((value) => !value.includes('\0'))
      .default(''),
    conditions: z.array(searchConditionSchema).max(12).default([]),
    sort: z.array(searchSortSchema).max(3).default([]),
    page: z.number().int().min(1).max(4000).default(1),
    pageSize: z
      .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
      .default(25),
    columns: z.array(searchFieldKeySchema).min(1).max(100).optional(),
  })
  .superRefine((value, context) => {
    if ((value.page - 1) * value.pageSize > 100000)
      context.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'Offset exceeds limit',
      });
    for (const [field, items] of [
      ['sort', value.sort.map((item) => item.field)],
      ['columns', value.columns ?? []],
    ] as const)
      if (new Set(items).size !== items.length)
        context.addIssue({
          code: 'custom',
          path: [field],
          message: 'Duplicate fields',
        });
  });
export const searchResponseSchema = z.strictObject({
  data: z
    .array(
      z
        .object({ id: recordIdSchema })
        .catchall(z.union([z.string(), z.boolean(), z.null()])),
    )
    .max(100),
  pageInfo: pageInfoSchema,
  sort: z.array(searchSortSchema).max(4),
  queryId: z.uuid(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type SearchCondition = z.infer<typeof searchConditionSchema>;
export type SearchSort = z.infer<typeof searchSortSchema>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
