import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Question } from './entities/question.entity';
import { getLevelIdsForDifficulty } from './constants/question-levels.constant';
import {
  QuestionSelectionStrategy,
  SelectionRequest,
} from './strategies/question-selection.strategy';

@Injectable()
export class QuestionBankService {
  private readonly logger = new Logger(QuestionBankService.name);

  /**
   * How many candidates to pull PER FALLBACK TIER, as a multiple of the
   * requested question count.
   *
   * The selection strategy can consume at most `limit` questions in total, so
   * `limit` rows per tier is already sufficient to reproduce the unbounded
   * behaviour exactly. The 3x margin covers the two cases where tiers overlap:
   * the "any unused" tier may return the very same rows as the "matching level"
   * tier, and a future mixed-difficulty request set would spread its picks
   * across several levels. Three tiers x 3x = at most 9 * limit rows loaded,
   * versus the whole subtopic (tens of thousands) before.
   */
  private static readonly POOL_OVERSAMPLE = 3;

  constructor(
    @InjectRepository(Question, 'questionsConnection')
    private readonly questionRepository: Repository<Question>,
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

    const pool = await this.fetchBoundedPool(
      numericSubtopicId,
      limit,
      excludeIds,
      difficulty,
    );

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
   * Loads a BOUNDED candidate pool for one subtopic, sampled in SQL.
   *
   * WHY THIS IS NOT A PLAIN `LIMIT n`
   * ---------------------------------
   * The selection strategy has three fallback tiers (matching level -> any
   * unused -> recycled). A single `LIMIT n` over the whole subtopic could come
   * back entirely composed of already-used questions, or entirely of the wrong
   * difficulty, and would silently degrade selection quality. So the pool is
   * sampled PER TIER: each tier gets its own bounded, independently randomised
   * slice, and the union is handed to the (still pure) strategy, which applies
   * exactly the same precedence rules it always did.
   *
   * Cost: previously every call streamed the subtopic's entire question set
   * into Node and shuffled it there — for a popular subtopic, tens of thousands
   * of rows, ~96 times per generation job. Now Postgres returns at most
   * 9 * limit rows and does the randomisation as a bounded top-N sort.
   *
   * `EXISTS` replaces the two `IN (SELECT ...)` subqueries. Against
   * `odiseo.flat_questions` (a VIEW) the old form had to materialise the whole
   * view once per call to build the IN-list; the correlated `EXISTS` is a
   * semi-join that can stop at the first matching row per candidate and lets
   * the planner push the question_id predicate into the view. The
   * question_subtopic subquery becomes a plain INNER JOIN, which also makes it
   * the driving relation — the query now starts from the subtopic index instead
   * of scanning `odiseo.question`.
   */
  private async fetchBoundedPool(
    subtopicId: number,
    limit: number,
    excludeIds: string[],
    difficulty?: string,
  ): Promise<Question[]> {
    const perTier = limit * QuestionBankService.POOL_OVERSAMPLE;

    const excluded = excludeIds
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id));
    const levelIds = difficulty ? getLevelIdsForDifficulty(difficulty) : [];

    // $1 subtopic, $2 excluded ids, $3 per-tier limit, $4 level ids.
    const params: any[] = [subtopicId, excluded, perTier, levelIds];

    const baseFrom = `
      FROM odiseo.question q
      INNER JOIN odiseo.question_subtopic qs
        ON qs.question_id = q.id AND qs.fl_status = true
      WHERE qs.subtopic_id = $1
        AND q.fl_status = true
        AND EXISTS (
          SELECT 1 FROM odiseo.flat_questions fq WHERE fq.question_id = q.id
        )`;

    const unused = `NOT (q.id = ANY($2::bigint[]))`;
    const used = `q.id = ANY($2::bigint[])`;

    // Tier 1 is only meaningful when a difficulty was requested; without one it
    // would duplicate tier 2 exactly.
    const tiers = [
      levelIds.length > 0
        ? `(SELECT q.id, q.level_id ${baseFrom} AND ${unused} AND q.level_id = ANY($4::int[]) ORDER BY random() LIMIT $3)`
        : null,
      `(SELECT q.id, q.level_id ${baseFrom} AND ${unused} ORDER BY random() LIMIT $3)`,
      `(SELECT q.id, q.level_id ${baseFrom} AND ${used} ORDER BY random() LIMIT $3)`,
    ].filter(Boolean);

    const rows = await this.questionRepository.manager.query(
      tiers.join('\nUNION\n'),
      params,
    );

    // Shape the raw rows into the minimal Question projection the strategy
    // consumes (id + levelId). Kept as plain objects: the strategy is a pure
    // function over that shape and never touches entity behaviour.
    return rows.map((row: { id: string; level_id: number }) => ({
      id: String(row.id),
      levelId: row.level_id,
    })) as Question[];
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
