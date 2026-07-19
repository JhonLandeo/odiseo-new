import {
  Injectable,
  Inject,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { I_SYLLABUS_REPOSITORY } from './repositories/i-syllabus.repository';
import type { ISyllabusRepository } from './repositories/i-syllabus.repository';
import { CreateSyllabusDto } from './dto/create-syllabus.dto';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { TenantService } from '../database/tenant.service';
import { AcademicTimeUseCase } from '../academic-time/academic-time.use-case';
import { Syllabus } from './entities/syllabus.entity';
import { SyllabusDistribution } from './entities/syllabus-distribution.entity';

/**
 * FR-007: hard technical cap on the sum of `question_count` per syllabus week,
 * across every template (a generated material reads the whole week, regardless
 * of template — see generate-material.use-case). This is complementary to the
 * per-cell `Max(100)` enforced by the DTOs.
 */
const WEEKLY_QUESTION_LIMIT = 100;

@Injectable()
export class SyllabusUseCase {
  constructor(
    @Inject(I_SYLLABUS_REPOSITORY)
    private readonly syllabusRepo: ISyllabusRepository,
    private readonly tenantService: TenantService,
    private readonly academicTimeUseCase: AcademicTimeUseCase,
  ) {}

  async create(dto: CreateSyllabusDto) {
    const existing = await this.syllabusRepo.findByCourseAndCycle(
      dto.courseId,
      dto.cycleId,
    );
    if (existing) {
      throw new ConflictException(
        'Ya existe un sílabo para este curso y ciclo. Por favor edite el existente.',
      );
    }

    return await this.syllabusRepo.createSyllabus({
      courseId: dto.courseId,
      cycleId: dto.cycleId,
      name: 'Nuevo Sílabo',
      isActive: true,
    });
  }

  async findByCycle(cycleId: string) {
    return await this.syllabusRepo.findByCycleWithProgress(cycleId);
  }

  async addDistribution(syllabusId: string, dto: CreateDistributionDto) {
    // FR-007: reject if this cell would push the week's total over the limit.
    // Residual TOCTOU race: this is an application-level check-then-write, not
    // an atomic guarantee. A per-week SUM cannot be expressed as a DB CHECK
    // constraint, so two concurrent creates can each read a sum under the cap
    // and jointly exceed it. That is accepted for a soft business limit; heavy
    // locking is not justified here.
    const currentSum = await this.syllabusRepo.sumWeekQuestionCount(
      syllabusId,
      dto.weekNumber,
    );
    if (currentSum + dto.questionCount > WEEKLY_QUESTION_LIMIT) {
      throw new BadRequestException(
        `La semana ${dto.weekNumber} superaría el límite de ${WEEKLY_QUESTION_LIMIT} preguntas ` +
          `(actual: ${currentSum}, se intenta agregar: ${dto.questionCount}).`,
      );
    }

    return await this.syllabusRepo.createDistribution({
      syllabusId,
      templateId: dto.templateId || null,
      weekNumber: dto.weekNumber,
      topicId: dto.topicId,
      subtopicId: dto.subtopicId,
      questionCount: dto.questionCount,
    });
  }

  async updateDistributionQuantity(
    distId: string,
    syllabusId: string,
    questionCount: number,
  ) {
    // FR-007: the week total must stay within the limit AFTER this cell takes
    // its new value, so exclude the cell being updated from the current sum and
    // add the incoming quantity. Same residual TOCTOU caveat as addDistribution
    // applies (application-level check-then-write, no DB-level atomicity).
    const dist = await this.syllabusRepo.getDistributionById(
      distId,
      syllabusId,
    );
    if (dist) {
      const otherCellsSum = await this.syllabusRepo.sumWeekQuestionCount(
        syllabusId,
        dist.weekNumber,
        distId,
      );
      if (otherCellsSum + questionCount > WEEKLY_QUESTION_LIMIT) {
        throw new BadRequestException(
          `La semana ${dist.weekNumber} superaría el límite de ${WEEKLY_QUESTION_LIMIT} preguntas ` +
            `(resto de la semana: ${otherCellsSum}, nuevo valor: ${questionCount}).`,
        );
      }
    }
    // If the cell does not exist, fall through: the repository update reports
    // the same NotFound it always has, preserving existing behavior.

    await this.syllabusRepo.updateDistributionQuantity(
      distId,
      syllabusId,
      questionCount,
    );
  }

  async deleteDistribution(distId: string, syllabusId: string) {
    await this.syllabusRepo.deleteDistribution(distId, syllabusId);
  }

  async getSummary(syllabusId: string, templateId?: string) {
    const distributions = await this.syllabusRepo.getSummaryBySyllabus(
      syllabusId,
      templateId,
    );
    const generatedWeeks =
      await this.syllabusRepo.findGeneratedWeeks(syllabusId);

    const summary = {
      totalQuestions: 0,
      weeklyQuestions: {} as Record<number, number>,
      topicQuestions: {} as Record<string, number>,
      distributions,
      generatedWeeks,
    };

    for (const dist of distributions) {
      summary.totalQuestions += dist.questionCount;
      summary.weeklyQuestions[dist.weekNumber] =
        (summary.weeklyQuestions[dist.weekNumber] || 0) + dist.questionCount;
      summary.topicQuestions[dist.topicId] =
        (summary.topicQuestions[dist.topicId] || 0) + dist.questionCount;
    }

    return summary;
  }

  async cloneSyllabus(
    syllabusId: string,
    sourceSyllabusId: string,
    targetActiveWeeks?: number[],
  ) {
    return this.tenantService.runInTenant(async () => {
      const targetSyllabus = await this.syllabusRepo.findById(syllabusId);
      if (!targetSyllabus)
        throw new BadRequestException('Syllabus destino no encontrado.');

      const sourceSyllabus = await this.syllabusRepo.findById(sourceSyllabusId);
      if (!sourceSyllabus)
        throw new BadRequestException('Syllabus origen no encontrado.');

      const activeWeeks =
        targetActiveWeeks ||
        (await this.academicTimeUseCase.getActiveWeekNumbers(
          targetSyllabus.cycleId,
        ));
      const sourceDistributions =
        await this.syllabusRepo.getSummaryBySyllabus(sourceSyllabusId);

      const templateMap = await this.buildTemplateMapping(
        sourceSyllabus,
        targetSyllabus,
        sourceDistributions,
      );

      await this.clearExistingDistributions(syllabusId);
      await this.copyDistributions(
        syllabusId,
        sourceDistributions,
        activeWeeks,
        sourceSyllabus,
        targetSyllabus,
        templateMap,
      );
      await this.setDefaultTemplate(
        syllabusId,
        sourceSyllabus,
        targetSyllabus,
        templateMap,
      );

      return await this.getSummary(syllabusId);
    });
  }

  private async buildTemplateMapping(
    sourceSyllabus: Syllabus,
    targetSyllabus: Syllabus,
    sourceDistributions: SyllabusDistribution[],
  ) {
    const templateMap: Record<string, string | null> = {};
    if (sourceSyllabus.cycleId === targetSyllabus.cycleId) return templateMap;

    const referencedTemplateIds = new Set<string>();
    if (sourceSyllabus.templateId)
      referencedTemplateIds.add(sourceSyllabus.templateId);
    sourceDistributions.forEach((dist) => {
      if (dist.templateId) referencedTemplateIds.add(dist.templateId);
    });

    if (referencedTemplateIds.size === 0) return templateMap;

    const sourceTemplates = await this.academicTimeUseCase.getTemplates(
      sourceSyllabus.cycleId,
    );
    const targetTemplates = await this.academicTimeUseCase.getTemplates(
      targetSyllabus.cycleId,
    );

    if (targetTemplates.length === 0) {
      referencedTemplateIds.forEach((id) => (templateMap[id] = null));
      return templateMap;
    }

    const missingTemplateNames: string[] = [];
    referencedTemplateIds.forEach((srcTempId) => {
      const srcTemplate = sourceTemplates.find((t) => t.id === srcTempId);
      if (!srcTemplate) return;

      const match = targetTemplates.find(
        (tgtT) =>
          tgtT.name.trim().toLowerCase() ===
          srcTemplate.name.trim().toLowerCase(),
      );
      if (match) {
        templateMap[srcTempId] = match.id;
      } else {
        missingTemplateNames.push(srcTemplate.name);
      }
    });

    if (missingTemplateNames.length > 0) {
      throw new BadRequestException(
        `No se puede realizar la clonación. Las siguientes plantillas de evaluación usadas en el origen no existen en el ciclo destino: [${missingTemplateNames.join(', ')}]. Por favor, configúrelas en el ciclo destino antes de continuar.`,
      );
    }

    return templateMap;
  }

  private async clearExistingDistributions(syllabusId: string) {
    await this.syllabusRepo.bulkDeleteDistributionsBySyllabus(syllabusId);
  }

  private async copyDistributions(
    syllabusId: string,
    sourceDistributions: SyllabusDistribution[],
    activeWeeks: number[],
    sourceSyllabus: Syllabus,
    targetSyllabus: Syllabus,
    templateMap: Record<string, string | null>,
  ) {
    const distributionsToCreate: any[] = [];
    for (const dist of sourceDistributions) {
      if (!activeWeeks.includes(dist.weekNumber)) continue;

      let newTemplateId = dist.templateId;
      if (dist.templateId) {
        newTemplateId =
          templateMap[dist.templateId] !== undefined
            ? templateMap[dist.templateId]
            : sourceSyllabus.cycleId === targetSyllabus.cycleId
              ? dist.templateId
              : null;
        if (newTemplateId === null && dist.templateId) continue;
      }

      distributionsToCreate.push({
        syllabusId,
        weekNumber: dist.weekNumber,
        topicId: dist.topicId,
        subtopicId: dist.subtopicId,
        questionCount: dist.questionCount,
        templateId: newTemplateId,
      });
    }

    if (distributionsToCreate.length > 0) {
      await this.syllabusRepo.bulkCreateDistributions(distributionsToCreate);
    }
  }

  private async setDefaultTemplate(
    syllabusId: string,
    sourceSyllabus: Syllabus,
    targetSyllabus: Syllabus,
    templateMap: Record<string, string | null>,
  ) {
    if (!sourceSyllabus.templateId) return;

    const targetSyllabusTemplateId =
      sourceSyllabus.cycleId === targetSyllabus.cycleId
        ? sourceSyllabus.templateId
        : templateMap[sourceSyllabus.templateId] || null;

    if (targetSyllabusTemplateId) {
      await this.syllabusRepo.setTemplate(syllabusId, targetSyllabusTemplateId);
    }
  }

  async cloneCycleSyllabuses(targetCycleId: string, sourceCycleId: string) {
    // Atomic: the whole cycle clone runs in a single tenant transaction so a
    // mid-way failure rolls back every syllabus instead of leaving a partial
    // clone. Nested repo/use-case calls reuse this ambient transaction.
    return this.tenantService.runInTenant(async () => {
      const sourceSyllabuses =
        await this.syllabusRepo.findByCycle(sourceCycleId);

      if (sourceSyllabuses.length === 0) {
        throw new BadRequestException(
          'El ciclo origen no tiene sílabos para clonar.',
        );
      }

      const targetActiveWeeks =
        await this.academicTimeUseCase.getActiveWeekNumbers(targetCycleId);

      const existingTargets =
        await this.syllabusRepo.findByCycle(targetCycleId);
      const existingTargetMap = new Map(
        existingTargets.map((s) => [s.courseId, s]),
      );

      let clonedCount = 0;
      for (const sourceSyllabus of sourceSyllabuses) {
        const existingTarget = existingTargetMap.get(sourceSyllabus.courseId);

        let targetSyllabusId;
        if (existingTarget) {
          targetSyllabusId = existingTarget.id;
        } else {
          const newSyllabus = await this.syllabusRepo.createSyllabus({
            cycleId: targetCycleId,
            courseId: sourceSyllabus.courseId,
            name: sourceSyllabus.name,
            isActive: true,
          });
          targetSyllabusId = newSyllabus.id;
        }

        await this.cloneSyllabus(
          targetSyllabusId,
          sourceSyllabus.id,
          targetActiveWeeks,
        );
        clonedCount++;
      }

      return { clonedCount };
    });
  }

  async setTemplate(syllabusId: string, templateId: string) {
    await this.syllabusRepo.setTemplate(syllabusId, templateId);
  }

  async archiveSyllabus(id: string, isActive: boolean) {
    await this.syllabusRepo.updateVisibility(id, isActive);
  }
}
