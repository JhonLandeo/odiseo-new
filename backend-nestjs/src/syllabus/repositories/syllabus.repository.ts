import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import {
  ISyllabusRepository,
  SyllabusWithProgress,
} from './i-syllabus.repository';

/** Postgres `unique_violation`. Raised by `uq_syllabus_cycle_course_active`. */
const UNIQUE_VIOLATION = '23505';
import { Syllabus } from '../entities/syllabus.entity';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class SyllabusRepositoryImpl implements ISyllabusRepository {
  constructor(private readonly tenantService: TenantService) {}

  async createSyllabus(syllabus: Partial<Syllabus>): Promise<Syllabus> {
    return this.tenantService.runInTenant(async (manager) => {
      const newSyllabus = manager.create(Syllabus, syllabus);
      try {
        return await manager.save(newSyllabus);
      } catch (error) {
        // The use case checks for an existing syllabus in a separate
        // transaction, so two concurrent creates both pass that check and race
        // here. The partial unique index is what actually enforces uniqueness;
        // translate the loser's violation into the same 409 the check returns.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new ConflictException(
            'Ya existe un sílabo para este curso y ciclo. Por favor edite el existente.',
          );
        }
        throw error;
      }
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

  async findByCycleWithProgress(
    cycleId: string,
  ): Promise<SyllabusWithProgress[]> {
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
      try {
        await manager.update(Syllabus, id, { isActive });
      } catch (error) {
        // UQ_syllabus_active_cycle_course is a partial unique index over the
        // active rows, so reactivating an archived syllabus collides when
        // another one is already active for the same course and cycle. That is
        // a real conflict the caller must resolve, not a server fault: surface
        // it as 409 instead of letting the driver error bubble up as a 500.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          throw new ConflictException(
            'Ya existe un sílabo activo para este curso y ciclo. Archívelo antes de reactivar este.',
          );
        }
        throw error;
      }
    });
  }

  async createDistribution(
    distribution: Partial<SyllabusDistribution>,
  ): Promise<SyllabusDistribution> {
    return this.tenantService.runInTenant(async (manager) => {
      const newDist = manager.create(SyllabusDistribution, distribution);
      try {
        return await manager.save(newDist);
      } catch (error) {
        // The matrix is saved one cell per request, so two coordinators
        // toggling the same previously-empty cell both insert and the loser
        // violates UQ_syllabus_template_week_topic_subtopic. EC-004 mandates
        // Last-Write-Wins here, not a 500 and not a 409 (which would make the
        // first writer win): converge on the existing row and overwrite its
        // value so the last save wins.
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
          const existing = await manager.findOne(SyllabusDistribution, {
            where: {
              syllabusId: newDist.syllabusId,
              templateId: newDist.templateId ?? IsNull(),
              weekNumber: newDist.weekNumber,
              topicId: newDist.topicId,
              subtopicId: newDist.subtopicId,
            },
          });
          if (existing) {
            existing.questionCount = newDist.questionCount;
            return await manager.save(existing);
          }
        }
        throw error;
      }
    });
  }

  async updateDistributionQuantity(
    id: string,
    syllabusId: string,
    questionCount: number,
  ): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      // Scope by both the distribution id AND its owning syllabus so a caller
      // cannot mutate a distribution that belongs to a different syllabus by
      // passing a mismatched :id path param (object-level authorization). The
      // affected-row count is the race-free ownership check (single query).
      const result = await manager.update(
        SyllabusDistribution,
        { id, syllabusId },
        { questionCount },
      );
      if (!result.affected) {
        // NotFound over Forbidden: do not disclose that the distribution
        // exists under a different syllabus.
        throw new NotFoundException(
          'Distribution not found for this syllabus.',
        );
      }
    });
  }

  async deleteDistribution(id: string, syllabusId: string): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      const result = await manager.delete(SyllabusDistribution, {
        id,
        syllabusId,
      });
      if (!result.affected) {
        throw new NotFoundException(
          'Distribution not found for this syllabus.',
        );
      }
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
      const rows = await manager.query(
        `SELECT DISTINCT week_number
         FROM syllabus_distribution
         WHERE syllabus_id = $1 AND is_generated = true`,
        [syllabusId],
      );
      return rows.map((r: any) => r.week_number);
    });
  }
}
