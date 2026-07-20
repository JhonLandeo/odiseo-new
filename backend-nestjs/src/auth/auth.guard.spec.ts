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
    tokensValidAfter?: number | null;
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
        tokensValidAfter: options.tokensValidAfter ?? null,
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

  // ── JWT revocation: iat vs tokensValidAfter ──────────────────────────
  describe('token revocation', () => {
    it('allows a token when the account has never been revoked (tokensValidAfter null)', async () => {
      const { guard } = build({
        payload: { sub: 'user-1', companyId: 'company-a', iat: 1_000_000 },
        clsCompanyId: 'company-a',
        tokensValidAfter: null,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).resolves.toBe(true);
    });

    it('allows a token issued AFTER the last revocation', async () => {
      const issuedAtSeconds = 1_000_000;
      const { guard } = build({
        payload: {
          sub: 'user-1',
          companyId: 'company-a',
          iat: issuedAtSeconds,
        },
        clsCompanyId: 'company-a',
        // Revocation predates the token's iat: token still valid.
        tokensValidAfter: issuedAtSeconds * 1000 - 5000,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).resolves.toBe(true);
    });

    it('rejects a token issued BEFORE the last revocation', async () => {
      const issuedAtSeconds = 1_000_000;
      const { guard, authService } = build({
        payload: {
          sub: 'user-1',
          companyId: 'company-a',
          iat: issuedAtSeconds,
        },
        clsCompanyId: 'company-a',
        // Revocation happened after the token was issued: token now revoked.
        tokensValidAfter: issuedAtSeconds * 1000 + 5000,
      });
      const { execution, request } = context();

      await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      // The revoked token's claims must never reach downstream guards.
      expect(request.user).toBeUndefined();
      expect(authService.getUserAuthState).toHaveBeenCalled();
    });

    // iat is whole seconds (JWT spec truncates down); tokensValidAfter is a
    // millisecond Date. The guard floors tokensValidAfter to the second
    // before comparing, so a token minted in the SAME wall-clock second as a
    // revocation must still be allowed even when the revocation's ms offset
    // is nonzero — otherwise an immediate re-login right after logout would
    // be wrongly rejected as "revoked".
    it('allows a token whose iat exactly equals the floored revocation second', async () => {
      const issuedAtSeconds = 1_000_000;
      const { guard } = build({
        payload: { sub: 'user-1', companyId: 'company-a', iat: issuedAtSeconds },
        clsCompanyId: 'company-a',
        tokensValidAfter: issuedAtSeconds * 1000,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).resolves.toBe(true);
    });

    it('allows a token minted later in the SAME second as a revocation with a nonzero ms offset', async () => {
      const issuedAtSeconds = 1_000_000;
      const { guard } = build({
        payload: { sub: 'user-1', companyId: 'company-a', iat: issuedAtSeconds },
        clsCompanyId: 'company-a',
        // Revocation stamped 400ms into the same second iat truncates down
        // to — a naive iat*1000 &lt; tokensValidAfter comparison would reject
        // this even though the real mint time was after the revocation.
        tokensValidAfter: issuedAtSeconds * 1000 + 400,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).resolves.toBe(true);
    });

    it('rejects a token whose iat second is strictly before the revocation second', async () => {
      const issuedAtSeconds = 1_000_000;
      const { guard } = build({
        payload: { sub: 'user-1', companyId: 'company-a', iat: issuedAtSeconds },
        clsCompanyId: 'company-a',
        // Revocation lands in the NEXT second: a genuinely stale token.
        tokensValidAfter: (issuedAtSeconds + 1) * 1000,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('logs a warning identifying the user on a revoked-token rejection', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const issuedAtSeconds = 1_000_000;
      const { guard } = build({
        payload: {
          sub: 'user-1',
          companyId: 'company-a',
          iat: issuedAtSeconds,
        },
        clsCompanyId: 'company-a',
        tokensValidAfter: issuedAtSeconds * 1000 + 5000,
      });
      const { execution } = context();

      await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('user-1');
      warn.mockRestore();
    });
  });
});
