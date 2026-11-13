import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { CurrentUser } from '@datascope/contracts';
import type { z } from 'zod';

export interface AuthRequest extends IncomingMessage {
  principal?: CurrentUser;
  sessionId?: string;
}

export class AuthFailure extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    details: { field: string; message: string }[] = [],
    readonly retryAfter?: number,
  ) {
    super({ code, message, details }, status);
  }
}

export function validated<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AuthFailure(
      400,
      'VALIDATION_ERROR',
      'Invalid request',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: 'Invalid or unsupported value',
      })),
    );
  }
  return result.data;
}

@Catch()
export class AuthExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<ServerResponse>();
    const request = host.switchToHttp().getRequest<IncomingMessage>();
    // Preserve existing health/HTTP contracts outside the new authentication surface.
    if (
      !/^\/api\/v1\/auth(?:\/|\?|$)/i.test(request.url ?? '') &&
      error instanceof HttpException
    ) {
      response.statusCode = error.getStatus();
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      const value = error.getResponse();
      response.end(
        JSON.stringify(
          typeof value === 'string'
            ? { statusCode: error.getStatus(), message: value }
            : value,
        ),
      );
      return;
    }
    let status = 500;
    let body: object = {
      code: 'INTERNAL_ERROR',
      message: 'Request could not be completed',
      details: [],
    };
    if (error instanceof AuthFailure) {
      if (error.retryAfter)
        response.setHeader('Retry-After', String(error.retryAfter));
      status = error.getStatus();
      const value = error.getResponse();
      if (typeof value === 'object') body = value;
    } else if (error instanceof HttpException && error.getStatus() < 500) {
      status = error.getStatus();
      body = {
        code: 'INVALID_REQUEST',
        message: 'Invalid request',
        details: [],
      };
    }
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(
      JSON.stringify({
        ...body,
        requestId: response.getHeader('X-Request-Id') ?? randomUUID(),
      }),
    );
  }
}
