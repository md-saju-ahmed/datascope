import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { DatasetsService } from './datasets.service.js';
import { DatasetsController } from './datasets.controller.js';

@Module({
  imports: [PermissionsModule],
  controllers: [DatasetsController],
  providers: [DatasetsService],
})
export class DatasetsModule {}
