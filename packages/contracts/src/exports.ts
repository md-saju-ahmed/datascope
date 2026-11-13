import { z } from 'zod';
import { recordIdSchema } from './datasets.js';
import { searchFieldKeySchema } from './search.js';
export const selectedExportSchema = z.strictObject({
  recordIds: z
    .array(recordIdSchema)
    .min(1)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
  columns: z
    .array(searchFieldKeySchema)
    .min(1)
    .max(100)
    .refine((keys) => new Set(keys).size === keys.length),
});
export type SelectedExport = z.infer<typeof selectedExportSchema>;
