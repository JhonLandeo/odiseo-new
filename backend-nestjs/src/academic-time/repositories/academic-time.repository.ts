import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EntityManager, IsNull, ILike } from 'typeorm';
import {
  IAcademicTimeRepository,
  TemplateUsage,
  CycleUsage,
} from './i-academic-time.repository';
import { Cycle } from '../entities/cycle.entity';
import { CycleWeek } from '../entities/cycle-week.entity';
import { CycleMaterialTemplate } from '../entities/cycle-material-template.entity';
import { CycleMaterialTemplateCourse } from '../entities/cycle-material-template-course.entity';
import { TenantService } from '../../database/tenant.service';
import { I_SYLLABUS_REPOSITORY } from '../../syllabus/repositories/i-syllabus.repository';
import type { ISyllabusRepository } from '../../syllabus/repositories/i-syllabus.repository';

/** Postgres `unique_violation`. Raised by `uq_cycle_weeks_cycle_week_live`. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class AcademicTimeRepositoryImpl implements IAcademicTimeRepository {
  private readonly logger = new Logger(AcademicTimeRepositoryImpl.name);

  constructor(
    private readonly tenantService: TenantService,
    @Inject(I_SYLLABUS_REPOSITORY)
    private readonly syllabusRepository: ISyllabusRepository,
  ) {}

  /**
   * Persists `weeks` one row at a time and swallows a unique violation on
   * `uq_cycle_weeks_cycle_week_live` (cycle_id, week_number WHERE
   * deleted_at IS NULL). A week's dates are DERIVED from the cycle's config
   * (name/year aside, see AcademicTimeUseCase.createCycle/updateCycle), so two
   * concurrent creates/regrows computing the same week_number always produce
   * the SAME start/end dates as whichever write wins the race — skipping the
   * loser is correct, not lossy. Row-at-a-time (not a single bulk save) is
   * required so ONE colliding week never fails every other week in the batch.
   */
  private async saveWeeksSafely(
    manager: EntityManager,
    weeks: CycleWeek[],
  ): Promise<void> {
    for (const week of weeks) {
      try {
        await manager.save(CycleWeek, week);
      } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          continue;
        }
        throw error;
      }
    }
  }

  async getCycles(
    limit: number = 20,
    offset: number = 0,
    search: string = '',
  ): Promise<{ data: Cycle[]; total: number }> {
    return this.tenantService.runInTenant(async (manager) => {
      const where: any = { deletedAt: IsNull() };

      if (search && search.trim() !== '') {
        where.name = ILike(`%${search.trim()}%`);
      }

      // Query template count grouped by cycleId
      const counts = await manager
        .createQueryBuilder(CycleMaterialTemplate, 'cmt')
        .select('cmt.cycleId', 'cycleId')
        .addSelect('COUNT(cmt.id)', 'count')
        .groupBy('cmt.cycleId')
        .getRawMany();

      const countsMap = new Map<string, number>(
        counts.map((c) => [c.cycleId, parseInt(c.count, 10)]),
      );

      const [data, total] = await manager.findAndCount(Cycle, {
        relations: ['weeks'],
        where,
        order: { startDate: 'DESC', weeks: { weekNumber: 'ASC' } },
        take: limit,
        skip: offset,
      });

      const dataWithCounts = data.map((cycle: any) => ({
        ...cycle,
        templateCount: countsMap.get(cycle.id) ?? 0,
      }));

      return { data: dataWithCounts, total };
    });
  }

  async createCycle(data: any): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const { weeks, ...cycleData } = data;
      const cycle = manager.create(Cycle, cycleData);
      await manager.save(cycle);

      const cycleWeeks = weeks.map((w: any) => manager.create(CycleWeek, w));
      await this.saveWeeksSafely(manager, cycleWeeks);
    });
  }

  async updateCycle(id: string, data: any): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const { weeks, ...cycleData } = data;

      // Update the cycle core properties
      await manager.update(Cycle, id, cycleData);

      // If weeks are provided, it means we are recalculating
      if (weeks && weeks.length > 0) {
        // Find existing weeks first to know which ones to delete if they exceed the new totalWeeks
        const currentWeeks = await manager.find(CycleWeek, {
          where: { cycle: { id } },
        });
        const newWeekIds = weeks.map((w: any) => w.id);
        const weeksToDelete = currentWeeks.filter(
          (w) => !newWeekIds.includes(w.id),
        );

        if (weeksToDelete.length > 0) {
          await manager.softDelete(
            CycleWeek,
            weeksToDelete.map((w) => w.id),
          );
        }

        // Save new weeks (upsert)
        const cycleWeeks = weeks.map((w: any) => manager.create(CycleWeek, w));
        await this.saveWeeksSafely(manager, cycleWeeks);
      }
    });
  }

  async updateCycleVisibility(id: string, isActive: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(Cycle, id, { isActive });
      if (!isActive) {
        // Archiving a cycle must also archive its syllabuses, through
        // Syllabus's own module boundary rather than a raw cross-schema write
        // against a table this module does not own. deactivateByCycleId
        // re-enters this SAME transaction: TenantService.runInTenant reuses
        // the ambient tx_manager whenever the requested schema matches, so
        // the syllabus archive stays atomic with the cycle's own isActive
        // flip above.
        await this.syllabusRepository.deactivateByCycleId(id);
      }
    });
  }

  async updateWeekVisibility(id: string, isActive: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(CycleWeek, id, { isActive });
    });
  }

  async getActiveWeekNumbers(cycleId: string): Promise<number[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const weeks = await manager.find(CycleWeek, {
        where: { cycle: { id: cycleId }, isActive: true },
        order: { weekNumber: 'ASC' },
      });
      return weeks.map((w) => w.weekNumber);
    });
  }

  async getWeeksByCycle(cycleId: string): Promise<CycleWeek[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(CycleWeek, {
        where: { cycleId },
        order: { weekNumber: 'ASC' },
      });
    });
  }

  async getCycleWithSyllabus(id: string): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const cycle = await manager.findOne(Cycle, { where: { id } });
      if (!cycle) return null;

      // Query the database to check if there are active syllabuses for this cycle
      let hasSyllabus = false;
      try {
        const result = await manager.query(
          `SELECT COUNT(1) as count FROM "syllabus" WHERE "cycle_id" = $1 AND "is_active" = true`,
          [id],
        );
        hasSyllabus = parseInt(result[0]?.count || '0', 10) > 0;
      } catch (e) {
        // FAIL CLOSED. deleteCycle/updateCycle read hasSyllabus as their only
        // guard against destroying a cycle that syllabuses depend on. Returning
        // false after a failed check would report "no syllabus" on no evidence
        // and silently disable that guard, so the failure is surfaced instead.
        this.logger.error(
          `Could not check syllabus relations for cycle ${id}: ${(e as Error).message}`,
        );
        throw new InternalServerErrorException(
          'Could not verify syllabus relations for this cycle. Please retry.',
        );
      }

      return { ...cycle, hasSyllabus };
    });
  }

  async getCycleUsage(cycleId: string): Promise<CycleUsage> {
    return this.tenantService.runInTenant(async (manager) => {
      // One round-trip, four scalar sub-selects — mirrors getTemplateUsage.
      // Every table below carries a cycle_id FK straight to cycles(id); the
      // soft-delete of the cycle never cascades to them, so a non-zero count
      // means the cycle still owns related records. `syllabus` is counted with
      // NO is_active filter on purpose: an archived syllabus is still a related
      // record, and the old active-only guard let a cycle be tombstoned out
      // from under its inactive syllabuses.
      const [row] = await manager.query(
        `
        SELECT
          (SELECT COUNT(1) FROM "cycle_material_templates" WHERE "cycle_id" = $1) AS templates,
          (SELECT COUNT(1) FROM "syllabus" WHERE "cycle_id" = $1) AS syllabus,
          (SELECT COUNT(1) FROM "materials" WHERE "cycle_id" = $1) AS materials,
          (SELECT COUNT(1) FROM "material_requests" WHERE "cycle_id" = $1) AS material_requests
        `,
        [cycleId],
      );

      // No try/catch on purpose: like getCycleWithSyllabus, a failed usage check
      // must block the delete rather than read as "nothing depends on it".
      return {
        templates: parseInt(row?.templates ?? '0', 10),
        syllabus: parseInt(row?.syllabus ?? '0', 10),
        materials: parseInt(row?.materials ?? '0', 10),
        materialRequests: parseInt(row?.material_requests ?? '0', 10),
      };
    });
  }

  async softDeleteCycle(id: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.softDelete(Cycle, id);
      await manager.softDelete(CycleWeek, { cycle: { id } });
    });
  }

  async getTemplatesByCycle(cycleId: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(CycleMaterialTemplate, {
        where: { cycleId },
        relations: ['courses'],
        order: { createdAt: 'ASC' },
      });
    });
  }

  async getTemplateInCycle(
    templateId: string,
    cycleId: string,
  ): Promise<{ id: string } | null> {
    return this.tenantService.runInTenant(async (manager) => {
      // Object-level authorization guard. Scoping by { id, cycleId } yields the
      // row only when the template actually belongs to that cycle; a foreign
      // template returns null so the caller can refuse without disclosing it.
      return manager.findOne(CycleMaterialTemplate, {
        where: { id: templateId, cycleId },
        select: { id: true },
      });
    });
  }

  async createTemplate(data: any): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const { courses, ...templateData } = data;
      const template = manager.create(CycleMaterialTemplate, templateData);
      await manager.save(template);

      if (courses && courses.length > 0) {
        const templateCourses = courses.map((c: any) =>
          manager.create(CycleMaterialTemplateCourse, {
            ...c,
            templateId: template.id,
          }),
        );
        await manager.save(templateCourses);
      }
    });
  }

  async updateTemplate(templateId: string, data: any): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      const { courses, ...templateData } = data;
      await manager.update(CycleMaterialTemplate, templateId, templateData);

      if (courses) {
        // Hard delete old courses mappings and re-insert
        await manager.delete(CycleMaterialTemplateCourse, { templateId });
        if (courses.length > 0) {
          const templateCourses = courses.map((c: any) =>
            manager.create(CycleMaterialTemplateCourse, { ...c, templateId }),
          );
          await manager.save(templateCourses);
        }
      }
    });
  }

  async getTemplateUsage(templateId: string): Promise<TemplateUsage> {
    return this.tenantService.runInTenant(async (manager) => {
      // One round-trip: four scalar sub-selects instead of four queries.
      const [row] = await manager.query(
        `
        SELECT
          (SELECT COUNT(1) FROM "syllabus" WHERE "template_id" = $1) AS syllabus,
          (SELECT COUNT(1) FROM "syllabus_distribution" WHERE "template_id" = $1) AS syllabus_distribution,
          (SELECT COUNT(1) FROM "material_requests" WHERE "profile_id" = $1) AS material_requests,
          (SELECT COUNT(1) FROM "materials" WHERE "profile_id" = $1) AS materials
        `,
        [templateId],
      );

      // No try/catch on purpose: like getCycleWithSyllabus, a failed usage check
      // must block the delete rather than read as "nothing depends on it".
      return {
        syllabus: parseInt(row?.syllabus ?? '0', 10),
        syllabusDistribution: parseInt(row?.syllabus_distribution ?? '0', 10),
        materialRequests: parseInt(row?.material_requests ?? '0', 10),
        materials: parseInt(row?.materials ?? '0', 10),
      };
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      // Courses have CASCADE on delete if configured, or we delete explicitly:
      await manager.delete(CycleMaterialTemplateCourse, { templateId });
      await manager.delete(CycleMaterialTemplate, templateId);
    });
  }
}
