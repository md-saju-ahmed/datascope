import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  usersQuerySchema,
  userPatchSchema,
  preferencePatchSchema,
  settingsPatchSchema,
  uuidParamSchema,
} from '@datascope/contracts';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MutationGuard } from '../auth/mutation.guard.js';
import { principal } from '../../common/access.js';
import { ManagementService } from './management.service.js';
@Controller()
@UseGuards(SessionGuard, MutationGuard)
export class ManagementController {
  constructor(private readonly service: ManagementService) {}
  @Get('users') users(@Req() req: AuthRequest, @Query() query: unknown) {
    return this.service.users(
      principal(req),
      validated(usersQuerySchema, query),
    );
  }
  @Patch('users/:userId') patchUser(
    @Req() req: AuthRequest,
    @Param('userId') id: string,
    @Body() body: unknown,
  ) {
    return this.service.patchUser(
      principal(req),
      validated(uuidParamSchema, id),
      validated(userPatchSchema, body),
    );
  }
  @Get('preferences/me') preferences(@Req() req: AuthRequest) {
    return this.service.preferences(principal(req));
  }
  @Patch('preferences/me') patchPreferences(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.patchPreferences(
      principal(req),
      validated(preferencePatchSchema, body),
    );
  }
  @Get('system/settings') settings(@Req() req: AuthRequest) {
    return this.service.settings(principal(req));
  }
  @Patch('system/settings') patchSettings(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.patchSettings(
      principal(req),
      validated(settingsPatchSchema, body),
    );
  }
}
