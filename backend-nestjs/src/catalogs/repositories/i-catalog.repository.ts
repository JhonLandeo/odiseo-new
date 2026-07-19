import { Course } from '../entities/course.entity';
import { CatalogSyncState } from '../entities/catalog-sync-state.entity';

export const ICatalogRepository = Symbol('ICatalogRepository');

export interface ICatalogRepository {
  /**
   * Obtiene la lista completa de cursos (son pocos), acotada por una cota de
   * seguridad (`CatalogRepositoryImpl.MAX_COURSES_RESULT`) — no pagina: el
   * único caller (el catalog browser del frontend) no envía parámetros de
   * paginación y renderiza el resultado completo.
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
   * Whether `courseId` exists in the shared course catalog. Courses carry no
   * per-tenant hide flag (unlike topics, which have tenant_topic_visibility),
   * so "visible to the tenant" reduces to "present in public.courses". Used
   * to reject a bad/removed course id BEFORE a write that references it,
   * instead of letting the FK violation reach the client as a raw 500.
   */
  courseExists(courseId: string): Promise<boolean>;

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
