import { Injectable } from '@nestjs/common';
import { IsNull, ILike } from 'typeorm';
import { IAcademicTimeRepository } from './i-academic-time.repository';
import { Cycle } from '../entities/cycle.entity';
import { CycleWeek } from '../entities/cycle-week.entity';
import { CycleMaterialTemplate } from '../entities/cycle-material-template.entity';
import { CycleMaterialTemplateCourse } from '../entities/cycle-material-template-course.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class AcademicTimeRepositoryImpl implements IAcademicTimeRepository {
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
        const currentWeeks = await manager.find(CycleWeek, { where: { cycle: { id } } });
        const newWeekIds = weeks.map((w: any) => w.id);
        const weeksToDelete = currentWeeks.filter(w => !newWeekIds.includes(w.id));

        if (weeksToDelete.length > 0) {
          await manager.softDelete(CycleWeek, weeksToDelete.map(w => w.id));
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
        // Fallback to false if the table doesn't exist yet
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

  async deleteTemplate(templateId: string): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      // Courses have CASCADE on delete if configured, or we delete explicitly:
      await manager.delete(CycleMaterialTemplateCourse, { templateId });
      await manager.delete(CycleMaterialTemplate, templateId);
    });
  }
}
