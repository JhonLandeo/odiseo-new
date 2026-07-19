import { CatalogRepositoryImpl } from './catalog.repository';
import { Course } from '../entities/course.entity';
import { Topic } from '../entities/topic.entity';
import { Subtopic } from '../entities/subtopic.entity';
import { InvalidCatalogPayloadError } from '../dto/catalog-payload.dto';

describe('CatalogRepositoryImpl.upsertCatalogs', () => {
  /**
   * Default-connection manager stub. `transaction` runs the callback against a
   * tx manager sharing the same `upsert` spy, so assertions stay unchanged
   * while still proving the writes go through a transaction.
   */
  const makeManager = () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const transaction = jest.fn(async (cb: any) => cb({ upsert }));
    return { upsert, transaction, manager: { upsert, transaction } as any };
  };

  it('upserts via the default manager and NEVER uses runInTenant (cron has no tenant context)', async () => {
    const { upsert, manager } = makeManager();
    // If upsertCatalogs still routed through runInTenant, this stub — which
    // mimics the real "no tenant in CLS" failure — would throw.
    const tenantService = {
      runInTenant: jest.fn(() => {
        throw new Error('Tenant Schema no está definido en el contexto actual');
      }),
    } as any;

    const repo = new CatalogRepositoryImpl(tenantService, manager);

    await repo.upsertCatalogs({
      courses: [
        {
          id: '1',
          name: 'Course 1',
          topics: [
            {
              id: '10',
              name: 'Topic 1',
              subtopics: [{ id: '100', name: 'Sub 1' }],
            },
          ],
        },
      ],
    });

    expect(tenantService.runInTenant).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(
      Course,
      [{ id: '1', name: 'Course 1' }],
      ['id'],
    );
    expect(upsert).toHaveBeenCalledWith(
      Topic,
      [{ id: '10', courseId: '1', name: 'Topic 1' }],
      ['id'],
    );
    expect(upsert).toHaveBeenCalledWith(
      Subtopic,
      [{ id: '100', topicId: '10', name: 'Sub 1' }],
      ['id'],
    );
  });

  it('writes all three levels inside a SINGLE transaction', async () => {
    const { transaction, manager } = makeManager();
    const repo = new CatalogRepositoryImpl({} as any, manager);

    await repo.upsertCatalogs({
      courses: [
        {
          id: '1',
          name: 'Course 1',
          topics: [{ id: '10', name: 'Topic 1', subtopics: [] }],
        },
      ],
    });

    // One transaction, not three independent commits: a topic failure must not
    // leave orphaned courses in the shared catalog.
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when the payload has an empty course list', async () => {
    const { upsert, manager } = makeManager();
    const repo = new CatalogRepositoryImpl({} as any, manager);

    await repo.upsertCatalogs({ courses: [] });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('REJECTS a malformed payload instead of writing partial garbage', async () => {
    const { upsert, manager } = makeManager();
    const repo = new CatalogRepositoryImpl({} as any, manager);

    // The public schema is read by every tenant, so an unrecognised shape has
    // to fail loudly (and be recorded as a failed sync) rather than be
    // half-applied or silently skipped.
    await expect(repo.upsertCatalogs(null)).rejects.toThrow(
      InvalidCatalogPayloadError,
    );
    await expect(repo.upsertCatalogs({})).rejects.toThrow(
      InvalidCatalogPayloadError,
    );
    await expect(
      repo.upsertCatalogs({ courses: [{ id: '1' }] }),
    ).rejects.toThrow(InvalidCatalogPayloadError);
    await expect(
      repo.upsertCatalogs({
        courses: [{ id: '1', name: 'C', topics: 'nope' }],
      }),
    ).rejects.toThrow(InvalidCatalogPayloadError);

    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('CatalogRepositoryImpl.courseExists', () => {
  const buildRepo = (rows: unknown[]) => {
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    const tenantService = {
      runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as any;
    return {
      repo: new CatalogRepositoryImpl(tenantService, {} as any),
      manager,
    };
  };

  it('returns true when the course exists in the shared catalog', async () => {
    const { repo, manager } = buildRepo([{ '?column?': 1 }]);
    await expect(repo.courseExists('123')).resolves.toBe(true);
    expect(manager.query).toHaveBeenCalledWith(
      `SELECT 1 FROM public.courses WHERE id = $1`,
      ['123'],
    );
  });

  it('returns false for a nonexistent course id', async () => {
    const { repo } = buildRepo([]);
    await expect(repo.courseExists('missing')).resolves.toBe(false);
  });
});

describe('CatalogRepositoryImpl.getCourses', () => {
  const buildRepo = (rows: unknown[] = []) => {
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    const tenantService = {
      runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as any;
    return {
      repo: new CatalogRepositoryImpl(tenantService, {} as any),
      manager,
    };
  };

  it('escapes literal % and _ in the search term instead of treating them as wildcards', async () => {
    const { repo, manager } = buildRepo([]);

    await repo.getCourses('50%_off');

    const [query, params] = manager.query.mock.calls[0];
    // A course literally named "50%" must match literally, not degrade into
    // a match-everything wildcard.
    expect(query).toContain("ILIKE $1 ESCAPE '\\'");
    expect(params[0]).toBe('%50\\%\\_off%');
  });

  it('doubles a literal backslash first, so it cannot swallow the escape it introduces', async () => {
    const { repo, manager } = buildRepo([]);

    await repo.getCourses('a\\b');

    const [, params] = manager.query.mock.calls[0];
    expect(params[0]).toBe('%a\\\\b%');
  });

  it('caps the result with a LIMIT even with no search term', async () => {
    const { repo, manager } = buildRepo([]);

    await repo.getCourses();

    const [query, params] = manager.query.mock.calls[0];
    expect(query).toContain('LIMIT $1');
    expect(params).toEqual([500]);
  });

  it('appends the LIMIT parameter after the search parameter', async () => {
    const { repo, manager } = buildRepo([]);

    await repo.getCourses('algebra');

    const [query, params] = manager.query.mock.calls[0];
    expect(query).toContain('LIMIT $2');
    expect(params).toEqual(['%algebra%', 500]);
  });
});

describe('CatalogRepositoryImpl.getCourseTopics search escaping', () => {
  const buildRepo = (rows: unknown[] = []) => {
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    const tenantService = {
      runInTenant: jest.fn((cb: (m: unknown) => unknown) => cb(manager)),
    } as any;
    return {
      repo: new CatalogRepositoryImpl(tenantService, {} as any),
      manager,
    };
  };

  it('escapes literal % and _ before wrapping the topic/subtopic search term', async () => {
    const { repo, manager } = buildRepo([]);

    await repo.getCourseTopics('course-1', '100%_match');

    const [query, params] = manager.query.mock.calls[0];
    expect(query).toContain("ILIKE $2 ESCAPE '\\'");
    expect(params).toEqual(['course-1', '%100\\%\\_match%']);
  });
});
