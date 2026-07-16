import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Question } from './entities/question.entity';
import { MaterialReviewQuestion } from '../materials/entities/material-review-question.entity';
import { getLevelIdsForDifficulty } from './constants/question-levels.constant';
import { QuestionSelectionStrategy, SelectionRequest } from './strategies/question-selection.strategy';


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
    excludeIds: string[] = [],
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string,
  ): Promise<Question[]> {
    this.logger.debug(
      `Buscando ${limit} preguntas para el subtema ${subtopicId} con dificultad ${difficulty || 'CUALQUIERA'}`,
    );

    const numericSubtopicId = Number(subtopicId);
    const usedIdsList = excludeIds;

    // Fetch all valid question IDs and their levels for this subtopic
    const pool = await this.questionRepository
      .createQueryBuilder('q')
      .select(['q.id', 'q.levelId'])
      .where(
        'q.id IN (SELECT question_id FROM odiseo.question_subtopic WHERE subtopic_id = :subtopicId AND fl_status = true)',
        { subtopicId: numericSubtopicId },
      )
      .andWhere('q.fl_status = true')
      .andWhere('q.id IN (SELECT question_id FROM odiseo.flat_questions)')
      .getMany();

    const requests: SelectionRequest[] = Array(limit).fill({ expectedLevel: difficulty });
    
    // Call the centralized strategy. QuestionBankService allows recycling (Fallback 2)
    const selectedQ = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      usedIdsList,
      requests,
      true // allowRecycling
    );

    const selectedIds = selectedQ.filter(q => q !== null).map(q => String(q!.id));

    if (selectedIds.length === 0) {
      return [];
    }

    // Retrieve full question entities with alternatives for selected IDs
    return this.questionRepository.find({
      where: { id: In(selectedIds) },
      relations: ['alternatives'],
    });
  }

  async getSubtopicQuestionMappings(subtopicIds: number[]): Promise<any[]> {
    if (subtopicIds.length === 0) return [];
    
    return this.questionRepository.manager
      .createQueryBuilder()
      .select('question_id', 'questionId')
      .addSelect('subtopic_id', 'subtopicId')
      .from('odiseo.question_subtopic', 'qs')
      .where(
        'qs.subtopic_id IN (:...subtopicIds) AND qs.fl_status = true AND qs.question_id IN (SELECT question_id FROM odiseo.flat_questions)',
        { subtopicIds },
      )
      .getRawMany();
  }

  async getQuestionsByIds(questionIds: string[]): Promise<Question[]> {
    if (questionIds.length === 0) return [];
    return this.questionRepository.find({
      where: { id: In(questionIds) },
      relations: ['alternatives'],
    });
  }
}
