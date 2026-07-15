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
    tenantId: string,
    difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | string,
    cycleId?: string, // En un entorno real se usaría para cruzar con el material_request y filtrar por ciclo
  ): Promise<Question[]> {
    this.logger.debug(
      `Buscando ${limit} preguntas para el subtema ${subtopicId} con dificultad ${difficulty || 'CUALQUIERA'}`,
    );

    const numericSubtopicId = Number(subtopicId);

    const tenantSchema = `tenant_${tenantId}`;
    
    // Get list of already used question IDs from the specific tenant schema, optionally filtered by cycle
    let query = `SELECT mrq.question_id FROM ${tenantSchema}.material_review_questions mrq`;
    const params: any[] = [];
    
    if (cycleId) {
      query += ` INNER JOIN ${tenantSchema}.material_requests r ON mrq.material_request_id = r.id`;
    }
    query += ` WHERE mrq.question_id IS NOT NULL`;
    
    if (cycleId) {
      query += ` AND r.cycle_id = $1`;
      params.push(cycleId);
    }
    
    const usedQuestionIds = await this.reviewRepository.manager.query(query, params);

    const usedIdsList = usedQuestionIds.map((row: any) => row.question_id);

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
}
