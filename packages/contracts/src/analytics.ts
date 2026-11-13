import { z } from 'zod';
import { decimalCountSchema } from './datasets.js';
export const analyticsQuerySchema = z.strictObject({
  days: z.coerce.number().int().min(1).max(366).default(30),
});
export const activityQuerySchema = analyticsQuerySchema.extend({
  datasetId: z.uuid().optional(),
});
const bucket = z.strictObject({
  key: z.string().nullable(),
  count: decimalCountSchema,
});
const breakdown = z.strictObject({
  buckets: z.array(bucket).max(50),
  otherCount: decimalCountSchema,
});
export const activityDataSchema = z.strictObject({
  scope: z.enum(['own', 'dataset', 'platform']),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  total: decimalCountSchema,
  byDay: z.array(bucket).max(367),
  filters: z.array(bucket).max(50),
});
export const activityResponseSchema = z.strictObject({
  data: activityDataSchema,
});
export const datasetAnalyticsResponseSchema = z.strictObject({
  data: z.strictObject({
    datasetId: z.uuid(),
    totalRecords: decimalCountSchema,
    byCategory: breakdown,
    byStatus: breakdown,
    growth: z.array(bucket).max(367),
    searchActivity: activityDataSchema,
  }),
});
export const platformAnalyticsResponseSchema = z.strictObject({
  data: z.strictObject({
    datasets: decimalCountSchema,
    totalRecords: decimalCountSchema,
    users: decimalCountSchema,
    activeUsers: decimalCountSchema,
  }),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
