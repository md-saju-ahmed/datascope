import { z } from 'zod';

export const livenessResponseSchema = z.strictObject({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessResponseSchema = z.strictObject({
  status: z.literal('ok'),
  database: z.literal('up'),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
