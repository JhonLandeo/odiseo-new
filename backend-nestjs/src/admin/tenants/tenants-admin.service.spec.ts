import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { TenantsAdminService } from './tenants-admin.service';
import { TENANT_PROVISIONING_JOB_OPTIONS } from './constants/tenant-provisioning-queue.constants';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createService(company: any = { id: TENANT_ID }) {
  const mockManager = { query: jest.fn() };
  const companyRepository = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn().mockResolvedValue(company),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn((entity: any) =>
      Promise.resolve({ id: TENANT_ID, ...entity }),
    ),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    manager: mockManager,
  };
  const tenantProvisioningQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };
  const tenantService = {
    runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
      op(mockManager),
    ),
  };
  const tenantsService = {
    invalidateSubdomainCache: jest.fn().mockResolvedValue(undefined),
  };
  const authService = {
    invalidateUserPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TenantsAdminService(
    companyRepository as any,
    tenantProvisioningQueue as any,
    tenantService as any,
    tenantsService as any,
    authService as any,
  );
  return {
    service,
    mockManager,
    companyRepository,
    tenantProvisioningQueue,
    tenantService,
    tenantsService,
    authService,
  };
}

/**
 * The method issues two statements: it looks the Super Administrators up first,
 * then updates the single one it found. `admins` seeds the lookup; `updated` is
 * the TypeORM Postgres shape for an UPDATE, `[rows, affectedCount]`.
 */
function mockQueries(
  mockManager: { query: jest.Mock },
  admins: Array<{ id: string }>,
  updated: [Array<{ id: string }>, number] = [[{ id: admins[0]?.id }], 1],
) {
  mockManager.query
    .mockResolvedValueOnce(admins)
    .mockResolvedValueOnce(updated);
}

describe('TenantsAdminService.resetAdminCredentials', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the tenant does not exist', async () => {
    const { service } = createService(null);
    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the tenant has no Super Administrator', async () => {
    const { service, mockManager } = createService();
    mockQueries(mockManager, []);

    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  // A2 — resetting overwrites an email and password irreversibly. With several
  // Super Administrators the previous versions picked one: first whichever the
  // planner returned, then the oldest. Both silently designate a victim the
  // operator never named. Refuse instead.
  describe('when the tenant holds more than one Super Administrator', () => {
    it('refuses with a ConflictException', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }, { id: 'user-2' }]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('names how many were found so the operator can act', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toThrow(/3 administradores principales/);
    });

    it('writes nothing', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }, { id: 'user-2' }]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockManager.query).toHaveBeenCalledTimes(1);
      expect(mockManager.query.mock.calls[0][0]).not.toMatch(/\bUPDATE\b/);
    });
  });

  describe('when the tenant holds exactly one Super Administrator', () => {
    it('targets that administrator by id', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

      const [sql, params] = mockManager.query.mock.calls[1];
      expect(sql).toMatch(/\bUPDATE\b/);
      expect(params).toContain('user-1');
    });

    // AC-016: the operator chose this password, so the administrator must
    // replace it before the account can do anything else.
    it('holds the account for a password change', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

      expect(mockManager.query.mock.calls[1][0]).toMatch(
        /force_password_reset\s*=\s*true/,
      );
    });

    it('reports success and returns the generated password', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      const result = await service.resetAdminCredentials(
        TENANT_ID,
        'new@test.com',
      );

      expect(result.success).toBe(true);
      expect(result.newEmail).toBe('new@test.com');
      expect(result.temporaryPassword).toEqual(expect.any(String));
    });

    it('omits the temporary password when the caller supplied one', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      const result = await service.resetAdminCredentials(
        TENANT_ID,
        'new@test.com',
        'CallerChosen1!',
      );

      expect(result.temporaryPassword).toBeUndefined();
    });

    // A1 — TypeORM's Postgres driver returns [rows, affectedCount] for UPDATE,
    // so the original `rows.length === 0` check always saw 2 and never fired,
    // reporting success for a write that touched nothing.
    it('does not report success when the update affected no rows', async () => {
      const { service, mockManager, authService } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }], [[], 0]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(authService.invalidateUserPermissions).not.toHaveBeenCalled();
    });

    // A driver returning anything but [rows, affectedCount] is a contract
    // change; misreading it as "0 rows" would report a completed reset as
    // "admin not found" (or worse, the inverse). Fail loudly instead.
    it('fails loudly on an unexpected UPDATE result shape', async () => {
      const { service, mockManager, authService } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: 'user-1' }])
        .mockResolvedValueOnce([{ id: 'user-1' }] as any);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toThrow(/Unexpected UPDATE result shape/);
      expect(authService.invalidateUserPermissions).not.toHaveBeenCalled();
    });

    // The reset raises force_password_reset and rotates the credentials, both
    // served from the cached auth state; the committed write must drop it.
    it('invalidates the cached auth state of the reset administrator', async () => {
      const { service, mockManager, authService } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

      expect(authService.invalidateUserPermissions).toHaveBeenCalledWith(
        TENANT_ID,
        'user-1',
      );
    });

    it('still reports success when the cache invalidation rejects', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service, mockManager, authService } = createService();
      authService.invalidateUserPermissions.mockRejectedValue(
        new Error('Redis down'),
      );
      mockQueries(mockManager, [{ id: 'user-1' }]);

      const result = await service.resetAdminCredentials(
        TENANT_ID,
        'new@test.com',
      );

      expect(result.success).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });
  });
});

// The subdomain-lookup cache serves TenantMiddleware, so any company mutation
// that changes what the middleware enforces (or serves) must drop the cached
// row instead of waiting out the TTL.
describe('TenantsAdminService company lookup cache invalidation', () => {
  afterEach(() => jest.clearAllMocks());

  it('invalidates the subdomain on a status change (suspension)', async () => {
    const { service, tenantsService } = createService({
      id: TENANT_ID,
      subdomain: 'colegio',
      status: 'ACTIVE',
    });

    await service.updateStatus(TENANT_ID, 'SUSPENDED');

    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('invalidates the subdomain on a reactivation', async () => {
    const { service, tenantsService } = createService({
      id: TENANT_ID,
      subdomain: 'colegio',
      status: 'SUSPENDED',
      isActive: true,
    });

    await service.updateStatus(TENANT_ID, 'ACTIVE');

    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('invalidates the subdomain when company data is updated', async () => {
    const { service, tenantsService } = createService({
      id: TENANT_ID,
      subdomain: 'colegio',
    });

    await service.update(TENANT_ID, { commercialName: 'Renamed' });

    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('does not invalidate when the tenant does not exist', async () => {
    const { service, tenantsService } = createService(null);

    await expect(service.updateStatus(TENANT_ID, 'SUSPENDED')).rejects.toThrow(
      NotFoundException,
    );
    expect(tenantsService.invalidateSubdomainCache).not.toHaveBeenCalled();
  });
});

// A tenant left with isActive: false is unresolvable by TenantMiddleware;
// PATCH status ACTIVE must either really reactivate or refuse — never 200
// while the tenant stays dead.
describe('TenantsAdminService.updateStatus reactivation guard', () => {
  afterEach(() => jest.clearAllMocks());

  const deactivated = () =>
    createService({
      id: TENANT_ID,
      subdomain: 'colegio',
      status: 'SUSPENDED',
      isActive: false,
    });

  it('reactivates a deactivated tenant whose schema exists AND is seeded', async () => {
    const { service, mockManager, tenantsService } = deactivated();
    mockManager.query.mockResolvedValue([{ 1: 1 }]);

    const saved = await service.updateStatus(TENANT_ID, 'ACTIVE');

    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.schemata'),
      [`tenant_${TENANT_ID}`],
    );
    // Existence alone is not proof of provisioning: the probe must also verify
    // the migration runner's marker (the initial migration commits atomically
    // with its `_tenant_migrations` row).
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.tables'),
      [`tenant_${TENANT_ID}`],
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining('_tenant_migrations'),
      ['0001_initial_tenant_schema'],
    );
    expect(saved.isActive).toBe(true);
    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('refuses to activate a tenant whose schema was never provisioned, but re-enqueues provisioning', async () => {
    const { service, mockManager, companyRepository, tenantProvisioningQueue } =
      deactivated();
    mockManager.query.mockResolvedValue([]);

    await expect(service.updateStatus(TENANT_ID, 'ACTIVE')).rejects.toThrow(
      ConflictException,
    );
    expect(companyRepository.save).not.toHaveBeenCalled();
    // Both idempotent (CREATE SCHEMA IF NOT EXISTS, migration tracking), so
    // re-running the same job from scratch is safe.
    expect(tenantProvisioningQueue.add).toHaveBeenCalledWith(
      'provision',
      { schemaName: `tenant_${TENANT_ID}`, companyId: TENANT_ID },
      TENANT_PROVISIONING_JOB_OPTIONS,
    );
  });

  it('tells the operator the requeue itself failed when the queue is unreachable', async () => {
    const { service, mockManager, tenantProvisioningQueue } = deactivated();
    mockManager.query.mockResolvedValue([]);
    tenantProvisioningQueue.add.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.updateStatus(TENANT_ID, 'ACTIVE'),
    ).rejects.toThrow(/el reencolado también falló/);
  });

  // Provisioning can crash right after CREATE SCHEMA: the schema exists but
  // holds no tables. Activating it would 500 every request of the tenant.
  it('refuses to activate a tenant whose schema exists but was never seeded', async () => {
    const { service, mockManager, companyRepository } = deactivated();
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.schemata')) return [{ 1: 1 }];
      if (sql.includes('information_schema.tables')) return []; // no marker table
      return [{ 1: 1 }];
    });

    await expect(service.updateStatus(TENANT_ID, 'ACTIVE')).rejects.toThrow(
      /aprovisionamiento quedó incompleto/,
    );
    expect(companyRepository.save).not.toHaveBeenCalled();
  });

  it('re-enqueues provisioning for a half-seeded schema so the runner resumes where it stopped', async () => {
    const { service, mockManager, tenantProvisioningQueue } = deactivated();
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.schemata')) return [{ 1: 1 }];
      if (sql.includes('information_schema.tables')) return []; // no marker table
      return [{ 1: 1 }];
    });

    await expect(
      service.updateStatus(TENANT_ID, 'ACTIVE'),
    ).rejects.toThrow(/aprovisionamiento quedó incompleto/);

    expect(tenantProvisioningQueue.add).toHaveBeenCalledWith(
      'provision',
      { schemaName: `tenant_${TENANT_ID}`, companyId: TENANT_ID },
      TENANT_PROVISIONING_JOB_OPTIONS,
    );
  });

  it('refuses to activate when the marker table exists but the initial migration never committed', async () => {
    const { service, mockManager, companyRepository } = deactivated();
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.schemata')) return [{ 1: 1 }];
      if (sql.includes('information_schema.tables')) return [{ 1: 1 }];
      // The `_tenant_migrations` id lookup finds nothing: the runner created
      // its marker table, then crashed before migration 0001 committed.
      return [];
    });

    await expect(
      service.updateStatus(TENANT_ID, 'ACTIVE'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(companyRepository.save).not.toHaveBeenCalled();
  });

  it('does not probe the schema when the tenant is already active', async () => {
    const { service, mockManager } = createService({
      id: TENANT_ID,
      subdomain: 'colegio',
      status: 'GRACE_PERIOD',
      isActive: true,
    });

    await service.updateStatus(TENANT_ID, 'ACTIVE');

    expect(mockManager.query).not.toHaveBeenCalled();
  });

  it('never touches isActive nor probes the schema on a suspension', async () => {
    const { service, mockManager, companyRepository } = deactivated();

    await service.updateStatus(TENANT_ID, 'SUSPENDED');

    expect(mockManager.query).not.toHaveBeenCalled();
    expect(companyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, status: 'SUSPENDED' }),
    );
  });
});

describe('TenantsAdminService.findAll', () => {
  afterEach(() => jest.clearAllMocks());

  // `total` is the fixture's full tenant-table count, independent of how many
  // rows `findAndCount` actually hands back for the page (mirrors Postgres:
  // COUNT(*) OVER() ignores LIMIT/OFFSET). Callers pass however many `ids`
  // they want as the page; `total` defaults to that same length unless a test
  // needs to simulate a bigger table behind a smaller page.
  function withCompanies(
    ids: string[],
    queryImpl: (sql: string) => Promise<any>,
    total = ids.length,
  ) {
    const created = createService();
    created.companyRepository.findAndCount.mockResolvedValue([
      ids.map((id) => ({ id, subdomain: `sub-${id}` })),
      total,
    ]);
    created.mockManager.query.mockImplementation(queryImpl);
    return created;
  }

  it('flags tenants with an active Super Administrator', async () => {
    const { service } = withCompanies([TENANT_ID], async () => [{ 1: 1 }]);

    const result = await service.findAll();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].hasActiveSuperadmin).toBe(true);
  });

  // The schema name is interpolated into SQL, and identifiers cannot be
  // parameterized: the allowlist is the only barrier. A company id that fails
  // it is corrupt or hostile data — the request must die BEFORE any SQL is
  // built, not degrade into a skipped tenant.
  it('rejects a hostile schema string without issuing any tenant query', async () => {
    const hostile = '00000000"; DROP SCHEMA public CASCADE; --';
    const { service, mockManager } = withCompanies([hostile], async () => []);

    await expect(service.findAll()).rejects.toThrow(
      /Invalid tenant schema identifier/,
    );
    expect(mockManager.query).not.toHaveBeenCalled();
  });

  it('skips a tenant whose schema query fails and still returns the rest', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = withCompanies(
      ['ok-1', 'broken', 'ok-2'],
      async (sql) => {
        if (sql.includes('tenant_broken')) {
          throw new Error('schema "tenant_broken" does not exist');
        }
        return [{ 1: 1 }];
      },
    );

    const result = await service.findAll();

    expect(result.data).toHaveLength(3);
    expect(result.data.map((r: any) => r.hasActiveSuperadmin)).toEqual([
      true,
      false,
      true,
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('tenant_broken not available'),
    );
    warn.mockRestore();
  });

  it('bounds the number of schemas queried concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const { service } = withCompanies(ids, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return [];
    });

    await service.findAll();

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  // Server-side pagination: the O(N) fix. Without a page/pageSize argument
  // the call must still be bounded (page 1, the default page size) rather
  // than falling back to loading the whole table.
  it('defaults to page 1 and the default page size when called with no arguments', async () => {
    const { service, companyRepository } = withCompanies(
      [TENANT_ID],
      async () => [],
    );

    const result = await service.findAll();

    expect(companyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it('honors an explicit page and pageSize via skip/take', async () => {
    const { service, companyRepository } = withCompanies(
      [TENANT_ID],
      async () => [],
    );

    const result = await service.findAll(3, 10);

    // page 3 at pageSize 10 skips the first two full pages (20 rows).
    expect(companyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(10);
  });

  it('reports the full table count as total, not just the page length', async () => {
    const ids = ['c1', 'c2'];
    const { service } = withCompanies(ids, async () => [], 47);

    const result = await service.findAll(1, 2);

    expect(result.data).toHaveLength(2);
    expect(result.total).toBe(47);
  });

  it('clamps pageSize to the hard cap when the caller asks for more', async () => {
    const { service, companyRepository } = withCompanies(
      [TENANT_ID],
      async () => [],
    );

    const result = await service.findAll(1, 10_000);

    expect(companyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
    expect(result.pageSize).toBe(100);
  });

  // This is what actually kills the O(N) latency the audit flagged: with a
  // tenant table far larger than one page, the per-tenant Super Admin probe
  // fan-out must only run over the page TypeORM returned, never the whole
  // table's `total` count.
  it('probes the schema fan-out only for the returned page, not every tenant in the table', async () => {
    const pageIds = ['c1', 'c2', 'c3'];
    const { service, mockManager } = withCompanies(
      pageIds,
      async () => [],
      500, // total tenants in the table, far larger than the page
    );

    await service.findAll(1, 3);

    expect(mockManager.query).toHaveBeenCalledTimes(pageIds.length);
  });

  // Postgres gives no ordering guarantee without ORDER BY: an unordered
  // skip/take can hand the same tenant back on two pages, or none, as rows
  // move. createdAt alone can tie (bulk-seeded companies), so id must be the
  // tiebreaker for the sort to be fully deterministic across page requests.
  it('orders by createdAt then id so paging is stable across requests', async () => {
    const { service, companyRepository } = withCompanies(
      [TENANT_ID],
      async () => [],
    );

    await service.findAll();

    expect(companyRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ order: { createdAt: 'ASC', id: 'ASC' } }),
    );
  });
});

describe('TenantsAdminService.findAllLite', () => {
  afterEach(() => jest.clearAllMocks());

  // UI selectors (the dashboard's tenant filter) need every active tenant,
  // not a page, and have no use for the per-tenant schema probe — this must
  // skip both the pagination cap and the fan-out that finding it requires.
  it('returns every active tenant with no pagination and no schema fan-out', async () => {
    const { service, companyRepository, mockManager } = createService();
    companyRepository.find.mockResolvedValue([
      { id: 'c1', commercialName: 'Colegio Uno' },
      { id: 'c2', commercialName: 'Colegio Dos' },
    ]);

    const result = await service.findAllLite();

    expect(companyRepository.find).toHaveBeenCalledWith({
      select: ['id', 'commercialName'],
      where: { isActive: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    expect(result).toHaveLength(2);
    expect(mockManager.query).not.toHaveBeenCalled();
  });
});

describe('TenantsAdminService.create', () => {
  afterEach(() => jest.clearAllMocks());

  const input = {
    name: 'Colegio',
    subdomain: 'colegio',
    subscription_plan_id: 'plan-1',
  };

  function uniqueViolation(): Error {
    const error = new Error(
      'duplicate key value violates unique constraint',
    ) as Error & { code?: string };
    error.code = '23505';
    return error;
  }

  it('rejects a duplicate subdomain upfront with a 409', async () => {
    const { service, companyRepository } = createService({
      id: 'existing',
      subdomain: 'colegio',
    });

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(companyRepository.save).not.toHaveBeenCalled();
  });

  // The upfront findOne cannot see a concurrent insert: two simultaneous
  // creates both pass it, and the loser hits the UNIQUE constraint. That race
  // must surface as the same 409, not a raw 23505 turned 500.
  it('maps a unique-violation race on save to the same 409', async () => {
    const { service, companyRepository } = createService(null);
    companyRepository.save.mockRejectedValue(uniqueViolation());

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps a wrapped driver unique violation (QueryFailedError shape) too', async () => {
    const { service, companyRepository } = createService(null);
    const wrapped = new Error('query failed') as Error & {
      driverError?: { code: string };
    };
    wrapped.driverError = { code: '23505' };
    companyRepository.save.mockRejectedValue(wrapped);

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows non-unique-violation save failures untouched', async () => {
    const { service, companyRepository } = createService(null);
    companyRepository.save.mockRejectedValue(new Error('connection reset'));

    await expect(service.create(input)).rejects.toThrow('connection reset');
  });

  // The company row already committed by the time queue.add() runs; a
  // failure to enqueue (Redis unreachable) must not leave it silently
  // stranded ACTIVE-on-paper/isActive:false with no job and no signal.
  it('suspends the company and rethrows when enqueueing provisioning fails', async () => {
    const { service, companyRepository, tenantProvisioningQueue } =
      createService(null);
    tenantProvisioningQueue.add.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.create(input)).rejects.toThrow('ECONNREFUSED');

    expect(companyRepository.update).toHaveBeenCalledWith(TENANT_ID, {
      isActive: false,
      status: 'SUSPENDED',
    });
  });

  // Provisioning is asynchronous and findBySubdomain (TenantMiddleware)
  // filters on isActive: an active row here would route requests to a schema
  // that does not exist yet. TenantProvisioningProcessor owns activation.
  it('creates the company non-serviceable until provisioning completes', async () => {
    const { service, companyRepository } = createService(null);

    await service.create(input);

    expect(companyRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, status: 'ACTIVE' }),
    );
  });

  it('durably enqueues the provisioning job for the saved company schema', async () => {
    const { service, tenantProvisioningQueue } = createService(null);

    const saved = await service.create(input);

    expect(saved.id).toBe(TENANT_ID);
    expect(tenantProvisioningQueue.add).toHaveBeenCalledWith(
      'provision',
      { schemaName: `tenant_${TENANT_ID}`, companyId: TENANT_ID },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('does not enqueue a provisioning job when the insert fails', async () => {
    const { service, companyRepository, tenantProvisioningQueue } =
      createService(null);
    companyRepository.save.mockRejectedValue(uniqueViolation());

    await expect(service.create(input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tenantProvisioningQueue.add).not.toHaveBeenCalled();
  });
});
