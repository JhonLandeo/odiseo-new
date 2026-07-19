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
  });
});
