import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { IsNull, ILike } from 'typeorm';
import {
  IAcademicTimeRepository,
  TemplateUsage,
} from './i-academic-time.repository';
import { Cycle } from '../entities/cycle.entity';
import { CycleWeek } from '../entities/cycle-week.entity';
import { CycleMaterialTemplate } from '../entities/cycle-material-template.entity';
import { CycleMaterialTemplateCourse } from '../entities/cycle-material-template-course.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class AcademicTimeRepositoryImpl implements IAcademicTimeRepository {
  private readonly logger = new Logger(AcademicTimeRepositoryImpl.name);

  constructor(private readonly tenantService: TenantService) {}

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
      await manager.save(cycleWeeks);
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
        await manager.save(CycleWeek, cycleWeeks);
      }
    });
  }

  async updateCycleVisibility(id: string, isActive: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(Cycle, id, { isActive });
      if (!isActive) {
        // If a cycle is archived, all its associated syllabuses should also be archived
        // to prevent active syllabuses from belonging to inactive cycles.
        await manager.query(
          `UPDATE "syllabus" SET is_active = false WHERE cycle_id = $1`,
          [id],
        );
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
