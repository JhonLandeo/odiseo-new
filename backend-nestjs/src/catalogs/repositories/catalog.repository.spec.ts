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
