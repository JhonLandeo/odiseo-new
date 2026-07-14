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

    const usedSet = new Set(usedIdsList);
    const unusedPool = pool.filter(q => !usedSet.has(q.id));
    
    // Fisher-Yates shuffle helper
    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    let selectedIds: string[] = [];

    // Priority 1: Unused questions matching difficulty
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
        const diffPool = unusedPool.filter(q => levelIds.includes(q.levelId));
        shuffle(diffPool);
        const take = Math.min(limit, diffPool.length);
        selectedIds = diffPool.slice(0, take).map(q => String(q.id));
      }
    }

    // Priority 2: Unused questions of any difficulty (Fallback 1)
    if (selectedIds.length < limit) {
      const remainingLimit = limit - selectedIds.length;
      const selectedSet = new Set(selectedIds);
      const fallbackPool = unusedPool.filter(q => !selectedSet.has(q.id));
      
      shuffle(fallbackPool);
      const take = Math.min(remainingLimit, fallbackPool.length);
      selectedIds.push(...fallbackPool.slice(0, take).map(q => String(q.id)));
    }

    // Priority 3: Used questions (Fallback 2: Agotamiento del Banco)
    if (selectedIds.length < limit) {
      const missingCount = limit - selectedIds.length;
      this.logger.warn(
         `Banco agotado para subtema ${subtopicId}. Faltan ${missingCount} preguntas. Relajando regla de no-repetición.`,
      );
      
      const selectedSet = new Set(selectedIds);
      const usedPool = pool.filter(q => usedSet.has(q.id) && !selectedSet.has(q.id));
      
      shuffle(usedPool);
      const take = Math.min(missingCount, usedPool.length);
      selectedIds.push(...usedPool.slice(0, take).map(q => String(q.id)));
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
