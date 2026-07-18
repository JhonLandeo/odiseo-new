import { Course } from '../entities/course.entity';
import { CatalogSyncState } from '../entities/catalog-sync-state.entity';

export const ICatalogRepository = Symbol('ICatalogRepository');

export interface ICatalogRepository {
  /**
   * Obtiene la lista de cursos paginada o completa (son pocos)
   */
  getCourses(search?: string): Promise<Course[]>;

  /**
   * Obtiene los temas y subtemas de un curso específico,
   * interceptado con la visibilidad del tenant actual.
   */
  getCourseTopics(courseId: string, search?: string): Promise<any[]>;

  /**
   * Actualiza la visibilidad de un Tema insertando o actualizando
   * el registro en tenant_topic_visibility.
   */
  updateTopicLocalVisibility(topicId: string, isActive: boolean): Promise<void>;

  /**
   * Obtiene el courseId al que pertenece un topic.
   */
  findCourseIdByTopicId(topicId: string): Promise<string | null>;

  /**
   * Realiza un bulk upsert de courses, topics y subtopics en el esquema public.
   *
   * Recibe `unknown` a propósito: el payload viene de un sistema externo y la
   * implementación lo valida antes de escribir en el esquema compartido.
   */
  upsertCatalogs(payload: unknown): Promise<void>;

  /** Marks that a sync attempt has just started. */
  recordSyncAttempt(): Promise<void>;

  /** Marks the current attempt as successful and clears any previous error. */
  recordSyncSuccess(): Promise<void>;

  /** Marks the current attempt as failed, persisting the reason. */
  recordSyncFailure(error: string): Promise<void>;

  /** Durable sync state, or null if no sync has ever run. */
  getSyncState(): Promise<CatalogSyncState | null>;
}
