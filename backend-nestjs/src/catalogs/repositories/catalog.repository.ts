import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ICatalogRepository } from './i-catalog.repository';
import { Course } from '../entities/course.entity';
import { Topic } from '../entities/topic.entity';
import { Subtopic } from '../entities/subtopic.entity';
import {
  CatalogSyncState,
  CORE_API_SYNC_SOURCE,
} from '../entities/catalog-sync-state.entity';
import { validateCatalogPayload } from '../dto/catalog-payload.dto';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class CatalogRepositoryImpl implements ICatalogRepository {
  constructor(
    private readonly tenantService: TenantService,
    @InjectEntityManager()
    private readonly defaultManager: EntityManager,
  ) {}

  async getCourses(search?: string): Promise<Course[]> {
    return this.tenantService.runInTenant(async (manager) => {
      let query = `
        SELECT 
          c.id, 
          c.name, 
          COUNT(DISTINCT t.id) as topics_count,
          COUNT(DISTINCT CASE WHEN COALESCE(ttv.is_active, true) = true THEN t.id END) as active_topics_count
        FROM public.courses c
        LEFT JOIN public.topics t ON t.course_id = c.id
        LEFT JOIN tenant_topic_visibility ttv ON ttv.topic_id = t.id
      `;
      const params: any[] = [];
      if (search) {
        query += ` LEFT JOIN public.subtopics s ON s.topic_id = t.id `;
        query += ` WHERE c.name ILIKE $1 OR t.name ILIKE $1 OR s.name ILIKE $1 `;
        params.push(`%${search}%`);
      }
      query += ` GROUP BY c.id, c.name ORDER BY c.name;`;

      return manager.query(query, params);
    });
  }

  async getCourseTopics(courseId: string, search?: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      let query = `
        SELECT 
          t.id AS topic_id, t.name AS topic_name,
          COALESCE(ttv.is_active, true) AS is_active,
          s.id AS subtopic_id, s.name AS subtopic_name
        FROM public.topics t
        LEFT JOIN tenant_topic_visibility ttv ON ttv.topic_id = t.id
        LEFT JOIN public.subtopics s ON s.topic_id = t.id
        WHERE t.course_id = $1
      `;
      const params: any[] = [courseId];
      if (search) {
        query += ` AND (t.name ILIKE $2 OR s.name ILIKE $2) `;
        params.push(`%${search}%`);
      }
      query += ` ORDER BY t.name, s.name;`;

      const rows = await manager.query(query, params);

      const topicsMap = new Map();
      for (const row of rows) {
        if (!topicsMap.has(row.topic_id)) {
          topicsMap.set(row.topic_id, {
            id: row.topic_id,
            name: row.topic_name,
            isActive: row.is_active,
            subtopics: [],
          });
        }
        if (row.subtopic_id) {
          topicsMap.get(row.topic_id).subtopics.push({
            id: row.subtopic_id,
            name: row.subtopic_name,
          });
        }
      }

      return Array.from(topicsMap.values());
    });
  }

  async findCourseIdByTopicId(topicId: string): Promise<string | null> {
    return this.tenantService.runInTenant(async (manager) => {
      const rows = await manager.query(
        `SELECT course_id FROM public.topics WHERE id = $1`,
        [topicId],
      );
      return rows.length > 0 ? rows[0].course_id : null;
    });
  }

  async updateTopicLocalVisibility(
    topicId: string,
    isActive: boolean,
  ): Promise<void> {
    await this.tenantService.runInTenant(async (manager) => {
      // Upsert in tenant_topic_visibility
      const query = `
        INSERT INTO tenant_topic_visibility (topic_id, is_active, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (topic_id) DO UPDATE 
        SET is_active = EXCLUDED.is_active, updated_at = NOW();
      `;
      await manager.query(query, [topicId, isActive]);
    });
  }

  async upsertCatalogs(payload: unknown): Promise<void> {
    // Catalogs (courses/topics/subtopics) are GLOBAL public-schema entities, so
    // this write needs NO tenant context. It is called from the cron, which has
    // no CLS tenant — using runInTenant here previously threw "Tenant Schema no
    // está definido" every run and silently killed the sync.
    const manager = this.defaultManager;

    // Validate BEFORE touching the shared schema. Throws on a malformed
    // payload, which the cron records as a failed sync — far better than
    // half-writing garbage that every tenant then reads.
    const validated = validateCatalogPayload(payload);

    const courses = validated.courses;
    if (courses.length === 0) return;

    const coursesData = courses.map((c) => ({
      id: String(c.id),
      name: c.name,
    }));

    const topicsData: any[] = [];
    const subtopicsData: any[] = [];

    for (const c of courses) {
      for (const t of c.topics) {
        topicsData.push({
          id: String(t.id),
          courseId: String(c.id),
          name: t.name,
        });
        for (const s of t.subtopics) {
          subtopicsData.push({
            id: String(s.id),
            topicId: String(t.id),
            name: s.name,
          });
        }
      }
    }

    // One transaction for all three levels. Previously each upsert committed
    // on its own, so a failure partway through left the shared catalog
    // inconsistent — courses present with no topics, or topics referencing
    // courses that never landed. Foreign keys make the ordering mandatory and
    // the transaction makes it atomic.
    await manager.transaction(async (tx) => {
      await tx.upsert(Course, coursesData, ['id']);

      if (topicsData.length > 0) {
        await tx.upsert(Topic, topicsData, ['id']);
      }

      if (subtopicsData.length > 0) {
        await tx.upsert(Subtopic, subtopicsData, ['id']);
      }
    });
  }

  async recordSyncAttempt(): Promise<void> {
    await this.defaultManager.query(
      `INSERT INTO public.catalog_sync_state (source, last_attempt_at, updated_at)
       VALUES ($1, now(), now())
       ON CONFLICT (source) DO UPDATE
       SET last_attempt_at = now(), updated_at = now()`,
      [CORE_API_SYNC_SOURCE],
    );
  }

  async recordSyncSuccess(): Promise<void> {
    await this.defaultManager.query(
      `INSERT INTO public.catalog_sync_state
         (source, last_attempt_at, last_success_at, last_outcome, last_error, updated_at)
       VALUES ($1, now(), now(), 'SUCCESS', NULL, now())
       ON CONFLICT (source) DO UPDATE
       SET last_success_at = now(),
           last_outcome = 'SUCCESS',
           -- Cleared on success so a stale message from a long-resolved outage
           -- cannot be mistaken for a current one.
           last_error = NULL,
           updated_at = now()`,
      [CORE_API_SYNC_SOURCE],
    );
  }

  async recordSyncFailure(error: string): Promise<void> {
    await this.defaultManager.query(
      `INSERT INTO public.catalog_sync_state
         (source, last_attempt_at, last_outcome, last_error, updated_at)
       VALUES ($1, now(), 'FAILED', $2, now())
       ON CONFLICT (source) DO UPDATE
       SET last_outcome = 'FAILED',
           last_error = EXCLUDED.last_error,
           updated_at = now()`,
      // Bounded: an upstream stack trace should not become an unbounded column.
      [CORE_API_SYNC_SOURCE, error.slice(0, 4000)],
    );
  }

  async getSyncState(): Promise<CatalogSyncState | null> {
    const rows = await this.defaultManager.query(
      `SELECT source, last_attempt_at, last_success_at, last_outcome, last_error, updated_at
       FROM public.catalog_sync_state WHERE source = $1`,
      [CORE_API_SYNC_SOURCE],
    );
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      source: row.source,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      lastOutcome: row.last_outcome,
      lastError: row.last_error,
      updatedAt: row.updated_at,
    };
  }
}
