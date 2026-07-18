import { Test, TestingModule } from '@nestjs/testing';
import { CatalogUseCase } from './catalog.use-case';
import { ICatalogRepository } from './repositories/i-catalog.repository';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ClsService } from 'nestjs-cls';

describe('CatalogUseCase', () => {
  let useCase: CatalogUseCase;
  let mockCatalogRepository: any;
  let mockCacheManager: any;
  let mockClsService: any;

  beforeEach(async () => {
    mockCatalogRepository = {
      getCourses: jest.fn().mockResolvedValue([
        {
          id: 'course-1',
          name: 'Course 1',
          topics_count: '2',
        },
      ]),
      getCourseTopics: jest.fn().mockResolvedValue([
        {
          id: 'topic-1',
          name: 'Topic 1',
          isActive: true,
          subtopics: [],
        },
        {
          id: 'topic-2',
          name: 'Topic 2',
          isActive: false,
          subtopics: [],
        },
      ]),
      updateTopicLocalVisibility: jest.fn().mockResolvedValue(undefined),
      findCourseIdByTopicId: jest.fn().mockResolvedValue('course-1'),
    };

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    mockClsService = {
      get: jest.fn().mockReturnValue('tenant_test'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogUseCase,
        {
          provide: ICatalogRepository,
          useValue: mockCatalogRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    useCase = module.get<CatalogUseCase>(CatalogUseCase);
  });

  it('debería estar definido', () => {
    expect(useCase).toBeDefined();
  });

  it('debería retornar los cursos correctamente', async () => {
    const result = await useCase.getCourses();

    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].name).toBe('Course 1');
    expect(result.courses[0].topicsCount).toBe(2);
    expect(mockCatalogRepository.getCourses).toHaveBeenCalled();
  });

  it('debería retornar los temas del curso correctamente', async () => {
    const result = await useCase.getCourseTopics('course-1');

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Topic 1');
    expect(result[0].isActive).toBe(true);
    expect(mockCatalogRepository.getCourseTopics).toHaveBeenCalledWith(
      'course-1',
      undefined,
    );
  });

  it('debería aislar la actualización local en el repositorio e invalidar caché', async () => {
    await useCase.updateTopicVisibility('topic-1', false);

    expect(
      mockCatalogRepository.updateTopicLocalVisibility,
    ).toHaveBeenCalledWith('topic-1', false);
    expect(mockCatalogRepository.findCourseIdByTopicId).toHaveBeenCalledWith(
      'topic-1',
    );
    expect(mockCacheManager.del).toHaveBeenCalledWith(
      expect.stringContaining('catalogs:courses:tenant_test:all'),
    );
  });
});
