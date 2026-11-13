import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ManagementController } from './management.controller.js';
import { ManagementService } from './management.service.js';
@Module({
  imports: [PermissionsModule],
  controllers: [ManagementController],
  providers: [ManagementService],
})
export class ManagementModule {}
