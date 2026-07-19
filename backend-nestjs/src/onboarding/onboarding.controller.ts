import { Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OnboardingService, OnboardingProgressDto } from './onboarding.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AuthenticatedOnly } from '../common/decorators/authenticated-only.decorator';

// Onboarding-tour state. The frontend reads progress on every app load and any
// user may dismiss/reset the tour banner; the state is only a UI flag (plus
// existence booleans derived from tenant tables), exposing no records and no
// admin capability, so no specific permission applies — authenticated is
// enough. The dismissal flag is PER-USER (migration 0007): each user keeps the
// tour until they dismiss it themselves. The derived step booleans stay
// tenant-level. The user id comes from the JWT via JwtAuthGuard (req.user.sub),
// and the guard guarantees that user belongs to the resolved tenant schema.
@AuthenticatedOnly()
@UseGuards(JwtAuthGuard)
@Controller('v1/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('progress')
  async getProgress(@Req() req: Request): Promise<OnboardingProgressDto> {
    return this.onboardingService.getProgress((req as any).user.sub);
  }

  @Patch('dismiss')
  async dismissTour(@Req() req: Request): Promise<{ success: boolean }> {
    return this.onboardingService.dismissTour((req as any).user.sub);
  }

  @Patch('reset')
  async resetTour(@Req() req: Request): Promise<{ success: boolean }> {
    return this.onboardingService.resetTour((req as any).user.sub);
  }
}
