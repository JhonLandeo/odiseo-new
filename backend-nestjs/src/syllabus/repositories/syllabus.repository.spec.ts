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

  const buildRepo = (managerError?: unknown) => {
    const manager = {
      create: jest.fn((_entity, data) => data),
      save: jest.fn(() => {
        if (managerError) throw managerError;
        return Promise.resolve({ id: 's-1' });
      }),
      update: jest.fn(() => {
        if (managerError) throw managerError;
        return Promise.resolve({ affected: 1 });
      }),
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
});
