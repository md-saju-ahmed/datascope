import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { selectedExportSchema, uuidParamSchema } from '@datascope/contracts';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MutationGuard } from '../auth/mutation.guard.js';
import { principal } from '../../common/access.js';
import { ExportsService } from './exports.service.js';
@Controller('datasets/:datasetId/exports')
@UseGuards(SessionGuard, MutationGuard)
export class ExportsController {
  constructor(private readonly service: ExportsService) {}
  @Post('selected') @HttpCode(200) async selected(
    @Req() req: AuthRequest,
    @Param('datasetId') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    const csv = await this.service.selected(
      principal(req),
      validated(uuidParamSchema, id),
      validated(selectedExportSchema, body),
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      'attachment; filename="datascope-selected.csv"',
    );
    return csv;
  }
}
