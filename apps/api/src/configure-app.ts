import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthExceptionFilter } from './modules/auth/auth-http.js';
import { requestContext } from './common/request-context.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');
  // Also handles malformed JSON rejected before routing to a controller.
  app.useGlobalFilters(new AuthExceptionFilter());
  app.use(
    (request: IncomingMessage, response: ServerResponse, next: () => void) => {
      const requestId = randomUUID();
      if (
        /^\/api\/v1\/datasets\/[^/?]+\/search(?:\?|$)/i.test(request.url ?? '')
      ) {
        const started = Date.now();
        response.once('finish', () => {
          new Logger('SearchHttp').log(
            JSON.stringify({
              event: 'search_request',
              requestId,
              statusCode: response.statusCode,
              durationMs: Date.now() - started,
            }),
          );
        });
      }
      response.setHeader('X-Request-Id', requestId);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (/^\/api\/v1(?:\/|\?|$)/i.test(request.url ?? '')) {
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Pragma', 'no-cache');
        response.setHeader('Referrer-Policy', 'no-referrer');
      }
      requestContext.run({ requestId }, next);
    },
  );
}
