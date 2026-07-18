import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { OnboardingService, OnboardingProgressDto } from './onboarding.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AuthenticatedOnly } from '../common/decorators/authenticated-only.decorator';

// Onboarding-tour state. The frontend reads progress on every app load and any
// user may dismiss/reset the tour banner; the state is only a UI flag (plus
// existence booleans derived from tenant tables), exposing no records and no
// admin capability, so no specific permission applies. Note the flag is
// tenant-scoped (singleton row), not per-user.
@AuthenticatedOnly()
@UseGuards(JwtAuthGuard)
@Controller('v1/onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('progress')
  async getProgress(): Promise<OnboardingProgressDto> {
    return this.onboardingService.getProgress();
  }

  @Patch('dismiss')
  async dismissTour(): Promise<{ success: boolean }> {
    return this.onboardingService.dismissTour();
  }

  @Patch('reset')
  async resetTour(): Promise<{ success: boolean }> {
    return this.onboardingService.resetTour();
  }
}
