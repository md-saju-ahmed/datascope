import { z } from 'zod';
import { currentUserSchema } from './auth.js';
import { pageQuerySchema, pageInfoSchema } from './datasets.js';
export const usersQuerySchema = pageQuerySchema.extend({
  q: z
    .string()
    .trim()
    .max(200)
    .refine((value) => !value.includes('\0'))
    .default(''),
});
export const userPatchSchema = z
  .strictObject({
    role: currentUserSchema.shape.role.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const managedUserSchema = currentUserSchema.extend({
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const usersResponseSchema = z.strictObject({
  data: z.array(managedUserSchema).max(100),
  pageInfo: pageInfoSchema,
});
export const userResponseSchema = z.strictObject({ data: managedUserSchema });
export const preferencesSchema = z.strictObject({
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  defaultPageSize: z
    .union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)])
    .default(25),
  defaultDatasetId: z.uuid().nullable().default(null),
});
export const preferencePatchSchema = z
  .strictObject({
    density: preferencesSchema.shape.density.unwrap().optional(),
    defaultPageSize: preferencesSchema.shape.defaultPageSize
      .unwrap()
      .optional(),
    defaultDatasetId: preferencesSchema.shape.defaultDatasetId
      .unwrap()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const preferencesResponseSchema = z.strictObject({
  data: preferencesSchema,
});
export const settingsSchema = z.strictObject({
  'registration.enabled': z.boolean().default(true),
  'exports.max_selected_rows': z.number().int().min(1).max(1000).default(1000),
});
export const settingsPatchSchema = z
  .strictObject({
    'registration.enabled': settingsSchema.shape['registration.enabled']
      .unwrap()
      .optional(),
    'exports.max_selected_rows': settingsSchema.shape[
      'exports.max_selected_rows'
    ]
      .unwrap()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const settingsResponseSchema = z.strictObject({ data: settingsSchema });
export type UsersQuery = z.infer<typeof usersQuerySchema>;
export type UserPatch = z.infer<typeof userPatchSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferencePatch = z.infer<typeof preferencePatchSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
