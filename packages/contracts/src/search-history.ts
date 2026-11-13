import { z } from 'zod';
import {
  decimalCountSchema,
  pageInfoSchema,
  pageQuerySchema,
} from './datasets.js';
import { savedConfigSchema } from './saved-views.js';
export const historyQuerySchema = pageQuerySchema.extend({
  datasetId: z.uuid().optional(),
});
export const historyConfigSchema = savedConfigSchema.safeExtend({
  savedViewId: z.uuid().optional(),
});
export const historyResponseSchema = z.strictObject({
  data: z
    .array(
      z.strictObject({
        id: decimalCountSchema,
        datasetId: z.uuid(),
        normalizedQuery: historyConfigSchema,
        filterKeys: z.array(z.string()).max(12),
        durationMs: z.number().int().nonnegative().nullable(),
        executedAt: z.iso.datetime(),
      }),
    )
    .max(100),
  pageInfo: pageInfoSchema,
});
export const historyClearResponseSchema = z.strictObject({
  data: z.strictObject({ deleted: decimalCountSchema }),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
