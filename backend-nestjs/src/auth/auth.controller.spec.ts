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
