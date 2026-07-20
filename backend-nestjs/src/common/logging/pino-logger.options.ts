import { ConfigService } from '@nestjs/config';
import { Params } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import { REQUEST_ID_CLS_KEY } from './correlation-id.constants';

/**
 * Builds nestjs-pino's `Params` for `LoggerModule.forRootAsync`.
 *
 * `mixin` (a native pino option, not a pino-http one — `pino-http`'s
 * `Options` type extends `pino.LoggerOptions`, so it is accepted here) runs
 * on every log call made by the resulting logger AND every child logger it
 * creates, which includes:
 *   - the automatic request/response lines pino-http emits, and
 *   - every one of this codebase's ~40+ existing `new Logger(Foo.name)` call
 *     sites, once `app.useLogger(app.get(Logger))` is wired in main.ts —
 *     because that makes @nestjs/common's `Logger` delegate to this same
 *     pino instance for every call site with zero per-file changes.
 *
 * `customProps` was the other option nestjs-pino exposes for this, but it
 * only touches pino-http's own auto-emitted completion line, not ad-hoc logs
 * a service emits mid-request — which is most of what actually needs the
 * correlation id. `mixin` is the only mechanism that covers both.
 *
 * SCOPE OF `redact` BELOW: pino's redact targets structured object key paths
 * within a logged object — it has no effect on secrets embedded inside a
 * plain string (see `AllExceptionsFilter`, which handles that separately via
 * `scrubSecrets`). pino-http's default request/response serializers do not
 * include `req.body`/`res.body` today, so the body-shaped paths below are
 * not closing an active leak — they are cheap insurance against the next
 * person who adds body logging for debugging and doesn't think to re-check
 * this list. If you add a new password/token/secret-shaped field to any DTO,
 * add its path here too.
 */
export function createPinoLoggerParams(
  cls: ClsService,
  config: ConfigService,
): Params {
  const nodeEnv = config.get<string>('NODE_ENV');
  const level = config.get<string>('LOG_LEVEL') || 'info';

  return {
    pinoHttp: {
      level,
      // Only in explicit development — pino-pretty is a devDependency and
      // must never be reached for in a production/staging process image, and
      // an unset NODE_ENV must stay on the strict (JSON) path, matching how
      // cors-origin.util.ts treats "unset" as non-permissive rather than
      // defaulting it to development.
      transport:
        nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:standard',
              },
            }
          : undefined,
      // Strip anything that could leak a credential into a log sink: the
      // auth cookie / bearer header on every logged request, and any
      // password-shaped field pino-http's default body/response serializers
      // might otherwise capture.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body.password',
          'req.body.passwordHash',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.token',
          'res.headers["set-cookie"]',
          // Not read from a request body — resetAdminCredentials returns this
          // generated value in its RESPONSE body, the one place it exists.
          // pino-http does not log response bodies by default today, same as
          // request bodies (see the class-level note below), but this path
          // costs nothing to have ready if that ever changes.
          'res.body.temporaryPassword',
        ],
        censor: '[Redacted]',
      },
      mixin() {
        if (!cls.isActive()) {
          return {};
        }
        const requestId = cls.get(REQUEST_ID_CLS_KEY);
        return requestId ? { requestId } : {};
      },
    },
  };
}
