import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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
