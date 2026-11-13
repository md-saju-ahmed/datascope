import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import {
  loginRequestSchema,
  logoutRequestSchema,
  registerRequestSchema,
} from '@datascope/contracts';
import type {
  AuthUserResponse,
  CsrfResponse,
  LoginResponse,
  LogoutResponse,
} from '@datascope/contracts';
import { AuthExceptionFilter, AuthFailure, validated } from './auth-http.js';
import type { AuthRequest } from './auth-http.js';
import { AuthSecurity, readCookie } from './auth-security.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { SessionGuard } from './session.guard.js';

@Controller('auth')
@UseFilters(AuthExceptionFilter)
export class AuthController {
  constructor(
    private readonly repository: AuthRepository,
    private readonly security: AuthSecurity,
    private readonly service: AuthService,
  ) {}

  @Get('csrf')
  csrf(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): CsrfResponse {
    this.security.assertOrigin(request, false);
    return {
      csrfToken: this.security.issueCsrf(
        response,
        this.security.session(request),
        readCookie(request.headers.cookie, this.security.csrfCookie),
      ),
    };
  }

  @Post('register')
  async register(
    @Body() input: unknown,
    @Req() request: AuthRequest,
  ): Promise<AuthUserResponse> {
    this.security.assertCsrf(request);
    this.service.limitIp('register', request.socket.remoteAddress);
    return {
      data: await this.service.register(
        validated(registerRequestSchema, input),
      ),
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() input: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<LoginResponse> {
    this.security.assertCsrf(request);
    this.service.limitIp('login', request.socket.remoteAddress);
    const session = await this.service.login(
      validated(loginRequestSchema, input),
      this.security.session(request),
    );
    this.security.setSession(response, session.token);
    return {
      data: session.user,
      expiresAt: session.expiresAt.toISOString(),
      csrfToken: this.security.issueCsrf(response, session.token),
    };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthRequest): AuthUserResponse {
    if (!request.principal)
      throw new AuthFailure(401, 'UNAUTHENTICATED', 'Authentication required');
    return { data: request.principal };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async logout(
    @Body() input: unknown,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<LogoutResponse> {
    this.security.assertCsrf(request);
    validated(logoutRequestSchema, input);
    if (!request.sessionId)
      throw new AuthFailure(401, 'UNAUTHENTICATED', 'Authentication required');
    await this.repository.revoke(request.sessionId);
    this.security.clearSession(response);
    return {
      data: { loggedOut: true },
      csrfToken: this.security.issueCsrf(response, undefined),
    };
  }
}
