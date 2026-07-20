import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { scrubSecrets } from '../logging/scrub-secrets.util';

/**
 * Global exception filter — safe error normalization.
 *
 * Registered as an APP_FILTER, so it composes with the global guard chain
 * (JwtAuthGuard → PasswordResetGuard → PermissionsGuard) and catches whatever
 * they throw. The guards throw framework `HttpException`s
 * (`UnauthorizedException`, `ForbiddenException`), which this filter passes
 * through UNCHANGED — the deny-by-default 401/403 contract the frontend relies
 * on is preserved exactly.
 *
 * Two paths:
 *
 *   1. HttpException — serialize it byte-for-byte the way Nest's built-in
 *      filter does. The frontend already depends on the concrete shapes
 *      (`{ statusCode, message }`, `{ code: 'PASSWORD_CHANGE_REQUIRED' }`, …),
 *      so this must not reshape the body: an object response is sent as-is, a
 *      string response is wrapped as `{ statusCode, message }`.
 *
 *   2. Anything else (a thrown `Error`, a rejected DB/Redis promise, a bug) —
 *      the full error is logged server-side and the client gets a stable,
 *      generic 500. In production the body never carries the message or stack,
 *      so DB errors and internals cannot leak; in development the error name and
 *      message are echoed to make debugging bearable. The stack is only ever
 *      written to the log, never to the response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // (1) Preserve HttpExceptions exactly as Nest would serialize them.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Mirror Nest's BaseExceptionFilter: object bodies pass through verbatim,
      // string bodies are wrapped into the canonical envelope.
      const payload =
        typeof body === 'object' && body !== null
          ? body
          : { statusCode: status, message: body };
      response.status(status).json(payload);
      return;
    }

    // (2) Unexpected error: log everything server-side, redact for the client.
    const isProduction = process.env.NODE_ENV === 'production';
    const error = exception instanceof Error ? exception : undefined;

    // No bodies, headers, or cookies are interpolated here — but this IS a
    // free-text string, and pino's redact (see pino-logger.options.ts) only
    // strips structured object key paths, not substrings inside a message.
    // A driver/client error's OWN text can still embed a real credential (a
    // connection URL's user:pass@host, an echoed Bearer token) — scrubSecrets
    // is a narrow, pattern-based pass over exactly that residual risk, not a
    // general guarantee that nothing secret can ever appear here.
    this.logger.error(
      scrubSecrets(
        `Unhandled exception on ${request.method} ${request.url}: ${
          error ? `${error.name}: ${error.message}` : String(exception)
        }`,
      ),
      error?.stack ? scrubSecrets(error.stack) : undefined,
    );

    const payload: Record<string, unknown> = {
      statusCode: 500,
      message: 'Internal server error',
    };

    if (!isProduction && error) {
      // Enough to debug locally, still no stack in the response body.
      payload.error = error.name;
      payload.message = error.message;
    }

    response.status(500).json(payload);
  }
}
