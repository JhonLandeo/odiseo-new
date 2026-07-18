import { ConflictException, BadRequestException } from '@nestjs/common';
import { AcademicTimeUseCase } from './academic-time.use-case';

describe('AcademicTimeUseCase', () => {
  let useCase: AcademicTimeUseCase;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      getCycles: jest.fn(),
      createCycle: jest.fn().mockResolvedValue(undefined),
      updateCycle: jest.fn().mockResolvedValue(undefined),
      getCycleWithSyllabus: jest.fn(),
      getWeeksByCycle: jest.fn(),
      softDeleteCycle: jest.fn().mockResolvedValue(undefined),
      createTemplate: jest.fn().mockResolvedValue(undefined),
    };
    useCase = new AcademicTimeUseCase(mockRepo);
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
  });

  describe('createTemplate (difficulty validation)', () => {
    it('rejects a course whose easy+medium+hard does not equal the total quantity', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({ id: 'c1', hasSyllabus: false });

      await expect(
        useCase.createTemplate('c1', {
          name: 'Balotario',
          scope: 'CURRENT_WEEK',
          courses: [
            { courseId: '1', questionsQuantity: 10, easyCount: 3, mediumCount: 3, hardCount: 3 },
          ],
        } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepo.createTemplate).not.toHaveBeenCalled();
    });

    it('accepts a course whose difficulty counts sum to the total', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({ id: 'c1', hasSyllabus: false });

      const res = await useCase.createTemplate('c1', {
        name: 'Balotario',
        scope: 'CURRENT_WEEK',
        courses: [
          { courseId: '1', questionsQuantity: 10, easyCount: 4, mediumCount: 4, hardCount: 2 },
        ],
      } as any);

      expect(res.id).toBeDefined();
      expect(mockRepo.createTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteCycle', () => {
    it('blocks deletion when the cycle has active syllabus relations', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({ id: 'c1', hasSyllabus: true });

      await expect(useCase.deleteCycle('c1')).rejects.toThrow(ConflictException);
      expect(mockRepo.softDeleteCycle).not.toHaveBeenCalled();
    });

    it('soft-deletes a cycle with no syllabus relations', async () => {
      mockRepo.getCycleWithSyllabus.mockResolvedValue({ id: 'c1', hasSyllabus: false });

      await useCase.deleteCycle('c1');
      expect(mockRepo.softDeleteCycle).toHaveBeenCalledWith('c1');
    });
  });
});
