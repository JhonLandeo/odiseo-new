import { TenantService } from './tenant.service';

describe('TenantService', () => {
  let service: TenantService;
  let mockDataSource: any;
  let mockCls: any;
  let store: Record<string, any>;

  const makeManager = () => ({ query: jest.fn().mockResolvedValue(undefined) });

  beforeEach(() => {
    store = {};
    mockCls = {
      get: jest.fn((key?: string) => (key === undefined ? store : store[key])),
      runWith: jest.fn((newStore: any, cb: () => any) => cb()),
    };
    mockDataSource = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const manager = makeManager();
        return cb(manager);
      }),
    };
    service = new TenantService(mockDataSource, mockCls);
  });

  describe('runInSchema — schema validation (SQLi guard)', () => {
    it('rejects a schema identifier with injection characters and never opens a transaction', async () => {
      await expect(
        service.runInSchema('public"; DROP TABLE users; --', async () => 'ok'),
      ).rejects.toThrow(/Invalid tenant schema identifier/);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('accepts a valid tenant schema and sets the search_path to it', async () => {
      let seenSearchPath: string | undefined;
      mockDataSource.transaction.mockImplementation(
        async (cb: (m: any) => Promise<any>) => {
          const manager = {
            query: jest.fn((sql: string) => {
              seenSearchPath = sql;
              return Promise.resolve();
            }),
          };
          return cb(manager);
        },
      );

      const result = await service.runInSchema(
        'tenant_abc123',
        async () => 'done',
      );

      expect(result).toBe('done');
      expect(seenSearchPath).toContain('"tenant_abc123"');
    });
  });

  describe('runInSchema — ambient transaction reuse', () => {
    it('reuses the ambient manager only when it belongs to the same schema', async () => {
      const ambient = makeManager();
      store.tx_manager = ambient;
      store.tx_schema = 'tenant_same';

      const received = await service.runInSchema(
        'tenant_same',
        async (m) => m,
      );

      expect(received).toBe(ambient);
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('does NOT reuse the ambient manager when the requested schema differs (cross-tenant guard)', async () => {
      const ambient = makeManager();
      store.tx_manager = ambient;
      store.tx_schema = 'tenant_A';

      const received = await service.runInSchema(
        'tenant_B',
        async (m) => m,
      );

      // A brand-new transaction/manager must be opened for tenant_B,
      // never the ambient manager still bound to tenant_A.
      expect(received).not.toBe(ambient);
      expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('runInTenant', () => {
    it('throws when no tenant schema is present in the context', async () => {
      await expect(service.runInTenant(async () => 'x')).rejects.toThrow(
        /Tenant Schema no está definido/,
      );
    });

    it('delegates to the schema resolved from the CLS context', async () => {
      store.tenantSchema = 'tenant_ctx';
      let seenSearchPath: string | undefined;
      mockDataSource.transaction.mockImplementation(
        async (cb: (m: any) => Promise<any>) => {
          const manager = {
            query: jest.fn((sql: string) => {
              seenSearchPath = sql;
              return Promise.resolve();
            }),
          };
          return cb(manager);
        },
      );

      await service.runInTenant(async () => 'ok');

      expect(seenSearchPath).toContain('"tenant_ctx"');
    });
  });
});
