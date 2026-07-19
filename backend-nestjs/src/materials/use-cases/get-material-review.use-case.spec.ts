import { GetMaterialReviewUseCase } from './get-material-review.use-case';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { MaterialReviewQuestion } from '../entities/material-review-question.entity';
import { Topic } from '../../catalogs/entities/topic.entity';
import { Subtopic } from '../../catalogs/entities/subtopic.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';

const REQUEST_ID = 'req-1';

/**
 * Catalog fixture: t-1/s-1 are referenced by the review question; t-2/s-2 are
 * referenced ONLY by the syllabus distribution, so they must arrive through
 * the backfill query, not the initial (question-scoped) load.
 */
const TOPICS: any[] = [
  { id: 't-1', name: 'Algebra', courseId: 'course-1' },
  { id: 't-2', name: 'Geometry', courseId: 'course-1' },
];
const SUBTOPICS: any[] = [
  { id: 's-1', name: 'Linear equations' },
  { id: 's-2', name: 'Angles' },
];

function inValues(where: any): string[] {
  // TypeORM In() wraps the ids in a FindOperator; `value` is its payload.
  return where?.id?.value ?? [];
}

function buildHarness() {
  const request = {
    id: REQUEST_ID,
    status: MaterialRequestStatus.IN_REVIEW,
    cycleId: 'cycle-1',
    profileId: 'profile-1',
    weekNumber: 4,
    version: 1,
  };
  const findCalls: { entity: any; options: any }[] = [];

  const manager = {
    findOne: jest.fn(async (entity: any) => {
      if (entity === MaterialRequest) return request;
      if (entity === Cycle) return { name: '2026-I', universityId: null };
      if (entity === CycleMaterialTemplate) {
        return { id: 'profile-1', name: 'Balotario', courses: [] };
      }
      if (entity === Syllabus) return { id: 'syl-1' };
      return null;
    }),
    find: jest.fn(async (entity: any, options: any) => {
      findCalls.push({ entity, options });
      if (entity === MaterialReviewQuestion) {
        return [
          {
            id: 'rq-1',
            questionId: null,
            topicId: 't-1',
            subtopicId: 's-1',
            expectedLevel: 'EASY',
            position: 1,
            status: 'EMPTY',
          },
        ];
      }
      if (entity === Topic) {
        const ids = inValues(options?.where);
        return TOPICS.filter((t) => ids.includes(t.id));
      }
      if (entity === Subtopic) {
        const ids = inValues(options?.where);
        return SUBTOPICS.filter((s) => ids.includes(s.id));
      }
      if (entity === SyllabusDistribution) {
        return [
          { topicId: 't-1', subtopicId: 's-1' },
          { topicId: 't-2', subtopicId: 's-2' },
        ];
      }
      return [];
    }),
    save: jest.fn(async (obj: any) => obj),
  };

  const useCase = new GetMaterialReviewUseCase(
    { runInTenant: jest.fn(async (cb: any) => cb(manager)) } as any,
    {
      findByIds: jest.fn().mockResolvedValue([]),
      findByIdsFromNormalized: jest.fn().mockResolvedValue([]),
    } as any,
    {} as any,
  );
  jest
    .spyOn((useCase as any).logger, 'log')
    .mockImplementation(() => undefined);

  return { useCase, manager, findCalls };
}

describe('GetMaterialReviewUseCase catalog loading', () => {
  it('never loads the Topic/Subtopic catalogs unfiltered', async () => {
    const { useCase, findCalls } = buildHarness();

    await useCase.execute(REQUEST_ID);

    const catalogCalls = findCalls.filter(
      (c) => c.entity === Topic || c.entity === Subtopic,
    );
    expect(catalogCalls.length).toBeGreaterThan(0);
    for (const call of catalogCalls) {
      expect(call.options?.where?.id).toBeDefined();
    }
    // The initial load is scoped to the ids the review questions reference.
    const firstTopicCall = findCalls.find((c) => c.entity === Topic);
    expect(inValues(firstTopicCall!.options.where)).toEqual(['t-1']);
  });

  it('resolves question names and syllabus-unit names, including ids outside the question set', async () => {
    const { useCase } = buildHarness();

    const result = await useCase.execute(REQUEST_ID);

    expect(result.questions[0].topicName).toBe('Algebra');
    expect(result.questions[0].subtopicName).toBe('Linear equations');
    // t-2/s-2 appear only in the syllabus distribution; the backfill must
    // still resolve their names instead of degrading to 'Desconocido'.
    expect(result.allowedSyllabusUnits).toEqual([
      expect.objectContaining({
        topicId: 't-1',
        topicName: 'Algebra',
        subtopicName: 'Linear equations',
      }),
      expect.objectContaining({
        topicId: 't-2',
        topicName: 'Geometry',
        subtopicName: 'Angles',
      }),
    ]);
  });
});
