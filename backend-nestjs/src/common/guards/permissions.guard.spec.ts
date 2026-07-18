import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PermissionsGuard,
  RequirePermissions,
  REQUIRE_PERMISSIONS_KEY,
} from './permissions.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AuthenticatedOnly,
  NO_PERMISSIONS_REQUIRED_KEY,
} from '../decorators/authenticated-only.decorator';

describe('PermissionsGuard', () => {
  const handler = () => undefined;
  class SomeController {}

  function context(user: any) {
    return {
      getHandler: () => handler,
      getClass: () => SomeController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  interface MetadataByKey {
    [IS_PUBLIC_KEY]?: boolean;
    [NO_PERMISSIONS_REQUIRED_KEY]?: boolean;
    [REQUIRE_PERMISSIONS_KEY]?: string[];
  }

  function build(metadata: MetadataByKey) {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) => metadata[key as keyof MetadataByKey]);
    return new PermissionsGuard(reflector);
  }

  it('allows a @Public() route (it has no user to authorize)', () => {
    const guard = build({ [IS_PUBLIC_KEY]: true });

    expect(guard.canActivate(context(undefined))).toBe(true);
  });

  it('allows an @AuthenticatedOnly() route without checking permissions', () => {
    const guard = build({ [NO_PERMISSIONS_REQUIRED_KEY]: true });

    expect(guard.canActivate(context({ permissions: [] }))).toBe(true);
  });

  it('allows a @RequirePermissions route when the user holds all permissions', () => {
    const guard = build({ [REQUIRE_PERMISSIONS_KEY]: ['A', 'B'] });

    expect(guard.canActivate(context({ permissions: ['A', 'B', 'C'] }))).toBe(
      true,
    );
  });

  it('denies a @RequirePermissions route when any permission is missing (AND semantics)', () => {
    const guard = build({ [REQUIRE_PERMISSIONS_KEY]: ['A', 'B'] });

    expect(guard.canActivate(context({ permissions: ['A'] }))).toBe(false);
  });

  it('denies a @RequirePermissions route when the user has no permissions field', () => {
    const guard = build({ [REQUIRE_PERMISSIONS_KEY]: ['A'] });

    expect(guard.canActivate(context({}))).toBe(false);
  });

  it('denies a @RequirePermissions route when there is no user at all', () => {
    const guard = build({ [REQUIRE_PERMISSIONS_KEY]: ['A'] });

    expect(guard.canActivate(context(undefined))).toBe(false);
  });

  it('DENIES a route with no metadata at all (deny-by-default)', () => {
    const guard = build({});

    // Even a fully-privileged user must be rejected: the route itself has no
    // declared policy, and that is the failure mode this guard exists to catch.
    expect(() =>
      guard.canActivate(context({ permissions: ['A', 'B', 'C'] })),
    ).toThrow(ForbiddenException);
  });

  it('names the missing policy in the rejection so the cause is obvious in logs', () => {
    const guard = build({});

    expect(() => guard.canActivate(context({ permissions: ['A'] }))).toThrow(
      /no permission policy/i,
    );
  });

  describe('handler vs controller metadata precedence', () => {
    // The guard resolves metadata via getAllAndOverride([handler, class]):
    // handler-level metadata overrides controller-level metadata. These tests
    // use a real (unmocked) Reflector against real decorated classes to pin
    // that behavior down.
    function realContext(controller: any, methodName: string, user: any) {
      return {
        getHandler: () => controller.prototype[methodName],
        getClass: () => controller,
        switchToHttp: () => ({ getRequest: () => ({ user }) }),
      } as any;
    }

    it('controller-level @RequirePermissions applies to an undecorated handler', () => {
      @RequirePermissions('ADMIN' as any)
      class GatedController {
        list() {}
      }
      const guard = new PermissionsGuard(new Reflector());

      expect(
        guard.canActivate(
          realContext(GatedController, 'list', { permissions: [] }),
        ),
      ).toBe(false);
      expect(
        guard.canActivate(
          realContext(GatedController, 'list', { permissions: ['ADMIN'] }),
        ),
      ).toBe(true);
    });

    it('handler-level @RequirePermissions overrides the controller-level one', () => {
      @RequirePermissions('ADMIN' as any)
      class MixedController {
        @RequirePermissions('VIEWER' as any)
        read() {}
      }
      const guard = new PermissionsGuard(new Reflector());

      // VIEWER alone satisfies the handler override; ADMIN alone does not.
      expect(
        guard.canActivate(
          realContext(MixedController, 'read', { permissions: ['VIEWER'] }),
        ),
      ).toBe(true);
      expect(
        guard.canActivate(
          realContext(MixedController, 'read', { permissions: ['ADMIN'] }),
        ),
      ).toBe(false);
    });

    it('controller-level @AuthenticatedOnly applies to an undecorated handler', () => {
      @AuthenticatedOnly()
      class TourController {
        progress() {}
      }
      const guard = new PermissionsGuard(new Reflector());

      expect(
        guard.canActivate(
          realContext(TourController, 'progress', { permissions: [] }),
        ),
      ).toBe(true);
    });

    it('a completely undecorated controller and handler are denied', () => {
      class ForgottenController {
        leak() {}
      }
      const guard = new PermissionsGuard(new Reflector());

      expect(() =>
        guard.canActivate(
          realContext(ForgottenController, 'leak', { permissions: ['ADMIN'] }),
        ),
      ).toThrow(ForbiddenException);
    });
  });
});
