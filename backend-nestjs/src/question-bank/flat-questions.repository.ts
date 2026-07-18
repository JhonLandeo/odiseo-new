import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { FlatQuestion, FlatQuestionSearchFilters } from './flat-question.model';
import { getLevelIdsForDifficulty } from './constants/question-levels.constant';

/**
 * Anti-corruption layer for the external question bank (`odiseo.*`).
 *
 * This repository is the SINGLE place in the B2B codebase allowed to issue raw
 * SQL against the bank schema. Every other module depends on this typed port,
 * never on the bank's physical tables. Access is READ-ONLY. When the bank
 * becomes an independent service, only this class changes (to call REST).
 *
 * Explicit column lists (no `SELECT *`) keep us insulated from bank schema drift.
 */
@Injectable()
export class FlatQuestionsRepository {
  /**
   * How many candidate ids to pull as a multiple of the caller's intended
   * `limit`, mirroring the `POOL_OVERSAMPLE` convention in QuestionBankService.
   * The caller shuffles the returned ids and slices `limit`, so oversampling
   * keeps the picked set varied while the SQL result stays bounded.
   */
  private static readonly SEARCH_OVERSAMPLE = 3;

  /**
   * Defensive fallback when a caller omits `limit`. Keeps the query bounded
   * (at most DEFAULT * SEARCH_OVERSAMPLE rows) instead of returning the whole
   * matching set from the shared bank.
   */
  private static readonly DEFAULT_SEARCH_LIMIT = 25;

  // Exactly the columns the SaaS consumes from flat_questions.
  private static readonly FLAT_COLUMNS =
    'question_id, code, level_id, level_name, type, html_content, ' +
    'alternatives, config_alternative, images, solution, origins, ' +
    'math_formulas, alternative_maths';

  constructor(
    @InjectEntityManager('questionsConnection')
    private readonly manager: EntityManager,
  ) {}

  /** Fetch flattened questions by their bank ids. Returns [] for an empty input. */
  async findByIds(ids: Array<string | number>): Promise<FlatQuestion[]> {
    if (!ids || ids.length === 0) return [];
    const numericIds = ids.map((id) => BigInt(id));
    return this.manager.query(
      `SELECT ${FlatQuestionsRepository.FLAT_COLUMNS} FROM odiseo.flat_questions WHERE question_id = ANY($1)`,
      [numericIds],
    );
  }

  /** Fetch a single flattened question, or null if absent. */
  async findById(id: string | number): Promise<FlatQuestion | null> {
    const rows = await this.findByIds([id]);
    return rows[0] ?? null;
  }

  /**
   * Fallback path: reconstruct a flat-question shape from the bank's normalized
   * tables when a question is not present in the flat_questions view.
   */
  async findByIdsFromNormalized(
    ids: Array<string | number>,
  ): Promise<FlatQuestion[]> {
    if (!ids || ids.length === 0) return [];
    const rows = await this.manager.query(
      `SELECT q.id as question_id, q.code, q.level_id, l.name as level_name, q.type, q.description as html_content,
         (SELECT json_agg(json_build_object('id', a.id, 'description', a.description, 'is_correct', a.id = q.answer_id))
          FROM odiseo.alternative a WHERE a.question_id = q.id AND a.fl_status = true) as alternatives,
         (SELECT json_agg(json_build_object('id', qi.id, 'code', qi.code, 'gcs_key', qi.image))
          FROM odiseo.question_image qi WHERE qi.question_id = q.id AND qi.fl_status = true) as images
       FROM odiseo.question q
       LEFT JOIN odiseo.level l ON q.level_id = l.id
       WHERE q.id = ANY($1) AND q.fl_status = true`,
      [ids.map((id) => BigInt(id))],
    );

    return rows.map((fq: any) => ({
      question_id: fq.question_id,
      code: fq.code,
      level_id: fq.level_id,
      level_name: fq.level_name,
      type: fq.type,
      html_content: fq.html_content,
      alternatives: (fq.alternatives || []).map((alt: any, idx: number) => ({
        id: alt.id,
        label: String.fromCharCode(65 + idx),
        text: alt.description,
        is_correct: alt.is_correct,
      })),
      images: fq.images || [],
      solution: null,
    }));
  }

  /** Convenience single-id variant of the normalized fallback. */
  async findByIdFromNormalized(
    id: string | number,
  ): Promise<FlatQuestion | null> {
    const rows = await this.findByIdsFromNormalized([id]);
    return rows[0] ?? null;
  }

  /**
   * Search question ids by course/topic/subtopic and optional difficulty.
   * Returns only ids; selection/shuffle/limit stay in the caller (business logic).
   */
  async searchQuestionIds(
    filters: FlatQuestionSearchFilters,
  ): Promise<string[]> {
    const { courseId, topicId, subtopicId, level, excludeIds = [] } = filters;
    const desiredLimit =
      filters.limit && filters.limit > 0
        ? filters.limit
        : FlatQuestionsRepository.DEFAULT_SEARCH_LIMIT;

    let sql = `
      SELECT fq.question_id
      FROM odiseo.flat_questions fq
      INNER JOIN odiseo.question_subtopic qs ON fq.question_id = qs.question_id
      INNER JOIN odiseo.subtopic s ON qs.subtopic_id = s.id
      ${courseId ? 'INNER JOIN odiseo.topic t ON s.topic_id = t.id' : ''}
      WHERE qs.fl_status = true
    `;
    const params: any[] = [];

    if (subtopicId) {
      const ids = subtopicId.split(',').filter(Boolean).map(Number);
      if (ids.length > 0) {
        sql += ` AND s.id IN (${ids.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...ids);
      }
    } else if (topicId) {
      const ids = topicId.split(',').filter(Boolean).map(Number);
      if (ids.length > 0) {
        sql += ` AND s.topic_id IN (${ids.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...ids);
      }
    } else if (courseId) {
      const ids = courseId.split(',').filter(Boolean).map(Number);
      if (ids.length > 0) {
        sql += ` AND t.course_id IN (${ids.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...ids);
      }
    }

    if (level) {
      const mappedLevelIds = getLevelIdsForDifficulty(level);
      if (mappedLevelIds.length > 0) {
        // Difficulty label (EASY/MEDIUM/HARD) → its configured level ids.
        sql += ` AND fq.level_id IN (${mappedLevelIds.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...mappedLevelIds);
      } else {
        // Raw numeric level id passed through as-is.
        sql += ` AND fq.level_id = $${params.length + 1}`;
        params.push(Number(level));
      }
    }

    if (excludeIds.length > 0) {
      const numericExcludeIds = excludeIds
        .map(Number)
        .filter((id) => !isNaN(id));
      if (numericExcludeIds.length > 0) {
        sql += ` AND fq.question_id NOT IN (${numericExcludeIds.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...numericExcludeIds);
      }
    }

    // Bound the result in SQL: sample at most `limit * oversample` random ids
    // instead of every matching row. The caller still shuffles and slices to
    // its exact limit, so the picked set stays varied but memory is capped.
    // The limit is parameterized ($n), never interpolated.
    const boundLimit = desiredLimit * FlatQuestionsRepository.SEARCH_OVERSAMPLE;
    sql += ` ORDER BY random() LIMIT $${params.length + 1}`;
    params.push(boundLimit);

    const rows = await this.manager.query(sql, params);
    return rows.map((r: any) => String(r.question_id));
  }
}
