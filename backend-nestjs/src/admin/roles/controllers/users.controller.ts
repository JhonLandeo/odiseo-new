import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { PermissionsGuard, RequirePermissions } from '../../../common/guards/permissions.guard';
import { PERMISSIONS } from '../constants/permissions.constant';

@Controller('v1/admin/users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MANAGE_USERS)
  async findAll() {
    // We are running in the Tenant-scoped EntityManager provided by TenantMiddleware
    const users = await this.entityManager.query(`
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
    `);

    return users;
  }
}
