import { GenerateMaterialUseCase } from './generate-material.use-case';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { Material } from '../entities/material.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';

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
  /** In-memory stand-in for the single materials row keyed by the natural key. */
  let materialRow: any;
  /** Number of tenant transactions currently open (0 = outside any tx). */
  let txDepth: number;
  /** txDepth observed at the moment each question-bank call was made. */
  let bankCallDepths: number[];
  /**
   * When set, simulates a concurrent request that inserted the material first:
   * our own `INSERT ... ON CONFLICT DO NOTHING` becomes a no-op and the row
   * that exists is this one.
   */
  let concurrentMaterial: any;
  /** The chainable insert query builder returned by manager.createQueryBuilder. */
  let insertBuilder: any;

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
    materialRow = null;
    concurrentMaterial = null;

    // Mirrors manager.createQueryBuilder().insert().into().values().orIgnore().execute()
    // for the race-safe find-or-create. execute() emulates ON CONFLICT DO
    // NOTHING against the natural-key unique index: it only "inserts" when no
    // row exists, and the concurrent-winner case leaves the existing row intact.
    let insertedValues: any = null;
    insertBuilder = {
      insert: jest.fn(() => insertBuilder),
      into: jest.fn(() => insertBuilder),
      values: jest.fn((v: any) => {
        insertedValues = v;
        return insertBuilder;
      }),
      orIgnore: jest.fn(() => insertBuilder),
      execute: jest.fn(async () => {
        if (concurrentMaterial) {
          // Lost the race: our insert is ignored, the concurrent row stands.
          materialRow = concurrentMaterial;
          return { identifiers: [], raw: [] };
        }
        materialRow = { ...insertedValues };
        return {
          identifiers: [{ id: materialRow.id }],
          raw: [{ id: materialRow.id }],
        };
      }),
    };

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
          return {
            id: TENANT_ID,
            commercialName: 'Academia Real',
            logoUrl: 'l',
          };
        }
        if (entity === Syllabus) return { id: 'syllabus-1' };
        // Reflects the current state of the single materials row: null until the
        // create path inserts it (or a concurrent request does), then the row.
        if (entity === Material) return materialRow;
        return null;
      }),
      find: jest.fn(async (entity: any) => {
        if (entity === SyllabusDistribution) {
          return [{ topicId: 't-1', subtopicId: '101', questionCount: 2 }];
        }
        if (entity === MaterialRequest) return [];
        return [];
      }),
      create: jest.fn((_entity: any, obj: any) => ({
        id: 'generated-id',
        ...obj,
      })),
      save: jest.fn(async (_entity: any, obj?: any) => obj ?? _entity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn(() => insertBuilder),
    };
    // `Material` rows are saved with an explicit id; keep it stable.
    manager.create.mockImplementation((entity: any, obj: any) =>
      entity === Material ? { ...obj } : { id: 'generated-id', ...obj },
    );

    queue = { add: jest.fn().mockResolvedValue(undefined) };
    materialsRepo = {
      getUsedQuestionsInCycle: jest.fn().mockResolvedValue([]),
    };
    txDepth = 0;
    bankCallDepths = [];
    questionBankService = {
      getSubtopicQuestionMappings: jest.fn(async () => {
        bankCallDepths.push(txDepth);
        return [];
      }),
      getQuestionsByIds: jest.fn(async () => {
        bankCallDepths.push(txDepth);
        return [];
      }),
    };

    const tenantService: any = {
      runInTenant: jest.fn(async (cb: any) => {
        txDepth++;
        try {
          const res = await cb(manager);
          // Everything the callback did is only durable once runInTenant
          // resolves; sample the queue exactly at that boundary.
          addCallsAtCommit = queue.add.mock.calls.length;
          if (commitShouldFail) throw new Error('transaction rolled back');
          return res;
        } finally {
          txDepth--;
        }
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

  describe('material type at creation', () => {
    it('always persists BALOTARIO', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      const created = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === MaterialRequest,
      );
      expect(created[1].materialType).toBe('BALOTARIO');
      expect(queue.add.mock.calls[0][1].material_type).toBe('BALOTARIO');
    });
  });

  describe('question-bank I/O outside the tenant transaction', () => {
    it('calls the question bank with no tenant transaction open', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      // The bank is a second datasource: its lookups must run between the
      // read tx and the write tx, never while a tenant tx (and its pooled
      // connection) is held open.
      expect(
        questionBankService.getSubtopicQuestionMappings,
      ).toHaveBeenCalled();
      expect(bankCallDepths.length).toBeGreaterThan(0);
      expect(bankCallDepths.every((d) => d === 0)).toBe(true);
    });

    it('still persists the review slots for auditing after the split', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      // 2 slots (questionsQuantity: 2) with an empty bank -> EMPTY slots, in
      // position order, saved inside the write transaction.
      const reviewSave = manager.save.mock.calls.find(
        ([, obj]: any[]) =>
          Array.isArray(obj) && obj.length > 0 && obj[0].position,
      );
      expect(reviewSave).toBeDefined();
      const slots = reviewSave[1];
      expect(slots).toHaveLength(2);
      expect(slots.map((s: any) => s.position)).toEqual([1, 2]);
      expect(slots.every((s: any) => s.status === 'EMPTY')).toBe(true);
    });
  });

  describe('race-safe material find-or-create (Bug 1)', () => {
    it('creates the material through an ON CONFLICT DO NOTHING insert', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      // The create path must go through orIgnore so the natural-key unique
      // index (uq_materials_tenant_profile_week) can absorb a lost race instead
      // of raising inside the tenant transaction.
      expect(manager.createQueryBuilder).toHaveBeenCalled();
      expect(insertBuilder.orIgnore).toHaveBeenCalledTimes(1);
      expect(insertBuilder.execute).toHaveBeenCalledTimes(1);
    });

    it('never constructs a Material entity via manager.create (no duplicate row)', async () => {
      await useCase.execute(TENANT_ID, USER_ID, dto());

      const materialCreate = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === Material,
      );
      expect(materialCreate).toBeUndefined();
    });

    it('falls through to the existing-material path when a concurrent request wins the race', async () => {
      // A concurrent POST /generate inserted the material after our findOne but
      // before our insert. ON CONFLICT DO NOTHING makes our insert a no-op and
      // the re-select returns the concurrent row.
      concurrentMaterial = {
        id: 'concurrent-material',
        tenantId: TENANT_ID,
        profileId: 'profile-1',
        weekNumber: 4,
      };
      // That concurrent material already has a request whose question usages
      // must be cleared, exactly like a regeneration of an existing material.
      manager.find.mockImplementation(async (entity: any) => {
        if (entity === SyllabusDistribution) {
          return [{ topicId: 't-1', subtopicId: '101', questionCount: 2 }];
        }
        if (entity === MaterialRequest) return [{ id: 'prev-request-1' }];
        return [];
      });

      await useCase.execute(TENANT_ID, USER_ID, dto());

      // Our insert was attempted (and ignored), not skipped.
      expect(insertBuilder.orIgnore).toHaveBeenCalledTimes(1);
      // The lost race runs the SAME cleanup the existing-material branch runs:
      // prior usages are deleted for the concurrent material's requests.
      expect(manager.delete).toHaveBeenCalledWith(
        MaterialQuestionUsage,
        expect.objectContaining({ materialRequestId: expect.anything() }),
      );
      // No duplicate parent row: the request attaches to the concurrent
      // material, and no new Material entity was constructed.
      const requestCreate = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === MaterialRequest,
      );
      expect(requestCreate[1].materialId).toBe('concurrent-material');
      const materialCreate = manager.create.mock.calls.find(
        ([entity]: any[]) => entity === Material,
      );
      expect(materialCreate).toBeUndefined();
      // The generation still proceeds normally for the single surviving row.
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });
});
