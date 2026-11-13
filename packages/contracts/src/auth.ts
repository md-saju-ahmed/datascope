import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const boundedPassword = z
  .string()
  .max(128)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 128,
    'Password must be at most 128 UTF-8 bytes',
  );

export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: boundedPassword.min(16),
});
export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: boundedPassword.min(1),
});
export const logoutRequestSchema = z.strictObject({});
export const currentUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(['admin', 'analyst', 'viewer']),
});
export const authUserResponseSchema = z.strictObject({
  data: currentUserSchema,
});
export const csrfResponseSchema = z.strictObject({
  csrfToken: z.string().regex(/^[0-9a-f]{64}\.[0-9a-f]{64}$/),
});
export const loginResponseSchema = z.strictObject({
  data: currentUserSchema,
  csrfToken: csrfResponseSchema.shape.csrfToken,
  expiresAt: z.iso.datetime(),
});
export const logoutResponseSchema = z.strictObject({
  data: z.strictObject({ loggedOut: z.literal(true) }),
  csrfToken: csrfResponseSchema.shape.csrfToken,
});
export const apiErrorSchema = z.strictObject({
  code: z.string(),
  message: z.string(),
  details: z.array(z.strictObject({ field: z.string(), message: z.string() })),
  requestId: z.uuid(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type AuthUserResponse = z.infer<typeof authUserResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
export type CsrfResponse = z.infer<typeof csrfResponseSchema>;
