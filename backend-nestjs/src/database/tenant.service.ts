import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { assertValidSchema } from './schema-name.util';

@Injectable()
export class TenantService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
  ) {}

  /**
   * Ejecuta una operación en el contexto del esquema del tenant activo.
   * Utiliza SET LOCAL search_path dentro de una transacción para garantizar
   * el aislamiento físico a nivel de base de datos.
   */
  async runInTenant<T>(
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const tenantSchema = this.cls.get('tenantSchema');

    if (!tenantSchema) {
      throw new Error('Tenant Schema no está definido en el contexto actual');
    }

    return this.runInSchema(tenantSchema, operation);
  }

  /**
   * Ejecuta una operación con un esquema explícito (ej. procesos background).
   *
   * Aislamiento: solo se reutiliza la transacción ambiente cuando pertenece
   * EXACTAMENTE al mismo esquema solicitado. Si el esquema difiere, se abre
   * una transacción nueva (conexión distinta del pool con su propio
   * search_path), evitando operar sobre el esquema equivocado.
   */
  async runInSchema<T>(
    schema: string,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    assertValidSchema(schema);

    const existingManager = this.cls.get('tx_manager') as EntityManager;
    const existingSchema = this.cls.get('tx_schema') as string;
    if (existingManager && existingSchema === schema) {
      return operation(existingManager);
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${schema}", public`);
      return this.cls.runWith(
        { ...this.cls.get(), tx_manager: manager, tx_schema: schema } as any,
        () => operation(manager),
      );
    });
  }
}
