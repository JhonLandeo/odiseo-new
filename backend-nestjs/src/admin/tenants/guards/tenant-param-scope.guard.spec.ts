import { ForbiddenException, Logger } from '@nestjs/common';
import { TenantParamScopeGuard } from './tenant-param-scope.guard';
import { PERMISSIONS } from '../../roles/constants/permissions.constant';

describe('TenantParamScopeGuard', () => {
  function context(user: any, tenantId?: string) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, params: { tenantId } }),
      }),
    } as any;
  }

  it('allows the caller to manage admins of their OWN tenant', () => {
    const guard = new TenantParamScopeGuard();

    expect(
      guard.canActivate(
        context(
          { sub: 'user-1', companyId: 'company-a', permissions: [] },
          'company-a',
        ),
      ),
    ).toBe(true);
  });

  it('rejects a caller reaching into a DIFFERENT tenant without MANAGE_TENANTS (cross-tenant takeover regression)', () => {
    const guard = new TenantParamScopeGuard();

    // A tenant Super Admin holds the granular *_TENANT_ADMINS permissions but
    // NOT MANAGE_TENANTS. Putting another tenant's id in the URL must be denied.
    expect(() =>
      guard.canActivate(
        context(
          {
            sub: 'attacker',
            companyId: 'company-a',
            permissions: [
              PERMISSIONS.CHANGE_PASSWORD_TENANT_ADMINS,
              PERMISSIONS.DELETE_TENANT_ADMINS,
            ],
          },
          'company-b',
        ),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows a genuine platform operator (holds MANAGE_TENANTS) to manage any tenant', () => {
    const guard = new TenantParamScopeGuard();

    expect(
      guard.canActivate(
        context(
          {
            sub: 'operator',
            companyId: 'platform',
            permissions: [PERMISSIONS.MANAGE_TENANTS],
          },
          'company-b',
        ),
      ),
    ).toBe(true);
  });

  it('logs a warning identifying the caller and the target tenant on a blocked attempt', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new TenantParamScopeGuard();

    expect(() =>
      guard.canActivate(
        context(
          { sub: 'attacker', companyId: 'company-a', permissions: [] },
          'company-b',
        ),
      ),
    ).toThrow(ForbiddenException);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('attacker');
    expect(message).toContain('company-a');
    expect(message).toContain('company-b');

    warn.mockRestore();
  });

  it('does not log on the happy path (own tenant)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const guard = new TenantParamScopeGuard();

    expect(
      guard.canActivate(
        context({ sub: 'user-1', companyId: 'company-a' }, 'company-a'),
      ),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();

    warn.mockRestore();
  });

  it('rejects when there is no authenticated user at all', () => {
    const guard = new TenantParamScopeGuard();

    expect(() => guard.canActivate(context(undefined, 'company-a'))).toThrow(
      ForbiddenException,
    );
  });
});
