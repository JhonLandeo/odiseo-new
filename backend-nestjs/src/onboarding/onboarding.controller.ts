import {
  Controller,
  Get,
  Post,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('api/v1/onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /** T018: GET /api/v1/onboarding/progress */
  @Get('progress')
  async getProgress() {
    return this.onboardingService.getProgress();
  }

  /** T012: POST /api/v1/onboarding/seed-demo */
  @Post('seed-demo')
  @HttpCode(HttpStatus.CREATED)
  async seedDemo() {
    const result = await this.onboardingService.seedDemoData();
    return {
      message: 'Datos de demostración cargados exitosamente.',
      cycleId: result.cycleId,
      stepsCompleted: result.stepsCompleted,
    };
  }

  /** T025: POST /api/v1/onboarding/clear-demo */
  @Post('clear-demo')
  @HttpCode(HttpStatus.OK)
  async clearDemo() {
    await this.onboardingService.clearDemoData();
    return {
      message:
        'Datos de demostración eliminados. El progreso de onboarding ha sido reiniciado.',
    };
  }

  /** T023: PATCH /api/v1/onboarding/dismiss */
  @Patch('dismiss')
  @HttpCode(HttpStatus.OK)
  async dismiss() {
    return this.onboardingService.dismissOnboarding();
  }
}
