import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ICatalogRepository } from './i-catalog.repository';
import { Course } from '../entities/course.entity';
import { Topic } from '../entities/topic.entity';
import { Subtopic } from '../entities/subtopic.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class CatalogRepositoryImpl implements ICatalogRepository {
  constructor(
    private readonly tenantService: TenantService,
    @InjectEntityManager()
    private readonly defaultManager: EntityManager,
  ) {}

  async getActiveHierarchy(): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      // Usar Raw SQL para armar la jerarquía porque combinamos public y tenant schema
      const query = `
        SELECT 
          c.id AS course_id, c.name AS course_name,
          t.id AS topic_id, t.name AS topic_name,
          COALESCE(ttv.is_active, true) AS is_active,
          s.id AS subtopic_id, s.name AS subtopic_name
        FROM public.courses c
        LEFT JOIN public.topics t ON t.course_id = c.id
        LEFT JOIN tenant_topic_visibility ttv ON ttv.topic_id = t.id
        LEFT JOIN public.subtopics s ON s.topic_id = t.id
        ORDER BY c.name, t.name, s.name;
      `;
      const rows = await manager.query(query);

      // Agrupar filas en Course > Topic > Subtopic
      const coursesMap = new Map();

      for (const row of rows) {
        if (!coursesMap.has(row.course_id)) {
          coursesMap.set(row.course_id, {
            id: row.course_id,
            name: row.course_name,
            topics: new Map(),
          });
        }

        const course = coursesMap.get(row.course_id);
        if (row.topic_id) {
          if (!course.topics.has(row.topic_id)) {
            course.topics.set(row.topic_id, {
              id: row.topic_id,
              name: row.topic_name,
              isActive: row.is_active,
              subtopics: [],
            });
          }

          if (row.subtopic_id) {
            course.topics.get(row.topic_id).subtopics.push({
              id: row.subtopic_id,
              name: row.subtopic_name,
            });
          }
        }
      }

      return Array.from(coursesMap.values()).map((c) => ({
        ...c,
        topics: Array.from(c.topics.values()),
      }));
    });
  }

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

  async upsertCatalogs(payload: any): Promise<void> {
    // Catalogs (courses/topics/subtopics) are GLOBAL public-schema entities, so
    // this write needs NO tenant context. It is called from the cron, which has
    // no CLS tenant — using runInTenant here previously threw "Tenant Schema no
    // está definido" every run and silently killed the sync.
    const manager = this.defaultManager;

    if (!payload || !payload.courses) return;

    const courses = payload.courses;
    if (courses.length === 0) return;

    // 1. Upsert Courses
    const coursesData = courses.map((c: any) => ({
      id: c.id,
      name: c.name,
    }));
    await manager.upsert(Course, coursesData, ['id']);

    // 2. Gather & Upsert Topics and Subtopics
    const topicsData: any[] = [];
    const subtopicsData: any[] = [];

    for (const c of courses) {
      if (!c.topics) continue;
      for (const t of c.topics) {
        topicsData.push({
          id: t.id,
          courseId: c.id,
          name: t.name,
        });
        if (!t.subtopics) continue;
        for (const s of t.subtopics) {
          subtopicsData.push({
            id: s.id,
            topicId: t.id,
            name: s.name,
          });
        }
      }
    }

    if (topicsData.length > 0) {
      await manager.upsert(Topic, topicsData, ['id']);
    }

    if (subtopicsData.length > 0) {
      await manager.upsert(Subtopic, subtopicsData, ['id']);
    }
  }
}
