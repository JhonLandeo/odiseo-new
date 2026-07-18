import { Injectable } from '@nestjs/common';
import { TenantService } from '../../../database/tenant.service';

@Injectable()
export class UsersService {
  // Users, roles and user_roles live in the per-tenant schema, so every query
  // must run inside the tenant transaction opened by TenantService, which sets
  // the search_path. The default EntityManager resolves unqualified table names
  // against the public schema instead, which is the wrong tenant's data (or no
  // data at all).
  constructor(private readonly tenantService: TenantService) {}

  async findAllUsersWithRoles() {
    return this.tenantService.runInTenant((manager) =>
      manager.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        COALESCE(
          json_agg(
            json_build_object('id', r.id, 'name', r.name)
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'
        ) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id, u.name, u.email
    `),
    );
  }
}
