import { z } from 'zod';

export const livenessResponseSchema = z.strictObject({
  status: z.literal('ok'),
});
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;
