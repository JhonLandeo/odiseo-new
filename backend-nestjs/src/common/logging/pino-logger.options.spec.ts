import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import type { Options } from 'pino-http';
import { createPinoLoggerParams } from './pino-logger.options';
import { REQUEST_ID_CLS_KEY } from './correlation-id.constants';

describe('createPinoLoggerParams', () => {
  const configWith = (env: Record<string, string | undefined>) =>
    ({
      get: (key: string) => env[key],
    }) as ConfigService;

  // `Params.pinoHttp` is typed as `Options | DestinationStream | [Options,
  // DestinationStream]` because nestjs-pino also allows those other two
  // shapes — createPinoLoggerParams only ever returns the plain `Options`
  // object form, so tests narrow to that directly instead of repeating an
  // `as Options` cast (or an unused DestinationStream branch check) at every
  // call site.
  const pinoHttpOf = (params: ReturnType<typeof createPinoLoggerParams>) =>
    params.pinoHttp as Options;

  describe('mixin', () => {
    it('attaches the CLS-derived requestId when a CLS context is active', () => {
      const cls = {
        isActive: () => true,
        get: (key: string) =>
          key === REQUEST_ID_CLS_KEY ? 'the-request-id' : undefined,
      } as any;

      const params = createPinoLoggerParams(cls, configWith({}));

      expect(
        pinoHttpOf(params).mixin?.(undefined as any, 0, undefined as any),
      ).toEqual({
        requestId: 'the-request-id',
      });
    });

    it('adds nothing outside a CLS context (e.g. app bootstrap, cron jobs)', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;

      const params = createPinoLoggerParams(cls, configWith({}));

      expect(
        pinoHttpOf(params).mixin?.(undefined as any, 0, undefined as any),
      ).toEqual({});
    });
  });

  describe('level', () => {
    it('reads LOG_LEVEL from ConfigService', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;

      const params = createPinoLoggerParams(
        cls,
        configWith({ LOG_LEVEL: 'debug' }),
      );

      expect(pinoHttpOf(params).level).toBe('debug');
    });

    it('defaults to info when LOG_LEVEL is unset', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;

      const params = createPinoLoggerParams(cls, configWith({}));

      expect(pinoHttpOf(params).level).toBe('info');
    });
  });

  describe('transport', () => {
    it('enables pino-pretty only when NODE_ENV is exactly "development"', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;

      const dev = createPinoLoggerParams(
        cls,
        configWith({ NODE_ENV: 'development' }),
      );
      const prod = createPinoLoggerParams(
        cls,
        configWith({ NODE_ENV: 'production' }),
      );
      const unset = createPinoLoggerParams(cls, configWith({}));

      expect(pinoHttpOf(dev).transport).toBeDefined();
      expect(pinoHttpOf(prod).transport).toBeUndefined();
      expect(pinoHttpOf(unset).transport).toBeUndefined();
    });
  });

  describe('redact', () => {
    it('redacts the auth cookie, bearer header, and password-shaped body fields', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;

      const params = createPinoLoggerParams(cls, configWith({}));
      const redact = pinoHttpOf(params).redact as { paths: string[] };

      expect(redact.paths).toEqual(
        expect.arrayContaining([
          'req.headers.cookie',
          'req.headers.authorization',
          'req.body.password',
          'req.body.passwordHash',
          'req.body.currentPassword',
          'req.body.newPassword',
          'req.body.token',
          'res.body.temporaryPassword',
        ]),
      );
    });

    // The test above only proves the config's SHAPE. This one runs the
    // config through a real pino instance and inspects the actual emitted
    // log line, so a typo'd/malformed redact path (wrong bracket/dot
    // notation, wrong nesting) would fail this test even though it would
    // still pass the shape-only assertion above.
    it('genuinely censors the configured fields in a real emitted log line', () => {
      const cls = { isActive: () => false, get: () => undefined } as any;
      const params = createPinoLoggerParams(cls, configWith({}));
      const redact = pinoHttpOf(params).redact as {
        paths: string[];
        censor: string;
      };

      const lines: string[] = [];
      const destination = {
        write: (line: string) => {
          lines.push(line);
        },
      };
      const logger = pino({ redact }, destination as any);

      logger.info({
        req: {
          headers: {
            cookie: 'jwt=super-secret-session-token',
            authorization: 'Bearer abc.def.ghi',
          },
          body: {
            password: 'plainTextPassword1',
            passwordHash: '$2b$10$hashedvalue',
            currentPassword: 'oldPass1',
            newPassword: 'newPass1',
            token: 'raw-token-value',
          },
        },
        res: { body: { temporaryPassword: 'GeneratedTemp123' } },
      });

      const emitted = lines.join('\n');
      for (const secret of [
        'super-secret-session-token',
        'abc.def.ghi',
        'plainTextPassword1',
        '$2b$10$hashedvalue',
        'oldPass1',
        'newPass1',
        'raw-token-value',
        'GeneratedTemp123',
      ]) {
        expect(emitted).not.toContain(secret);
      }
      expect(emitted).toContain('[Redacted]');
    });
  });
});
