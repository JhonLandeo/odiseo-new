import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AcademicTimeUseCase } from './academic-time.use-case';

const NO_TEMPLATE_USAGE = {
  syllabus: 0,
  syllabusDistribution: 0,
  materialRequests: 0,
  materials: 0,
};

const NO_CYCLE_USAGE = {
  templates: 0,
  syllabus: 0,
  materials: 0,
  materialRequests: 0,
};

describe('AcademicTimeUseCase', () => {
  let useCase: AcademicTimeUseCase;
  let mockRepo: any;
  let mockTenantService: any;

  beforeEach(() => {
    mockRepo = {
      getCycles: jest.fn(),
      createCycle: jest.fn().mockResolvedValue(undefined),
      updateCycle: jest.fn().mockResolvedValue(undefined),
      getCycleWithSyllabus: jest.fn(),
      getCycleUsage: jest.fn().mockResolvedValue(NO_CYCLE_USAGE),
      getWeeksByCycle: jest.fn(),
      softDeleteCycle: jest.fn().mockResolvedValue(undefined),
      createTemplate: jest.fn().mockResolvedValue(undefined),
      // Ownership guard resolves to an owned template by default; individual
      // IDOR tests override it with null to simulate a foreign template.
      getTemplateInCycle: jest.fn().mockResolvedValue({ id: 't1' }),
      updateTemplate: jest.fn().mockResolvedValue(undefined),
      getTemplateUsage: jest.fn().mockResolvedValue(NO_TEMPLATE_USAGE),
      deleteTemplate: jest.fn().mockResolvedValue(undefined),
    };
    // Mirrors the ambient tx_manager reuse of the real TenantService: every
    // repository call nested inside this callback observes the same "one
    // transaction" the real reentrancy mechanism provides.
    mockTenantService = {
      runInTenant: jest.fn((op: () => Promise<any>) => op()),
    };
    useCase = new AcademicTimeUseCase(mockRepo, mockTenantService);
  });

  describe('createCycle', () => {
    it('generates sequential weekly dates, all active, and sets the cycle end date', async () => {
      const res = await useCase.createCycle({
        name: 'Ciclo A',
        year: 2026,
        startDate: '2026-01-05',
        daysPerWeek: 5,
        totalWeeks: 3,
      });

      expect(res.id).toBeDefined();
      const arg = mockRepo.createCycle.mock.calls[0][0];
      expect(arg.weeks).toHaveLength(3);
      // Week 1: start = startDate, end = start + (daysPerWeek - 1)
      expect(arg.weeks[0]).toEqual(
        expect.objectContaining({
          weekNumber: 1,
          startDate: '2026-01-05',
          endDate: '2026-01-09',
          isActive: true,
        }),
      );
      // Week 2 starts 7 days after week 1
      expect(arg.weeks[1].startDate).toBe('2026-01-12');
      expect(arg.weeks[2].startDate).toBe('2026-01-19');
      expect(arg.weeks.every((w: any) => w.isActive)).toBe(true);
      // Cycle end date == last week end date
      expect(arg.endDate).toBe(arg.weeks[2].endDate);
    });
  });

  describe('updateCycle (recalculation)', () => {
    it('fetches existing weeks BY cycleId and preserves their ids and isActive state (CR-004)', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({
        id: 'c1',
        name: 'Ciclo A',
        startDate: '2026-01-05',
        daysPerWeek: 5,
        totalWeeks: 2,
        hasSyllabus: false,
      });
      mockRepo.getWeeksByCycle.mockResolvedValue([
        { id: 'w1', weekNumber: 1, isActive: false },
        { id: 'w2', weekNumber: 2, isActive: true },
      ]);

      await useCase.updateCycle('c1', { totalWeeks: 3 });

      // The stable key (cycleId), never the name, drives the lookup.
      expect(mockRepo.getWeeksByCycle).toHaveBeenCalledWith('c1');
      const data = mockRepo.updateCycle.mock.calls[0][1];
      expect(data.weeks).toHaveLength(3);
      expect(data.weeks[0]).toEqual(
        expect.objectContaining({ id: 'w1', weekNumber: 1, isActive: false }),
      );
      expect(data.weeks[1]).toEqual(
        expect.objectContaining({ id: 'w2', weekNumber: 2, isActive: true }),
      );
      // A brand-new week defaults to active.
      expect(data.weeks[2].weekNumber).toBe(3);
      expect(data.weeks[2].isActive).toBe(true);
    });

    it('refuses to recalculate weeks when the cycle has active syllabus relations', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({
        id: 'c1',
        name: 'Ciclo A',
        startDate: '2026-01-05',
        daysPerWeek: 5,
        totalWeeks: 2,
        hasSyllabus: true,
      });

      await expect(
        useCase.updateCycle('c1', { totalWeeks: 5 }),
      ).rejects.toThrow(ConflictException);
      expect(mockRepo.updateCycle).not.toHaveBeenCalled();
    });

    // TOCTOU: the syllabus-relations check (getCycleWithSyllabus) and the
    // week regrow it gates (getWeeksByCycle + updateCycle) must observe one
    // consistent snapshot.
    it('collapses the syllabus-relations check and the regrow into a single transaction', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({
        id: 'c1',
        name: 'Ciclo A',
        startDate: '2026-01-05',
        daysPerWeek: 5,
        totalWeeks: 2,
        hasSyllabus: false,
      });
      mockRepo.getWeeksByCycle.mockResolvedValue([]);

      await useCase.updateCycle('c1', { totalWeeks: 3 });

      expect(mockTenantService.runInTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('createTemplate (difficulty validation)', () => {
    it('rejects a course whose easy+medium+hard does not equal the total quantity', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({
        id: 'c1',
        hasSyllabus: false,
      });

      await expect(
        useCase.createTemplate('c1', {
          name: 'Balotario',
          scope: 'CURRENT_WEEK',
          courses: [
            {
              courseId: '1',
              questionsQuantity: 10,
              easyCount: 3,
              mediumCount: 3,
              hardCount: 3,
            },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createTemplate).not.toHaveBeenCalled();
    });

    it('accepts a course whose difficulty counts sum to the total', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({
        id: 'c1',
        hasSyllabus: false,
      });

      const res = await useCase.createTemplate('c1', {
        name: 'Balotario',
        scope: 'CURRENT_WEEK',
        courses: [
          {
            courseId: '1',
            questionsQuantity: 10,
            easyCount: 4,
            mediumCount: 4,
            hardCount: 2,
          },
        ],
      } as any);

      expect(res.id).toBeDefined();
      expect(mockRepo.createTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteCycle', () => {
    it('soft-deletes a cycle with no dependent records', async () => {
      mockRepo.getCycleUsage.mockResolvedValue(NO_CYCLE_USAGE);

      await useCase.deleteCycle('c1');
      expect(mockRepo.softDeleteCycle).toHaveBeenCalledWith('c1');
    });

    it('blocks deletion when the cycle has active syllabus relations', async () => {
      mockRepo.getCycleUsage.mockResolvedValue({
        ...NO_CYCLE_USAGE,
        syllabus: 2,
      });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    // The old guard only looked at ACTIVE syllabuses. getCycleUsage counts
    // syllabuses regardless of is_active, so an inactive syllabus still blocks
    // the delete — the cycle would otherwise be tombstoned under it.
    it('blocks deletion when only an inactive syllabus references the cycle', async () => {
      mockRepo.getCycleUsage.mockResolvedValue({
        ...NO_CYCLE_USAGE,
        syllabus: 1,
      });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    it('blocks deletion when material templates still reference the cycle', async () => {
      mockRepo.getCycleUsage.mockResolvedValue({
        ...NO_CYCLE_USAGE,
        templates: 3,
      });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    it('blocks deletion when generated materials still reference the cycle', async () => {
      mockRepo.getCycleUsage.mockResolvedValue({
        ...NO_CYCLE_USAGE,
        materials: 1,
      });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    it('names every kind of dependant in the conflict message', async () => {
      mockRepo.getCycleUsage.mockResolvedValue({
        templates: 3,
        syllabus: 2,
        materials: 4,
        materialRequests: 1,
      });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(
        /3 material templates, 2 syllabus, 4 generated materials, 1 material requests/,
      );
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    // The usage check must fail closed. If getCycleUsage cannot prove the cycle
    // is unused, the delete must not proceed.
    it('does not delete when the usage check itself fails', async () => {
      mockRepo.getCycleUsage.mockRejectedValue(
        new Error('relation "syllabus" does not exist'),
      );

      await expect(useCase.deleteCycle('c1')).rejects.toThrow();
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    // TOCTOU: getCycleUsage (check) and softDeleteCycle (act) must run inside
    // ONE transaction, not two independent ones with a window between them.
    it('collapses the usage check and the delete into a single transaction', async () => {
      await useCase.deleteCycle('c1');

      expect(mockTenantService.runInTenant).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────── IDOR: object-level authorization on templates ───────
  describe('updateTemplate (template must belong to the cycle)', () => {
    it('updates a template that belongs to the cycle', async () => {
      mockRepo.getTemplateInCycle.mockResolvedValue({ id: 't1' });

      const res = await useCase.updateTemplate('c1', 't1', {
        name: 'New name',
      });

      expect(mockRepo.getTemplateInCycle).toHaveBeenCalledWith('t1', 'c1');
      expect(mockRepo.updateTemplate).toHaveBeenCalledWith('t1', {
        name: 'New name',
      });
      expect(res).toEqual({ success: true });
    });

    it('refuses (NotFound) and never touches rows when the template belongs to a different cycle', async () => {
      // A MANAGE_ACADEMIC_TIME user passes a :cycleId that does not own t1.
      mockRepo.getTemplateInCycle.mockResolvedValue(null);

      await expect(
        useCase.updateTemplate('other-cycle', 't1', {
          name: 'Hijack',
          courses: [
            {
              courseId: '1',
              questionsQuantity: 5,
              easyCount: 5,
              mediumCount: 0,
              hardCount: 0,
            },
          ],
        } as any),
      ).rejects.toThrow(NotFoundException);

      // The mutation (and therefore the course delete/re-insert) is never reached.
      expect(mockRepo.updateTemplate).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────── B1: deleteTemplate ─────────────
  describe('deleteTemplate', () => {
    it('deletes a template nothing depends on', async () => {
      await useCase.deleteTemplate('c1', 't1');

      expect(mockRepo.getTemplateInCycle).toHaveBeenCalledWith('t1', 'c1');
      expect(mockRepo.getTemplateUsage).toHaveBeenCalledWith('t1');
      expect(mockRepo.deleteTemplate).toHaveBeenCalledWith('t1');
    });

    it('refuses (NotFound) a template of a different cycle before the usage check, deleting nothing', async () => {
      mockRepo.getTemplateInCycle.mockResolvedValue(null);

      await expect(useCase.deleteTemplate('other-cycle', 't1')).rejects.toThrow(
        NotFoundException,
      );

      // Ownership is checked BEFORE usage, so neither the usage lookup nor the
      // delete (which would remove the template's course rows) is reached.
      expect(mockRepo.getTemplateUsage).not.toHaveBeenCalled();
      expect(mockRepo.deleteTemplate).not.toHaveBeenCalled();
    });

    it('blocks deletion when syllabus distributions still reference it', async () => {
      mockRepo.getTemplateUsage.mockResolvedValue({
        ...NO_TEMPLATE_USAGE,
        syllabusDistribution: 3,
      });

      await expect(useCase.deleteTemplate('c1', 't1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.deleteTemplate).not.toHaveBeenCalled();
    });

    it('blocks deletion when generated materials still reference it', async () => {
      mockRepo.getTemplateUsage.mockResolvedValue({
        ...NO_TEMPLATE_USAGE,
        materials: 1,
      });

      await expect(useCase.deleteTemplate('c1', 't1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepo.deleteTemplate).not.toHaveBeenCalled();
    });

    it('names every kind of dependant in the conflict message', async () => {
      mockRepo.getTemplateUsage.mockResolvedValue({
        syllabus: 2,
        syllabusDistribution: 5,
        materialRequests: 1,
        materials: 4,
      });

      await expect(useCase.deleteTemplate('c1', 't1')).rejects.toThrow(
        /2 syllabus, 5 syllabus distributions, 1 material requests, 4 generated materials/,
      );
    });

    it('does not delete when the usage check itself fails', async () => {
      mockRepo.getTemplateUsage.mockRejectedValue(new Error('connection lost'));

      await expect(useCase.deleteTemplate('c1', 't1')).rejects.toThrow();
      expect(mockRepo.deleteTemplate).not.toHaveBeenCalled();
    });

    // TOCTOU: getTemplateInCycle (IDOR check), getTemplateUsage (usage check)
    // and deleteTemplate (act) must all observe ONE consistent snapshot.
    // Before this fix, each repository call opened its own transaction, so a
    // syllabus could start referencing the template between the usage check
    // and the delete — the FK is ON DELETE SET NULL, so that reference would
    // silently go null instead of blocking the delete. Asserting
    // runInTenant is invoked exactly once at the use-case boundary proves the
    // whole check-then-act sequence now shares the single outer transaction
    // (TenantService reuses the ambient tx_manager for nested calls of the
    // same schema — see tenant.service.spec.ts "ambient transaction reuse").
    it('collapses the ownership check, usage check, and delete into a single transaction', async () => {
      await useCase.deleteTemplate('c1', 't1');

      expect(mockTenantService.runInTenant).toHaveBeenCalledTimes(1);
    });

    it('still collapses into a single transaction when the ownership check refuses the delete', async () => {
      mockRepo.getTemplateInCycle.mockResolvedValue(null);

      await expect(useCase.deleteTemplate('other-cycle', 't1')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockTenantService.runInTenant).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────── B3: 404 not 500 ────────────────
  describe('missing cycle raises NotFoundException (not a bare Error)', () => {
    it('updateCycle throws NotFoundException', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue(null);

      await expect(
        useCase.updateCycle('missing', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('createTemplate throws NotFoundException', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue(null);

      await expect(
        useCase.createTemplate('missing', {
          name: 't',
          scope: 'CURRENT_WEEK',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
