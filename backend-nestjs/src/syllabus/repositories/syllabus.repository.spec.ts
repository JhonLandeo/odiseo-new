import { ConflictException } from '@nestjs/common';
import { SyllabusRepositoryImpl } from './syllabus.repository';
import { TenantService } from '../../database/tenant.service';

/**
 * `uq_syllabus_cycle_course_active` (tenant migration 0004) is a partial unique
 * index over the ACTIVE rows. It is the only thing that actually enforces one
 * syllabus per course and cycle: the use case checks for a duplicate in a
 * separate transaction, so concurrent callers both pass that check.
 *
 * These tests pin the translation of the resulting driver error. Without it the
 * loser of the race — and anyone reactivating an archived syllabus whose slot is
 * taken — receives a 500 for what is a legitimate conflict.
 */
describe('SyllabusRepositoryImpl (unique violation handling)', () => {
  const UNIQUE_VIOLATION = '23505';

  const buildRepo = (
    managerError?: unknown,
    options: { findOneResult?: unknown } = {},
  ) => {
    // `save` fails once with `managerError` (the racing insert), then succeeds
    // so the Last-Write-Wins upsert can persist the existing row on the retry.
    let saveCalls = 0;
    const manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn((...args: unknown[]) => {
        saveCalls += 1;
        if (managerError && saveCalls === 1) throw managerError;
        const entity = args[args.length - 1] as { id?: string };
        return Promise.resolve(entity?.id ? entity : { id: 's-1' });
      }),
      update: jest.fn(() => {
        if (managerError) throw managerError;
        return Promise.resolve({ affected: 1 });
      }),
      findOne: jest.fn(() => Promise.resolve(options.findOneResult ?? null)),
    };
    const tenantService = {
      runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as unknown as TenantService;
    return { repo: new SyllabusRepositoryImpl(tenantService), manager };
  };

  const uniqueViolation = Object.assign(new Error('duplicate key'), {
    code: UNIQUE_VIOLATION,
  });

  describe('createSyllabus', () => {
    it('translates a unique violation into a 409', async () => {
      const { repo } = buildRepo(uniqueViolation);
      await expect(
        repo.createSyllabus({ courseId: '1', cycleId: 'c-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets unrelated database errors propagate untouched', async () => {
      const other = Object.assign(new Error('connection lost'), {
        code: '08006',
      });
      const { repo } = buildRepo(other);
      await expect(
        repo.createSyllabus({ courseId: '1', cycleId: 'c-1' }),
      ).rejects.toBe(other);
    });

    it('returns the saved syllabus when there is no conflict', async () => {
      const { repo } = buildRepo();
      await expect(
        repo.createSyllabus({ courseId: '1', cycleId: 'c-1' }),
      ).resolves.toEqual({ id: 's-1' });
    });
  });

  describe('updateVisibility', () => {
    it('translates a unique violation into a 409 when reactivating', async () => {
      const { repo } = buildRepo(uniqueViolation);
      await expect(repo.updateVisibility('s-1', true)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets unrelated database errors propagate untouched', async () => {
      const other = Object.assign(new Error('deadlock detected'), {
        code: '40P01',
      });
      const { repo } = buildRepo(other);
      await expect(repo.updateVisibility('s-1', true)).rejects.toBe(other);
    });

    it('archiving never conflicts', async () => {
      const { repo, manager } = buildRepo();
      await expect(repo.updateVisibility('s-1', false)).resolves.toBeUndefined();
      expect(manager.update).toHaveBeenCalled();
    });
  });

  describe('createDistribution', () => {
    const cell = {
      syllabusId: 'sy-1',
      templateId: 't-1',
      weekNumber: 3,
      topicId: '10',
      subtopicId: '20',
      questionCount: 5,
    };

    it('returns the saved distribution when there is no conflict', async () => {
      const { repo, manager } = buildRepo();
      await expect(repo.createDistribution(cell)).resolves.toEqual({
        id: 's-1',
      });
      expect(manager.findOne).not.toHaveBeenCalled();
    });

    it('applies Last-Write-Wins by overwriting the existing cell on a unique violation', async () => {
      // EC-004: two coordinators toggle the same previously-empty cell; the
      // loser hits UQ_syllabus_template_week_topic_subtopic. The existing row
      // must be updated with the incoming value and returned, so the last save
      // wins instead of raising a 500 or a 409.
      const existing = {
        id: 'dist-existing',
        ...cell,
        questionCount: 1,
      };
      const { repo, manager } = buildRepo(uniqueViolation, {
        findOneResult: existing,
      });

      const result = await repo.createDistribution(cell);

      expect(result).toEqual({ id: 'dist-existing', ...cell });
      expect((result as { questionCount: number }).questionCount).toBe(5);
      expect(manager.findOne).toHaveBeenCalledTimes(1);
    });

    it('lets unrelated database errors propagate untouched', async () => {
      const other = Object.assign(new Error('connection lost'), {
        code: '08006',
      });
      const { repo, manager } = buildRepo(other);
      await expect(repo.createDistribution(cell)).rejects.toBe(other);
      expect(manager.findOne).not.toHaveBeenCalled();
    });

    it('rethrows the violation when the racing cell can no longer be found', async () => {
      const { repo } = buildRepo(uniqueViolation, { findOneResult: null });
      await expect(repo.createDistribution(cell)).rejects.toBe(uniqueViolation);
    });
  });
});
