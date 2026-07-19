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

  constructor(private readonly tenantService: TenantService) {}

  /**
   * Read-only by design.
   *
   * This used to INSERT a progress row and UPDATE the cached step list from
   * inside a GET, which broke HTTP safety: a browser prefetch mutated state and
   * a retry duplicated the insert — the actual mechanism behind the duplicate
   * rows. Step completion is derived from the real tables on every call anyway,
   * so persisting it on read bought nothing and is simply dropped.
   *
   * The `onboarding_progress.steps_completed` column that used to cache this
   * became vestigial as a result and was dropped in tenant migration 0004.
   *
   * Note on scope: only `is_dismissed` is per-user (migration 0007 keys the row
   * on `user_id`). The four derived steps below stay TENANT-level — they are
   * EXISTS checks over the tenant's own tables and reflect the institution's
   * setup, identical for every user of the tenant.
   */
  async getProgress(userId: string): Promise<OnboardingProgressDto> {
    return this.tenantService.runInTenant(async (manager) => {
      // Per-user dismissal (migration 0007). An absent row means "not
      // dismissed", so this user still sees the tour — no write needed to say
      // that.
      const dismissalRows = await manager.query(
        `SELECT is_dismissed FROM onboarding_progress WHERE user_id = $1`,
        [userId],
      );
      const isDismissed: boolean = dismissalRows[0]?.is_dismissed ?? false;

      // One round-trip for all four checks. They were four sequential
      // `SELECT 1 ... LIMIT 1` on an endpoint the frontend hits on every load.
      const [flags] = await manager.query(
        `SELECT
           EXISTS(SELECT 1 FROM cycles WHERE deleted_at IS NULL) AS create_cycle,
           EXISTS(SELECT 1 FROM pdf_design_templates) AS create_pdf_template,
           EXISTS(SELECT 1 FROM syllabus WHERE is_active = true) AS setup_syllabus,
           EXISTS(SELECT 1 FROM materials) AS generate_material`,
      );

      const availableSteps: OnboardingStepInfo[] = ONBOARDING_STEPS.map(
        (id) => ({
          id,
          label: STEP_LABELS[id],
          completed: Boolean(flags?.[id]),
        }),
      );

      const stepsCompleted = availableSteps
        .filter((step) => step.completed)
        .map((step) => step.id);

      return {
        stepsCompleted,
        isDismissed,
        progressPercentage: Math.round(
          (stepsCompleted.length / ONBOARDING_STEPS.length) * 100,
        ),
        availableSteps,
      };
    });
  }

  async dismissTour(userId: string): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(userId, true);
    return { success: true };
  }

  async resetTour(userId: string): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(userId, false);
    return { success: true };
  }

  /**
   * Atomic get-or-create of the caller's own dismissal row.
   *
   * Dismissal is per-user (migration 0007): the row is keyed on `user_id` with
   * a UNIQUE index, which is the conflict target for this single
   * `INSERT ... ON CONFLICT (user_id) DO UPDATE`. That makes the upsert atomic
   * and correct against any writer without a cooperative advisory lock. Same
   * pattern as CatalogRepositoryImpl's upserts.
   */
  private async upsertTourDismissal(
    userId: string,
    isDismissed: boolean,
  ): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.query(
        `INSERT INTO onboarding_progress (user_id, is_dismissed)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE
         SET is_dismissed = EXCLUDED.is_dismissed, updated_at = now()`,
        [userId, isDismissed],
      );
    });
  }
}
