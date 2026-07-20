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

  it('invalidateCacheForTenants bumpea la versión de CADA tenant recibido', async () => {
    // Called by CatalogCronService after a successful sync: the sync itself
    // has no single tenant in scope, so it hands over every active schema.
    await useCase.invalidateCacheForTenants([
      'tenant_a',
      'tenant_b',
      'tenant_c',
    ]);

    expect(mockCacheManager.set).toHaveBeenCalledTimes(3);
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'catalogs:version:tenant_a',
      expect.any(Number),
      0,
    );
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'catalogs:version:tenant_b',
      expect.any(Number),
      0,
    );
    expect(mockCacheManager.set).toHaveBeenCalledWith(
      'catalogs:version:tenant_c',
      expect.any(Number),
      0,
    );
  });

  it('invalidateCacheForTenants no escribe nada para una lista vacía', async () => {
    await useCase.invalidateCacheForTenants([]);

    expect(mockCacheManager.set).not.toHaveBeenCalled();
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

  // The withTimeout adoption's whole point: a hung Redis must degrade, not
  // hang the request. AuthService/TenantsService already prove their own
  // call sites this way; this proves catalog.use-case.ts's newly-wrapped
  // calls genuinely degrade too, not just that withTimeout itself works.
  describe('when the cache hangs', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('getCourses degrades to the repository instead of hanging', async () => {
      mockCacheManager.get = jest.fn().mockReturnValue(new Promise(() => {}));

      const pending = useCase.getCourses();
      // getCourses races TWO sequential reads against the same hung mock
      // (the version read, then the content read) — each bound at 1000ms
      // and awaited one after the other, not in parallel.
      await jest.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(result.courses).toHaveLength(1);
      expect(mockCatalogRepository.getCourses).toHaveBeenCalled();
    });

    it('getCourseTopics degrades to the repository instead of hanging', async () => {
      mockCacheManager.get = jest.fn().mockReturnValue(new Promise(() => {}));

      const pending = useCase.getCourseTopics('course-1');
      // Same two-sequential-races shape as getCourses above (version read,
      // then content read), so 2000ms — not the sibling AuthService/
      // TenantsService tests' single-race 1000ms.
      await jest.advanceTimersByTimeAsync(2000);
      const result = await pending;

      expect(result).toHaveLength(2);
      expect(mockCatalogRepository.getCourseTopics).toHaveBeenCalled();
    });

    it('getCacheVersion (via getCourses) degrades to version 0 instead of hanging', async () => {
      // getCourses calls getCacheVersion first; a hung version read must not
      // block it, and must produce the same cache key an ordinary miss would
      // (version 0), not throw or wait forever. 2000ms because this still
      // goes through getCourses' own two sequential races (version, then
      // content) even though only the first is what this test cares about.
      mockCacheManager.get = jest.fn().mockReturnValue(new Promise(() => {}));

      const pending = useCase.getCourses();
      await jest.advanceTimersByTimeAsync(2000);
      await pending;

      expect(mockCacheManager.get).toHaveBeenCalledWith(
        'catalogs:version:tenant_test',
      );
      // The claim in the comment above, actually checked: the content read
      // and the eventual write both used version 0's cache key, not a
      // hung/undefined one.
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        'catalogs:0:courses:tenant_test:all',
      );
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        'catalogs:0:courses:tenant_test:all',
        expect.anything(),
      );
    });

    it('bumpCacheVersion (via updateTopicVisibility) does not throw when the write hangs', async () => {
      mockCacheManager.set = jest.fn().mockReturnValue(new Promise(() => {}));

      const pending = useCase.updateTopicVisibility('topic-1', true);
      await jest.advanceTimersByTimeAsync(1000);

      await expect(pending).resolves.toBeUndefined();
      expect(
        mockCatalogRepository.updateTopicLocalVisibility,
      ).toHaveBeenCalled();
    });
  });
});
