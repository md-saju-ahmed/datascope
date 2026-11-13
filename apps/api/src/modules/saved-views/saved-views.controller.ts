import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  viewCreateSchema,
  viewPatchSchema,
  viewListQuerySchema,
  viewApplySchema,
  shareRequestSchema,
  uuidParamSchema,
  logoutRequestSchema,
} from '@datascope/contracts';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MutationGuard } from '../auth/mutation.guard.js';
import { principal } from '../../common/access.js';
import { SearchService } from '../search/search.service.js';
import { SavedViewsService } from './saved-views.service.js';
@Controller('saved-views')
@UseGuards(SessionGuard, MutationGuard)
export class SavedViewsController {
  constructor(
    private readonly service: SavedViewsService,
    private readonly search: SearchService,
  ) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.list(
      principal(req),
      validated(viewListQuerySchema, query),
    );
  }
  @Post() create(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.service.create(
      principal(req),
      validated(viewCreateSchema, body),
    );
  }
  @Get(':viewId') get(@Req() req: AuthRequest, @Param('viewId') id: string) {
    return this.service.get(principal(req), validated(uuidParamSchema, id));
  }
  @Patch(':viewId') patch(
    @Req() req: AuthRequest,
    @Param('viewId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.patch(
      principal(req),
      validated(uuidParamSchema, id),
      validated(viewPatchSchema, body),
    );
  }
  @Delete(':viewId') remove(
    @Req() req: AuthRequest,
    @Param('viewId') id: string,
    @Body() body: unknown,
  ) {
    validated(logoutRequestSchema, body);
    return this.service.remove(principal(req), validated(uuidParamSchema, id));
  }
  @Post(':viewId/apply') @HttpCode(200) apply(
    @Req() req: AuthRequest,
    @Param('viewId') id: string,
    @Body() body: unknown,
  ) {
    return this.search.applyView(
      principal(req),
      validated(uuidParamSchema, id),
      validated(viewApplySchema, body),
    );
  }
  @Post(':viewId/shares') share(
    @Req() req: AuthRequest,
    @Param('viewId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.share(
      principal(req),
      validated(uuidParamSchema, id),
      validated(shareRequestSchema, body).userId,
    );
  }
  @Delete(':viewId/shares/:userId') revoke(
    @Req() req: AuthRequest,
    @Param('viewId') id: string,
    @Param('userId') userId: string,
    @Body() body: unknown,
  ) {
    validated(logoutRequestSchema, body);
    return this.service.share(
      principal(req),
      validated(uuidParamSchema, id),
      validated(uuidParamSchema, userId),
      true,
    );
  }
}
