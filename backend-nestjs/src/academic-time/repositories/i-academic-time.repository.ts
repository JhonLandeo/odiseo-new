import { Cycle } from '../entities/cycle.entity';
import { CycleWeek } from '../entities/cycle-week.entity';

export const IAcademicTimeRepository = Symbol('IAcademicTimeRepository');

/**
 * How many live rows still point at a material template. The FKs are SET NULL
 * (syllabus, syllabus_distribution) or CASCADE (materials, material_requests),
 * so the database will NOT stop a delete — it will quietly break or erase the
 * dependants. These counts are what makes the deletion refusable.
 */
export interface TemplateUsage {
  syllabus: number;
  syllabusDistribution: number;
  materialRequests: number;
  materials: number;
}

/**
 * How many live rows still point at a cycle. Every one of these tables has a
 * `cycle_id` FK with `ON DELETE CASCADE`, but the cycle is removed via
 * soft-delete (an UPDATE of deleted_at), so that CASCADE never fires: the rows
 * would be left pointing at a tombstoned cycle. `syllabus` counts ACTIVE and
 * ARCHIVED syllabuses alike — an inactive syllabus is still a related record
 * that FR-005 forbids deleting a cycle over. These counts are what makes the
 * deletion refusable.
 */
export interface CycleUsage {
  templates: number;
  syllabus: number;
  materials: number;
  materialRequests: number;
}

export interface IAcademicTimeRepository {
  getCycles(
    limit?: number,
    offset?: number,
    search?: string,
  ): Promise<{ data: Cycle[]; total: number }>;
  createCycle(data: any): Promise<void>;
  updateCycleVisibility(id: string, isActive: boolean): Promise<void>;
  updateWeekVisibility(id: string, isActive: boolean): Promise<void>;
  getActiveWeekNumbers(cycleId: string): Promise<number[]>;
  /** All non-deleted weeks of a cycle, fetched by cycleId (its stable key). */
  getWeeksByCycle(cycleId: string): Promise<CycleWeek[]>;
  getCycleWithSyllabus(id: string): Promise<any>;
  getCycleUsage(cycleId: string): Promise<CycleUsage>;
  updateCycle(id: string, data: any): Promise<void>;
  softDeleteCycle(id: string): Promise<void>;

  getTemplatesByCycle(cycleId: string): Promise<any[]>;
  createTemplate(data: any): Promise<void>;
  updateTemplate(templateId: string, data: any): Promise<void>;
  getTemplateUsage(templateId: string): Promise<TemplateUsage>;
  deleteTemplate(templateId: string): Promise<void>;
}
