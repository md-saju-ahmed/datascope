import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthRepository } from './auth.repository.js';
import { AuthSecurity } from './auth-security.js';
import { AuthFailure } from './auth-http.js';
import type { AuthRequest } from './auth-http.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly repository: AuthRepository,
    private readonly security: AuthSecurity,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = this.security.session(request);
    const result = token ? await this.repository.principal(token) : undefined;
    if (!result)
      throw new AuthFailure(401, 'UNAUTHENTICATED', 'Authentication required');
    request.principal = result.user;
    request.sessionId = result.sessionId;
    return true;
  }
}
