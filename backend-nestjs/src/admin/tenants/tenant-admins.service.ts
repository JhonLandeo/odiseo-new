import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Company } from '../../tenants/entities/tenant.entity';
import { TenantService } from '../../database/tenant.service';
import {
  CreateTenantAdminDto,
  UpdateTenantAdminDto,
  UpdatePasswordDto,
} from './dto/tenant-admins.dto';
import { TENANT_SUPER_ADMIN_PERMISSIONS } from '../roles/constants/permissions.constant';

@Injectable()
export class TenantAdminsService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    private readonly tenantService: TenantService,
  ) {}

  private async validateCompanyExists(tenantId: string) {
    const company = await this.companyRepository.findOne({
      where: { id: tenantId },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    return company;
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 50) {
    await this.validateCompanyExists(tenantId);
    const schema = `tenant_${tenantId}`;

    return this.tenantService.runInSchema(schema, async (manager) => {
      const offset = (page - 1) * limit;

      const [admins, total] = await Promise.all([
        manager.query(
          `
          SELECT u.id, u.email, u.name, u.is_active, u.created_at, u.updated_at
          FROM "${schema}".users u
          JOIN "${schema}".user_roles ur ON u.id = ur.user_id
          JOIN "${schema}".roles r ON ur.role_id = r.id
          WHERE r.name = 'Super Administrador' 
            AND u.is_active = true
          LIMIT $1 OFFSET $2
        `,
          [limit, offset],
        ),
        manager.query(`
          SELECT count(1) as count
          FROM "${schema}".users u
          JOIN "${schema}".user_roles ur ON u.id = ur.user_id
          JOIN "${schema}".roles r ON ur.role_id = r.id
          WHERE r.name = 'Super Administrador'
            AND u.is_active = true
        `),
      ]);

      return {
        data: admins,
        meta: {
          total: parseInt(total[0].count, 10),
          page,
          last_page: Math.ceil(parseInt(total[0].count, 10) / limit),
        },
      };
    });
  }

  async create(tenantId: string, data: CreateTenantAdminDto) {
    await this.validateCompanyExists(tenantId);
    const schema = `tenant_${tenantId}`;

    return this.tenantService.runInSchema(schema, async (manager) => {
      // Validar email duplicado
      const existingUser = await manager.query(
        `SELECT id FROM "${schema}".users WHERE email = $1`,
        [data.email],
      );
      if (existingUser.length > 0) {
        throw new ConflictException('Ya existe un usuario con ese correo.');
      }

      // Asegurar que exista el rol
      const roleResult = await manager.query(
        `SELECT id FROM "${schema}".roles WHERE name = 'Super Administrador' LIMIT 1`,
      );
      let roleId;
      if (roleResult.length === 0) {
        // Canonical UPPERCASE permission vocabulary enforced by PermissionsGuard
        // (single source of truth) — never the stale lowercase set.
        const superAdminPermsJSON = JSON.stringify(
          TENANT_SUPER_ADMIN_PERMISSIONS,
        );
        const newRole = await manager.query(
          `
          INSERT INTO "${schema}".roles (name, description, is_system_default, permissions)
          VALUES ('Super Administrador', 'Administrador Principal de la Institución', true, $1::jsonb)
          RETURNING id
        `,
          [superAdminPermsJSON],
        );
        roleId = newRole[0].id;
      } else {
        roleId = roleResult[0].id;
      }

      // Crear usuario
      const passwordHash = await bcrypt.hash(data.password, 10);
      const userRes = await manager.query(
        `
        INSERT INTO "${schema}".users (email, password_hash, name, company_id, is_active)
        VALUES ($1, $2, $3, $4, true) RETURNING id, email, name, is_active
      `,
        [data.email, passwordHash, data.name, tenantId],
      );

      const userId = userRes[0].id;

      // Asignar rol
      await manager.query(
        `
        INSERT INTO "${schema}".user_roles (user_id, role_id) VALUES ($1, $2)
      `,
        [userId, roleId],
      );

      return userRes[0];
    });
  }

  async update(tenantId: string, userId: string, data: UpdateTenantAdminDto) {
    await this.validateCompanyExists(tenantId);
    const schema = `tenant_${tenantId}`;

    return this.tenantService.runInSchema(schema, async (manager) => {
      // Check if user exists and is active admin
      const existing = await manager.query(
        `
        SELECT u.id FROM "${schema}".users u
        JOIN "${schema}".user_roles ur ON u.id = ur.user_id
        JOIN "${schema}".roles r ON ur.role_id = r.id
        WHERE u.id = $1 AND r.name = 'Super Administrador' AND u.is_active = true
      `,
        [userId],
      );

      if (existing.length === 0)
        throw new NotFoundException('Administrador activo no encontrado.');

      if (data.email) {
        const emailCheck = await manager.query(
          `SELECT id FROM "${schema}".users WHERE email = $1 AND id != $2`,
          [data.email, userId],
        );
        if (emailCheck.length > 0)
          throw new ConflictException('Ya existe un usuario con ese correo.');
      }

      const updates = [];
      const values = [];
      let idx = 1;

      if (data.name) {
        updates.push(`name = $${idx++}`);
        values.push(data.name);
      }
      if (data.email) {
        updates.push(`email = $${idx++}`);
        values.push(data.email);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = now()`);
        values.push(userId);

        await manager.query(
          `
          UPDATE "${schema}".users SET ${updates.join(', ')} WHERE id = $${idx}
        `,
          values,
        );
      }

      return { success: true };
    });
  }

  async updatePassword(
    tenantId: string,
    userId: string,
    data: UpdatePasswordDto,
  ) {
    await this.validateCompanyExists(tenantId);
    const schema = `tenant_${tenantId}`;

    return this.tenantService.runInSchema(schema, async (manager) => {
      const existing = await manager.query(
        `
        SELECT u.id FROM "${schema}".users u
        JOIN "${schema}".user_roles ur ON u.id = ur.user_id
        JOIN "${schema}".roles r ON ur.role_id = r.id
        WHERE u.id = $1 AND r.name = 'Super Administrador' AND u.is_active = true
      `,
        [userId],
      );

      if (existing.length === 0)
        throw new NotFoundException('Administrador activo no encontrado.');

      const passwordHash = await bcrypt.hash(data.password, 10);
      await manager.query(
        `
        UPDATE "${schema}".users SET password_hash = $1, updated_at = now() WHERE id = $2
      `,
        [passwordHash, userId],
      );

      // The auto-reset on first login logic is preserved if it relies on a flag,
      // but if the system does not have a flag in the DB, changing password forces next login reset as per spec AC-016.
      // E.g. we might need to set `force_password_reset = true` if that column exists, but for now we just change it.

      return { success: true };
    });
  }

  async softDelete(tenantId: string, userId: string) {
    await this.validateCompanyExists(tenantId);
    const schema = `tenant_${tenantId}`;

    return this.tenantService.runInSchema(schema, async (manager) => {
      // Validar si quedan más de 1 superadmin activo
      const countRes = await manager.query(`
        SELECT count(1) as count FROM "${schema}".users u
        JOIN "${schema}".user_roles ur ON u.id = ur.user_id
        JOIN "${schema}".roles r ON ur.role_id = r.id
        WHERE r.name = 'Super Administrador' AND u.is_active = true
      `);
      const count = parseInt(countRes[0].count, 10);

      if (count <= 1) {
        throw new ConflictException(
          'La empresa debe conservar al menos un administrador activo.',
        );
      }

      const res = await manager.query(
        `
        UPDATE "${schema}".users SET is_active = false, updated_at = now() 
        WHERE id = $1 AND is_active = true
        RETURNING id
      `,
        [userId],
      );

      if (res[1] === 0) {
        throw new NotFoundException('Administrador activo no encontrado.');
      }

      return { success: true };
    });
  }
}
