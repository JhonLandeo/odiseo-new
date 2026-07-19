import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
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
      getSyncState: jest.fn().mockResolvedValue({
        source: 'core-api',
        lastAttemptAt: new Date('2026-01-01T10:00:00.000Z'),
        lastSuccessAt: new Date('2026-01-01T10:00:00.000Z'),
        lastOutcome: 'SUCCESS',
        lastError: null,
        updatedAt: new Date('2026-01-01T10:00:00.000Z'),
      }),
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

  it('debería exponer lastSyncedAt desde la tabla durable de estado de sync', async () => {
    const result = await useCase.getCourses();

    // Read from the sync-state table, not from a cache entry that expires long
    // before the hourly sync refreshes it.
    expect(mockCatalogRepository.getSyncState).toHaveBeenCalled();
    expect(result.lastSyncedAt).toBe('2026-01-01T10:00:00.000Z');
    expect(result.syncStatus.lastOutcome).toBe('SUCCESS');
  });

  it('reporta lastSyncedAt null cuando nunca hubo un sync exitoso', async () => {
    mockCatalogRepository.getSyncState.mockResolvedValue({
      source: 'core-api',
      lastAttemptAt: new Date('2026-01-01T11:00:00.000Z'),
      lastSuccessAt: null,
      lastOutcome: 'FAILED',
      lastError: 'boom',
      updatedAt: new Date('2026-01-01T11:00:00.000Z'),
    });

    const result = await useCase.getCourses();

    expect(result.lastSyncedAt).toBeNull();
    // The failure is surfaced rather than hidden behind a blank timestamp.
    expect(result.syncStatus.lastOutcome).toBe('FAILED');
    expect(result.syncStatus.lastError).toBe('boom');
  });

  it('debería aislar la actualización local en el repositorio e invalidar caché', async () => {
    await useCase.updateTopicVisibility('topic-1', false);

    // The topic must be looked up before writing so a bad id fails as a 404.
    expect(mockCatalogRepository.findCourseIdByTopicId).toHaveBeenCalledWith(
      'topic-1',
    );
    expect(
      mockCatalogRepository.updateTopicLocalVisibility,
    ).toHaveBeenCalledWith('topic-1', false);
    // Invalidation bumps the tenant's cache-namespace version, which retires
    // every cached variant at once instead of only the ':all' keys.
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'catalogs:version:tenant_test',
      expect.any(Number),
      0,
    );
  });

  it('invalida TODAS las variantes de búsqueda, no solo ":all"', async () => {
    // Regression guard: search-scoped entries used to survive a visibility
    // toggle for the full TTL, so a user toggled, searched, and saw stale counts.
    let version = 0;
    mockCacheManager.get.mockImplementation(async (key: string) =>
      key === 'catalogs:version:tenant_test' ? version : null,
    );
    mockCacheManager.set.mockImplementation(async (key: string, value: any) => {
      if (key === 'catalogs:version:tenant_test') version = value;
    });

    await useCase.getCourses('algebra');
    const keyBefore = mockCacheManager.set.mock.calls.find((c: any[]) =>
      c[0].includes(':courses:'),
    )[0];
    expect(keyBefore).toContain('algebra');

    await useCase.updateTopicVisibility('topic-1', false);

    mockCacheManager.set.mockClear();
    await useCase.getCourses('algebra');
    const keyAfter = mockCacheManager.set.mock.calls.find((c: any[]) =>
      c[0].includes(':courses:'),
    )[0];

    // Same search term, different namespace => the old entry is unreachable.
    expect(keyAfter).not.toBe(keyBefore);
  });

  it('lanza NotFound y no escribe ni invalida caché cuando el topic no existe', async () => {
    mockCatalogRepository.findCourseIdByTopicId.mockResolvedValue(null);

    await expect(
      useCase.updateTopicVisibility('missing-topic', true),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      mockCatalogRepository.updateTopicLocalVisibility,
    ).not.toHaveBeenCalled();
    // No cache-version bump for a rejected write.
    expect(mockCacheManager.set).not.toHaveBeenCalledWith(
      'catalogs:version:tenant_test',
      expect.any(Number),
      0,
    );
  });
});
