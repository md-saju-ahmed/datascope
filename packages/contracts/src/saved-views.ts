import { z } from 'zod';
import {
  searchRequestSchema,
  searchSortSchema,
  searchConditionSchema,
  searchFieldKeySchema,
} from './search.js';
import type { SearchRequest } from './search.js';
import { pageInfoSchema, pageQuerySchema } from './datasets.js';
export const savedConfigSchema = z
  .strictObject({
    version: z.literal(1),
    q: z.string().trim().max(200).default(''),
    conditions: z.array(searchConditionSchema).max(12).default([]),
    sort: z.array(searchSortSchema).max(3).default([]),
    columns: z.array(searchFieldKeySchema).min(1).max(100).optional(),
    pageSize: z
      .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
      .default(25),
  })
  .superRefine((config, context) => {
    if (!searchRequestSchema.safeParse(savedQuery(config)).success)
      context.addIssue({
        code: 'custom',
        message: 'Invalid search configuration',
      });
  });
export const viewCreateSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !value.includes('\0')),
  datasetId: z.uuid(),
  config: savedConfigSchema,
});
export const viewPatchSchema = viewCreateSchema
  .omit({ datasetId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export const viewListQuerySchema = pageQuerySchema.extend({
  datasetId: z.uuid().optional(),
});
export const viewApplySchema = z.strictObject({
  page: z.number().int().min(1).max(4000).default(1),
  pageSize: z
    .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
    .optional(),
});
export const shareRequestSchema = z.strictObject({ userId: z.uuid() });
export const savedViewSchema = z.strictObject({
  id: z.uuid(),
  ownerId: z.uuid(),
  datasetId: z.uuid(),
  name: z.string(),
  config: savedConfigSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const viewResponseSchema = z.strictObject({ data: savedViewSchema });
export const viewListResponseSchema = z.strictObject({
  data: z.array(savedViewSchema).max(100),
  pageInfo: pageInfoSchema,
});
export const shareResponseSchema = z.strictObject({
  data: z.strictObject({
    viewId: z.uuid(),
    userId: z.uuid(),
    createdAt: z.iso.datetime(),
  }),
});
export const deletedResponseSchema = z.strictObject({
  data: z.strictObject({ deleted: z.literal(true) }),
});
export type SavedConfig = z.infer<typeof savedConfigSchema>;
export type ViewCreate = z.infer<typeof viewCreateSchema>;
export type ViewPatch = z.infer<typeof viewPatchSchema>;
export type ViewListQuery = z.infer<typeof viewListQuerySchema>;
export type ViewApply = z.infer<typeof viewApplySchema>;
export function savedQuery(
  config: Pick<
    SearchRequest,
    'q' | 'conditions' | 'sort' | 'columns' | 'pageSize'
  >,
) {
  return {
    q: config.q,
    conditions: config.conditions,
    sort: config.sort,
    columns: config.columns,
    pageSize: config.pageSize,
  };
}
