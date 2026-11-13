import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  pageQuerySchema,
  recordIdSchema,
  uuidParamSchema,
} from '@datascope/contracts';
import { DatasetAction, principal } from '../../common/access.js';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { DatasetAccessGuard } from '../permissions/access.guards.js';
import { RecordsService } from './records.service.js';

@Controller('datasets/:datasetId/records')
@UseGuards(SessionGuard, DatasetAccessGuard)
@DatasetAction('read')
export class RecordsController {
  constructor(private readonly service: RecordsService) {}

  @Get(':recordId')
  detail(
    @Req() request: AuthRequest,
    @Param('datasetId') datasetId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.service.detail(
      principal(request),
      validated(uuidParamSchema, datasetId),
      validated(recordIdSchema, recordId),
    );
  }

  @Get(':recordId/related')
  related(
    @Req() request: AuthRequest,
    @Param('datasetId') datasetId: string,
    @Param('recordId') recordId: string,
    @Query() query: unknown,
  ) {
    return this.service.related(
      principal(request),
      validated(uuidParamSchema, datasetId),
      validated(recordIdSchema, recordId),
      validated(pageQuerySchema, query),
    );
  }

  @Get(':recordId/changes')
  changes(
    @Req() request: AuthRequest,
    @Param('datasetId') datasetId: string,
    @Param('recordId') recordId: string,
    @Query() query: unknown,
  ) {
    return this.service.changes(
      principal(request),
      validated(uuidParamSchema, datasetId),
      validated(recordIdSchema, recordId),
      validated(pageQuerySchema, query),
    );
  }
}
