import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    // Silence the expected error log for the unexpected-error case.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status, json }),
        getRequest: () => ({ method: 'GET', url: '/api/v1/thing' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  describe('HttpException pass-through', () => {
    it('preserves an object body and status unchanged', () => {
      const exception = new HttpException(
        { code: 'PASSWORD_CHANGE_REQUIRED', statusCode: 403 },
        HttpStatus.FORBIDDEN,
      );

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        code: 'PASSWORD_CHANGE_REQUIRED',
        statusCode: 403,
      });
    });

    it('wraps a string body into the canonical envelope', () => {
      const exception = new HttpException('Nope', HttpStatus.BAD_REQUEST);

      filter.catch(exception, host);

      expect(status).toHaveBeenCalledWith(400);
      expect(json).toHaveBeenCalledWith({ statusCode: 400, message: 'Nope' });
    });

    it('does not alter guard responses (401 / 403)', () => {
      filter.catch(new UnauthorizedException(), host);
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({
        statusCode: 401,
        message: 'Unauthorized',
      });

      status.mockClear();
      json.mockClear();

      filter.catch(new ForbiddenException('Forbidden resource'), host);
      expect(status).toHaveBeenCalledWith(403);
      expect(json).toHaveBeenCalledWith({
        statusCode: 403,
        message: 'Forbidden resource',
        error: 'Forbidden',
      });
    });
  });

  describe('unexpected errors', () => {
    it('redacts to a stable 500 in production (no stack, no message)', () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        filter.catch(new Error('connection to db failed: password=secret'), host);
      } finally {
        process.env.NODE_ENV = original;
      }

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal server error',
      });
      const body = json.mock.calls[0][0];
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(body).not.toHaveProperty('stack');
    });

    it('echoes name and message in development but never a stack', () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        filter.catch(new TypeError('boom'), host);
      } finally {
        process.env.NODE_ENV = original;
      }

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expect(body).toEqual({
        statusCode: 500,
        error: 'TypeError',
        message: 'boom',
      });
      expect(body).not.toHaveProperty('stack');
    });

    // pino's redact only strips structured object key paths (see
    // pino-logger.options.ts) — it has no visibility into this filter's
    // free-text log message, which is exactly where a driver/client error's
    // OWN text can embed a real credential.
    it('scrubs a credential embedded in the error message AND stack before logging it', () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      // V8's default Error.stack starts with "${name}: ${message}", so the
      // same secret is present in BOTH logger.error arguments — both must be
      // scrubbed, not just the message.
      filter.catch(
        new Error(
          'connection to postgres://dbuser:sup3rSecret@db.internal:5432/odiseo failed',
        ),
        host,
      );

      const [loggedMessage, loggedStack] = errorSpy.mock.calls[0] as [
        string,
        string,
      ];
      expect(loggedMessage).not.toContain('sup3rSecret');
      expect(loggedMessage).toContain('[REDACTED]');
      expect(loggedStack).not.toContain('sup3rSecret');
      expect(loggedStack).toContain('[REDACTED]');
    });

    it('scrubs a Bearer token embedded in the error message AND stack before logging it', () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      filter.catch(
        new Error('upstream rejected Authorization: Bearer abc123.def456-ghi'),
        host,
      );

      const [loggedMessage, loggedStack] = errorSpy.mock.calls[0] as [
        string,
        string,
      ];
      expect(loggedMessage).not.toContain('abc123.def456-ghi');
      expect(loggedMessage).toContain('Bearer [REDACTED]');
      expect(loggedStack).not.toContain('abc123.def456-ghi');
      expect(loggedStack).toContain('Bearer [REDACTED]');
    });

    it('scrubs a password=... pattern embedded in the error message AND stack before logging it', () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      filter.catch(new Error('connection to db failed: password=secret'), host);

      const [loggedMessage, loggedStack] = errorSpy.mock.calls[0] as [
        string,
        string,
      ];
      expect(loggedMessage).not.toContain('=secret');
      expect(loggedMessage).toContain('password=[REDACTED]');
      expect(loggedStack).not.toContain('=secret');
      expect(loggedStack).toContain('password=[REDACTED]');
    });
  });
});
