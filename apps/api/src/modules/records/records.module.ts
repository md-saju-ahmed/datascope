import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { RecordsController } from './records.controller.js';
import { RecordsService } from './records.service.js';

@Module({
  imports: [PermissionsModule],
  controllers: [RecordsController],
  providers: [RecordsService],
})
export class RecordsModule {}
