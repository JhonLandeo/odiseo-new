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
 *
 * `QuestionBankService` is the only consumer allowed to hold a reference to
 * this class; it must never reach for its own `EntityManager`/`Repository.manager`
 * to query `odiseo.*` directly — that would reopen the exact bypass this class
 * exists to close.
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

  /**
   * How many candidates to pull PER FALLBACK TIER, as a multiple of the
   * requested question count, for `findBoundedCandidatePool`.
   *
   * `QuestionBankService`'s selection strategy can consume at most `limit`
   * questions in total, so `limit` rows per tier is already sufficient to
   * reproduce the unbounded behaviour exactly. The 3x margin covers the two
   * cases where tiers overlap: the "any unused" tier may return the very same
   * rows as the "matching level" tier, and a mixed-difficulty request set
   * spreads its picks across several levels. Three tiers x 3x = at most
   * 9 * limit rows loaded, versus the whole subtopic (tens of thousands)
   * before this method existed.
   */
  private static readonly POOL_OVERSAMPLE = 3;

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
         (SELECT json_agg(json_build_object('id', a.id, 'description', a.description, 'is_correct', a.id = q.answer_id) ORDER BY a.id)
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
      // `ORDER BY a.id` above already makes Postgres's json_agg deterministic,
      // but the letter (A/B/C/...) is assigned by array index here in Node, so
      // this sort is re-applied defensively — matching the numeric-id ordering
      // Question.options (question.entity.ts) uses — instead of trusting that
      // no intermediate step ever reorders the array.
      alternatives: (fq.alternatives || [])
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id))
        .map((alt: any, idx: number) => ({
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
   * Resolve the distinct topic ids a question belongs to, via its active
   * subtopic mappings. Used by the object-level authorization gate to decide
   * whether a question is visible to a tenant. Returns [] when the question has
   * no subtopic mapping (which the gate treats as visible-by-default, matching
   * the Catalogs `COALESCE(is_active, true)` rule).
   */
  async findTopicIdsForQuestion(
    questionId: string | number,
  ): Promise<string[]> {
    const rows = await this.manager.query(
      `SELECT DISTINCT s.topic_id
       FROM odiseo.question_subtopic qs
       INNER JOIN odiseo.subtopic s ON qs.subtopic_id = s.id
       WHERE qs.question_id = $1 AND qs.fl_status = true`,
      [BigInt(questionId)],
    );
    return rows
      .map((r: any) => (r.topic_id == null ? null : String(r.topic_id)))
      .filter((id: string | null): id is string => id !== null);
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
      const ids = subtopicId
        .split(',')
        .filter(Boolean)
        .map(Number)
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        sql += ` AND s.id IN (${ids.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...ids);
      }
    } else if (topicId) {
      const ids = topicId
        .split(',')
        .filter(Boolean)
        .map(Number)
        .filter((id) => !isNaN(id));
      if (ids.length > 0) {
        sql += ` AND s.topic_id IN (${ids.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...ids);
      }
    } else if (courseId) {
      const ids = courseId
        .split(',')
        .filter(Boolean)
        .map(Number)
        .filter((id) => !isNaN(id));
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

    // Object-level authorization gate: drop questions whose subtopic belongs to
    // a topic this tenant has hidden. `s.topic_id` is always in scope here (the
    // subtopic `s` is joined unconditionally above). This is the exact inverse
    // of the Catalogs visibility rule — a topic is invisible only when an
    // explicit `tenant_topic_visibility` row sets `is_active = false`, so the
    // caller passes precisely that set.
    const excludeTopicIds = filters.excludeTopicIds ?? [];
    if (excludeTopicIds.length > 0) {
      const numericExcludeTopicIds = excludeTopicIds
        .map(Number)
        .filter((id) => !isNaN(id));
      if (numericExcludeTopicIds.length > 0) {
        sql += ` AND s.topic_id NOT IN (${numericExcludeTopicIds.map((_, i) => `$${params.length + 1 + i}`).join(', ')})`;
        params.push(...numericExcludeTopicIds);
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

  /**
   * Loads a BOUNDED candidate pool for one subtopic, sampled in SQL.
   *
   * WHY THIS IS NOT A PLAIN `LIMIT n`
   * ---------------------------------
   * The caller's selection strategy has three fallback tiers (matching level ->
   * any unused -> recycled). A single `LIMIT n` over the whole subtopic could
   * come back entirely composed of already-used questions, or entirely of the
   * wrong difficulty, and would silently degrade selection quality. So the
   * pool is sampled PER TIER: each tier gets its own bounded, independently
   * randomised slice, and the union is handed back for the (pure) strategy to
   * apply its usual precedence rules over.
   *
   * Cost: previously every call streamed the subtopic's entire question set
   * into Node and shuffled it there — for a popular subtopic, tens of
   * thousands of rows, ~96 times per generation job. Now Postgres returns at
   * most 9 * limit rows and does the randomisation as a bounded top-N sort.
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
  async findBoundedCandidatePool(
    subtopicId: number,
    limit: number,
    excludeIds: string[],
    difficulty?: string,
  ): Promise<Array<{ id: string; levelId: number }>> {
    const perTier = limit * FlatQuestionsRepository.POOL_OVERSAMPLE;

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

    const rows = await this.manager.query(tiers.join('\nUNION\n'), params);

    // Shape the raw rows into the minimal projection the selection strategy
    // consumes (id + levelId).
    return rows.map((row: { id: string; level_id: number }) => ({
      id: String(row.id),
      levelId: row.level_id,
    }));
  }

  /**
   * Maps subtopic ids to the (question_id, subtopic_id) pairs of their active,
   * flat-questions-eligible questions. Deliberately UNBOUNDED (no LIMIT): the
   * generation path that consumes this needs the complete mapping to build its
   * review plan, not a sample.
   */
  async findSubtopicQuestionMappings(
    subtopicIds: number[],
  ): Promise<Array<{ questionId: string; subtopicId: string }>> {
    if (subtopicIds.length === 0) return [];

    return this.manager.query(
      `SELECT question_id AS "questionId", subtopic_id AS "subtopicId"
       FROM odiseo.question_subtopic
       WHERE subtopic_id = ANY($1) AND fl_status = true
         AND question_id IN (SELECT question_id FROM odiseo.flat_questions)`,
      [subtopicIds],
    );
  }
}
