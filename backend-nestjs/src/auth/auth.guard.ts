import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // This guard runs globally (APP_GUARD), so routes that must stay reachable
    // without a session (login, branding, machine-to-machine webhooks) opt out
    // explicitly via @Public(). Handler metadata overrides controller metadata.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract JWT from httpOnly cookie (not Authorization header)
    const token = request.cookies?.jwt;
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const payload = this.authService.verifyToken(token);
      // Dynamically load permissions to avoid stale claims
      const permissions = await this.authService.getUserPermissions(
        payload.sub,
        payload.companyId,
      );

      // Attach decoded user and fresh permissions to request for downstream use
      (request as any).user = {
        ...payload,
        permissions,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Token expired or invalid');
    }
  }
}
