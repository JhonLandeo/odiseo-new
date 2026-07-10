import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import * as express from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './auth.guard';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
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
      permissions: result.permissions,
    });

    // Set JWT as httpOnly cookie
    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      domain: process.env.COOKIE_DOMAIN || undefined, // Soporte para multi-tenant (ej. '.odiseo.com')
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        companyId: result.companyId,
        roles: result.roles,
        permissions: result.permissions,
      },
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: express.Request) {
    const payload = (req as any).user;
    const userData = await this.authService.getUserFromToken(payload);
    return { user: userData };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: express.Response) {
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
