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

  createDistribution(
    distribution: Partial<SyllabusDistribution>,
  ): Promise<SyllabusDistribution>;
  updateDistributionQuantity(
    id: string,
    syllabusId: string,
    questionCount: number,
  ): Promise<void>;
  deleteDistribution(id: string, syllabusId: string): Promise<void>;
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
