import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export interface DatabaseOptions {
  connectionString: string;
  max: number;
  connectionTimeoutMillis: number;
  statementTimeoutMillis: number;
}

export function createDatabase(options: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    connectionTimeoutMillis: options.connectionTimeoutMillis,
    idleTimeoutMillis: 30000,
    statement_timeout: options.statementTimeoutMillis,
    query_timeout: options.statementTimeoutMillis + 500,
    application_name: 'datascope-api',
  });
  return { pool, db: drizzle(pool) };
}
