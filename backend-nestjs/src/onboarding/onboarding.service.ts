import { Injectable, Logger } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';

const ONBOARDING_STEPS = [
  'create_cycle',
  'create_pdf_template',
  'setup_syllabus',
  'generate_material',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingStepInfo {
  id: OnboardingStep;
  label: string;
  completed: boolean;
}

export interface OnboardingProgressDto {
  stepsCompleted: OnboardingStep[];
  isDismissed: boolean;
  progressPercentage: number;
  availableSteps: OnboardingStepInfo[];
}

const STEP_LABELS: Record<OnboardingStep, string> = {
  create_cycle: 'Crear Ciclo',
  create_pdf_template: 'Crear Plantilla PDF',
  setup_syllabus: 'Configurar Syllabus',
  generate_material: 'Generar Material',
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly tenantService: TenantService,
  ) {}

  async getProgress(): Promise<OnboardingProgressDto> {
    return this.tenantService.runInTenant(async (manager) => {
      // Load or create progress record
      let progressRows = (await manager.query(
        `SELECT steps_completed, is_dismissed FROM onboarding_progress LIMIT 1`,
      )) as { steps_completed: string[]; is_dismissed: boolean }[];

      if (progressRows.length === 0) {
        await manager.query(
          `INSERT INTO onboarding_progress (steps_completed, is_dismissed) VALUES ('[]'::jsonb, false)`,
        );
        progressRows = [{ steps_completed: [], is_dismissed: false }];
      }

      const { steps_completed: stepsCompleted, is_dismissed: isDismissed } = progressRows[0];
      const verifiedSteps = new Set<OnboardingStep>(stepsCompleted as OnboardingStep[]);

      // Step 1: Check cycles
      const hasCycle = await manager.query(`SELECT 1 FROM cycles WHERE deleted_at IS NULL LIMIT 1`);
      if (hasCycle.length > 0) verifiedSteps.add('create_cycle');

      // Step 2: Check templates
      const hasTemplate = await manager.query(`SELECT 1 FROM pdf_design_templates LIMIT 1`);
      if (hasTemplate.length > 0) verifiedSteps.add('create_pdf_template');

      // Step 3: Check syllabus
      const hasSyllabus = await manager.query(`SELECT 1 FROM syllabus WHERE is_active = true LIMIT 1`);
      if (hasSyllabus.length > 0) verifiedSteps.add('setup_syllabus');

      // Step 4: Check material requests
      const hasMaterial = await manager.query(`SELECT 1 FROM materials LIMIT 1`);
      if (hasMaterial.length > 0) verifiedSteps.add('generate_material');

      const completedArray = Array.from(verifiedSteps) as OnboardingStep[];
      const progressPercentage = Math.round((completedArray.length / ONBOARDING_STEPS.length) * 100);

      const availableSteps: OnboardingStepInfo[] = ONBOARDING_STEPS.map((id) => ({
        id,
        label: STEP_LABELS[id],
        completed: verifiedSteps.has(id),
      }));

      // Update if changed
      if (completedArray.length !== (stepsCompleted as string[]).length) {
        await manager.query(
          `UPDATE onboarding_progress SET steps_completed = $1::jsonb, updated_at = now()`,
          [JSON.stringify(completedArray)],
        );
      }

      return { stepsCompleted: completedArray, isDismissed, progressPercentage, availableSteps };
    });
  }

  async dismissTour(): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(true);
    return { success: true };
  }

  async resetTour(): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(false);
    return { success: true };
  }

  private async upsertTourDismissal(isDismissed: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      const count = await manager.query(`SELECT COUNT(*) FROM onboarding_progress`);
      if (parseInt(count[0].count) === 0) {
        await manager.query(
          `INSERT INTO onboarding_progress (steps_completed, is_dismissed) VALUES ('[]'::jsonb, $1)`,
          [isDismissed]
        );
      } else {
        await manager.query(
          `UPDATE onboarding_progress SET is_dismissed = $1, updated_at = now()`,
          [isDismissed]
        );
      }
    });
  }
}
