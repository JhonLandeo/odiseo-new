import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface TopicIdSpaceOverlapResult {
  totalCoreTopics: number;
  overlappingTopics: number;
  overlapRatio: number;
}

/**
 * Verifies that `public.topics.id` (default connection, populated by
 * `CatalogRepositoryImpl.upsertCatalogs` from the Core API sync) and the
 * question bank's own topic id space (`odiseo.topic.id`, the SEPARATE
 * `questionsConnection` datasource) are actually the same numeric id space.
 *
 * WHY THIS CHECK EXISTS
 * ----------------------
 * `tenant_topic_visibility.topic_id` (default connection) is what a tenant
 * uses to hide a topic. `FlatQuestionsRepository.findTopicIdsForQuestion` /
 * `.searchQuestionIds` (questionsConnection) filter question-bank rows by
 * `topic_id` / `s.topic_id` on the SEPARATE `odiseo` database. Both call the
 * column `topic_id`, and both are numeric, but nothing in the schema PROVES
 * the two physically separate Postgres databases assign the same ids to the
 * same topics — they have independent primary-key sequences. If the id
 * spaces do not actually overlap 1:1, the visibility gate silently does the
 * wrong thing: either it filters nothing (a topic a tenant hid stays fully
 * reachable through the question bank — a cross-tenant/cross-visibility
 * content leak) or it filters everything (over-blocking). This exact risk
 * has been flagged "unverifiable without runtime DB access" across multiple
 * audit rounds, because nobody auditing had credentials to query both
 * databases directly and compare.
 *
 * This class closes that gap OPERATIONALLY: it runs INSIDE the app, through
 * the two DataSources the app already has configured (no new credentials
 * needed), and computes the real overlap. It cannot be exercised against
 * production data from this development sandbox either — no DB credentials
 * are available here — but once deployed it runs automatically
 * (`TopicIdSpaceCronService`, daily) and can be triggered on demand
 * (`checkOverlap`) by an operator or a future audit, closing the loop that
 * "somebody needs runtime access to verify this" previously blocked on.
 */
@Injectable()
export class TopicIdSpaceReconciliationService {
  private readonly logger = new Logger(TopicIdSpaceReconciliationService.name);

  /**
   * Minimum fraction of `public.topics.id` that must also exist in
   * `odiseo.topic.id`.
   *
   * WHY 95% AND NOT 100%
   * ---------------------
   * The two catalogs update on independent schedules (Core API sync is
   * hourly here; the question bank has its own ingestion pipeline upstream),
   * so a handful of topics freshly added on one side and not yet the other
   * is expected steady-state drift, not a bug. 95% tolerates that drift while
   * still catching the failure this check exists for — a fundamentally
   * disjoint or mismapped id space, which shows up as a ratio near 0%, not a
   * few points under 100%.
   */
  private static readonly MIN_OVERLAP_RATIO = 0.95;

  constructor(
    @InjectEntityManager()
    private readonly defaultManager: EntityManager,
    @InjectEntityManager('questionsConnection')
    private readonly questionsManager: EntityManager,
  ) {}

  /**
   * Computes the overlap and, when it falls below the threshold, logs a
   * `Logger.error` (a data-integrity/security finding, not a mere warning)
   * with the actual counts. Never throws on a low ratio — this is an
   * observability check, not a request-path gate, and must not crash the app.
   */
  async checkOverlap(): Promise<TopicIdSpaceOverlapResult> {
    const [coreTopicRows, bankTopicRows] = await Promise.all([
      this.defaultManager.query('SELECT DISTINCT id FROM public.topics'),
      this.questionsManager.query('SELECT DISTINCT id FROM odiseo.topic'),
    ]);

    const coreTopicIds: string[] = coreTopicRows.map((row: any) =>
      String(row.id),
    );
    const bankTopicIdSet = new Set<string>(
      bankTopicRows.map((row: any) => String(row.id)),
    );

    const totalCoreTopics = coreTopicIds.length;
    const overlappingTopics = coreTopicIds.filter((id) =>
      bankTopicIdSet.has(id),
    ).length;
    // No Core topics yet (e.g. before the first sync ever ran): there is
    // nothing to be disjoint FROM, so this is vacuously consistent rather
    // than a division by zero or a false alarm.
    const overlapRatio =
      totalCoreTopics === 0 ? 1 : overlappingTopics / totalCoreTopics;

    if (overlapRatio < TopicIdSpaceReconciliationService.MIN_OVERLAP_RATIO) {
      this.logger.error(
        `Topic id-space overlap between public.topics (default connection) ` +
          `and odiseo.topic (questionsConnection) is ` +
          `${(overlapRatio * 100).toFixed(2)}% (${overlappingTopics}/${totalCoreTopics} ` +
          `core topics found in the question bank), below the ` +
          `${TopicIdSpaceReconciliationService.MIN_OVERLAP_RATIO * 100}% threshold. ` +
          `The question-bank visibility gate (tenant_topic_visibility vs ` +
          `FlatQuestionsRepository topic filtering) may be silently filtering ` +
          `nothing or the wrong topics — investigate before trusting it to hide ` +
          `question-bank content from a tenant.`,
      );
    }

    return { totalCoreTopics, overlappingTopics, overlapRatio };
  }
}
