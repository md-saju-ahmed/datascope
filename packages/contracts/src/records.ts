import { z } from 'zod';
import {
  decimalCountSchema,
  pageInfoSchema,
  recordIdSchema,
} from './datasets.js';

export const recordSummarySchema = z.strictObject({
  id: recordIdSchema,
  datasetId: z.uuid(),
  name: z.string(),
  status: z.string().nullable(),
  country: z.string().nullable(),
  category: z.string().nullable(),
  revenue: z
    .string()
    .regex(/^-?[0-9]+\.[0-9]{2}$/)
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const recordDetailSchema = recordSummarySchema.extend({
  attributes: z.record(z.string(), z.unknown()),
});
export const recordResponseSchema = z.strictObject({
  data: recordDetailSchema,
});
export const relatedRecordSchema = z.strictObject({
  relationId: recordIdSchema,
  relationType: z.string(),
  direction: z.enum(['outgoing', 'incoming']),
  record: recordSummarySchema,
});
export const relatedListResponseSchema = z.strictObject({
  data: z.array(relatedRecordSchema),
  pageInfo: pageInfoSchema,
});
export const recordChangeSchema = z.strictObject({
  id: decimalCountSchema,
  recordId: recordIdSchema,
  actorUserId: z.uuid().nullable(),
  changedAt: z.iso.datetime(),
  changes: z.record(z.string(), z.unknown()),
});
export const changesResponseSchema = z.strictObject({
  data: z.array(recordChangeSchema),
  pageInfo: pageInfoSchema,
});
export type RecordSummary = z.infer<typeof recordSummarySchema>;
export type RecordDetail = z.infer<typeof recordDetailSchema>;
export type RelatedRecord = z.infer<typeof relatedRecordSchema>;
export type RecordChange = z.infer<typeof recordChangeSchema>;
