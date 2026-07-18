import { UsersService } from './users.service';

function createService() {
  const rows = [{ id: 'user-1', name: 'Ada', email: 'ada@example.com', roles: [] }];
  const manager = {
    query: jest.fn().mockResolvedValue(rows),
  };
  const tenantService = {
    runInTenant: jest.fn((op: (m: any) => Promise<any>) => op(manager)),
  };

  const service = new UsersService(tenantService as any);
  return { service, manager, tenantService, rows };
}

describe('UsersService', () => {
  it('runs the user listing inside the tenant transaction', async () => {
    const { service, tenantService, rows } = createService();

    const result = await service.findAllUsersWithRoles();

    expect(tenantService.runInTenant).toHaveBeenCalledTimes(1);
    expect(result).toBe(rows);
  });

  it('queries the tenant-scoped manager, never the default one', async () => {
    const { service, manager } = createService();

    await service.findAllUsersWithRoles();

    expect(manager.query).toHaveBeenCalledTimes(1);
    const sql = manager.query.mock.calls[0][0] as string;
    expect(sql).toContain('FROM users u');
    // The search_path set by runInTenant is what qualifies these tables; an
    // explicit "public." prefix would defeat the tenant isolation.
    expect(sql).not.toContain('public.');
  });

  it('propagates the missing-tenant failure instead of falling back to public', async () => {
    const tenantService = {
      runInTenant: jest.fn().mockRejectedValue(new Error('Tenant Schema no está definido en el contexto actual')),
    };
    const service = new UsersService(tenantService as any);

    await expect(service.findAllUsersWithRoles()).rejects.toThrow(
      'Tenant Schema',
    );
  });
});
