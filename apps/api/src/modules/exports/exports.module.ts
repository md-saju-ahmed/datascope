import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';
@Module({
  imports: [PermissionsModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
