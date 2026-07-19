import { InternalServerErrorException } from '@nestjs/common';
import { AcademicTimeRepositoryImpl } from './academic-time.repository';
import { CycleWeek } from '../entities/cycle-week.entity';

const UNIQUE_VIOLATION = '23505';

function createRepository() {
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    softDelete: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const tenantService = {
    runInTenant: jest.fn((op: (m: any) => Promise<any>) => op(manager)),
  };
  const syllabusRepository = {
    deactivateByCycleId: jest.fn().mockResolvedValue(undefined),
  };
  const repository = new AcademicTimeRepositoryImpl(
    tenantService as any,
    syllabusRepository as any,
  );
  return { repository, manager, tenantService, syllabusRepository };
}

describe('AcademicTimeRepositoryImpl', () => {
  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────── B2 ─────────────────────────────
  describe('getCycleWithSyllabus', () => {
    it('reports hasSyllabus when active syllabuses exist', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue({ id: 'c1', name: 'Ciclo A' });
      manager.query.mockResolvedValue([{ count: '2' }]);

      const result = await repository.getCycleWithSyllabus('c1');

      expect(result.hasSyllabus).toBe(true);
    });

    it('reports no syllabus when the count is genuinely zero', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue({ id: 'c1' });
      manager.query.mockResolvedValue([{ count: '0' }]);

      const result = await repository.getCycleWithSyllabus('c1');

      expect(result.hasSyllabus).toBe(false);
    });

    // The guard must never be silently disabled: a failed check is NOT
    // evidence that no syllabus exists.
    it('throws instead of returning hasSyllabus=false when the check fails', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue({ id: 'c1' });
      manager.query.mockRejectedValue(new Error('connection reset'));

      await expect(repository.getCycleWithSyllabus('c1')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('returns null for a cycle that does not exist', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue(null);

      expect(await repository.getCycleWithSyllabus('missing')).toBeNull();
    });
  });

  // ─────────────────────────────── B1 ─────────────────────────────
  describe('getTemplateUsage', () => {
    it('collapses the four dependant counts into one query', async () => {
      const { repository, manager } = createRepository();
      manager.query.mockResolvedValue([
        {
          syllabus: '2',
          syllabus_distribution: '5',
          material_requests: '0',
          materials: '1',
        },
      ]);

      const usage = await repository.getTemplateUsage('t1');

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(usage).toEqual({
        syllabus: 2,
        syllabusDistribution: 5,
        materialRequests: 0,
        materials: 1,
      });
    });

    it('propagates a failed usage check rather than reporting zero usage', async () => {
      const { repository, manager } = createRepository();
      manager.query.mockRejectedValue(new Error('connection reset'));

      await expect(repository.getTemplateUsage('t1')).rejects.toThrow(
        'connection reset',
      );
    });
  });

  // ── IDOR: template ownership scoped by cycle ──────────────────────
  describe('getTemplateInCycle', () => {
    it('returns the template id when it belongs to the cycle', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue({ id: 't1' });

      const result = await repository.getTemplateInCycle('t1', 'c1');

      expect(manager.findOne).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ where: { id: 't1', cycleId: 'c1' } }),
      );
      expect(result).toEqual({ id: 't1' });
    });

    it('returns null when the template belongs to a different cycle', async () => {
      const { repository, manager } = createRepository();
      manager.findOne.mockResolvedValue(null);

      const result = await repository.getTemplateInCycle('t1', 'other-cycle');

      expect(result).toBeNull();
    });
  });

  describe('getCycleUsage', () => {
    it('collapses every dependent-record count into one query', async () => {
      const { repository, manager } = createRepository();
      manager.query.mockResolvedValue([
        {
          templates: '3',
          syllabus: '2',
          materials: '4',
          material_requests: '1',
        },
      ]);

      const usage = await repository.getCycleUsage('c1');

      expect(manager.query).toHaveBeenCalledTimes(1);
      expect(usage).toEqual({
        templates: 3,
        syllabus: 2,
        materials: 4,
        materialRequests: 1,
      });
    });

    it('propagates a failed usage check rather than reporting zero usage', async () => {
      const { repository, manager } = createRepository();
      manager.query.mockRejectedValue(new Error('connection reset'));

      await expect(repository.getCycleUsage('c1')).rejects.toThrow(
        'connection reset',
      );
    });
  });

  // ── Cross-module boundary: cycle archive must go through Syllabus's own
  // repository, never a raw cross-schema UPDATE ──────────────────────────
  describe('updateCycleVisibility', () => {
    it('archives the cycle and deactivates its syllabuses through ISyllabusRepository', async () => {
      const { repository, manager, syllabusRepository } = createRepository();

      await repository.updateCycleVisibility('c1', false);

      expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'c1', {
        isActive: false,
      });
      expect(syllabusRepository.deactivateByCycleId).toHaveBeenCalledWith('c1');
      // No raw SQL against the syllabus table from this module anymore.
      expect(manager.query).not.toHaveBeenCalled();
    });

    it('never touches syllabuses when the cycle is reactivated', async () => {
      const { repository, syllabusRepository } = createRepository();

      await repository.updateCycleVisibility('c1', true);

      expect(syllabusRepository.deactivateByCycleId).not.toHaveBeenCalled();
    });
  });

  // ── uq_cycle_weeks_cycle_week_live: a 23505 on a concurrent regrow must
  // degrade to a no-op for that week, not a raw 500 / poisoned transaction ──
  describe('week insert races (createCycle / updateCycle)', () => {
    const uniqueViolation = Object.assign(new Error('duplicate key'), {
      code: UNIQUE_VIOLATION,
    });

    describe('createCycle', () => {
      it('skips a week that races into an existing live row instead of throwing', async () => {
        const { repository, manager } = createRepository();
        let weekSaveCalls = 0;
        // The cycle itself is saved with `manager.save(cycle)` (single arg);
        // saveWeeksSafely saves each week with `manager.save(CycleWeek, week)`
        // (two args) — only the latter is subject to the 23505 catch.
        manager.save.mockImplementation((...args: unknown[]) => {
          if (args[0] === CycleWeek) {
            weekSaveCalls += 1;
            if (weekSaveCalls === 1) throw uniqueViolation;
            return Promise.resolve(args[1]);
          }
          return Promise.resolve(args[0]);
        });

        await expect(
          repository.createCycle({
            id: 'c1',
            name: 'Ciclo A',
            weeks: [
              { id: 'w1', cycleId: 'c1', weekNumber: 1 },
              { id: 'w2', cycleId: 'c1', weekNumber: 2 },
            ],
          }),
        ).resolves.toBeUndefined();

        // Cycle save + 2 week saves attempted, despite the first colliding.
        expect(manager.save).toHaveBeenCalledTimes(3);
        expect(weekSaveCalls).toBe(2);
      });

      it('lets an unrelated database error propagate untouched', async () => {
        const { repository, manager } = createRepository();
        const other = Object.assign(new Error('connection lost'), {
          code: '08006',
        });
        manager.save.mockImplementation((...args: unknown[]) => {
          if (args[0] === CycleWeek) throw other;
          return Promise.resolve(args[0]);
        });

        await expect(
          repository.createCycle({
            id: 'c1',
            name: 'Ciclo A',
            weeks: [{ id: 'w1', cycleId: 'c1', weekNumber: 1 }],
          }),
        ).rejects.toBe(other);
      });
    });

    describe('updateCycle (regrow)', () => {
      it('skips a regrown week that collides with an already-committed live row', async () => {
        const { repository, manager } = createRepository();
        manager.find.mockResolvedValue([]);
        manager.save.mockImplementation((entity: unknown) => {
          if (entity === CycleWeek) throw uniqueViolation;
          return Promise.resolve(undefined);
        });

        await expect(
          repository.updateCycle('c1', {
            weeks: [{ id: 'w3', cycleId: 'c1', weekNumber: 3 }],
          }),
        ).resolves.toBeUndefined();
      });

      it('lets an unrelated database error propagate untouched', async () => {
        const { repository, manager } = createRepository();
        manager.find.mockResolvedValue([]);
        const other = Object.assign(new Error('connection lost'), {
          code: '08006',
        });
        manager.save.mockImplementation((entity: unknown) => {
          if (entity === CycleWeek) throw other;
          return Promise.resolve(undefined);
        });

        await expect(
          repository.updateCycle('c1', {
            weeks: [{ id: 'w3', cycleId: 'c1', weekNumber: 3 }],
          }),
        ).rejects.toBe(other);
      });
    });
  });
});
