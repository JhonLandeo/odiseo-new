import { TenantMigrationService } from './tenant-migration.service';
import { TENANT_MIGRATIONS } from './tenant-migrations';

describe('TenantMigrationService', () => {
  let service: TenantMigrationService;
  let mockQueryRunner: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    mockDataSource = {
      createQueryRunner: jest.fn(() => mockQueryRunner),
    };
    service = new TenantMigrationService(mockDataSource);
  });

  it('rejects an invalid schema before touching the database', async () => {
    await expect(service.runMigrations('bad; DROP')).rejects.toThrow(
      /Invalid tenant schema identifier/,
    );
    expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('applies every pending migration on a fresh schema and records it', async () => {
    // ensure-table, then SELECT returns no applied rows
    mockQueryRunner.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM')) return Promise.resolve([]);
      return Promise.resolve(undefined);
    });

    await service.runMigrations('tenant_fresh');

    expect(mockQueryRunner.startTransaction).toHaveBeenCalledTimes(
      TENANT_MIGRATIONS.length,
    );
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(
      TENANT_MIGRATIONS.length,
    );
    // Each migration must be recorded in _tenant_migrations
    const insertCalls = mockQueryRunner.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('INSERT INTO'),
    );
    expect(insertCalls).toHaveLength(TENANT_MIGRATIONS.length);
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('skips migrations already recorded for the schema', async () => {
    mockQueryRunner.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM')) {
        return Promise.resolve(TENANT_MIGRATIONS.map((m) => ({ id: m.id })));
      }
      return Promise.resolve(undefined);
    });

    await service.runMigrations('tenant_existing');

    expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });

  it('rolls back and rethrows when a migration statement fails', async () => {
    mockQueryRunner.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM')) return Promise.resolve([]);
      if (sql.includes('CREATE TABLE IF NOT EXISTS') && sql.includes('users')) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve(undefined);
    });

    await expect(service.runMigrations('tenant_broken')).rejects.toThrow(
      'boom',
    );
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockQueryRunner.release).toHaveBeenCalled();
  });
});
