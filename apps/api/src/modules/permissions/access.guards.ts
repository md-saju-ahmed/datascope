import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { uuidParamSchema } from '@datascope/contracts';
import type { CurrentUser, Permission } from '@datascope/contracts';
import type { AuthRequest } from '../auth/auth-http.js';
import { validated } from '../auth/auth-http.js';
import {
  rolesMetadata,
  datasetActionMetadata,
  principal,
  forbidden,
} from '../../common/access.js';
import { PermissionsService } from './permissions.service.js';

interface ResourceRequest extends AuthRequest {
  params: Record<string, unknown>;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<
      CurrentUser['role'][] | undefined
    >(rolesMetadata, [context.getHandler(), context.getClass()]);
    const user = await this.permissions.current(
      principal(context.switchToHttp().getRequest<AuthRequest>()),
    );
    if (roles && !roles.includes(user.role)) forbidden();
    return true;
  }
}

@Injectable()
export class DatasetAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ResourceRequest>();
    const action = this.reflector.getAllAndOverride<Permission>(
      datasetActionMetadata,
      [context.getHandler(), context.getClass()],
    );
    await this.permissions.dataset(
      principal(request),
      validated(uuidParamSchema, request.params.datasetId),
      action,
    );
    return true;
  }
}
