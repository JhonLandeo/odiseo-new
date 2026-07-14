// This migration has been deprecated and replaced by the JSONB-based RBAC model.
// Roles and permissions are now managed within each tenant schema using:
// - roles table with permissions JSONB column
// - user_roles join table
// See: tenant-schema-init.sql and schema.service.ts
//
// This file is kept as a no-op to avoid migration runner errors.

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRolesTables1710000000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // No-op: RBAC tables are created per-tenant in tenant schema provisioning
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op
  }
}
