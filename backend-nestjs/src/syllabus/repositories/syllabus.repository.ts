import { Injectable } from '@nestjs/common';
import { ISyllabusRepository, SyllabusWithProgress } from './i-syllabus.repository';
import { Syllabus } from '../entities/syllabus.entity';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class SyllabusRepositoryImpl implements ISyllabusRepository {
  constructor(private readonly tenantService: TenantService) {}

  async createSyllabus(syllabus: Partial<Syllabus>): Promise<Syllabus> {
    return this.tenantService.runInTenant(async (manager) => {
      const newSyllabus = manager.create(Syllabus, syllabus);
      return await manager.save(newSyllabus);
    });
  }

  async findById(id: string): Promise<Syllabus | null> {
    return this.tenantService.runInTenant(async (manager) => {
      return await manager.findOne(Syllabus, { where: { id, isActive: true } });
    });
  }

  async findByCourseAndCycle(
    courseId: string,
    cycleId: string,
  ): Promise<Syllabus | null> {
    return this.tenantService.runInTenant(async (manager) => {
      return await manager.findOne(Syllabus, {
        where: { courseId, cycleId, isActive: true },
      });
    });
  }

  async findByCycle(cycleId: string): Promise<Syllabus[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(Syllabus, { where: { cycleId } });
    });
  }

  async findByCycleWithProgress(cycleId: string): Promise<SyllabusWithProgress[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.query(
         `SELECT
          s.id,
          s.cycle_id AS "cycleId",
          s.course_id AS "courseId",
          s.name,
          s.template_id AS "templateId",
          s.is_active AS "isActive",
          s.created_at AS "createdAt",
          s.updated_at AS "updatedAt",
          COALESCE(c.total_weeks, 0) AS "totalWeeks",
          COALESCE(
            (SELECT array_agg(DISTINCT sd.week_number) FROM syllabus_distribution sd WHERE sd.syllabus_id = s.id),
            ARRAY[]::integer[]
          ) AS "filledWeeks",
          COALESCE(
            (
              SELECT json_object_agg(COALESCE(sd.template_id::text, 'null'), sd.weeks)
              FROM (
                SELECT template_id, array_agg(DISTINCT week_number) as weeks
                FROM syllabus_distribution
                WHERE syllabus_id = s.id
                GROUP BY template_id
              ) sd
            ),
            '{}'::json
          ) AS "templateProgress"
        FROM syllabus s
        LEFT JOIN cycles c ON c.id = s.cycle_id
        WHERE s.cycle_id = $1`,
        [cycleId],
      );
    });
  }

  async setTemplate(syllabusId: string, templateId: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(Syllabus, syllabusId, { templateId });
    });
  }

  async updateVisibility(id: string, isActive: boolean): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(Syllabus, id, { isActive });
    });
  }

  async createDistribution(
    distribution: Partial<SyllabusDistribution>,
  ): Promise<SyllabusDistribution> {
    return this.tenantService.runInTenant(async (manager) => {
      const newDist = manager.create(SyllabusDistribution, distribution);
      return await manager.save(newDist);
    });
  }

  async updateDistributionQuantity(id: string, questionCount: number): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.update(SyllabusDistribution, { id }, { questionCount });
    });
  }

  async deleteDistribution(id: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.delete(SyllabusDistribution, { id });
    });
  }

  async bulkCreateDistributions(
    distributions: Partial<SyllabusDistribution>[],
  ): Promise<SyllabusDistribution[]> {
    if (!distributions || distributions.length === 0) return [];
    return this.tenantService.runInTenant(async (manager) => {
      const newDists = manager.create(SyllabusDistribution, distributions);
      return await manager.save(SyllabusDistribution, newDists, { chunk: 500 });
    });
  }

  async bulkDeleteDistributionsBySyllabus(syllabusId: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      await manager.delete(SyllabusDistribution, { syllabusId });
    });
  }

  async getSummaryBySyllabus(
    syllabusId: string,
    templateId?: string,
  ): Promise<SyllabusDistribution[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const where: any = { syllabusId };
      if (templateId) {
        where.templateId = templateId;
      }
      return await manager.find(SyllabusDistribution, { where });
    });
  }

  async findGeneratedWeeks(syllabusId: string): Promise<number[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const syllabus = await manager.findOne(Syllabus, {
        where: { id: syllabusId },
      });
      if (!syllabus) return [];

      const rows = await manager.query(
        `SELECT DISTINCT mr.week_number
         FROM material_requests mr
         INNER JOIN material_request_courses mrc ON mrc.material_request_id = mr.id
         WHERE mr.cycle_id = $1
           AND mrc.course_id = $2
           AND mrc.status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')`,
        [syllabus.cycleId, syllabus.courseId],
      );
      return rows.map((r: any) => r.week_number);
    });
  }

  async findActiveWeeksByCycle(cycleId: string): Promise<number[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const rows = await manager.query(
        `SELECT week_number FROM cycle_weeks WHERE cycle_id = $1 AND is_active = true AND deleted_at IS NULL ORDER BY week_number ASC`,
        [cycleId],
      );
      return rows.map((r: any) => r.week_number);
    });
  }

  async findTemplatesByCycle(cycleId: string): Promise<{ id: string; name: string }[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const rows = await manager.query(
        `SELECT id, name FROM cycle_material_templates WHERE cycle_id = $1`,
        [cycleId],
      );
      return rows.map((r: any) => ({ id: r.id, name: r.name }));
    });
  }
}
