import {
  Controller,
  Post,
  Get,
  Body,
  Logger,
  Res,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { AuthenticatedOnly } from '../common/decorators/authenticated-only.decorator';
import { AllowDuringPasswordReset } from '../common/decorators/allow-password-reset.decorator';
import { jwtExpirationToMs } from './jwt-expiration.util';

@Controller('v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Post('login')
  // Entry point of the session: by definition there is no JWT yet.
  @Public()
  @HttpCode(HttpStatus.OK)
  // Brute-force protection: max 5 login attempts per minute per IP.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    const result = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
      loginDto.subdomain,
    );

    if (!result) {
      throw new UnauthorizedException(
        'Invalid credentials or unauthorized access for this subdomain',
      );
    }

    // Generate JWT
    const token = this.authService.generateToken({
      sub: result.user.id,
      companyId: result.companyId,
      roles: result.roles,
    });

    // Set JWT as httpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      domain: process.env.COOKIE_DOMAIN || undefined, // Soporte para multi-tenant (ej. '.odiseo.com')
      path: '/',
      // Token lifetime follows JWT_EXPIRATION (see jwtModuleOptionsFactory);
      // the cookie must follow the same value, or it either outlives the
      // token (dead session cookie) or expires under a still-valid token.
      maxAge: jwtExpirationToMs(process.env.JWT_EXPIRATION),
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.companyId,
        roles: result.roles,
        permissions: result.permissions,
        // Convenience only. The server enforces this via PasswordResetGuard
        // regardless of what the client does with it; login still succeeds
        // because changing the password requires being logged in.
        forcePasswordReset: result.user.forcePasswordReset,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  // Reads only the caller's own account; any authenticated user may ask who
  // they are, so no specific permission applies.
  @AuthenticatedOnly()
  // A blocked client must still be able to read its own state to know it is
  // blocked and why, without having to provoke a 403 somewhere else first.
  @AllowDuringPasswordReset()
  async me(@Req() req: express.Request) {
    const payload = (req as any).user;
    const userData = await this.authService.getUserFromToken(payload);
    return { user: userData };
  }

  @Post('change-password')
  // Changes only the caller's own password (and requires knowing the current
  // one); any authenticated user may do this, so no specific permission
  // applies.
  @AuthenticatedOnly()
  // The endpoint that lifts the hold cannot itself be held; blocking it would
  // leave the account with no way out.
  @AllowDuringPasswordReset()
  @HttpCode(HttpStatus.NO_CONTENT)
  // Same brute-force exposure as login: the endpoint verifies a password, so an
  // attacker holding a stolen session could otherwise grind the current
  // password here. Same budget as login rather than a tighter one — rejected
  // password-policy violations also consume it, so a user who trips the rules
  // once or twice before succeeding must not be locked out of the only endpoint
  // that can unblock their account.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(ThrottlerGuard)
  async changePassword(
    @Req() req: express.Request,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    const payload = (req as any).user;
    await this.authService.changePassword(
      payload.sub,
      payload.companyId,
      dto.currentPassword,
      dto.newPassword,
    );
    // Deliberately no body. Returning the user here would echo account state
    // back on a write whose only meaningful outcome is success or failure.
  }

  @Post('logout')
  // Clearing the cookie must succeed even when the token is already expired or
  // invalid; otherwise the client is stuck holding a stale cookie.
  @Public()
  // Redundant while the route is @Public — kept so that if it ever stops being
  // public, abandoning a session does not become something a blocked account is
  // forbidden to do.
  @AllowDuringPasswordReset()
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: express.Request,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    // Server-side revocation, not just a client-side cookie clear: without
    // this, a copy of the cookie taken before logout (a leaked/stolen token,
    // or a second device sharing the same session) would keep working for the
    // rest of the token's 24h lifetime. revokeUserTokens is per-USER, not
    // per-session — this codebase tracks no sessions, only per-user auth
    // state — so logging out on one device revokes every device/session this
    // user is signed in on, exactly like every other revocation trigger
    // (password change, admin deactivation, role change).
    //
    // Best-effort by design: an already-expired or malformed token, or even a
    // revocation write that fails, must never turn "log me out" into a 401 —
    // the client is trying to END a session, and clearing the cookie below is
    // what actually accomplishes that from its point of view.
    const token = req.cookies?.jwt;
    if (token) {
      let payload: { sub: string; companyId: string } | undefined;
      try {
        payload = this.authService.verifyToken(token);
      } catch {
        // Expired/malformed token: routine (the client is logging out of a
        // session that's already effectively dead) — nothing to revoke, no
        // signal worth logging. Fall through to clearing the cookie.
      }
      if (payload) {
        try {
          await this.authService.revokeUserTokens(
            payload.companyId,
            payload.sub,
          );
        } catch (error) {
          // A VALID token's revocation write failing is a real problem — that
          // token stays fully usable despite the user believing they logged
          // out — unlike an expired/malformed token above, which had nothing
          // to revoke in the first place. Still never blocks the cookie
          // clear: "log me out" must not itself 401.
          this.logger.error(
            `Failed to revoke tokens for user ${payload.sub} in company ${payload.companyId} on logout; their token may remain valid until it naturally expires: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          );
        }
      }
    }

    res.clearCookie('jwt', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      domain: process.env.COOKIE_DOMAIN || undefined,
      path: '/',
    });
    return { message: 'Logged out successfully' };
  }
}
