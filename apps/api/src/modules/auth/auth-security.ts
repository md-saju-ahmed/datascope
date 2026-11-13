import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { APP_ENVIRONMENT } from '../../config/environment.js';
import type { AppEnvironment } from '../../config/environment.js';
import { AuthFailure } from './auth-http.js';

export const sessionLifetimeMs = 24 * 60 * 60 * 1000;
export const opaquePattern = /^[0-9a-f]{64}$/;
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Opaque values use only hex, so no URL decoding or arbitrary cookie deserialization.
// Duplicate cookies are rejected rather than resolving ambiguous domain/path values.
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  const entries = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  const value =
    entries.length === 1 ? entries[0]?.slice(name.length + 1) : undefined;
  return value && opaquePattern.test(value) ? value : undefined;
}

@Injectable()
export class AuthSecurity {
  // A restart requires CSRF bootstrap again, but does not invalidate DB sessions.
  // This initial deployment has one API process; multi-instance keys need shared configuration.
  private readonly csrfKey = randomBytes(32);
  readonly sessionCookie: string;
  readonly csrfCookie: string;
  private readonly secure: boolean;

  constructor(
    @Inject(APP_ENVIRONMENT) private readonly environment: AppEnvironment,
  ) {
    this.secure = environment.NODE_ENV === 'production';
    this.sessionCookie = this.secure
      ? '__Host-datascope_session'
      : 'datascope_session';
    this.csrfCookie = this.secure ? '__Host-datascope_csrf' : 'datascope_csrf';
  }

  session(request: IncomingMessage): string | undefined {
    return readCookie(request.headers.cookie, this.sessionCookie);
  }

  assertOrigin(request: IncomingMessage, required: boolean): void {
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    if (request.headers['sec-fetch-site'] === 'cross-site') this.denied();
    if (origin !== undefined) {
      if (origin !== this.environment.APP_ORIGIN) this.denied();
    } else if (referer !== undefined) {
      try {
        if (new URL(referer).origin !== this.environment.APP_ORIGIN)
          this.denied();
      } catch {
        this.denied();
      }
    } else if (required) this.denied();
  }

  private signature(nonce: string, session: string | undefined): string {
    // Fixed-length components avoid ambiguous concatenation; never expose session identifiers.
    return createHmac('sha256', this.csrfKey)
      .update(`${session ? tokenHash(session) : 'anonymous'}:${nonce}`)
      .digest('hex');
  }

  issueCsrf(
    response: ServerResponse,
    session: string | undefined,
    existingNonce?: string,
  ): string {
    const nonce = existingNonce ?? randomBytes(32).toString('hex');
    this.cookie(response, this.csrfCookie, nonce, sessionLifetimeMs);
    return `${nonce}.${this.signature(nonce, session)}`;
  }

  assertCsrf(request: IncomingMessage): void {
    this.assertOrigin(request, true);
    const header = request.headers['x-csrf-token'];
    const nonce = readCookie(request.headers.cookie, this.csrfCookie);
    if (
      typeof header !== 'string' ||
      !/^[0-9a-f]{64}\.[0-9a-f]{64}$/.test(header) ||
      !nonce
    )
      this.denied();
    const [submittedNonce, signature] = header.split('.');
    const expected = this.signature(nonce, this.session(request));
    if (
      submittedNonce !== nonce ||
      !signature ||
      !timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    )
      this.denied();
    if (
      request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !==
      'application/json'
    ) {
      throw new AuthFailure(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Use application/json',
      );
    }
  }

  setSession(response: ServerResponse, token: string): void {
    this.cookie(response, this.sessionCookie, token, sessionLifetimeMs);
  }

  clearSession(response: ServerResponse): void {
    this.cookie(response, this.sessionCookie, '', 0);
  }

  private cookie(
    response: ServerResponse,
    name: string,
    value: string,
    lifetime: number,
  ): void {
    const existing = response.getHeader('Set-Cookie');
    const cookies =
      typeof existing === 'string'
        ? [existing]
        : Array.isArray(existing)
          ? existing.map(String)
          : [];
    cookies.push(
      `${name}=${value}; Max-Age=${String(lifetime / 1000)}; Expires=${new Date(lifetime ? Date.now() + lifetime : 0).toUTCString()}; Path=/; HttpOnly; SameSite=Lax${this.secure ? '; Secure' : ''}`,
    );
    response.setHeader('Set-Cookie', cookies);
  }

  private denied(): never {
    throw new AuthFailure(403, 'CSRF_REJECTED', 'Request verification failed');
  }
}
