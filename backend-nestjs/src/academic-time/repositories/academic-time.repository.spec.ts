import { InternalServerErrorException } from '@nestjs/common';
import { AcademicTimeRepositoryImpl } from './academic-time.repository';

function createRepository() {
  const manager = {
    query: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const tenantService = {
    runInTenant: jest.fn((op: (m: any) => Promise<any>) => op(manager)),
  };
  const repository = new AcademicTimeRepositoryImpl(tenantService as any);
  return { repository, manager };
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
});
