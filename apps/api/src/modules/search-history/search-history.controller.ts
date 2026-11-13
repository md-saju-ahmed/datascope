import {
  Body,
  Controller,
  Delete,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { historyQuerySchema, logoutRequestSchema } from '@datascope/contracts';
import { validated } from '../auth/auth-http.js';
import type { AuthRequest } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MutationGuard } from '../auth/mutation.guard.js';
import { principal } from '../../common/access.js';
import { SearchHistoryService } from './search-history.service.js';
@Controller('search-history')
@UseGuards(SessionGuard, MutationGuard)
export class SearchHistoryController {
  constructor(private readonly service: SearchHistoryService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.list(
      principal(req),
      validated(historyQuerySchema, query),
    );
  }
  @Delete() clear(@Req() req: AuthRequest, @Body() body: unknown) {
    validated(logoutRequestSchema, body);
    return this.service.clear(principal(req));
  }
}
