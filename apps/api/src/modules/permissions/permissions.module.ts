import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PermissionsService } from './permissions.service.js';
import { SecurityAudit } from './security-audit.service.js';
import { DatasetAccessGuard, RolesGuard } from './access.guards.js';

@Module({
  imports: [AuthModule],
  providers: [
    PermissionsService,
    SecurityAudit,
    DatasetAccessGuard,
    RolesGuard,
  ],
  exports: [
    AuthModule,
    PermissionsService,
    SecurityAudit,
    DatasetAccessGuard,
    RolesGuard,
  ],
})
export class PermissionsModule {}
