import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';
import { EnvironmentModule } from './config/environment.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [EnvironmentModule, DatabaseModule, HealthModule, AuthModule],
})
export class AppModule {}
