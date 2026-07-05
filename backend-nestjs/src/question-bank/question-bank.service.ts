import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Question } from './entities/question.entity';
import { MaterialReviewQuestion } from '../materials/entities/material-review-question.entity';
import { convertUuidToIntegerId } from '../database/uuid-converter';

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    @InjectRepository(Question, 'questionsConnection')
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(MaterialReviewQuestion)
    private readonly reviewRepository: Repository<MaterialReviewQuestion>,
  ) {}

  /**
   * Extrae preguntas aleatorias excluyendo las ya usadas en el ciclo actual.
   * Implementa un Fallback en caso de que el banco se agote.
   */
  async getRandomQuestions(
    subtopicId: string,
    limit: number,
    tenantId: string,
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string,
    cycleId?: string, // En un entorno real se usaría para cruzar con el material_request y filtrar por ciclo
  ): Promise<Question[]> {
    this.logger.debug(
      `Buscando ${limit} preguntas para el subtema ${subtopicId} con dificultad ${difficulty || 'CUALQUIERA'}`,
    );

    const numericSubtopicId = convertUuidToIntegerId(subtopicId);

    // Get list of already used question IDs
    const usedQuestionIds = await this.reviewRepository
      .createQueryBuilder('mrq')
      .select('mrq.question_id')
      .where('mrq.question_id IS NOT NULL')
      .getRawMany();

    const usedIdsList = usedQuestionIds.map((row) => row.question_id);

    // Base query builder for unused questions
    const unusedIdsQb = this.questionRepository
      .createQueryBuilder('q')
      .select('q.id', 'id')
      .where(
        'q.id IN (SELECT question_id FROM odiseo.question_subtopic WHERE subtopic_id = :subtopicId AND fl_status = true)',
        { subtopicId: numericSubtopicId },
      )
      .andWhere('q.fl_status = true')
      .andWhere('q.id IN (SELECT question_id FROM odiseo.flat_questions)');

    if (usedIdsList.length > 0) {
      unusedIdsQb.andWhere('q.id NOT IN (:...usedIdsList)', { usedIdsList });
    }

    let selectedIds: string[] = [];

    // If difficulty is specified, try to find questions matching the difficulty first
    if (difficulty) {
      let levelIds: number[] = [];
      const upperDiff = String(difficulty).toUpperCase();
      if (upperDiff === 'EASY' || upperDiff === 'FACIL') {
        levelIds = [43, 44];
      } else if (upperDiff === 'MEDIUM' || upperDiff === 'INTERMEDIO' || upperDiff === 'MEDIA') {
        levelIds = [45];
      } else if (upperDiff === 'HARD' || upperDiff === 'DIFICIL') {
        levelIds = [46, 47, 48, 49, 50, 51, 52];
      }

      if (levelIds.length > 0) {
        const diffQb = unusedIdsQb.clone().andWhere('q.level_id IN (:...levelIds)', { levelIds });
        const diffRows = await diffQb.orderBy('RANDOM()').limit(limit).getRawMany();
        selectedIds = diffRows.map((row) => row.id);
      }
    }

    // If no difficulty was specified or not enough questions found, fall back to any difficulty (still unused)
    if (selectedIds.length < limit) {
      const remainingLimit = limit - selectedIds.length;
      const fallbackQb = unusedIdsQb.clone();
      if (selectedIds.length > 0) {
        fallbackQb.andWhere('q.id NOT IN (:...selectedIds)', { selectedIds });
      }
      const fallbackRows = await fallbackQb.orderBy('RANDOM()').limit(remainingLimit).getRawMany();
      selectedIds = [...selectedIds, ...fallbackRows.map((row) => row.id)];
    }

    // Priority 2 (Fallback): Agotamiento del Banco (relax unused constraint)
    if (selectedIds.length < limit) {
      const missingCount = limit - selectedIds.length;
      this.logger.warn(
         `Banco agotado para subtema ${subtopicId}. Faltan ${missingCount} preguntas. Relajando regla de no-repetición.`,
      );

      const fallbackIdsQb = this.questionRepository
        .createQueryBuilder('q')
        .select('q.id', 'id')
        .where(
          'q.id IN (SELECT question_id FROM odiseo.question_subtopic WHERE subtopic_id = :subtopicId AND fl_status = true)',
          { subtopicId: numericSubtopicId },
        )
        .andWhere('q.fl_status = true')
        .andWhere('q.id IN (SELECT question_id FROM odiseo.flat_questions)');

      if (selectedIds.length > 0) {
        fallbackIdsQb.andWhere('q.id NOT IN (:...selectedIds)', {
          selectedIds,
        });
      }

      const fallbackIdRows = await fallbackIdsQb
        .orderBy('RANDOM()')
        .limit(missingCount)
        .getRawMany();
      selectedIds = [...selectedIds, ...fallbackIdRows.map((row) => row.id)];
    }

    if (selectedIds.length === 0) {
      return [];
    }

    // Retrieve full question entities with alternatives for selected IDs
    return this.questionRepository.find({
      where: { id: In(selectedIds) },
      relations: ['alternatives'],
    });
  }
}
