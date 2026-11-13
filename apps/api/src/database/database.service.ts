import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, sql } from '@datascope/db';
import { APP_ENVIRONMENT } from '../config/environment.js';
import type { AppEnvironment } from '../config/environment.js';

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly pool;
  readonly db;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(APP_ENVIRONMENT) environment: AppEnvironment) {
    const database = createDatabase({
      connectionString: environment.DATABASE_URL,
      max: environment.DB_POOL_MAX,
      connectionTimeoutMillis: environment.DB_CONNECTION_TIMEOUT_MS,
      statementTimeoutMillis: environment.DB_STATEMENT_TIMEOUT_MS,
    });
    this.pool = database.pool;
    this.db = database.db;
    // Idle connection failures must not crash the API or expose connection details.
    this.pool.on('error', () => {
      this.logger.warn('Database connection unavailable');
    });
  }

  async isReady(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
