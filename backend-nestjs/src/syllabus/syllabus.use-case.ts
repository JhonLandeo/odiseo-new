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

  async cloneSyllabus(syllabusId: string, sourceSyllabusId: string) {
    const sourceDistributions =
      await this.syllabusRepo.getSummaryBySyllabus(sourceSyllabusId);

    // Clean existing
    const currentDistributions =
      await this.syllabusRepo.getSummaryBySyllabus(syllabusId);
    for (const dist of currentDistributions) {
      await this.syllabusRepo.deleteDistribution(dist.id);
    }

    // Copy new
    for (const dist of sourceDistributions) {
      await this.syllabusRepo.createDistribution({
        syllabusId,
        weekNumber: dist.weekNumber,
        topicId: dist.topicId,
        subtopicId: dist.subtopicId,
        questionCount: dist.questionCount,
      });
    }

    return await this.getSummary(syllabusId);
  }

  async cloneCycleSyllabuses(targetCycleId: string, sourceCycleId: string) {
    const sourceSyllabuses = await this.syllabusRepo.findByCycle(sourceCycleId);

    if (sourceSyllabuses.length === 0) {
      throw new BadRequestException('El ciclo origen no tiene sílabos para clonar.');
    }

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

      await this.cloneSyllabus(targetSyllabusId, sourceSyllabus.id);
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
