import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module.js';
import { SearchHistoryService } from './search-history.service.js';
import { SearchHistoryController } from './search-history.controller.js';
@Module({
  imports: [PermissionsModule],
  controllers: [SearchHistoryController],
  providers: [SearchHistoryService],
})
export class SearchHistoryModule {}
