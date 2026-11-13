import { z } from 'zod';

const databaseUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      Boolean(
        url.hostname && url.username && url.password && url.pathname.length > 1,
      ) &&
      !url.hash
    );
  } catch {
    return false;
  }
});

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  DATABASE_URL: databaseUrl,
  API_HOST: z.enum(['127.0.0.1', '0.0.0.0', '::1', '::']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(2000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(3000),
});

export type AppEnvironment = z.infer<typeof environmentSchema>;
export const APP_ENVIRONMENT = Symbol('APP_ENVIRONMENT');

export class EnvironmentError extends Error {
  constructor(fields: string[]) {
    super(`Invalid environment: ${[...new Set(fields)].join(', ')}`);
    this.name = 'EnvironmentError';
  }
}

export function parseEnvironment(
  input: Record<string, unknown>,
): AppEnvironment {
  const result = environmentSchema.safeParse(input);
  if (!result.success) {
    throw new EnvironmentError(
      result.error.issues.map((issue) => issue.path.join('.')),
    );
  }
  return result.data;
}
