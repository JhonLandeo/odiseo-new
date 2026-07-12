import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableCheck } from 'typeorm';

export class CreateRolesTables1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: Schema selection is handled dynamically in our multi-tenant setup,
    // so we assume the queryRunner is already configured for the tenant schema
    // or we use currentSchema() mechanism if applicable.
    
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'gen_random_uuid()' },
          { name: 'name', type: 'varchar', isUnique: true },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'is_system_default', type: 'boolean', default: false },
          { name: 'permissions', type: 'jsonb', default: "'[]'::jsonb" },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'role_inheritance',
        columns: [
          { name: 'parent_role_id', type: 'uuid', isPrimary: true },
          { name: 'child_role_id', type: 'uuid', isPrimary: true },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'user_id', type: 'uuid', isPrimary: true },
          { name: 'role_id', type: 'uuid', isPrimary: true },
          { name: 'assigned_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKeys('role_inheritance', [
      new TableForeignKey({
        columnNames: ['parent_role_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'RESTRICT',
      }),
      new TableForeignKey({
        columnNames: ['child_role_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'CASCADE',
      }),
    ]);

    await queryRunner.createCheckConstraint(
      'role_inheritance',
      new TableCheck({
        expression: `parent_role_id != child_role_id`,
      })
    );

    // Assuming users table is globally accessible or in the same schema.
    // If user table is in public schema, you might need to qualify it.
    await queryRunner.createForeignKeys('user_roles', [
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
      }),
      new TableForeignKey({
        columnNames: ['role_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'roles',
        onDelete: 'RESTRICT',
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_roles');
    await queryRunner.dropTable('role_inheritance');
    await queryRunner.dropTable('roles');
  }
}
