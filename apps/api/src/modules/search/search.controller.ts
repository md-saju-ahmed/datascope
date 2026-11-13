import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { searchRequestSchema, uuidParamSchema } from '@datascope/contracts';
import { DatasetAction, principal } from '../../common/access.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AuthSecurity } from '../auth/auth-security.js';
import { AuthFailure, validated } from '../auth/auth-http.js';
import type { AuthRequest } from '../auth/auth-http.js';
import { DatasetAccessGuard } from '../permissions/access.guards.js';
import { SearchService } from './search.service.js';

@Controller('datasets/:datasetId/search')
@UseGuards(SessionGuard, DatasetAccessGuard)
@DatasetAction('read')
export class SearchController {
  constructor(
    private readonly service: SearchService,
    private readonly security: AuthSecurity,
  ) {}
  @Post()
  @HttpCode(200)
  search(
    @Req() request: AuthRequest,
    @Param('datasetId') datasetId: string,
    @Body() body: unknown,
  ) {
    this.security.assertCsrf(request);
    const intent = request.headers['x-search-intent'];
    if (intent !== undefined && intent !== 'apply')
      throw new AuthFailure(400, 'VALIDATION_ERROR', 'Invalid search intent');
    return this.service.search(
      principal(request),
      validated(uuidParamSchema, datasetId),
      validated(searchRequestSchema, body),
      intent === 'apply',
    );
  }
}
