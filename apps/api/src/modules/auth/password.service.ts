import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const options = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return hash(password, options);
  }

  async matches(
    encoded: string | undefined,
    password: string,
  ): Promise<boolean> {
    const usable = encoded?.startsWith('$argon2id$') ? encoded : undefined;
    try {
      const result = await verify(usable ?? this.dummyHash, password);
      return usable !== undefined && result;
    } catch {
      return false;
    }
  }
}
