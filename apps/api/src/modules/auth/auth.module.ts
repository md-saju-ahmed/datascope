import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AuthSecurity } from './auth-security.js';
import { AuthRateLimit } from './auth-rate-limit.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { AuthService } from './auth.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthSecurity,
    AuthRateLimit,
    PasswordService,
    SessionGuard,
    AuthService,
  ],
  exports: [SessionGuard, AuthSecurity, AuthRepository],
})
export class AuthModule {}
