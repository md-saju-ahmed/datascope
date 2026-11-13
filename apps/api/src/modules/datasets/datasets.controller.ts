import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  datasetCreateSchema,
  datasetListQuerySchema,
  datasetPatchSchema,
  fieldCreateSchema,
  fieldPatchSchema,
  pageQuerySchema,
  permissionWriteSchema,
  uuidParamSchema,
} from '@datascope/contracts';
import { Roles, principal } from '../../common/access.js';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { AuthSecurity } from '../auth/auth-security.js';
import { SessionGuard } from '../auth/session.guard.js';
import { RolesGuard } from '../permissions/access.guards.js';
import { DatasetsService } from './datasets.service.js';

@Controller('datasets')
@UseGuards(SessionGuard, RolesGuard)
export class DatasetsController {
  constructor(
    private readonly service: DatasetsService,
    private readonly security: AuthSecurity,
  ) {}

  @Get()
  list(@Req() request: AuthRequest, @Query() query: unknown) {
    return this.service.list(
      principal(request),
      validated(datasetListQuerySchema, query),
    );
  }

  @Post()
  @Roles('admin')
  create(@Req() request: AuthRequest, @Body() body: unknown) {
    this.security.assertCsrf(request);
    return this.service.create(
      principal(request),
      validated(datasetCreateSchema, body),
    );
  }

  @Get(':datasetId')
  get(@Req() request: AuthRequest, @Param('datasetId') id: string) {
    return this.service.get(principal(request), validated(uuidParamSchema, id));
  }

  @Patch(':datasetId')
  @Roles('admin')
  patch(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Body() body: unknown,
  ) {
    this.security.assertCsrf(request);
    return this.service.patch(
      principal(request),
      validated(uuidParamSchema, id),
      validated(datasetPatchSchema, body),
    );
  }

  @Delete(':datasetId')
  @Roles('admin')
  archive(@Req() request: AuthRequest, @Param('datasetId') id: string) {
    this.security.assertCsrf(request);
    return this.service.archive(
      principal(request),
      validated(uuidParamSchema, id),
    );
  }

  @Get(':datasetId/fields')
  fields(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Query() query: unknown,
  ) {
    return this.service.fields(
      principal(request),
      validated(uuidParamSchema, id),
      validated(pageQuerySchema, query),
    );
  }

  @Post(':datasetId/fields')
  @Roles('admin')
  createField(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Body() body: unknown,
  ) {
    this.security.assertCsrf(request);
    return this.service.createField(
      principal(request),
      validated(uuidParamSchema, id),
      validated(fieldCreateSchema, body),
    );
  }

  @Patch(':datasetId/fields/:fieldId')
  @Roles('admin')
  patchField(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ) {
    this.security.assertCsrf(request);
    return this.service.patchField(
      principal(request),
      validated(uuidParamSchema, id),
      validated(uuidParamSchema, fieldId),
      validated(fieldPatchSchema, body),
    );
  }

  @Get(':datasetId/permissions')
  @Roles('admin')
  grants(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Query() query: unknown,
  ) {
    return this.service.grants(
      principal(request),
      validated(uuidParamSchema, id),
      validated(pageQuerySchema, query),
    );
  }

  @Put(':datasetId/permissions/:userId')
  @Roles('admin')
  grant(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    this.security.assertCsrf(request);
    return this.service.grant(
      principal(request),
      validated(uuidParamSchema, id),
      validated(uuidParamSchema, userId),
      validated(permissionWriteSchema, body).permission,
    );
  }

  @Delete(':datasetId/permissions/:userId')
  @Roles('admin')
  revoke(
    @Req() request: AuthRequest,
    @Param('datasetId') id: string,
    @Param('userId') userId: string,
  ) {
    this.security.assertCsrf(request);
    return this.service.revoke(
      principal(request),
      validated(uuidParamSchema, id),
      validated(uuidParamSchema, userId),
    );
  }
}
