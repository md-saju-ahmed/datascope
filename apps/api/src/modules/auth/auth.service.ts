import { Injectable } from '@nestjs/common';
import type { LoginRequest, RegisterRequest } from '@datascope/contracts';
import { AuthRepository } from './auth.repository.js';
import { PasswordService } from './password.service.js';
import { AuthRateLimit } from './auth-rate-limit.js';
import { AuthFailure } from './auth-http.js';
import { tokenHash } from './auth-security.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly limits: AuthRateLimit,
  ) {}

  limitIp(action: 'login' | 'register', address: string | undefined): void {
    this.limits.consume(
      `${action}-ip:${address ?? 'unknown'}`,
      action === 'login' ? 10 : 5,
      action === 'login' ? 60000 : 3600000,
    );
  }

  async register(body: RegisterRequest) {
    return this.repository.register(
      body.email,
      await this.passwords.hash(body.password),
    );
  }

  async login(body: LoginRequest, previousToken: string | undefined) {
    this.limits.consume(`login-account:${tokenHash(body.email)}`, 5, 900000);
    const account = await this.repository.credentials(body.email);
    const matches = await this.passwords.matches(
      account?.passwordHash,
      body.password,
    );
    if (!matches || !account?.isActive)
      throw new AuthFailure(
        401,
        'INVALID_CREDENTIALS',
        'Unable to sign in with those credentials',
      );
    return this.repository.createSession(
      account.id,
      account.passwordHash,
      previousToken,
    );
  }
}
