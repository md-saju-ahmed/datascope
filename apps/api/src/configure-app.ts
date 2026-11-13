import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthExceptionFilter } from './modules/auth/auth-http.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  // Also handles malformed JSON rejected before routing to a controller.
  app.useGlobalFilters(new AuthExceptionFilter());
  app.use(
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      response.setHeader('X-Request-Id', randomUUID());
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (/^\/api\/v1\/auth(?:\/|\?|$)/i.test(request.url ?? '')) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Referrer-Policy', 'no-referrer');
      }
      next();
    },
  );
}
