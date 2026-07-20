import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';
import { TenantService } from '../database/tenant.service';
import { Company } from '../tenants/entities/tenant.entity';
import { CycleMaterialTemplate } from '../academic-time/entities/cycle-material-template.entity';
import { Cycle } from '../academic-time/entities/cycle.entity';
import { Material } from './entities/material.entity';
import { CourseMaterialStatus } from './entities/material-request-course.entity';
import { MATERIALS_JOB_OPTIONS } from './constants/materials-queue.constants';
import { MaterialGeneratedListener } from '../syllabus/listeners/material-generated.listener';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';
import type { DistributedLock } from '../common/locking/distributed-lock.interface';

/** One `syllabus_distribution` week that finished generating but whose
 * `is_generated` flag never got flipped, recovered by the reconciliation
 * sweep. */
interface StuckSyllabusWeek {
  cycleId: string;
  courseId: string;
  weekNumber: number;
}

/** One `material_request_courses` row stuck in PROCESSING because the
 * dispatching process crashed between committing the status and calling
 * `queue.add`, recovered by the reconciliation sweep. */
interface StuckMaterialCourse {
  courseRequestId: string;
  courseId: string;
  materialRequestId: string;
  cycleId: string;
  weekNumber: number;
  designTemplateId: string | null;
  requiresReview: boolean;
  profileId: string;
  materialType: string;
}

@Injectable()
export class MaterialsCron {
  private readonly logger = new Logger(MaterialsCron.name);

  /**
   * Generous: this walks every tenant, cycle and week. Still far below the
   * daily interval, so a replica that dies mid-run cannot block tomorrow.
   */
  private static readonly LOCK_TTL_MS = 60 * 60 * 1000;

  private static readonly LOCK_KEY = 'cron:materials:auto-generate';

  /**
   * Well under the 15-minute tick, so a replica that dies mid-sweep cannot
   * block the next one.
   */
  private static readonly RECONCILIATION_LOCK_TTL_MS = 10 * 60 * 1000;

  private static readonly RECONCILIATION_LOCK_KEY =
    'cron:materials:reconciliation-sweep';

  /**
   * Floor below which a row is treated as "still in flight" rather than
   * "stuck", so the sweep never races the normal post-commit dispatch path
   * (webhook emit / queue.add) for a request that is simply still running.
   */
  private static readonly STALE_THRESHOLD_MINUTES = 5;

  /**
   * Hard cap on how many rows a single tick processes, per tenant per query.
   * A large post-incident backlog must not make one sweep run long enough to
   * outlive RECONCILIATION_LOCK_TTL_MS (which would let the next tick's
   * replica acquire the lock and sweep concurrently). The tradeoff: a
   * backlog bigger than this drains gradually, up to this many rows per
   * tenant per 15-minute tick, rather than all at once. Neither query orders
   * its rows, so under a backlog this large there is no guarantee the SAME
   * over-cap rows aren't reselected every tick ahead of newer ones -- a
   * known, accepted limitation for a narrow edge case (a persistently
   * failing row AND a backlog past this cap for the same tenant), not
   * something this sweep tries to solve with a priority/dead-letter scheme.
   */
  private static readonly SWEEP_BATCH_LIMIT = 200;

  constructor(
    private readonly generateMaterialUseCase: GenerateMaterialUseCase,
    private readonly tenantService: TenantService,
    private readonly cls: ClsService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @Inject(DISTRIBUTED_LOCK)
    private readonly lock: DistributedLock,
    @InjectQueue('materials-queue')
    private readonly materialsQueue: Queue,
    private readonly materialGeneratedListener: MaterialGeneratedListener,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    // MaterialsCron is registered in every process, unlike the queue processor
    // which PROCESS_ROLE already gates. The existence check below is a plain
    // read with no unique constraint behind it, so N replicas would each see
    // "no material yet" and each enqueue a duplicate generation job.
    await this.lock.runExclusively(
      MaterialsCron.LOCK_KEY,
      MaterialsCron.LOCK_TTL_MS,
      () => this.generateForAllTenants(),
    );
  }

  /**
   * Reconciliation sweep (unrelated to the daily auto-generation cron above,
   * and deliberately kept separate from it): closes the crash-window gap
   * where a use-case commits its tenant transaction and then, OUTSIDE that
   * transaction, emits an event or enqueues a BullMQ job. A crash in that
   * narrow window loses the event/job forever with no retry, leaving a row
   * stuck in a "not yet applied" state that a normal read never revisits.
   *
   * Runs every 15 minutes: frequent enough to close the crash window quickly
   * (it is narrow, but real), infrequent enough that the per-tenant queries
   * below are cheap. `@nestjs/schedule` (^6.1.3, installed) has no
   * `EVERY_15_MINUTES` member, hence the literal cron string.
   */
  @Cron('0 */15 * * * *')
  async handleReconciliationSweepCron() {
    await this.lock.runExclusively(
      MaterialsCron.RECONCILIATION_LOCK_KEY,
      MaterialsCron.RECONCILIATION_LOCK_TTL_MS,
      () => this.sweepAllTenants(),
    );
  }

  private async sweepAllTenants(): Promise<void> {
    const companies = await this.entityManager.find(Company, {
      where: { isActive: true },
    });

    for (const company of companies) {
      try {
        await this.sweepTenant(company);
      } catch (error: any) {
        this.logger.error(
          `Reconciliation sweep failed for tenant ${company.id}: ${error.message}`,
        );
        // Continue with the next tenant; one tenant's failure must not block
        // the rest (same convention as generateForAllTenants above).
      }
    }
  }

  private async sweepTenant(company: Company): Promise<void> {
    const tenantId = company.id;
    const schemaName = `tenant_${tenantId}`;

    await this.sweepStuckSyllabusDistributions(schemaName, tenantId);
    await this.sweepStuckMaterialCourses(schemaName, tenantId, company);
  }

  /**
   * Instance 1 (Syllabus): HandleMaterialWebhookUseCase commits the course's
   * terminal status, then emits `material.course.generated` OUTSIDE that
   * transaction. If the process crashes in between, the event is lost and
   * `SyllabusDistribution.isGenerated` stays false forever even though the
   * material genuinely completed. `isGenerated = false` on an already-
   * completed course IS the "stuck" marker; no outbox table needed.
   */
  private async sweepStuckSyllabusDistributions(
    schemaName: string,
    tenantId: string,
  ): Promise<void> {
    const staleWeeks: StuckSyllabusWeek[] = await this.tenantService.runInSchema(
      schemaName,
      (manager) =>
        manager.query(
          `SELECT DISTINCT s.cycle_id AS "cycleId", s.course_id AS "courseId", sd.week_number AS "weekNumber"
           FROM syllabus_distribution sd
           JOIN syllabus s ON s.id = sd.syllabus_id
           JOIN material_requests mr ON mr.cycle_id = s.cycle_id AND mr.week_number = sd.week_number
           JOIN material_request_courses mrc ON mrc.material_request_id = mr.id AND mrc.course_id = s.course_id
           WHERE sd.is_generated = false
             AND mrc.status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')
             AND mrc.completed_at < now() - ($1 * interval '1 minute')
           LIMIT $2`,
          [MaterialsCron.STALE_THRESHOLD_MINUTES, MaterialsCron.SWEEP_BATCH_LIMIT],
        ),
    );

    if (staleWeeks.length === MaterialsCron.SWEEP_BATCH_LIMIT) {
      this.logger.warn(
        `Reconciliation sweep hit the ${MaterialsCron.SWEEP_BATCH_LIMIT}-row cap for stuck syllabus distributions in tenant ${tenantId}; ` +
          `more may remain and will be picked up over subsequent ticks`,
      );
    }

    if (staleWeeks.length === 0) {
      return;
    }

    let recovered = 0;
    for (const week of staleWeeks) {
      try {
        // markWeekGenerated calls tenantService.runInTenant internally, which
        // reads the schema from CLS -- unlike runInSchema it takes no
        // explicit schema argument, so the call must run inside this context.
        const applied = await this.cls.runWith(
          { companyId: tenantId, tenantSchema: schemaName } as any,
          () => this.materialGeneratedListener.markWeekGenerated(week),
        );
        if (!applied) {
          // The JOIN that produced `week` and markWeekGenerated's own lookup
          // can disagree if the syllabus/distribution row was deleted in
          // between -- not an error, but NOT a recovery either: is_generated
          // never flips, so this row will keep matching the query above on
          // every future tick unless someone notices this log.
          this.logger.warn(
            `Reconciliation sweep found no matching syllabus distribution to update for tenant ${tenantId}, ` +
              `cycle ${week.cycleId}, course ${week.courseId}, week ${week.weekNumber} -- will keep re-matching every tick`,
          );
          continue;
        }
        recovered++;
        this.logger.debug(
          `Reconciliation sweep recovered syllabus distribution for tenant ${tenantId}, ` +
            `cycle ${week.cycleId}, course ${week.courseId}, week ${week.weekNumber}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Reconciliation sweep failed to recover syllabus distribution for tenant ${tenantId}, ` +
            `cycle ${week.cycleId}, course ${week.courseId}, week ${week.weekNumber}: ${error.message}`,
        );
      }
    }

    if (recovered > 0) {
      this.logger.log(
        `Reconciliation sweep recovered ${recovered} stuck syllabus distribution week(s) for tenant ${tenantId}`,
      );
    }
  }

  /**
   * Instance 2 (Materials): GenerateMaterialUseCase and
   * ApproveMaterialReviewUseCase both flip MaterialRequestCourse to
   * PROCESSING inside their tenant transaction, then AFTER commit call
   * queue.add(...). If the process crashes in between, the course stays
   * PROCESSING forever with no job ever queued.
   *
   * Redispatch always uses the batch 'generate-pdf' job shape (not the
   * per-course 'generate' shape ApproveMaterialReviewUseCase dispatches),
   * because GenerateMaterialUseCase materializes MaterialReviewQuestion rows
   * unconditionally in its write transaction regardless of requiresReview --
   * PdfGenerationProcessor.loadCourseQuestions always prefers those curated
   * rows over dist.topics when they exist, so the fallback distribution
   * shape is never needed. `distributions` therefore carries one entry per
   * recovered course (course_id + course_request_id, empty topics) so the
   * processor's per-course loop still has something to iterate.
   *
   * MaterialRequestCourse has no updatedAt column (only createdAt), so the
   * staleness signal is the PARENT MaterialRequest.updatedAt instead — and a
   * successful redispatch bumps that same column, so a request that is
   * merely running long (not crashed) is not redispatched again on every
   * subsequent tick; see the comment at the queue.add call site below.
   */
  private async sweepStuckMaterialCourses(
    schemaName: string,
    tenantId: string,
    company: Company,
  ): Promise<void> {
    const staleCourses: StuckMaterialCourse[] =
      await this.tenantService.runInSchema(schemaName, (manager) =>
        manager.query(
          `SELECT mrc.id AS "courseRequestId", mrc.course_id AS "courseId",
                  mr.id AS "materialRequestId", mr.cycle_id AS "cycleId",
                  mr.week_number AS "weekNumber", mr.design_template_id AS "designTemplateId",
                  mr.requires_review AS "requiresReview", mr.profile_id AS "profileId",
                  mr.material_type AS "materialType"
           FROM material_request_courses mrc
           JOIN material_requests mr ON mr.id = mrc.material_request_id
           WHERE mrc.status = $1
             AND mr.updated_at < now() - ($2 * interval '1 minute')
           LIMIT $3`,
          [
            CourseMaterialStatus.PROCESSING,
            MaterialsCron.STALE_THRESHOLD_MINUTES,
            MaterialsCron.SWEEP_BATCH_LIMIT,
          ],
        ),
      );

    if (staleCourses.length === MaterialsCron.SWEEP_BATCH_LIMIT) {
      this.logger.warn(
        `Reconciliation sweep hit the ${MaterialsCron.SWEEP_BATCH_LIMIT}-row cap for stuck material courses in tenant ${tenantId}; ` +
          `more may remain and will be picked up over subsequent ticks`,
      );
    }

    if (staleCourses.length === 0) {
      return;
    }

    // Group by materialRequestId: request-level fields (cycle, week, design
    // template, template name, tenant branding) are shared by every course
    // of the same request, and bundling them into one job mirrors how
    // GenerateMaterialUseCase originally dispatched a single job per request.
    const byRequest = new Map<string, StuckMaterialCourse[]>();
    for (const course of staleCourses) {
      const bucket = byRequest.get(course.materialRequestId) ?? [];
      bucket.push(course);
      byRequest.set(course.materialRequestId, bucket);
    }

    let recovered = 0;
    for (const [materialRequestId, courses] of byRequest) {
      try {
        const [first] = courses;
        const templateName = await this.tenantService.runInSchema(
          schemaName,
          async (manager) => {
            const template = await manager.findOne(CycleMaterialTemplate, {
              where: { id: first.profileId },
            });
            return template?.name || 'Material';
          },
        );

        const jobPayload = {
          material_request_id: materialRequestId,
          tenant_id: tenantId,
          cycle_id: first.cycleId,
          week_number: first.weekNumber,
          template_name: templateName,
          design_template_id: first.designTemplateId,
          requires_review: first.requiresReview,
          material_type: first.materialType,
          distributions: courses.map((c) => ({
            course_id: c.courseId,
            topics: [],
            exclude_question_ids: [],
            course_request_id: c.courseRequestId,
          })),
          tenant: {
            tenant_id: tenantId,
            commercial_name:
              company.commercialName || 'Colegio Odiseo Innova',
            logo_url:
              company.logoUrl ||
              'https://s3.aws.com/tenant-assets/odiseo-innova.png',
          },
        };

        await this.materialsQueue.add(
          'generate-pdf',
          jobPayload,
          MATERIALS_JOB_OPTIONS,
        );

        recovered += courses.length;
        this.logger.debug(
          `Reconciliation sweep redispatched material request ${materialRequestId} ` +
            `(${courses.length} course(s): ${courses.map((c) => c.courseRequestId).join(', ')}) for tenant ${tenantId}`,
        );

        // Bump the SAME column the staleness query above filters on, in its
        // OWN try/catch: the job is already durably queued by this point, so
        // a failure here must not be reported as "failed to redispatch" (it
        // didn't fail -- a duplicate job is now genuinely in flight) and must
        // not roll back or skip the `recovered` count above. Without this
        // bump, a request that is genuinely still processing (not crashed,
        // just running past STALE_THRESHOLD_MINUTES) would match again on
        // EVERY subsequent 15-minute tick for its entire remaining runtime,
        // each producing another full duplicate generate-pdf job -- unbounded
        // growth, not a single bounded duplicate. If the bump itself fails,
        // that specific risk reappears for this one row on the very next
        // tick; logged loudly so it's visible rather than silently retried
        // forever, since (unlike the queue.add above) a repeat of THIS
        // specific write is cheap and safe to just try again later.
        try {
          await this.tenantService.runInSchema(schemaName, (manager) =>
            manager.query(
              `UPDATE material_requests SET updated_at = now() WHERE id = $1`,
              [materialRequestId],
            ),
          );
        } catch (bumpError: any) {
          this.logger.warn(
            `Reconciliation sweep redispatched material request ${materialRequestId} for tenant ${tenantId} ` +
              `but failed to reset its staleness clock, so it may be redispatched again next tick: ${bumpError.message}`,
          );
        }
      } catch (error: any) {
        this.logger.error(
          `Reconciliation sweep failed to redispatch material request ${materialRequestId} for tenant ${tenantId}: ${error.message}`,
        );
      }
    }

    if (recovered > 0) {
      this.logger.log(
        `Reconciliation sweep redispatched ${recovered} stuck material course(s) for tenant ${tenantId}`,
      );
    }
  }

  private async generateForAllTenants(): Promise<void> {
    this.logger.log('Running US5: Automatic Material Generation (Cron)');

    // Process EVERY active company, not just the first one.
    const companies = await this.entityManager.find(Company, {
      where: { isActive: true },
    });

    if (companies.length === 0) {
      this.logger.warn(
        'No active company found. Skipping automatic material generation.',
      );
      return;
    }

    for (const company of companies) {
      try {
        await this.generateForTenant(company.id);
      } catch (error: any) {
        this.logger.error(
          `Automatic material generation failed for tenant ${company.id}: ${error.message}`,
        );
        // Continue with the next tenant; one tenant's failure must not block the rest.
      }
    }
  }

  private async generateForTenant(tenantId: string) {
    const schemaName = `tenant_${tenantId}`;

    // Buscar un perfil (CycleMaterialTemplate) activo en el esquema del tenant
    const template = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        return manager.findOne(CycleMaterialTemplate, {});
      },
    );

    if (!template) {
      this.logger.warn(
        `No CycleMaterialTemplate found for tenant schema ${schemaName}. Skipping automatic material generation.`,
      );
      return;
    }

    // Buscar todos los ciclos activos con sus semanas en el esquema del tenant
    const cycles = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        return manager.find(Cycle, {
          where: { isActive: true },
          relations: ['weeks'],
        });
      },
    );

    for (const cycle of cycles) {
      this.logger.log(`Processing cycle: ${cycle.name}`);

      for (const week of cycle.weeks || []) {
        // T026 [US5]: Lógica de iteración alineada a CR-004
        // Preservación ESTRICTA de las semanas inactivas
        if (!week.isActive) {
          this.logger.log(
            `CR-004 Validated: Preserving inactive week ${week.weekNumber} for cycle ${cycle.id} without deletion.`,
          );
          continue; // Se omite el procesamiento físico
        }

        // Check if material is already generated or enqueued
        const existingMaterial = await this.tenantService.runInSchema(
          schemaName,
          async (manager) => {
            return manager.findOne(Material, {
              where: {
                profileId: template.id,
                cycleId: cycle.id,
                weekNumber: week.weekNumber,
              },
            });
          },
        );

        if (existingMaterial) {
          this.logger.log(
            `Material for cycle ${cycle.id} week ${week.weekNumber} already exists. Skipping auto-generation.`,
          );
          continue;
        }

        this.logger.log(
          `Triggering generation for active week ${week.weekNumber} in cycle ${cycle.id}`,
        );
        try {
          // Invocamos el flujo de US1 usando el caso de uso
          await this.cls.runWith(
            {
              companyId: tenantId,
              tenantSchema: schemaName,
            } as any,
            async () => {
              await this.generateMaterialUseCase.execute(tenantId, tenantId, {
                profile_id: template.id,
                week_number: week.weekNumber,
                requires_review: false,
                courses: [],
                // Si no enviamos courses, el caso de uso toma todos los cursos del perfil por defecto
              });
            },
          );
        } catch (error: any) {
          this.logger.error(
            `Error auto-generating material for week ${week.weekNumber}: ${error.message}`,
          );
        }
      }
    }
  }
}
