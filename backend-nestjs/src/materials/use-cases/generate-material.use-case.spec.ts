import { GenerateMaterialUseCase } from './generate-material.use-case';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { Material } from '../entities/material.entity';
import { MaterialRequest } from '../entities/material-request.entity';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';

describe('GenerateMaterialUseCase', () => {
  let useCase: GenerateMaterialUseCase;
  let queue: any;
  let manager: any;
  let materialsRepo: any;
  let questionBankService: any;
  /** Number of queue.add calls observed at the moment the tx callback returned. */
  let addCallsAtCommit: number;
  let commitShouldFail: boolean;

  const dto = (overrides: any = {}) =>
    ({
      profile_id: 'profile-1',
      week_number: 4,
      requires_review: false,
      design_template_id: 'design-1',
      courses: [{ course_id: 'course-1' }],
      ...overrides,
    }) as any;

  beforeEach(() => {
    addCallsAtCommit = -1;
    commitShouldFail = false;

    manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === CycleMaterialTemplate) {
          return {
            id: 'profile-1',
            name: 'Balotario Semanal',
            scope: 'CURRENT_WEEK',
            cycleId: 'cycle-1',
            courses: [
              {
                courseId: 'course-1',
                questionsQuantity: 2,
                easyCount: 1,
                mediumCount: 1,
                hardCount: 0,
              },
            ],
          };
        }
        if (entity === Company) {
          return { id: TENANT_ID, commercialName: 'Academia Real', logoUrl: 'l' };
        }
        if (entity === Syllabus) return { id: 'syllabus-1' };
        // No pre-existing Material: the create branch is exercised.
        return null;
      }),
      find: jest.fn(async (entity: any) => {
        if (entity === SyllabusDistribution) {
          return [{ topicId: 't-1', subtopicId: '101', questionCount: 2 }];
        }
        if (entity === MaterialRequest) return [];
        return [];
      }),
      create: jest.fn((_entity: any, obj: any) => ({ id: 'generated-id', ...obj })),
      save: jest.fn(async (_entity: any, obj?: any) => obj ?? _entity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    // `Material` rows are saved with an explicit id; keep it stable.
    manager.create.mockImplementation((entity: any, obj: any) =>
      entity === Material ? { ...obj } : { id: 'generated-id', ...obj },
    );

    queue = { add: jest.fn().mockResolvedValue(undefined) };
    materialsRepo = { getUsedQuestionsInCycle: jest.fn().mockResolvedValue([]) };
    questionBankService = {
      getSubtopicQuestionMappings: jest.fn().mockResolvedValue([]),
      getQuestionsByIds: jest.fn().mockResolvedValue([]),
    };

    const tenantService: any = {
      runInTenant: jest.fn(async (cb: any) => {
        const res = await cb(manager);
        // Everything the callback did is only durable once runInTenant
        // resolves; sample the queue exactly at that boundary.
        addCallsAtCommit = queue.add.mock.calls.length;
        if (commitShouldFail) throw new Error('transaction rolled back');
        return res;
      }),
    };

    useCase = new GenerateMaterialUseCase(
      materialsRepo,
      queue,
      tenantService,
      questionBankService,
    );
  });

  describe('job dispatch ordering (Fix 3)', () => {
    it('does not touch the queue until the transaction callback has resolved', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      // A worker could otherwise dequeue and query for a row that is not
      // committed yet.
      expect(addCallsAtCommit).toBe(0);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][0]).toBe('generate-pdf');
    });

    it('leaves no orphan job when the transaction fails', async () => {
      commitShouldFail = true;

      await expect(useCase.execute(TENANT_ID, USER_ID, dto())).rejects.toThrow(
        'transaction rolled back',
      );

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('enqueues nothing when the request is paused for review', async () => {
      const res = await useCase.execute(
        TENANT_ID,
        USER_ID,
        dto({ requires_review: true }),
      );

      expect(queue.add).not.toHaveBeenCalled();
      expect(res.data.status).toBeDefined();
    });

    it('enqueues with retry and retention bounds', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      const opts = queue.add.mock.calls[0][2];
      expect(opts.attempts).toBe(3);
      expect(opts.backoff.type).toBe('exponential');
      expect(opts.removeOnComplete).toBeDefined();
      expect(opts.removeOnFail).toBeDefined();
    });
  });

  describe('response contract', () => {
    it('returns the same payload shape as before the dispatch was moved', async () => {
      const res = await useCase.execute(TENANT_ID, USER_ID, dto());

      expect(res.message).toBe('Solicitud de generación encolada exitosamente');
      expect(res.data.material_request_id).toBeDefined();
      expect(res.data.estimated_completion).toBe('60s');
      expect(res.data.courses).toEqual([
        { courseId: 'course-1', status: 'PENDING' },
      ]);
    });
  });

  describe('material type at creation (Fix 2 counterpart)', () => {
    it('persists EXAMEN when exam areas are requested', async () => {
      await useCase.execute(
        TENANT_ID,
        USER_ID,
        dto({ exam_areas: [{ name: 'Area A' }] }),
      );

      const created = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === MaterialRequest,
      );
      expect(created[1].materialType).toBe('EXAMEN');
      expect(queue.add.mock.calls[0][1].material_type).toBe('EXAMEN');
    });

    it('persists BALOTARIO when no exam areas are requested', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      const created = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === MaterialRequest,
      );
      expect(created[1].materialType).toBe('BALOTARIO');
    });
  });
});
