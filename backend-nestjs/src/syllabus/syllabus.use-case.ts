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

@Injectable()
export class SyllabusUseCase {
  constructor(
    @Inject(I_SYLLABUS_REPOSITORY)
    private readonly syllabusRepo: ISyllabusRepository,
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
    await this.syllabusRepo.updateDistributionQuantity(distId, questionCount);
  }

  async deleteDistribution(distId: string) {
    await this.syllabusRepo.deleteDistribution(distId);
  }

  async getSummary(syllabusId: string, templateId?: string) {
    const distributions =
      await this.syllabusRepo.getSummaryBySyllabus(syllabusId, templateId);
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
    const targetSyllabus = await this.syllabusRepo.findById(syllabusId);
    if (!targetSyllabus) {
      throw new BadRequestException('Syllabus destino no encontrado.');
    }

    const sourceSyllabus = await this.syllabusRepo.findById(sourceSyllabusId);
    if (!sourceSyllabus) {
      throw new BadRequestException('Syllabus origen no encontrado.');
    }

    let activeWeeks = targetActiveWeeks;
    if (!activeWeeks) {
      activeWeeks = await this.syllabusRepo.findActiveWeeksByCycle(
        targetSyllabus.cycleId,
      );
    }

    const sourceDistributions =
      await this.syllabusRepo.getSummaryBySyllabus(sourceSyllabusId);

    // Build template mapping and validate that all used templates exist in target cycle
    const templateMap: Record<string, string | null> = {};
    if (sourceSyllabus.cycleId !== targetSyllabus.cycleId) {
      const referencedTemplateIds = new Set<string>();
      if (sourceSyllabus.templateId) {
        referencedTemplateIds.add(sourceSyllabus.templateId);
      }
      for (const dist of sourceDistributions) {
        if (dist.templateId) {
          referencedTemplateIds.add(dist.templateId);
        }
      }

      if (referencedTemplateIds.size > 0) {
        const sourceTemplates = await this.syllabusRepo.findTemplatesByCycle(
          sourceSyllabus.cycleId,
        );
        const targetTemplates = await this.syllabusRepo.findTemplatesByCycle(
          targetSyllabus.cycleId,
        );

        if (targetTemplates.length > 0) {
          const missingTemplateNames: string[] = [];
          for (const srcTempId of referencedTemplateIds) {
            const srcTemplate = sourceTemplates.find((t) => t.id === srcTempId);
            if (!srcTemplate) continue;

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
          }

          if (missingTemplateNames.length > 0) {
            throw new BadRequestException(
              `No se puede realizar la clonación. Las siguientes plantillas de evaluación usadas en el origen no existen en el ciclo destino: [${missingTemplateNames.join(', ')}]. Por favor, configúrelas en el ciclo destino antes de continuar.`,
            );
          }
        } else {
          // If no templates exist in target cycle at all, bypass strict check and map everything to null
          for (const srcTempId of referencedTemplateIds) {
            templateMap[srcTempId] = null;
          }
        }
      }
    }

    // Clean existing
    const currentDistributions =
      await this.syllabusRepo.getSummaryBySyllabus(syllabusId);
    for (const dist of currentDistributions) {
      await this.syllabusRepo.deleteDistribution(dist.id);
    }

    // Copy new
    for (const dist of sourceDistributions) {
      if (!activeWeeks.includes(dist.weekNumber)) {
        continue;
      }

      let targetTemplateId: string | null = null;
      if (dist.templateId) {
        if (sourceSyllabus.cycleId === targetSyllabus.cycleId) {
          targetTemplateId = dist.templateId;
        } else {
          targetTemplateId = templateMap[dist.templateId] || null;
        }
      }

      await this.syllabusRepo.createDistribution({
        syllabusId,
        weekNumber: dist.weekNumber,
        topicId: dist.topicId,
        subtopicId: dist.subtopicId,
        questionCount: dist.questionCount,
        templateId: targetTemplateId,
      });
    }

    // Set syllabus-level default templateId if mapped
    if (sourceSyllabus.templateId) {
      let targetSyllabusTemplateId: string | null = null;
      if (sourceSyllabus.cycleId === targetSyllabus.cycleId) {
        targetSyllabusTemplateId = sourceSyllabus.templateId;
      } else {
        targetSyllabusTemplateId = templateMap[sourceSyllabus.templateId] || null;
      }
      if (targetSyllabusTemplateId) {
        await this.syllabusRepo.setTemplate(syllabusId, targetSyllabusTemplateId);
      }
    }

    return await this.getSummary(syllabusId);
  }

  async cloneCycleSyllabuses(targetCycleId: string, sourceCycleId: string) {
    const sourceSyllabuses = await this.syllabusRepo.findByCycle(sourceCycleId);

    if (sourceSyllabuses.length === 0) {
      throw new BadRequestException('El ciclo origen no tiene sílabos para clonar.');
    }

    const targetActiveWeeks =
      await this.syllabusRepo.findActiveWeeksByCycle(targetCycleId);

    let clonedCount = 0;
    for (const sourceSyllabus of sourceSyllabuses) {
      const existingTarget = await this.syllabusRepo.findByCourseAndCycle(
        sourceSyllabus.courseId,
        targetCycleId,
      );

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
  }

  async setTemplate(syllabusId: string, templateId: string) {
    await this.syllabusRepo.setTemplate(syllabusId, templateId);
  }

  async archiveSyllabus(id: string, isActive: boolean) {
    await this.syllabusRepo.updateVisibility(id, isActive);
  }
}
