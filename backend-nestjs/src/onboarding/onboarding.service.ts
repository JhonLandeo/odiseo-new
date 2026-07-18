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
   * Consequence: `onboarding_progress.steps_completed` is now written by no one
   * and read by no one. It is vestigial, left in place because dropping a column
   * needs a migration.
   */
  async getProgress(): Promise<OnboardingProgressDto> {
    return this.tenantService.runInTenant(async (manager) => {
      // Deterministic pick: the table has no unique constraint, so an already
      // duplicated tenant must at least resolve to the same row every time.
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
   * `onboarding_progress` has no unique constraint to hang an
   * `ON CONFLICT ... DO UPDATE` on (only `id UUID PRIMARY KEY DEFAULT
   * gen_random_uuid()`), so exclusion is taken explicitly: a transaction-scoped
   * advisory lock keyed on the tenant's own schema serialises concurrent
   * get-or-create for that tenant, and one CTE statement then updates the
   * existing row or inserts the first one. Two parallel calls can no longer
   * both observe "no row" and both insert.
   *
   * The previous COUNT-then-INSERT/UPDATE also updated EVERY row (no WHERE);
   * the UPDATE below is scoped to the single row the CTE selected.
   */
  private async upsertTourDismissal(isDismissed: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      // runInTenant runs inside a transaction, so this lock is released on
      // commit/rollback. current_schema() is the tenant schema (search_path),
      // which keeps the key distinct per tenant.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext(current_schema() || '.onboarding_progress'))`,
      );

      await manager.query(
        `
        WITH existing AS (
          SELECT id FROM onboarding_progress
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        ), updated AS (
          UPDATE onboarding_progress p
          SET is_dismissed = $1, updated_at = now()
          FROM existing e
          WHERE p.id = e.id
          RETURNING p.id
        )
        INSERT INTO onboarding_progress (steps_completed, is_dismissed)
        SELECT '[]'::jsonb, $1
        WHERE NOT EXISTS (SELECT 1 FROM updated)
        `,
        [isDismissed],
      );
    });
  }
}
