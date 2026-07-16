import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { OnboardingService, OnboardingProgressDto } from './onboarding.service';
import { JwtAuthGuard } from '../auth/auth.guard';

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
