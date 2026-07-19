import { BadRequestException } from '@nestjs/common';
import {
  HandleMaterialWebhookUseCase,
  QuestionUsageRecord,
} from './handle-material-webhook.use-case';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = 'req-1';

interface CourseSeed {
  id: string;
  status: CourseMaterialStatus;
  materialRequestId?: string;
  courseId?: string;
}

/**
 * Builds a stateful mock EntityManager. `findOne` returns the live object so a
 * later `update` mutation is visible to the code under test, which lets a
 * sequence of callbacks share committed state the way separate transactions do.
 */
function buildHarness(
  courses: CourseSeed[],
  parentStatus: MaterialRequestStatus,
) {
  const state = {
    courses: new Map(
      courses.map((c) => [
        c.id,
        {
          courseId: 'course-x',
          materialRequestId: REQUEST_ID,
          ...c,
        },
      ]),
    ),
    parent: {
      id: REQUEST_ID,
      status: parentStatus,
      cycleId: 'cycle-1',
      weekNumber: 4,
      materialId: null as string | null,
    },
    lockCaptured: undefined as any,
    insertedUsages: [] as any[],
  };

  // Insert-builder stub for the usage ledger write; the chain mirrors
  // manager.createQueryBuilder().insert().into().values().orIgnore().execute().
  const insertBuilder: any = {
    insert: jest.fn(() => insertBuilder),
    into: jest.fn(() => insertBuilder),
    values: jest.fn((rows: any[]) => {
      state.insertedUsages.push(...rows);
      return insertBuilder;
    }),
    orIgnore: jest.fn(() => insertBuilder),
    execute: jest.fn().mockResolvedValue({}),
  };

  const manager = {
    findOne: jest.fn(async (entity: any, options: any) => {
      if (entity === MaterialRequestCourse) {
        return state.courses.get(options.where.id) ?? null;
      }
      if (entity === MaterialRequest) {
        if (options?.lock) state.lockCaptured = options.lock;
        return state.parent.id === options.where.id ? state.parent : null;
      }
      return null;
    }),
    find: jest.fn(async (entity: any, options: any) => {
      if (entity === MaterialRequestCourse) {
        return [...state.courses.values()].filter(
          (c) => c.materialRequestId === options.where.materialRequestId,
        );
      }
      return [];
    }),
    update: jest.fn(async (entity: any, id: any, patch: any) => {
      if (entity === MaterialRequestCourse) {
        const c = state.courses.get(id);
        if (c) Object.assign(c, patch);
      } else if (entity === MaterialRequest) {
        if (state.parent.id === id) Object.assign(state.parent, patch);
      }
      // Material updates are irrelevant to these assertions.
      return { affected: 1 };
    }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    createQueryBuilder: jest.fn(() => insertBuilder),
    // Raw SQL surface used only for the usage-ledger savepoint commands.
    query: jest.fn().mockResolvedValue(undefined),
  };

  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const cls = {
    get: jest.fn((key: string) =>
      key === 'companyId' ? TENANT_ID : undefined,
    ),
  };
  const eventEmitter = { emit: jest.fn() };
  const tenantService = {
    runInTenant: jest.fn(async (cb: any) => cb(manager)),
  };

  const useCase = new HandleMaterialWebhookUseCase(
    tenantService as any,
    cls as any,
    queue as any,
    eventEmitter as any,
  );

  return {
    useCase,
    manager,
    queue,
    cls,
    eventEmitter,
    tenantService,
    state,
    insertBuilder,
  };
}

describe('HandleMaterialWebhookUseCase', () => {
  describe('idempotency and the asymmetric terminal-state guard', () => {
    it('treats a duplicate completed for the same course as a no-op', async () => {
      const { useCase, manager, queue, eventEmitter, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.COMPLETED }],
        MaterialRequestStatus.COMPLETED,
      );

      await useCase.execute({ job_id: 'c1', status: 'completed' } as any);

      // No side effects: the course update, the event and the queue are all
      // skipped because the course is already in a success-terminal state.
      expect(manager.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.COMPLETED,
      );
    });

    it('IGNORES a failed that arrives after completed (bug #1 regression)', async () => {
      const { useCase, manager, queue, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.COMPLETED }],
        MaterialRequestStatus.COMPLETED,
      );

      await useCase.execute({
        job_id: 'c1',
        status: 'failed',
        error_message: 'late failure',
      } as any);

      // The course keeps its finished state and the parent is NOT rolled back.
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.COMPLETED,
      );
      expect(state.parent.status).toBe(MaterialRequestStatus.COMPLETED);
      expect(manager.update).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('upgrades a FAILED course when a later completed arrives (retry success)', async () => {
      const { useCase, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.FAILED }],
        MaterialRequestStatus.FAILED,
      );

      await useCase.execute({
        job_id: 'c1',
        status: 'completed',
        download_url: 'materials/tenant/x.pdf',
      } as any);

      // FAILED is provisional: the retry-success overwrites it, and the single
      // finished course rolls the parent forward to COMPLETED.
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.COMPLETED,
      );
      expect(state.parent.status).toBe(MaterialRequestStatus.COMPLETED);
    });

    it('treats a repeated failed on an already-FAILED course as a no-op', async () => {
      const { useCase, manager, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.FAILED }],
        MaterialRequestStatus.FAILED,
      );

      await useCase.execute({ job_id: 'c1', status: 'failed' } as any);

      expect(manager.update).not.toHaveBeenCalled();
      expect(state.courses.get('c1')!.status).toBe(CourseMaterialStatus.FAILED);
    });
  });

  describe('parent roll-up serialization and merge dispatch', () => {
    it('loads the parent request with a pessimistic write lock', async () => {
      const { useCase, state } = buildHarness(
        [
          { id: 'c1', status: CourseMaterialStatus.PENDING },
          { id: 'c2', status: CourseMaterialStatus.PENDING },
        ],
        MaterialRequestStatus.PROCESSING,
      );

      await useCase.execute({ job_id: 'c1', status: 'completed' } as any);

      expect(state.lockCaptured).toEqual({ mode: 'pessimistic_write' });
    });

    it('dispatches merge-pdf exactly once when both courses finish', async () => {
      const { useCase, queue, state } = buildHarness(
        [
          { id: 'c1', status: CourseMaterialStatus.PENDING },
          { id: 'c2', status: CourseMaterialStatus.PENDING },
        ],
        MaterialRequestStatus.PROCESSING,
      );

      // First course finishes: not all done yet, no merge.
      await useCase.execute({ job_id: 'c1', status: 'completed' } as any);
      expect(queue.add).not.toHaveBeenCalled();

      // Second course finishes: transition into all-finished dispatches once.
      await useCase.execute({ job_id: 'c2', status: 'completed' } as any);
      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][0]).toBe('merge-pdf');
      expect(state.parent.status).toBe(MaterialRequestStatus.COMPLETED);

      // A redelivered final callback must NOT dispatch a second merge: the
      // course is already success-terminal so it is ignored outright.
      await useCase.execute({ job_id: 'c2', status: 'completed' } as any);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('atomic anti-repetition ledger', () => {
    const usages: QuestionUsageRecord[] = [
      {
        cycleId: 'cycle-1',
        questionId: 'q-1',
        topicId: 't-1',
        subtopicId: 's-1',
        positionInPdf: 1,
        wasReplacement: false,
      },
      {
        cycleId: 'cycle-1',
        questionId: 'q-2',
        topicId: 't-1',
        subtopicId: 's-2',
        positionInPdf: 2,
        wasReplacement: true,
      },
    ];

    it('writes the usage rows on the SAME transaction manager as the completed status', async () => {
      const { useCase, manager, state, insertBuilder } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );

      await useCase.execute(
        { job_id: 'c1', status: 'completed' } as any,
        usages,
      );

      // Idempotent rewrite scoped to THIS request+course, keyed off the course
      // row loaded inside the transaction (not caller-supplied ids).
      expect(manager.delete).toHaveBeenCalledWith(MaterialQuestionUsage, {
        materialRequestId: REQUEST_ID,
        courseId: 'course-x',
      });
      // ON CONFLICT DO NOTHING: a raised 23505 would poison the tenant tx.
      expect(insertBuilder.orIgnore).toHaveBeenCalled();
      expect(state.insertedUsages).toEqual([
        expect.objectContaining({
          materialRequestId: REQUEST_ID,
          courseId: 'course-x',
          questionId: 'q-1',
          positionInPdf: 1,
          wasReplacement: false,
        }),
        expect.objectContaining({
          materialRequestId: REQUEST_ID,
          courseId: 'course-x',
          questionId: 'q-2',
          positionInPdf: 2,
          wasReplacement: true,
        }),
      ]);
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.COMPLETED,
      );
    });

    it('commits the completed status even when the ledger insert fails, rolling back to the savepoint', async () => {
      const { useCase, manager, state, insertBuilder } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );
      insertBuilder.execute.mockRejectedValueOnce(
        new Error('FK violation: topic_id not present'),
      );

      await useCase.execute(
        { job_id: 'c1', status: 'completed' } as any,
        usages,
      );

      // The ledger failure must NOT sink the status of a PDF that already
      // exists in S3: roll back to the savepoint, keep COMPLETED.
      expect(manager.query).toHaveBeenCalledWith('SAVEPOINT usage_ledger');
      expect(manager.query).toHaveBeenCalledWith(
        'ROLLBACK TO SAVEPOINT usage_ledger',
      );
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.COMPLETED,
      );
    });

    it('does not rewrite the ledger when the callback is an ignored duplicate', async () => {
      const { useCase, manager, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.COMPLETED }],
        MaterialRequestStatus.COMPLETED,
      );

      await useCase.execute(
        { job_id: 'c1', status: 'completed' } as any,
        usages,
      );

      // The first delivery already committed status + ledger atomically; a
      // redelivery must not touch either.
      expect(manager.delete).not.toHaveBeenCalled();
      expect(state.insertedUsages).toEqual([]);
    });

    it('never writes usage rows for a non-success status', async () => {
      const { useCase, manager, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );

      await useCase.execute({ job_id: 'c1', status: 'failed' } as any, usages);

      expect(manager.delete).not.toHaveBeenCalled();
      expect(state.insertedUsages).toEqual([]);
    });
  });

  describe('billing artifact metadata (page count / file size)', () => {
    it('persists pageCount and fileSizeBytes on the SAME update as the terminal status', async () => {
      const { useCase, manager, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );

      await useCase.execute(
        { job_id: 'c1', status: 'completed' } as any,
        undefined,
        { pageCount: 7, fileSizeBytes: 123456 },
      );

      expect(manager.update).toHaveBeenCalledWith(
        MaterialRequestCourse,
        'c1',
        expect.objectContaining({
          status: CourseMaterialStatus.COMPLETED,
          pageCount: 7,
          fileSizeBytes: 123456,
        }),
      );
      expect((state.courses.get('c1')! as any).pageCount).toBe(7);
      expect((state.courses.get('c1')! as any).fileSizeBytes).toBe(123456);
      // No extra transaction/savepoint: manager.update was called exactly
      // once for the course (the same call that sets status/downloadUrl).
      expect(
        manager.update.mock.calls.filter(
          ([entity]: any[]) => entity === MaterialRequestCourse,
        ),
      ).toHaveLength(1);
    });

    it('omits both columns (leaves them untouched) when no artifactMeta is given', async () => {
      const { useCase, manager } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );

      await useCase.execute({ job_id: 'c1', status: 'failed' } as any);

      const [, , patch] = manager.update.mock.calls[0];
      expect(patch.pageCount).toBeUndefined();
      expect(patch.fileSizeBytes).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('rejects an unknown status instead of silently marking the course FAILED', async () => {
      const { useCase, tenantService, state } = buildHarness(
        [{ id: 'c1', status: CourseMaterialStatus.PROCESSING }],
        MaterialRequestStatus.PROCESSING,
      );

      await expect(
        useCase.execute({ job_id: 'c1', status: 'garbage' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Rejected before any tenant work: the course is untouched, not FAILED.
      expect(tenantService.runInTenant).not.toHaveBeenCalled();
      expect(state.courses.get('c1')!.status).toBe(
        CourseMaterialStatus.PROCESSING,
      );
    });

    it('rejects a payload missing job_id or status', async () => {
      const { useCase } = buildHarness([], MaterialRequestStatus.PROCESSING);

      await expect(
        useCase.execute({ status: 'completed' } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unknown course', () => {
    it('is a benign no-op for a job_id with no matching course', async () => {
      const { useCase, queue, manager } = buildHarness(
        [],
        MaterialRequestStatus.PROCESSING,
      );

      await expect(
        useCase.execute({ job_id: 'missing', status: 'completed' } as any),
      ).resolves.toBeUndefined();

      expect(manager.update).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
