import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';

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

    const existingManager = this.cls.get('tx_manager') as EntityManager;
    if (existingManager) {
      return operation(existingManager);
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${tenantSchema}", public`);
      return this.cls.runWith({ ...this.cls.get(), tx_manager: manager } as any, () => operation(manager));
    });
  }

  /**
   * Helper para cuando se necesita pasar un schema explícito (ej. procesos background)
   */
  async runInSchema<T>(
    schema: string,
    operation: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const existingManager = this.cls.get('tx_manager') as EntityManager;
    if (existingManager) {
      return operation(existingManager);
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SET LOCAL search_path TO "${schema}", public`);
      return this.cls.runWith({ ...this.cls.get(), tx_manager: manager } as any, () => operation(manager));
    });
  }
}
