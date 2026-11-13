import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from './auth-http.js';
import { AuthSecurity } from './auth-security.js';
@Injectable()
export class MutationGuard implements CanActivate {
  constructor(private readonly security: AuthSecurity) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method ?? ''))
      this.security.assertCsrf(request);
    return true;
  }
}
