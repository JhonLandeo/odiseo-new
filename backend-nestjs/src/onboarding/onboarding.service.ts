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
   */
  async getProgress(): Promise<OnboardingProgressDto> {
    return this.tenantService.runInTenant(async (manager) => {
      // Migration 0004 makes this row a singleton, so LIMIT 1 is now exact
      // rather than a tie-break. The ORDER BY is retained so a tenant schema
      // that predates the migration still resolves to the same row every time.
      const dismissalRows = await manager.query(
        `SELECT is_dismissed FROM onboarding_progress ORDER BY created_at ASC, id ASC LIMIT 1`,
      );
      // Absent row simply means "not dismissed" — no write needed to say that.
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

  async dismissTour(): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(true);
    return { success: true };
  }

  async resetTour(): Promise<{ success: boolean }> {
    await this.upsertTourDismissal(false);
    return { success: true };
  }

  /**
   * Atomic get-or-create of the tenant's single progress row.
   *
   * This used to take a transaction-scoped advisory lock, because the table had
   * no unique constraint to hang an `ON CONFLICT` on. That lock was only
   * cooperative: it held exactly as long as every writer went through this one
   * method, and nothing structural enforced that.
   *
   * Tenant migration 0004 makes the singleton invariant real — a fixed-true
   * `singleton` column with a CHECK plus a UNIQUE index — so exclusion is now
   * the database's job and a single `INSERT ... ON CONFLICT DO UPDATE` is both
   * atomic and correct against any writer, not just this one. Same pattern as
   * CatalogRepositoryImpl's upserts.
   */
  private async upsertTourDismissal(isDismissed: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.query(
        `INSERT INTO onboarding_progress (singleton, is_dismissed)
         VALUES (true, $1)
         ON CONFLICT (singleton) DO UPDATE
         SET is_dismissed = EXCLUDED.is_dismissed, updated_at = now()`,
        [isDismissed],
      );
    });
  }
}
