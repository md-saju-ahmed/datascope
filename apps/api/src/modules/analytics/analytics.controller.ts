import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  analyticsQuerySchema,
  activityQuerySchema,
  uuidParamSchema,
} from '@datascope/contracts';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { principal } from '../../common/access.js';
import { AnalyticsService } from './analytics.service.js';
@Controller()
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}
  @Get('datasets/:datasetId/analytics') dataset(
    @Req() req: AuthRequest,
    @Param('datasetId') id: string,
    @Query() query: unknown,
  ) {
    return this.service.dataset(
      principal(req),
      validated(uuidParamSchema, id),
      validated(analyticsQuerySchema, query),
    );
  }
  @Get('analytics/platform') platform(@Req() req: AuthRequest) {
    return this.service.platform(principal(req));
  }
  @Get('analytics/search-activity') activity(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.service.activity(
      principal(req),
      validated(activityQuerySchema, query),
    );
  }
}
