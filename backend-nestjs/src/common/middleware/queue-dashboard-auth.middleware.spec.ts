import { Global, INestApplication, Logger, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Request, Response, NextFunction } from 'express';
import { QueueDashboardAuthMiddleware } from './queue-dashboard-auth.middleware';
import { AuthService } from '../../auth/auth.service';
import { PERMISSIONS } from '../../admin/roles/constants/permissions.constant';

describe('QueueDashboardAuthMiddleware', () => {
  let authService: {
    verifyToken: jest.Mock;
    getUserAuthState: jest.Mock;
  };
  let middleware: QueueDashboardAuthMiddleware;
  let res: Response;
  let next: NextFunction;
  let status: jest.Mock;
  let json: jest.Mock;

  const requestWithCookie = (jwt?: string) =>
    ({ cookies: jwt ? { jwt } : {} }) as unknown as Request;

  beforeEach(() => {
    authService = {
      verifyToken: jest.fn(),
      getUserAuthState: jest.fn(),
    };
    middleware = new QueueDashboardAuthMiddleware(
      authService as unknown as AuthService,
    );
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    res = { status } as unknown as Response;
    next = jest.fn();
  });

  it('rejects with 401 when no jwt cookie is present', async () => {
    await middleware.use(requestWithCookie(), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the token is invalid', async () => {
    authService.verifyToken.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await middleware.use(requestWithCookie('bad-token'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('rejects with 403 when the user lacks MANAGE_TENANTS', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockResolvedValue({
      permissions: ['MANAGE_MATERIALS'],
      forcePasswordReset: false,
    });

    await middleware.use(requestWithCookie('good-token'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it('calls next() when the user holds MANAGE_TENANTS', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockResolvedValue({
      permissions: [PERMISSIONS.MANAGE_TENANTS],
      forcePasswordReset: false,
    });

    await middleware.use(requestWithCookie('good-token'), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  // Fail-closed: an unexpected failure loading permissions must never be read
  // as "no restriction applies".
  it('denies instead of allowing when the auth lookup throws unexpectedly', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockRejectedValue(
      new Error('database unreachable'),
    );

    await middleware.use(requestWithCookie('good-token'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });

  it('denies when the auth state carries no permissions at all', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockResolvedValue({});

    await middleware.use(requestWithCookie('good-token'), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  describe('observability', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('logs the denied user id when MANAGE_TENANTS is missing', async () => {
      authService.verifyToken.mockReturnValue({
        sub: 'user-1',
        companyId: 'company-1',
      });
      authService.getUserAuthState.mockResolvedValue({ permissions: [] });

      await middleware.use(requestWithCookie('super-secret-token'), res, next);

      expect(status).toHaveBeenCalledWith(403);
      expect(warn).toHaveBeenCalledTimes(1);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain('user-1');
      expect(message).not.toContain('super-secret-token');
    });

    // Both a bad token and a dead Redis answer 401. Only the log tells them apart.
    it('logs the underlying cause when the lookup fails', async () => {
      authService.verifyToken.mockReturnValue({
        sub: 'user-1',
        companyId: 'company-1',
      });
      authService.getUserAuthState.mockRejectedValue(
        new Error('Redis connection refused'),
      );

      await middleware.use(requestWithCookie('super-secret-token'), res, next);

      expect(status).toHaveBeenCalledWith(401);
      const message = String(warn.mock.calls[0][0]);
      expect(message).toContain('Redis connection refused');
      expect(message).not.toContain('super-secret-token');
    });

    it('logs nothing when access is granted', async () => {
      authService.verifyToken.mockReturnValue({
        sub: 'user-1',
        companyId: 'company-1',
      });
      authService.getUserAuthState.mockResolvedValue({
        permissions: [PERMISSIONS.MANAGE_TENANTS],
      });

      await middleware.use(requestWithCookie('good-token'), res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  // A hung Redis must not hang the dashboard an operator opened precisely
  // because the queues are misbehaving.
  describe('bounded auth-state lookup', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('denies with 401 instead of hanging when the lookup never settles', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      authService.verifyToken.mockReturnValue({
        sub: 'user-1',
        companyId: 'company-1',
      });
      authService.getUserAuthState.mockReturnValue(new Promise(() => {}));

      const pending = middleware.use(
        requestWithCookie('good-token'),
        res,
        next,
      );
      await jest.advanceTimersByTimeAsync(5000);
      await pending;

      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(String(warn.mock.calls[0][0])).toContain('timed out');

      warn.mockRestore();
    });

    it('does not trip the timeout on the fast path', async () => {
      authService.verifyToken.mockReturnValue({
        sub: 'user-1',
        companyId: 'company-1',
      });
      authService.getUserAuthState.mockResolvedValue({
        permissions: [PERMISSIONS.MANAGE_TENANTS],
      });

      await middleware.use(requestWithCookie('good-token'), res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(status).not.toHaveBeenCalled();
      // The timer must be cleared once the lookup settles, or every allowed
      // request would leave a pending handle behind.
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});

// Proves the middleware is actually reached for /queues. The dashboard router
// is raw Express middleware and bypasses Nest guards entirely, so a unit test of
// the class alone would not show that anything intercepts the route.
describe('Bull Board /queues wiring', () => {
  let app: INestApplication;
  const authService = {
    verifyToken: jest.fn(),
    getUserAuthState: jest.fn(),
  };

  beforeAll(async () => {
    @Global()
    @Module({
      providers: [{ provide: AuthService, useValue: authService }],
      exports: [AuthService],
    })
    class StubAuthModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        StubAuthModule,
        BullBoardModule.forRoot({
          route: '/queues',
          adapter: ExpressAdapter,
          middleware: QueueDashboardAuthMiddleware,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects an unauthenticated GET /queues with 401', async () => {
    await request(app.getHttpServer()).get('/queues').expect(401);
  });

  it('rejects a nested unauthenticated dashboard request with 401', async () => {
    await request(app.getHttpServer()).get('/queues/api/queues').expect(401);
  });

  it('rejects an authenticated user without MANAGE_TENANTS with 403', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockResolvedValue({ permissions: [] });

    await request(app.getHttpServer())
      .get('/queues')
      .set('Cookie', ['jwt=good-token'])
      .expect(403);
  });

  it('lets a MANAGE_TENANTS holder reach the dashboard router', async () => {
    authService.verifyToken.mockReturnValue({
      sub: 'user-1',
      companyId: 'company-1',
    });
    authService.getUserAuthState.mockResolvedValue({
      permissions: [PERMISSIONS.MANAGE_TENANTS],
    });

    const response = await request(app.getHttpServer())
      .get('/queues')
      .set('Cookie', ['jwt=good-token']);

    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
  });
});
