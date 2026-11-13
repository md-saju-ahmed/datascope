import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { EnvironmentModule } from './config/environment.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatasetsModule } from './modules/datasets/datasets.module.js';
import { RecordsModule } from './modules/records/records.module.js';

@Module({
  imports: [
    EnvironmentModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    DatasetsModule,
    RecordsModule,
  ],
})
export class AppModule {}
