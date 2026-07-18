import { Cycle } from '../entities/cycle.entity';
import { CycleWeek } from '../entities/cycle-week.entity';

export const IAcademicTimeRepository = Symbol('IAcademicTimeRepository');

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
  updateCycle(id: string, data: any): Promise<void>;
  softDeleteCycle(id: string): Promise<void>;

  getTemplatesByCycle(cycleId: string): Promise<any[]>;
  createTemplate(data: any): Promise<void>;
  updateTemplate(templateId: string, data: any): Promise<void>;
  deleteTemplate(templateId: string): Promise<void>;
}
