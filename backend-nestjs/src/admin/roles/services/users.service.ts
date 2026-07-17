import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

@Injectable()
export class UsersService {
  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async findAllUsersWithRoles() {
    // We are running in the Tenant-scoped EntityManager provided by TenantMiddleware
    return await this.entityManager.query(`
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
  }
}
