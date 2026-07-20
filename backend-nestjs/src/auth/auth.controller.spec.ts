import { Logger } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController.login session cookie', () => {
  const ORIGINAL_JWT_EXPIRATION = process.env.JWT_EXPIRATION;

  afterEach(() => {
    if (ORIGINAL_JWT_EXPIRATION === undefined) {
      delete process.env.JWT_EXPIRATION;
    } else {
      process.env.JWT_EXPIRATION = ORIGINAL_JWT_EXPIRATION;
    }
    jest.clearAllMocks();
  });

  function createController() {
    const authService = {
      validateUser: jest.fn().mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'admin@test.com',
          name: 'Admin',
          forcePasswordReset: false,
        },
        companyId: 'company-1',
        roles: ['admin'],
        permissions: ['manage_users'],
      }),
      generateToken: jest.fn().mockReturnValue('signed.jwt.token'),
    };
    const res = { cookie: jest.fn() };
    const controller = new AuthController(authService as any);
    return { controller, res };
  }

  async function loginCookieOptions(res: {
    cookie: jest.Mock;
  }): Promise<Record<string, unknown>> {
    return res.cookie.mock.calls[0][2];
  }

  // The token lifetime follows JWT_EXPIRATION (jwtModuleOptionsFactory); a
  // hardcoded 24h cookie either outlives the token or expires under it.
  it('derives the cookie maxAge from JWT_EXPIRATION', async () => {
    process.env.JWT_EXPIRATION = '15m';
    const { controller, res } = createController();

    await controller.login(
      { email: 'admin@test.com', password: 'x', subdomain: 'colegio' } as any,
      res as any,
    );

    expect(await loginCookieOptions(res)).toMatchObject({
      httpOnly: true,
      maxAge: 15 * 60 * 1000,
    });
  });

  it('falls back to a 24h cookie when JWT_EXPIRATION is unset', async () => {
    delete process.env.JWT_EXPIRATION;
    const { controller, res } = createController();

    await controller.login(
      { email: 'admin@test.com', password: 'x', subdomain: 'colegio' } as any,
      res as any,
    );

    expect(await loginCookieOptions(res)).toMatchObject({
      maxAge: 24 * 60 * 60 * 1000,
    });
  });
});

// ── logout: server-side revocation, not just a client-side cookie clear ──
describe('AuthController.logout', () => {
  function createController(options: { verifyThrows?: unknown } = {}) {
    const authService = {
      verifyToken: jest.fn(() => {
        if (options.verifyThrows) {
          throw options.verifyThrows;
        }
        return { sub: 'user-1', companyId: 'company-1' };
      }),
      revokeUserTokens: jest.fn().mockResolvedValue(undefined),
    };
    const res = { clearCookie: jest.fn() };
    const controller = new AuthController(authService as any);
    return { controller, res, authService };
  }

  it('revokes the caller tokens for a valid session cookie', async () => {
    const { controller, res, authService } = createController();
    const req = { cookies: { jwt: 'valid.jwt.token' } };

    await controller.logout(req as any, res as any);

    expect(authService.verifyToken).toHaveBeenCalledWith('valid.jwt.token');
    expect(authService.revokeUserTokens).toHaveBeenCalledWith(
      'company-1',
      'user-1',
    );
  });

  it('always clears the cookie for a valid session', async () => {
    const { controller, res } = createController();
    const req = { cookies: { jwt: 'valid.jwt.token' } };

    await controller.logout(req as any, res as any);

    expect(res.clearCookie).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  // Logging out must never turn into a 401: the client is trying to END a
  // session, and an already-invalid token or credential is not a reason to
  // refuse that.
  it('clears the cookie without throwing or logging when the token is invalid/expired', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { controller, res, authService } = createController({
      verifyThrows: new Error('jwt expired'),
    });
    const req = { cookies: { jwt: 'expired.jwt.token' } };

    await expect(
      controller.logout(req as any, res as any),
    ).resolves.toEqual({ message: 'Logged out successfully' });
    expect(authService.revokeUserTokens).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    // Routine — there was nothing to revoke — so nothing worth an operator's
    // attention, unlike a valid token whose revocation write genuinely fails.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('clears the cookie without throwing, but logs loudly, when the revocation write fails', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { controller, res, authService } = createController();
    authService.revokeUserTokens.mockRejectedValue(new Error('DB down'));
    const req = { cookies: { jwt: 'valid.jwt.token' } };

    await expect(
      controller.logout(req as any, res as any),
    ).resolves.toEqual({ message: 'Logged out successfully' });
    expect(res.clearCookie).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'));
  });

  it('clears the cookie and skips revocation entirely when there is no cookie', async () => {
    const { controller, res, authService } = createController();
    const req = { cookies: {} };

    await controller.logout(req as any, res as any);

    expect(authService.verifyToken).not.toHaveBeenCalled();
    expect(authService.revokeUserTokens).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });
});
