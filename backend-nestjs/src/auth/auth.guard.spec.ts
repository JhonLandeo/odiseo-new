import {
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  const handler = () => undefined;
  class SomeController {}

  function context(cookies: Record<string, string> = { jwt: 'token' }) {
    const request: any = { cookies };
    return {
      request,
      execution: {
        getHandler: () => handler,
        getClass: () => SomeController,
        switchToHttp: () => ({ getRequest: () => request }),
      } as any,
    };
  }

  function build(options: {
    isPublic?: boolean;
    payload?: any;
    verifyThrows?: unknown;
    clsCompanyId?: string | null;
  }) {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) =>
        key === IS_PUBLIC_KEY ? options.isPublic : undefined,
      );

    const authService = {
      verifyToken: jest.fn(() => {
        if (options.verifyThrows) {
          throw options.verifyThrows;
        }
        return options.payload;
      }),
      getUserAuthState: jest.fn().mockResolvedValue({
        permissions: ['VIEW_MATERIALS'],
        forcePasswordReset: false,
      }),
    } as unknown as AuthService;

    const cls = {
      get: jest.fn((key: string) =>
        key === 'companyId' ? (options.clsCompanyId ?? undefined) : undefined,
      ),
    } as any;

    return {
      guard: new JwtAuthGuard(authService, reflector, cls),
      authService,
    };
  }

  it('allows the request when the token tenant matches the request tenant', async () => {
    const { guard } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: 'company-a',
    });
    const { execution, request } = context();

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(request.user).toMatchObject({
      sub: 'user-1',
      companyId: 'company-a',
      permissions: ['VIEW_MATERIALS'],
      forcePasswordReset: false,
    });
  });

  it('rejects a session issued for a different tenant', async () => {
    // The cookie is scoped to the whole COOKIE_DOMAIN, so tenant A's browser
    // does send it to tenant B's subdomain. This must be a 403, not a 401:
    // the caller is authenticated, just not for this tenant.
    const { guard, authService } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: 'company-b',
    });
    const { execution } = context();

    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(authService.getUserAuthState).not.toHaveBeenCalled();
  });

  it('does not swallow the tenant rejection into a generic 401', async () => {
    const { guard } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: 'company-b',
    });
    const { execution } = context();

    await expect(guard.canActivate(execution)).rejects.not.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('allows platform routes, which resolve no tenant in CLS', async () => {
    const { guard } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: null,
    });
    const { execution } = context();

    await expect(guard.canActivate(execution)).resolves.toBe(true);
  });

  it('short-circuits on @Public() routes without reading the cookie', async () => {
    const { guard, authService } = build({ isPublic: true });
    const { execution } = context({});

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects a request with no token', async () => {
    const { guard } = build({ clsCompanyId: 'company-a' });
    const { execution } = context({});

    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A silent 403 leaves a cross-tenant replay attempt with no trace at all.
  it('logs a warning identifying both tenants on a cross-tenant rejection', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { guard } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: 'company-b',
    });
    const { execution } = context({ jwt: 'super-secret-token' });

    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('user-1');
    expect(message).toContain('company-a');
    expect(message).toContain('company-b');
    // The credential must never reach the logs.
    expect(message).not.toContain('super-secret-token');

    warn.mockRestore();
  });

  it('does not log on the happy path', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { guard } = build({
      payload: { sub: 'user-1', companyId: 'company-a' },
      clsCompanyId: 'company-a',
    });
    const { execution } = context();

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('still rejects an invalid token with 401', async () => {
    const { guard } = build({
      verifyThrows: new Error('jwt malformed'),
      clsCompanyId: 'company-a',
    });
    const { execution } = context();

    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
