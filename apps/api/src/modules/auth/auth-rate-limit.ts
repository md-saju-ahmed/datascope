import { Injectable } from '@nestjs/common';
import { AuthFailure } from './auth-http.js';

interface Window {
  count: number;
  expires: number;
}

// Synchronous reservation makes concurrent attempts count before any password work.
// Fail closed at capacity; never evict an active limit to admit another identity.
export class RateWindows {
  private readonly windows = new Map<string, Window>();
  constructor(private readonly capacity = 10000) {}

  consume(
    key: string,
    limit: number,
    periodMs: number,
    now = Date.now(),
  ): number {
    for (const [entry, window] of this.windows) {
      if (window.expires <= now) this.windows.delete(entry);
    }
    const current = this.windows.get(key);
    if (current) {
      if (current.count >= limit)
        return Math.max(1, Math.ceil((current.expires - now) / 1000));
      current.count++;
    } else {
      if (this.windows.size >= this.capacity) return 60;
      this.windows.set(key, { count: 1, expires: now + periodMs });
    }
    return 0;
  }
}

@Injectable()
export class AuthRateLimit {
  private readonly windows = new RateWindows();

  consume(key: string, limit: number, periodMs: number): void {
    const retryAfter = this.windows.consume(key, limit, periodMs);
    if (retryAfter) {
      throw new AuthFailure(
        429,
        'RATE_LIMITED',
        'Too many attempts; try again later',
        [{ field: 'retryAfterSeconds', message: String(retryAfter) }],
        retryAfter,
      );
    }
  }
}
