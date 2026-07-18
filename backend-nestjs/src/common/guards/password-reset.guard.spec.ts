import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PasswordResetGuard,
  PASSWORD_CHANGE_REQUIRED_CODE,
} from './password-reset.guard';
import { ALLOW_DURING_PASSWORD_RESET_KEY } from '../decorators/allow-password-reset.decorator';

describe('PasswordResetGuard', () => {
  const handler = () => undefined;
  class SomeController {}

  function context(user: any) {
    return {
      getHandler: () => handler,
      getClass: () => SomeController,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  function build(allowlisted: boolean) {
    const reflector = new Reflector();
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockImplementation((key: any) =>
        key === ALLOW_DURING_PASSWORD_RESET_KEY ? allowlisted : undefined,
      );
    return new PasswordResetGuard(reflector);
  }

  it('blocks a normal endpoint while the hold is set', () => {
    const guard = build(false);

    expect(() =>
      guard.canActivate(context({ forcePasswordReset: true })),
    ).toThrow(ForbiddenException);
  });

  it('rejects with a machine-readable code, not just a message', () => {
    const guard = build(false);

    try {
      guard.canActivate(context({ forcePasswordReset: true }));
      throw new Error('expected the guard to reject');
    } catch (error) {
      // The frontend routes on this code; a 403 that only differs by prose is
      // indistinguishable from an ordinary authorization failure.
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        code: PASSWORD_CHANGE_REQUIRED_CODE,
      });
    }
  });

  it('allows an allowlisted endpoint while the hold is set', () => {
    const guard = build(true);

    expect(guard.canActivate(context({ forcePasswordReset: true }))).toBe(true);
  });

  it('allows a normal endpoint when the hold is not set', () => {
    const guard = build(false);

    expect(guard.canActivate(context({ forcePasswordReset: false }))).toBe(
      true,
    );
  });

  it('stays out of the way on public routes, which carry no user', () => {
    const guard = build(false);

    expect(guard.canActivate(context(undefined))).toBe(true);
  });
});
