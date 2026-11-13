import { z } from 'zod';

export const permissionSchema = z.enum(['read', 'analyze', 'manage']);
export const uuidParamSchema = z.uuid();
export const recordIdSchema = z
  .string()
  .regex(/^[1-9][0-9]{0,18}$/)
  .refine(
    (value) =>
      /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n,
    'Record ID is out of range',
  );
export const decimalCountSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
export const pageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(4000).default(1),
  pageSize: z.coerce
    .number()
    .pipe(
      z.union([z.literal(10), z.literal(25), z.literal(50), z.literal(100)]),
    )
    .default(25),
});
export const datasetListQuerySchema = pageQuerySchema.extend({
  includeArchived: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
});
export const pageInfoSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});
const datasetProperties = {
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .max(100)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  description: z.string().max(2000),
  category: z.string().trim().min(1).max(100),
  source: z.string().trim().min(1).max(200),
};
export const datasetCreateSchema = z.strictObject(datasetProperties).extend({
  description: datasetProperties.description.default(''),
  category: datasetProperties.category.default('uncategorized'),
});
export const datasetPatchSchema = z
  .strictObject(datasetProperties)
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one change',
  );
export const datasetSchema = z.strictObject({
  ...datasetProperties,
  id: z.uuid(),
  recordCount: decimalCountSchema,
  isArchived: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  effectivePermission: permissionSchema,
});
export const datasetResponseSchema = z.strictObject({ data: datasetSchema });
export const datasetListResponseSchema = z.strictObject({
  data: z.array(datasetSchema),
  pageInfo: pageInfoSchema,
});

export const fieldDataTypeSchema = z.enum([
  'string',
  'number',
  'date',
  'boolean',
  'enum',
]);
export const fieldOperatorSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
]);
const fieldProperties = {
  fieldKey: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  label: z.string().trim().min(1).max(100),
  dataType: fieldDataTypeSchema,
  operators: z
    .array(fieldOperatorSchema)
    .max(9)
    .refine(
      (items) => new Set(items).size === items.length,
      'Duplicate operators',
    ),
  isSearchable: z.boolean(),
  isFilterable: z.boolean(),
  isSortable: z.boolean(),
  isVisible: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
};
export const fieldDefinitionSchema = z.strictObject(fieldProperties);
export const fieldCreateSchema = fieldDefinitionSchema
  .extend({
    operators: fieldProperties.operators.default([]),
    isSearchable: z.boolean().default(false),
    isFilterable: z.boolean().default(false),
    isSortable: z.boolean().default(false),
    isVisible: z.boolean().default(true),
    sortOrder: fieldProperties.sortOrder.default(0),
  })
  .superRefine((value, context) => {
    const reserved = [
      'id',
      'datasetid',
      'attributes',
      'searchvector',
      'passwordhash',
      'tokenhash',
      '__proto__',
      'prototype',
      'constructor',
      'created_at',
      'updated_at',
    ];
    const hot: Record<string, string> = {
      name: 'string',
      status: 'enum',
      country: 'enum',
      category: 'enum',
      revenue: 'number',
      createdAt: 'date',
      updatedAt: 'date',
    };
    const operators: Record<z.infer<typeof fieldDataTypeSchema>, string[]> = {
      string: ['eq', 'neq', 'contains', 'in'],
      enum: ['eq', 'neq', 'contains', 'in'],
      number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
      date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'in'],
      boolean: ['eq', 'neq', 'in'],
    };
    if (
      reserved.includes(value.fieldKey.toLowerCase()) ||
      (Object.hasOwn(hot, value.fieldKey) &&
        hot[value.fieldKey] !== value.dataType)
    )
      context.addIssue({
        code: 'custom',
        path: ['fieldKey'],
        message: 'Reserved key or incompatible common field type',
      });
    if (
      value.operators.some(
        (operator) => !operators[value.dataType].includes(operator),
      ) ||
      value.isFilterable !== value.operators.length > 0
    )
      context.addIssue({
        code: 'custom',
        path: ['operators'],
        message: 'Operators must match field type and filterability',
      });
    if (value.isSearchable && !['string', 'enum'].includes(value.dataType))
      context.addIssue({
        code: 'custom',
        path: ['isSearchable'],
        message: 'Only text fields can participate in global search',
      });
  });
export const fieldPatchSchema = fieldDefinitionSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one change',
  );
export const datasetFieldSchema = fieldDefinitionSchema.extend({
  id: z.uuid(),
  datasetId: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const fieldResponseSchema = z.strictObject({ data: datasetFieldSchema });
export const fieldListResponseSchema = z.strictObject({
  data: z.array(datasetFieldSchema),
  pageInfo: pageInfoSchema,
});
export const permissionWriteSchema = z.strictObject({
  permission: permissionSchema,
});
export const grantSchema = z.strictObject({
  datasetId: z.uuid(),
  userId: z.uuid(),
  permission: permissionSchema,
  grantedBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const grantResponseSchema = z.strictObject({ data: grantSchema });
export const grantListResponseSchema = z.strictObject({
  data: z.array(grantSchema),
  pageInfo: pageInfoSchema,
});
export const revokedResponseSchema = z.strictObject({
  data: z.strictObject({ revoked: z.literal(true) }),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;
export type PageInfo = z.infer<typeof pageInfoSchema>;
export type DatasetListQuery = z.infer<typeof datasetListQuerySchema>;
export type DatasetCreate = z.infer<typeof datasetCreateSchema>;
export type DatasetPatch = z.infer<typeof datasetPatchSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetField = z.infer<typeof datasetFieldSchema>;
export type FieldCreate = z.infer<typeof fieldCreateSchema>;
export type FieldPatch = z.infer<typeof fieldPatchSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type Grant = z.infer<typeof grantSchema>;
