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

  describe('runMigrationsForAllTenants', () => {
    /**
     * Wires up the default-connection `query` used by the fan-out:
     *  - `SELECT id FROM public.companies` returns the provided companies
     *  - `information_schema.schemata` returns a row when the schema is in
     *    `existingSchemas` (i.e. the schema exists), empty otherwise
     * Everything else (advisory lock/unlock) resolves to a harmless value.
     */
    function wireDataSource(
      companies: Array<{ id: string }>,
      existingSchemas: Set<string>,
    ) {
      mockDataSource.query = jest.fn((sql: string, params?: any[]) => {
        if (sql.includes('FROM public.companies')) {
          return Promise.resolve(companies);
        }
        if (sql.includes('information_schema.schemata')) {
          const schema = params?.[0];
          return Promise.resolve(existingSchemas.has(schema) ? [{ '?column?': 1 }] : []);
        }
        return Promise.resolve([]);
      });
    }

    it('fans out to every tenant and reports the counts', async () => {
      const companies = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      wireDataSource(
        companies,
        new Set(['tenant_a', 'tenant_b', 'tenant_c']),
      );
      const runSpy = jest
        .spyOn(service, 'runMigrations')
        .mockResolvedValue(undefined);

      const summary = await service.runMigrationsForAllTenants();

      expect(runSpy).toHaveBeenCalledTimes(3);
      expect(runSpy).toHaveBeenCalledWith('tenant_a');
      expect(runSpy).toHaveBeenCalledWith('tenant_b');
      expect(runSpy).toHaveBeenCalledWith('tenant_c');
      expect(summary).toEqual({
        total: 3,
        migrated: 3,
        skipped: 0,
        failed: 0,
        failures: [],
      });
    });

    it('skips a tenant whose schema does not exist instead of failing it', async () => {
      wireDataSource(
        [{ id: 'a' }, { id: 'ghost' }, { id: 'c' }],
        // 'tenant_ghost' is absent: its provisioning never created the schema.
        new Set(['tenant_a', 'tenant_c']),
      );
      const runSpy = jest
        .spyOn(service, 'runMigrations')
        .mockResolvedValue(undefined);

      const summary = await service.runMigrationsForAllTenants();

      expect(runSpy).toHaveBeenCalledTimes(2);
      expect(runSpy).not.toHaveBeenCalledWith('tenant_ghost');
      expect(summary.migrated).toBe(2);
      expect(summary.skipped).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it('does not abort the run when one tenant fails, and counts it', async () => {
      wireDataSource(
        [{ id: 'a' }, { id: 'boom' }, { id: 'c' }],
        new Set(['tenant_a', 'tenant_boom', 'tenant_c']),
      );
      const runSpy = jest
        .spyOn(service, 'runMigrations')
        .mockImplementation((schema: string) => {
          if (schema === 'tenant_boom') {
            return Promise.reject(new Error('ddl blew up'));
          }
          return Promise.resolve(undefined);
        });

      const summary = await service.runMigrationsForAllTenants();

      // The failing tenant did not stop the others from migrating.
      expect(runSpy).toHaveBeenCalledTimes(3);
      expect(summary.migrated).toBe(2);
      expect(summary.failed).toBe(1);
      expect(summary.skipped).toBe(0);
      expect(summary.failures).toEqual([
        { schemaName: 'tenant_boom', error: 'ddl blew up' },
      ]);
    });

    it('is a clean no-op when there are no tenants', async () => {
      wireDataSource([], new Set());
      const runSpy = jest
        .spyOn(service, 'runMigrations')
        .mockResolvedValue(undefined);

      const summary = await service.runMigrationsForAllTenants();

      expect(runSpy).not.toHaveBeenCalled();
      expect(summary).toEqual({
        total: 0,
        migrated: 0,
        skipped: 0,
        failed: 0,
        failures: [],
      });
    });

    it('acquires and releases a per-schema advisory lock around each migration', async () => {
      wireDataSource([{ id: 'a' }], new Set(['tenant_a']));
      jest.spyOn(service, 'runMigrations').mockResolvedValue(undefined);

      await service.runMigrationsForAllTenants();

      const lockCalls = mockQueryRunner.query.mock.calls.filter(
        (c: any[]) =>
          typeof c[0] === 'string' && c[0].includes('pg_advisory_lock'),
      );
      const unlockCalls = mockQueryRunner.query.mock.calls.filter(
        (c: any[]) =>
          typeof c[0] === 'string' && c[0].includes('pg_advisory_unlock'),
      );
      expect(lockCalls).toHaveLength(1);
      expect(unlockCalls).toHaveLength(1);
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
