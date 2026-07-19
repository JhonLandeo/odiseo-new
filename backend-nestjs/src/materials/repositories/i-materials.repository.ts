export const I_MATERIALS_REPOSITORY = 'IMaterialsRepository';

export interface IMaterialsRepository {
  getUsedQuestionsInCycle(cycleId: string, courseId: string): Promise<string[]>;
}
