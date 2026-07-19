import { Syllabus } from '../entities/syllabus.entity';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';

export const I_SYLLABUS_REPOSITORY = 'ISyllabusRepository';

export interface SyllabusWithProgress {
  id: string;
  cycleId: string;
  courseId: string;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalWeeks: number;
  filledWeeks: number[];
  templateProgress?: Record<string, number[]>;
}

export interface ISyllabusRepository {
  createSyllabus(syllabus: Partial<Syllabus>): Promise<Syllabus>;
  findById(id: string): Promise<Syllabus | null>;
  findByCourseAndCycle(
    courseId: string,
    cycleId: string,
  ): Promise<Syllabus | null>;
  findByCycle(cycleId: string): Promise<Syllabus[]>;
  findByCycleWithProgress(cycleId: string): Promise<SyllabusWithProgress[]>;
  setTemplate(syllabusId: string, templateId: string): Promise<void>;
  updateVisibility(id: string, isActive: boolean): Promise<void>;
  /**
   * Archives every syllabus belonging to `cycleId`. The module boundary
   * AcademicTimeUseCase deactivates a cycle through, instead of a raw
   * cross-schema UPDATE against this table — keeps the write inside
   * Syllabus's own invariants (and any future auditing hook it grows).
   */
  deactivateByCycleId(cycleId: string): Promise<void>;

  createDistribution(
    distribution: Partial<SyllabusDistribution>,
  ): Promise<SyllabusDistribution>;
  getDistributionById(
    id: string,
    syllabusId: string,
  ): Promise<SyllabusDistribution | null>;
  updateDistributionQuantity(
    id: string,
    syllabusId: string,
    questionCount: number,
  ): Promise<void>;
  deleteDistribution(id: string, syllabusId: string): Promise<void>;

  /**
   * Sum of `question_count` for a syllabus week, across every template
   * (FR-007 is a per-week technical cap, not a per-template one). Pass
   * `excludeDistId` to omit a single cell from the total (used on update so the
   * cell being changed is not double-counted).
   */
  sumWeekQuestionCount(
    syllabusId: string,
    weekNumber: number,
    excludeDistId?: string,
  ): Promise<number>;
  bulkCreateDistributions(
    distributions: Partial<SyllabusDistribution>[],
  ): Promise<SyllabusDistribution[]>;
  bulkDeleteDistributionsBySyllabus(syllabusId: string): Promise<void>;

  getSummaryBySyllabus(
    syllabusId: string,
    templateId?: string,
  ): Promise<SyllabusDistribution[]>;
  findGeneratedWeeks(syllabusId: string): Promise<number[]>;
}
