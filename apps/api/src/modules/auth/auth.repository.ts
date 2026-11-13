import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { schema, sql } from '@datascope/db';
import { DatabaseService } from '../../database/database.service.js';
import { AuthFailure } from './auth-http.js';
import { sessionLifetimeMs, tokenHash } from './auth-security.js';
import type { CurrentUser } from '@datascope/contracts';

const userProjection = {
  id: schema.users.id,
  email: schema.users.email,
  role: schema.users.role,
};

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async register(email: string, passwordHash: string): Promise<CurrentUser> {
    const [user] = await this.database.db
      .insert(schema.users)
      .values({ email, passwordHash, role: 'viewer', isActive: true })
      .onConflictDoNothing()
      .returning(userProjection);
    if (!user)
      throw new AuthFailure(
        409,
        'REGISTRATION_CONFLICT',
        'Unable to register this account',
      );
    return user;
  }

  async credentials(email: string) {
    return this.database.db.query.users.findFirst({
      columns: { id: true, email: true, passwordHash: true, isActive: true },
      where: sql`lower(${schema.users.email}) = ${email}`,
    });
  }

  async createSession(
    userId: string,
    verifiedHash: string,
    previousToken: string | undefined,
  ) {
    return this.database.db.transaction(async (db) => {
      // Serialize with account updates and recheck after password verification.
      const [user] = await db
        .select(userProjection)
        .from(schema.users)
        .where(
          sql`${schema.users.id} = ${userId} and ${schema.users.isActive} = true and ${schema.users.passwordHash} = ${verifiedHash}`,
        )
        .for('update');
      if (!user)
        throw new AuthFailure(
          401,
          'INVALID_CREDENTIALS',
          'Unable to sign in with those credentials',
        );
      if (previousToken)
        await db
          .update(schema.authSessions)
          .set({ revokedAt: new Date() })
          .where(
            sql`${schema.authSessions.tokenHash} = ${tokenHash(previousToken)} and ${schema.authSessions.revokedAt} is null`,
          );
      const token = randomBytes(32).toString('hex');
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + sessionLifetimeMs);
      await db
        .insert(schema.authSessions)
        .values({ userId, tokenHash: tokenHash(token), createdAt, expiresAt });
      return { user, token, expiresAt };
    });
  }

  async principal(token: string) {
    const [result] = await this.database.db
      .select({ user: userProjection, sessionId: schema.authSessions.id })
      .from(schema.authSessions)
      .innerJoin(
        schema.users,
        sql`${schema.authSessions.userId} = ${schema.users.id}`,
      )
      .where(
        sql`${schema.authSessions.tokenHash} = ${tokenHash(token)} and ${schema.authSessions.revokedAt} is null and ${schema.authSessions.expiresAt} > now() and ${schema.users.isActive} = true`,
      )
      .limit(1);
    return result;
  }

  async revoke(sessionId: string): Promise<void> {
    await this.database.db
      .update(schema.authSessions)
      .set({ revokedAt: new Date() })
      .where(
        sql`${schema.authSessions.id} = ${sessionId} and ${schema.authSessions.revokedAt} is null`,
      );
  }
}
