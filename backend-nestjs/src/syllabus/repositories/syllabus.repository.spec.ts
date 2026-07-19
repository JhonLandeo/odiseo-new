import { ConflictException, NotFoundException } from '@nestjs/common';
import { SyllabusRepositoryImpl } from './syllabus.repository';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
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
      await expect(
        repo.updateVisibility('s-1', false),
      ).resolves.toBeUndefined();
      expect(manager.update).toHaveBeenCalled();
    });
  });

  // ── Cross-module boundary: AcademicTimeRepositoryImpl archives a cycle's
  // syllabuses through this method instead of a raw cross-schema UPDATE ────
  describe('deactivateByCycleId', () => {
    it('deactivates every syllabus for the cycle', async () => {
      const { repo, manager } = buildRepo();

      await repo.deactivateByCycleId('c-1');

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        { cycleId: 'c-1' },
        { isActive: false },
      );
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

  /**
   * Regression test for the NULL-safe fix (tenant migration
   * 0011_syllabus_distribution_null_safe_unique). Postgres treats
   * NULL <> NULL for uniqueness, so the OLD plain-column
   * UQ_syllabus_template_week_topic_subtopic never raised 23505 for two
   * distributions sharing (syllabusId, weekNumber, topicId, subtopicId) with
   * BOTH templateId null -- the createDistribution catch-and-overwrite LWW
   * path below was silently never reached, and duplicate cells accumulated.
   *
   * There is no live Postgres in this test suite, so the fake manager models
   * the fixed database precisely: `save` treats
   * (syllabusId, templateId ?? sentinel, weekNumber, topicId, subtopicId) as
   * the real-world NULL-safe conflict target (the COALESCE expression index)
   * and raises the same 23505 the driver would once the index exists.
   */
  describe('createDistribution — NULL-safe LWW regression (both cells templateId: null)', () => {
    const NULL_SENTINEL = '00000000-0000-0000-0000-000000000000';

    const buildNullSafeRepo = () => {
      const rows: Array<Record<string, unknown>> = [];
      let nextId = 1;

      const conflictKey = (r: Record<string, unknown>) =>
        [
          r.syllabusId,
          (r.templateId as string | null) ?? NULL_SENTINEL,
          r.weekNumber,
          r.topicId,
          r.subtopicId,
        ].join('|');

      const manager = {
        create: jest.fn((_entity, data) => ({ ...data })),
        save: jest.fn((entity: Record<string, unknown>) => {
          // An update to an already-persisted row (the LWW overwrite path)
          // carries an id; just persist the mutation.
          if (entity.id) {
            const idx = rows.findIndex((r) => r.id === entity.id);
            if (idx >= 0) rows[idx] = entity;
            return Promise.resolve(entity);
          }
          // A fresh INSERT: the fixed expression index rejects a second row
          // whose (syllabusId, COALESCE(templateId, sentinel), weekNumber,
          // topicId, subtopicId) tuple already exists.
          const conflict = rows.some(
            (r) => conflictKey(r) === conflictKey(entity),
          );
          if (conflict) {
            throw Object.assign(new Error('duplicate key'), {
              code: UNIQUE_VIOLATION,
            });
          }
          const saved = { ...entity, id: `dist-${nextId++}` };
          rows.push(saved);
          return Promise.resolve(saved);
        }),
        findOne: jest.fn(
          (_entity, { where }: { where: Record<string, unknown> }) => {
            const wantsNullTemplate =
              where.templateId !== null &&
              typeof where.templateId === 'object' &&
              (where.templateId as { type?: string })?.type === 'isNull';
            const found = rows.find(
              (r) =>
                r.syllabusId === where.syllabusId &&
                r.weekNumber === where.weekNumber &&
                r.topicId === where.topicId &&
                r.subtopicId === where.subtopicId &&
                (wantsNullTemplate
                  ? r.templateId == null
                  : r.templateId === where.templateId),
            );
            return Promise.resolve(found ?? null);
          },
        ),
      };
      const tenantService = {
        runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
      } as unknown as TenantService;
      return { repo: new SyllabusRepositoryImpl(tenantService), rows };
    };

    it('overwrites the existing row instead of creating a duplicate when templateId is null for both inserts', async () => {
      const { repo, rows } = buildNullSafeRepo();
      const baseCell = {
        syllabusId: 'sy-1',
        templateId: null,
        weekNumber: 3,
        topicId: '10',
        subtopicId: '20',
      };

      const first = await repo.createDistribution({
        ...baseCell,
        questionCount: 5,
      });
      const second = await repo.createDistribution({
        ...baseCell,
        questionCount: 9,
      });

      // Exactly one row survives (LWW), not two duplicates.
      expect(rows).toHaveLength(1);
      expect(second).toEqual(
        expect.objectContaining({ id: first.id, questionCount: 9 }),
      );
      expect(rows[0].questionCount).toBe(9);
    });
  });

  /**
   * Object-level authorization: a distribution mutation must be scoped by both
   * the distribution id AND its owning syllabus, so an EDIT_SYLLABUS caller
   * cannot update or delete a distribution belonging to a different syllabus by
   * passing a mismatched :id. The affected-row count is the race-free check; a
   * count of 0 means the distribution does not belong to that syllabus.
   */
  describe('distribution ownership scoping', () => {
    const buildScopedRepo = (affected: number) => {
      const manager = {
        update: jest.fn(() => Promise.resolve({ affected })),
        delete: jest.fn(() => Promise.resolve({ affected })),
      };
      const tenantService = {
        runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
      } as unknown as TenantService;
      return { repo: new SyllabusRepositoryImpl(tenantService), manager };
    };

    describe('updateDistributionQuantity', () => {
      it('scopes the update by both distribution id and syllabusId', async () => {
        const { repo, manager } = buildScopedRepo(1);
        await repo.updateDistributionQuantity('dist-1', 'syl-1', 7);
        expect(manager.update).toHaveBeenCalledWith(
          SyllabusDistribution,
          { id: 'dist-1', syllabusId: 'syl-1' },
          { questionCount: 7 },
        );
      });

      it('throws NotFoundException when no row belongs to the syllabus', async () => {
        const { repo } = buildScopedRepo(0);
        await expect(
          repo.updateDistributionQuantity('dist-1', 'other-syl', 7),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });

    describe('deleteDistribution', () => {
      it('scopes the delete by both distribution id and syllabusId', async () => {
        const { repo, manager } = buildScopedRepo(1);
        await repo.deleteDistribution('dist-1', 'syl-1');
        expect(manager.delete).toHaveBeenCalledWith(SyllabusDistribution, {
          id: 'dist-1',
          syllabusId: 'syl-1',
        });
      });

      it('throws NotFoundException when no row belongs to the syllabus', async () => {
        const { repo } = buildScopedRepo(0);
        await expect(
          repo.deleteDistribution('dist-1', 'other-syl'),
        ).rejects.toBeInstanceOf(NotFoundException);
      });
    });
  });
});
