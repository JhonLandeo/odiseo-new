import { Test, TestingModule } from '@nestjs/testing';
import { SyllabusUseCase } from './syllabus.use-case';
import { I_SYLLABUS_REPOSITORY } from './repositories/i-syllabus.repository';
import { BadRequestException } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';
import { AcademicTimeUseCase } from '../academic-time/academic-time.use-case';

describe('SyllabusUseCase', () => {
  let useCase: SyllabusUseCase;

  const mockRepo = {
    getSummaryBySyllabus: jest.fn(),
    createDistribution: jest.fn(),
    getDistributionById: jest.fn(),
    sumWeekQuestionCount: jest.fn(),
    findByCourseAndCycle: jest.fn(),
    createSyllabus: jest.fn(),
    findById: jest.fn(),
    findActiveWeeksByCycle: jest.fn(),
    updateDistributionQuantity: jest.fn(),
    deleteDistribution: jest.fn(),
    findGeneratedWeeks: jest.fn(),
    findTemplatesByCycle: jest.fn(),
    setTemplate: jest.fn(),
    bulkCreateDistributions: jest.fn(),
    bulkDeleteDistributionsBySyllabus: jest.fn(),
  };

  const mockAcademicTime = {
    getCycles: jest.fn(),
    getTemplates: jest.fn(),
    getActiveWeekNumbers: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyllabusUseCase,
        { provide: I_SYLLABUS_REPOSITORY, useValue: mockRepo },
        {
          provide: TenantService,
          useValue: {
            runInSchema: jest.fn((_, cb) => cb()),
            runInTenant: jest.fn((cb) => cb()),
          },
        },
        { provide: AcademicTimeUseCase, useValue: mockAcademicTime },
      ],
    }).compile();

    useCase = module.get<SyllabusUseCase>(SyllabusUseCase);
    jest.clearAllMocks();
  });

  it('should create distribution successfully with question count', async () => {
    mockRepo.sumWeekQuestionCount.mockResolvedValue(0);
    mockRepo.createDistribution.mockResolvedValue({
      id: 'new-dist',
      questionCount: 5,
    });

    const result = await useCase.addDistribution('syl-1', {
      weekNumber: 1,
      topicId: 't-1',
      subtopicId: 'st-1',
      questionCount: 5,
    });

    expect(result.id).toBe('new-dist');
    expect(mockRepo.createDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        questionCount: 5,
      }),
    );
  });

  describe('FR-007 weekly question-count limit (per syllabus/week)', () => {
    it('allows a create that keeps the week within the 100 limit', async () => {
      // Existing week total 50 + incoming 40 = 90 <= 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(50);
      mockRepo.createDistribution.mockResolvedValue({ id: 'new-dist' });

      await useCase.addDistribution('syl-1', {
        weekNumber: 3,
        topicId: 't-1',
        subtopicId: 'st-1',
        questionCount: 40,
      });

      expect(mockRepo.sumWeekQuestionCount).toHaveBeenCalledWith('syl-1', 3);
      expect(mockRepo.createDistribution).toHaveBeenCalledTimes(1);
    });

    it('rejects a create that would push the week over the 100 limit', async () => {
      // Existing week total 80 + incoming 30 = 110 > 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(80);

      await expect(
        useCase.addDistribution('syl-1', {
          weekNumber: 3,
          topicId: 't-1',
          subtopicId: 'st-1',
          questionCount: 30,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.createDistribution).not.toHaveBeenCalled();
    });

    it('allows a create landing exactly on the 100 boundary', async () => {
      // Existing week total 60 + incoming 40 = exactly 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(60);
      mockRepo.createDistribution.mockResolvedValue({ id: 'new-dist' });

      await useCase.addDistribution('syl-1', {
        weekNumber: 3,
        topicId: 't-1',
        subtopicId: 'st-1',
        questionCount: 40,
      });

      expect(mockRepo.createDistribution).toHaveBeenCalledTimes(1);
    });

    it('allows an update within the limit, excluding the edited cell from the sum', async () => {
      mockRepo.getDistributionById.mockResolvedValue({
        id: 'dist-1',
        weekNumber: 3,
      });
      // Sum of the OTHER cells in the week is 40; new value 50 => 90 <= 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(40);
      mockRepo.updateDistributionQuantity.mockResolvedValue(undefined);

      await useCase.updateDistributionQuantity('dist-1', 'syl-1', 50);

      // The edited cell must be excluded so its previous value is not counted.
      expect(mockRepo.sumWeekQuestionCount).toHaveBeenCalledWith(
        'syl-1',
        3,
        'dist-1',
      );
      expect(mockRepo.updateDistributionQuantity).toHaveBeenCalledWith(
        'dist-1',
        'syl-1',
        50,
      );
    });

    it('rejects an update that would push the week over the limit', async () => {
      mockRepo.getDistributionById.mockResolvedValue({
        id: 'dist-1',
        weekNumber: 3,
      });
      // Other cells sum to 70; new value 40 => 110 > 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(70);

      await expect(
        useCase.updateDistributionQuantity('dist-1', 'syl-1', 40),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepo.updateDistributionQuantity).not.toHaveBeenCalled();
    });

    it('allows an update landing exactly on the 100 boundary', async () => {
      mockRepo.getDistributionById.mockResolvedValue({
        id: 'dist-1',
        weekNumber: 3,
      });
      // Other cells sum to 55; new value 45 => exactly 100.
      mockRepo.sumWeekQuestionCount.mockResolvedValue(55);
      mockRepo.updateDistributionQuantity.mockResolvedValue(undefined);

      await useCase.updateDistributionQuantity('dist-1', 'syl-1', 45);

      expect(mockRepo.updateDistributionQuantity).toHaveBeenCalledWith(
        'dist-1',
        'syl-1',
        45,
      );
    });
  });

  it('forwards both distId and syllabusId when updating a distribution', async () => {
    // The syllabusId must reach the repository so the mutation is scoped to the
    // owning syllabus (object-level authorization), not the distribution alone.
    mockRepo.updateDistributionQuantity.mockResolvedValue(undefined);

    await useCase.updateDistributionQuantity('dist-1', 'syl-1', 9);

    expect(mockRepo.updateDistributionQuantity).toHaveBeenCalledWith(
      'dist-1',
      'syl-1',
      9,
    );
  });

  it('forwards both distId and syllabusId when deleting a distribution', async () => {
    mockRepo.deleteDistribution.mockResolvedValue(undefined);

    await useCase.deleteDistribution('dist-1', 'syl-1');

    expect(mockRepo.deleteDistribution).toHaveBeenCalledWith('dist-1', 'syl-1');
  });

  it('should clone syllabus and filter out inactive weeks', async () => {
    // Target active weeks: only weeks 1 and 2 are active (week 3 is inactive/missing)
    mockRepo.findById.mockResolvedValue({
      id: 'target-syl',
      cycleId: 'cycle-target',
    });
    mockAcademicTime.getActiveWeekNumbers.mockResolvedValue([1, 2]);

    // Source distributions: has questions in weeks 1, 2, and 3
    mockRepo.getSummaryBySyllabus.mockImplementation((id) => {
      if (id === 'source-syl') {
        return Promise.resolve([
          {
            id: 'd-1',
            weekNumber: 1,
            topicId: 't1',
            subtopicId: 's1',
            questionCount: 2,
          },
          {
            id: 'd-2',
            weekNumber: 2,
            topicId: 't2',
            subtopicId: 's2',
            questionCount: 3,
          },
          {
            id: 'd-3',
            weekNumber: 3,
            topicId: 't3',
            subtopicId: 's3',
            questionCount: 4,
          },
        ]);
      }
      return Promise.resolve([]); // target syllabus starts empty
    });

    mockRepo.findGeneratedWeeks.mockResolvedValue([]);

    await useCase.cloneSyllabus('target-syl', 'source-syl');

    // Should delete existing target distributions (if any)
    // Should copy only weeks 1 and 2
    expect(mockRepo.bulkCreateDistributions).toHaveBeenCalledTimes(1);
    const bulkArgs = mockRepo.bulkCreateDistributions.mock.calls[0][0];
    expect(bulkArgs).toHaveLength(2);
    expect(bulkArgs[0]).toEqual(expect.objectContaining({ weekNumber: 1 }));
    expect(bulkArgs[1]).toEqual(expect.objectContaining({ weekNumber: 2 }));
  });

  it('should clone syllabus and map templateId across cycles by template name match', async () => {
    mockRepo.findById.mockImplementation((id) => {
      if (id === 'target-syl') {
        return Promise.resolve({ id: 'target-syl', cycleId: 'cycle-target' });
      }
      if (id === 'source-syl') {
        return Promise.resolve({
          id: 'source-syl',
          cycleId: 'cycle-source',
          templateId: 'src-temp-id',
        });
      }
      return Promise.resolve(null);
    });

    mockAcademicTime.getActiveWeekNumbers.mockResolvedValue([1, 2, 3]);

    mockAcademicTime.getTemplates.mockImplementation((cycleId) => {
      if (cycleId === 'cycle-source') {
        return Promise.resolve([{ id: 'src-temp-id', name: 'Examen Parcial' }]);
      }
      if (cycleId === 'cycle-target') {
        return Promise.resolve([
          { id: 'tgt-temp-id', name: ' examen parcial ' }, // name match (case and spaces check)
        ]);
      }
      return Promise.resolve([]);
    });

    mockRepo.getSummaryBySyllabus.mockImplementation((id) => {
      if (id === 'source-syl') {
        return Promise.resolve([
          {
            id: 'd-1',
            weekNumber: 1,
            topicId: 't1',
            subtopicId: 's1',
            questionCount: 2,
            templateId: 'src-temp-id',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    mockRepo.findGeneratedWeeks.mockResolvedValue([]);
    mockRepo.setTemplate.mockResolvedValue(undefined);

    await useCase.cloneSyllabus('target-syl', 'source-syl');

    // Should copy distribution with mapped templateId
    expect(mockRepo.bulkCreateDistributions).toHaveBeenCalledTimes(1);
    expect(mockRepo.bulkCreateDistributions).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          weekNumber: 1,
          templateId: 'tgt-temp-id',
        }),
      ]),
    );

    // Should also set syllabus-level templateId
    expect(mockRepo.setTemplate).toHaveBeenCalledWith(
      'target-syl',
      'tgt-temp-id',
    );
  });

  it('should throw BadRequestException if referenced template does not exist in target cycle', async () => {
    mockRepo.findById.mockImplementation((id) => {
      if (id === 'target-syl') {
        return Promise.resolve({ id: 'target-syl', cycleId: 'cycle-target' });
      }
      if (id === 'source-syl') {
        return Promise.resolve({
          id: 'source-syl',
          cycleId: 'cycle-source',
          templateId: 'src-temp-id',
        });
      }
      return Promise.resolve(null);
    });

    mockAcademicTime.getActiveWeekNumbers.mockResolvedValue([1, 2, 3]);

    mockAcademicTime.getTemplates.mockImplementation((cycleId) => {
      if (cycleId === 'cycle-source') {
        return Promise.resolve([{ id: 'src-temp-id', name: 'Examen Parcial' }]);
      }
      // Target templates has templates, but doesn't contain 'Examen Parcial'
      return Promise.resolve([{ id: 'tgt-temp-other', name: 'Examen Final' }]);
    });

    mockRepo.getSummaryBySyllabus.mockImplementation((id) => {
      if (id === 'source-syl') {
        return Promise.resolve([
          {
            id: 'd-1',
            weekNumber: 1,
            topicId: 't1',
            subtopicId: 's1',
            questionCount: 2,
            templateId: 'src-temp-id',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    await expect(
      useCase.cloneSyllabus('target-syl', 'source-syl'),
    ).rejects.toThrow(
      'No se puede realizar la clonación. Las siguientes plantillas de evaluación usadas en el origen no existen en el ciclo destino: [Examen Parcial]. Por favor, configúrelas en el ciclo destino antes de continuar.',
    );
  });

  it('should clone syllabus successfully if target cycle has no templates at all, setting mapped templates to null', async () => {
    mockRepo.findById.mockImplementation((id) => {
      if (id === 'target-syl') {
        return Promise.resolve({ id: 'target-syl', cycleId: 'cycle-target' });
      }
      if (id === 'source-syl') {
        return Promise.resolve({
          id: 'source-syl',
          cycleId: 'cycle-source',
          templateId: 'src-temp-id',
        });
      }
      return Promise.resolve(null);
    });

    mockAcademicTime.getActiveWeekNumbers.mockResolvedValue([1, 2, 3]);

    mockAcademicTime.getTemplates.mockImplementation((cycleId) => {
      if (cycleId === 'cycle-source') {
        return Promise.resolve([{ id: 'src-temp-id', name: 'Examen Parcial' }]);
      }
      // Target templates is empty list (no templates at all)
      return Promise.resolve([]);
    });

    mockRepo.getSummaryBySyllabus.mockImplementation((id) => {
      if (id === 'source-syl') {
        return Promise.resolve([
          {
            id: 'd-1',
            weekNumber: 1,
            topicId: 't1',
            subtopicId: 's1',
            questionCount: 2,
            templateId: 'src-temp-id',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    mockRepo.findGeneratedWeeks.mockResolvedValue([]);
    mockRepo.setTemplate.mockResolvedValue(undefined);

    await useCase.cloneSyllabus('target-syl', 'source-syl');

    // Distributions requiring templates are skipped if target has no templates
    expect(mockRepo.bulkCreateDistributions).toHaveBeenCalledTimes(0);

    // Should not call setTemplate because targetSyllabusTemplateId is null
    expect(mockRepo.setTemplate).not.toHaveBeenCalledWith(
      'target-syl',
      expect.any(String),
    );
  });
});
