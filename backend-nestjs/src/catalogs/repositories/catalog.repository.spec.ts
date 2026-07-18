import { CatalogRepositoryImpl } from './catalog.repository';
import { Course } from '../entities/course.entity';
import { Topic } from '../entities/topic.entity';
import { Subtopic } from '../entities/subtopic.entity';

describe('CatalogRepositoryImpl.upsertCatalogs', () => {
  it('upserts via the default manager and NEVER uses runInTenant (cron has no tenant context)', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const mockManager = { upsert } as any;
    // If upsertCatalogs still routed through runInTenant, this stub — which
    // mimics the real "no tenant in CLS" failure — would throw.
    const tenantService = {
      runInTenant: jest.fn(() => {
        throw new Error('Tenant Schema no está definido en el contexto actual');
      }),
    } as any;

    const repo = new CatalogRepositoryImpl(tenantService, mockManager);

    await repo.upsertCatalogs({
      courses: [
        {
          id: '1',
          name: 'Course 1',
          topics: [
            { id: '10', name: 'Topic 1', subtopics: [{ id: '100', name: 'Sub 1' }] },
          ],
        },
      ],
    });

    expect(tenantService.runInTenant).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(Course, [{ id: '1', name: 'Course 1' }], ['id']);
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

  it('is a no-op when the payload has no courses', async () => {
    const upsert = jest.fn();
    const repo = new CatalogRepositoryImpl({} as any, { upsert } as any);

    await repo.upsertCatalogs({ courses: [] });
    await repo.upsertCatalogs(null);

    expect(upsert).not.toHaveBeenCalled();
  });
});
