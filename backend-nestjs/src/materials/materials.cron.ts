import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';
import { TenantService } from '../database/tenant.service';
import { Company } from '../tenants/entities/tenant.entity';
import { CycleMaterialTemplate } from '../academic-time/entities/cycle-material-template.entity';
import { Cycle } from '../academic-time/entities/cycle.entity';
import { Material } from './entities/material.entity';

@Injectable()
export class MaterialsCron {
  private readonly logger = new Logger(MaterialsCron.name);

  constructor(
    private readonly generateMaterialUseCase: GenerateMaterialUseCase,
    private readonly tenantService: TenantService,
    private readonly cls: ClsService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    this.logger.log('Running US5: Automatic Material Generation (Cron)');

    // Obtener la primera compañía activa en el esquema público
    const company = await this.entityManager.findOne(Company, {
      where: { isActive: true },
    });

    if (!company) {
      this.logger.warn('No active company found. Skipping automatic material generation.');
      return;
    }

    const tenantId = company.id;
    const schemaName = `tenant_${tenantId}`;

    // Buscar un perfil (CycleMaterialTemplate) activo en el esquema del tenant
    const template = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        return manager.findOne(CycleMaterialTemplate, {});
      },
    );

    if (!template) {
      this.logger.warn(
        `No CycleMaterialTemplate found for tenant schema ${schemaName}. Skipping automatic material generation.`,
      );
      return;
    }

    // Buscar todos los ciclos activos con sus semanas en el esquema del tenant
    const cycles = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        return manager.find(Cycle, {
          where: { isActive: true },
          relations: ['weeks'],
        });
      },
    );

    for (const cycle of cycles) {
      this.logger.log(`Processing cycle: ${cycle.name}`);

      for (const week of cycle.weeks || []) {
        // T026 [US5]: Lógica de iteración alineada a CR-004
        // Preservación ESTRICTA de las semanas inactivas
        if (!week.isActive) {
          this.logger.log(
            `CR-004 Validated: Preserving inactive week ${week.weekNumber} for cycle ${cycle.id} without deletion.`,
          );
          continue; // Se omite el procesamiento físico
        }

        // Check if material is already generated or enqueued
        const existingMaterial = await this.tenantService.runInSchema(
          schemaName,
          async (manager) => {
            return manager.findOne(Material, {
              where: {
                profileId: template.id,
                cycleId: cycle.id,
                weekNumber: week.weekNumber,
              },
            });
          },
        );

        if (existingMaterial) {
          this.logger.log(
            `Material for cycle ${cycle.id} week ${week.weekNumber} already exists. Skipping auto-generation.`,
          );
          continue;
        }

        this.logger.log(
          `Triggering generation for active week ${week.weekNumber} in cycle ${cycle.id}`,
        );
        try {
          // Invocamos el flujo de US1 usando el caso de uso
          await this.cls.runWith(
            {
              companyId: tenantId,
              tenantSchema: schemaName,
            } as any,
            async () => {
              await this.generateMaterialUseCase.execute(tenantId, tenantId, {
                profile_id: template.id,
                week_number: week.weekNumber,
                requires_review: false,
                // Si no enviamos courses, el caso de uso toma todos los cursos del perfil por defecto
              });
            },
          );
        } catch (error: any) {
          this.logger.error(
            `Error auto-generating material for week ${week.weekNumber}: ${error.message}`,
          );
        }
      }
    }
  }
}

