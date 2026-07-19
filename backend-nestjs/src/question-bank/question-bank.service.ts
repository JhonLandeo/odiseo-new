import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Question } from './entities/question.entity';
import { FlatQuestionsRepository } from './flat-questions.repository';
import {
  QuestionSelectionStrategy,
  SelectionRequest,
} from './strategies/question-selection.strategy';

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  constructor(
    @InjectRepository(Question, 'questionsConnection')
    private readonly questionRepository: Repository<Question>,
    private readonly flatQuestionsRepository: FlatQuestionsRepository,
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

    if (limit <= 0) return [];

    const numericSubtopicId = Number(subtopicId);
    const usedIdsList = excludeIds;

    const pool = (await this.flatQuestionsRepository.findBoundedCandidatePool(
      numericSubtopicId,
      limit,
      excludeIds,
      difficulty,
    )) as Question[];

    const requests: SelectionRequest[] = Array(limit).fill({
      expectedLevel: difficulty,
    });

    // Call the centralized strategy. QuestionBankService allows recycling (Fallback 2)
    const selectedQ = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      usedIdsList,
      requests,
      true, // allowRecycling
    );

    const selectedIds = selectedQ
      .filter((q) => q !== null)
      .map((q) => String(q.id));

    if (selectedIds.length === 0) {
      return [];
    }

    // Retrieve full question entities with alternatives for selected IDs
    return this.questionRepository.find({
      where: { id: In(selectedIds) },
      relations: ['alternatives'],
    });
  }

  /**
   * Resolves which questions belong to which subtopics for the material
   * generation review plan. Delegates to `FlatQuestionsRepository` — this
   * service must never issue raw SQL against `odiseo.*` itself.
   */
  async getSubtopicQuestionMappings(subtopicIds: number[]): Promise<any[]> {
    return this.flatQuestionsRepository.findSubtopicQuestionMappings(
      subtopicIds,
    );
  }

  async getQuestionsByIds(questionIds: string[]): Promise<Question[]> {
    if (questionIds.length === 0) return [];
    return this.questionRepository.find({
      where: { id: In(questionIds) },
      relations: ['alternatives'],
    });
  }
}
