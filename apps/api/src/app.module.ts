import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { EnvironmentModule } from './config/environment.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DatasetsModule } from './modules/datasets/datasets.module.js';
import { RecordsModule } from './modules/records/records.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { SavedViewsModule } from './modules/saved-views/saved-views.module.js';
import { SearchHistoryModule } from './modules/search-history/search-history.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { ManagementModule } from './modules/management/management.module.js';
import { ExportsModule } from './modules/exports/exports.module.js';

@Module({
  imports: [
    EnvironmentModule,
    DatabaseModule,
    HealthModule,
    AuthModule,
    DatasetsModule,
    RecordsModule,
    SearchModule,
    SavedViewsModule,
    SearchHistoryModule,
    AnalyticsModule,
    ManagementModule,
    ExportsModule,
  ],
})
export class AppModule {}
