import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';

const ONBOARDING_STEPS = [
  'load_demo_or_create_cycle',
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
  load_demo_or_create_cycle: 'Cargar datos demo o crear primer ciclo',
  create_pdf_template: 'Configurar plantilla de diseño PDF',
  setup_syllabus: 'Planificar sílabo de un curso',
  generate_material: 'Generar primer material académico',
};

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly tenantService: TenantService,
  ) {}

  /** T011: Check if real (non-demo) cycles exist */
  async hasRealCycles(): Promise<boolean> {
    return this.tenantService.runInTenant(async (manager) => {
      const result = await manager.query(
        `SELECT 1 FROM cycles WHERE is_demo = false AND deleted_at IS NULL LIMIT 1`,
      );
      return result.length > 0;
    });
  }

  /** T010: Check if any demo records exist */
  async hasDemoData(): Promise<boolean> {
    return this.tenantService.runInTenant(async (manager) => {
      const result = await manager.query(
        `SELECT 1 FROM cycles WHERE is_demo = true LIMIT 1`,
      );
      return result.length > 0;
    });
  }

  /** T009: Seed demo data atomically */
  async seedDemoData(): Promise<{ cycleId: string; stepsCompleted: OnboardingStep[] }> {
    // Guard: only seed if no real cycles exist
    const realCyclesExist = await this.hasRealCycles();
    if (realCyclesExist) {
      throw new BadRequestException(
        'No se pueden cargar datos de demostración si ya existen ciclos registrados en la institución.',
      );
    }

    return this.tenantService.runInTenant(async (manager) => {
      // 1. Insert demo cycle (2026, 16 weeks)
      const today = new Date();
      const startDate = new Date(today.getFullYear(), 2, 1); // March 1st current year
      const endDate = new Date(today.getFullYear(), 6, 31);   // July 31st current year

      const cycleRes = (await manager.query(`
        INSERT INTO cycles (name, year, start_date, end_date, days_per_week, total_weeks, is_active, is_demo)
        VALUES ($1, $2, $3, $4, 5, 16, true, true) RETURNING id
      `, ['Ciclo de Demostración 2026', today.getFullYear(), startDate, endDate])) as { id: string }[];

      const cycleId = cycleRes[0].id;

      // 2. Insert 2 demo weeks
      await manager.query(`
        INSERT INTO cycle_weeks (cycle_id, week_number, start_date, end_date, is_active)
        VALUES
          ($1, 1, $2, $3, true),
          ($1, 2, $4, $5, true)
      `, [
        cycleId,
        startDate,
        new Date(startDate.getTime() + 6 * 86400000),
        new Date(startDate.getTime() + 7 * 86400000),
        new Date(startDate.getTime() + 13 * 86400000),
      ]);

      // 3. Insert demo PDF design template
      await manager.query(`
        INSERT INTO pdf_design_templates (name, is_default, is_demo)
        VALUES ('Plantilla Demo Estándar', true, true)
      `);

      // 4. Fetch real IDs from global catalog (odiseo schema)
      const courseRes = await manager.query(`SELECT id FROM odiseo.courses LIMIT 1`);
      if (courseRes.length === 0) {
        throw new BadRequestException('El catálogo de cursos globales está vacío. Imposible cargar demo.');
      }
      const demoCourseId = courseRes[0].id;

      const topicRes = await manager.query(`SELECT id FROM odiseo.course_topics WHERE course_id = $1 LIMIT 1`, [demoCourseId]);
      const demoTopicId = topicRes.length > 0 ? topicRes[0].id : null;

      let demoSubtopicId = null;
      if (demoTopicId) {
        const subtopicRes = await manager.query(`SELECT id FROM odiseo.course_subtopics WHERE topic_id = $1 LIMIT 1`, [demoTopicId]);
        demoSubtopicId = subtopicRes.length > 0 ? subtopicRes[0].id : null;
      }

      // 5. Insert demo syllabus
      const syllabusRes = (await manager.query(`
        INSERT INTO syllabus (cycle_id, course_id, name, is_active, is_demo)
        VALUES ($1, $2, 'Sílabo Demo - Generado', true, true) RETURNING id
      `, [cycleId, demoCourseId])) as { id: string }[];

      const syllabusId = syllabusRes[0].id;

      // 6. Insert 1 demo distribution entry if topics exist
      if (demoTopicId && demoSubtopicId) {
        await manager.query(`
          INSERT INTO syllabus_distribution (syllabus_id, week_number, topic_id, subtopic_id, question_count)
          VALUES ($1, 1, $2, $3, 5)
        `, [syllabusId, demoTopicId, demoSubtopicId]);
      }

      // 6. Mark the first onboarding step as complete
      await this._upsertStepCompleted(manager, 'load_demo_or_create_cycle');

      this.logger.log(`Demo data seeded for tenant. Cycle ID: ${cycleId}`);
      return { cycleId, stepsCompleted: ['load_demo_or_create_cycle'] };
    });
  }

  /** T017: Get onboarding progress by dynamically checking tenant data */
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

      // Dynamically verify step completion against actual data
      const verifiedSteps = new Set<OnboardingStep>(stepsCompleted as OnboardingStep[]);

      // Step 1: any cycle exists (demo or real)
      const hasCycle = await manager.query(`SELECT 1 FROM cycles WHERE deleted_at IS NULL LIMIT 1`);
      if (hasCycle.length > 0) verifiedSteps.add('load_demo_or_create_cycle');

      // Step 2: any PDF template exists
      const hasTemplate = await manager.query(`SELECT 1 FROM pdf_design_templates LIMIT 1`);
      if (hasTemplate.length > 0) verifiedSteps.add('create_pdf_template');

      // Step 3: any syllabus exists
      const hasSyllabus = await manager.query(`SELECT 1 FROM syllabus WHERE is_active = true LIMIT 1`);
      if (hasSyllabus.length > 0) verifiedSteps.add('setup_syllabus');

      const completedArray = Array.from(verifiedSteps) as OnboardingStep[];
      const progressPercentage = Math.round((completedArray.length / ONBOARDING_STEPS.length) * 100);

      const availableSteps: OnboardingStepInfo[] = ONBOARDING_STEPS.map((id) => ({
        id,
        label: STEP_LABELS[id],
        completed: verifiedSteps.has(id),
      }));

      // Persist updated steps
      await manager.query(
        `UPDATE onboarding_progress SET steps_completed = $1::jsonb, updated_at = now()`,
        [JSON.stringify(completedArray)],
      );

      return { stepsCompleted: completedArray, isDismissed, progressPercentage, availableSteps };
    });
  }

  /** T022: Dismiss the checklist widget */
  async dismissOnboarding(): Promise<{ isDismissed: boolean }> {
    await this.tenantService.runInTenant(async (manager) => {
      const count = await manager.query(`SELECT COUNT(*) FROM onboarding_progress`);
      if (parseInt(count[0].count) === 0) {
        await manager.query(`INSERT INTO onboarding_progress (steps_completed, is_dismissed) VALUES ('[]'::jsonb, true)`);
      } else {
        await manager.query(`UPDATE onboarding_progress SET is_dismissed = true, updated_at = now()`);
      }
    });
    return { isDismissed: true };
  }

  /** T024: Purge all demo records in a single transaction */
  async clearDemoData(): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      // Order matters due to FK constraints (SyllabusDistribution has ON DELETE RESTRICT)
      await manager.query(`DELETE FROM syllabus_distribution WHERE syllabus_id IN (SELECT id FROM syllabus WHERE is_demo = true)`);
      await manager.query(`DELETE FROM syllabus WHERE is_demo = true`);
      await manager.query(`DELETE FROM pdf_design_templates WHERE is_demo = true`);
      await manager.query(`DELETE FROM cycles WHERE is_demo = true`);
      // Reset the onboarding progress steps
      await manager.query(
        `UPDATE onboarding_progress SET steps_completed = '[]'::jsonb, updated_at = now()`,
      );
      this.logger.log('Demo data cleared for tenant');
    });
  }

  /** Private helper: mark a step as completed in the progress record */
  private async _upsertStepCompleted(manager: any, step: OnboardingStep): Promise<void> {
    const existing = (await manager.query(
      `SELECT steps_completed FROM onboarding_progress LIMIT 1`,
    )) as { steps_completed: string[] }[];
    if (existing.length === 0) {
      await manager.query(
        `INSERT INTO onboarding_progress (steps_completed, is_dismissed) VALUES ($1::jsonb, false)`,
        [JSON.stringify([step])],
      );
    } else {
      const current = existing[0].steps_completed as string[];
      if (!current.includes(step)) {
        current.push(step);
        await manager.query(
          `UPDATE onboarding_progress SET steps_completed = $1::jsonb, updated_at = now()`,
          [JSON.stringify(current)],
        );
      }
    }
  }
}
