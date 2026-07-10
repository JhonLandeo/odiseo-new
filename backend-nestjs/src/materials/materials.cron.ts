import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';
import { TenantService } from '../database/tenant.service';
import { Company } from '../tenants/entities/tenant.entity';
import { CycleMaterialTemplate } from '../academic-time/entities/cycle-material-template.entity';

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

    // Mock de base de datos para la configuración de ciclos
    const cycles = [
      {
        cycle_id: 'c-1',
        name: 'Ciclo Verano 2026',
        cycle_weeks: [
          { week_num: 1, active: true, course_id: 'course-math' },
          { week_num: 2, active: false, course_id: null }, // Semana inactiva (NULL)
          { week_num: 3, active: true, course_id: 'course-math' },
        ],
      },
    ];

    for (const cycle of cycles) {
      this.logger.log(`Processing cycle: ${cycle.name}`);

      for (const week of cycle.cycle_weeks) {
        // T026 [US5]: Lógica de iteración alineada a CR-004
        // Preservación ESTRICTA de las semanas nulas (inactivas)
        if (!week.active || week.course_id === null) {
          this.logger.log(
            `CR-004 Validated: Preserving inactive NULL week ${week.week_num} for cycle ${cycle.cycle_id} without deletion.`,
          );
          continue; // Se omite el procesamiento físico, pero el registro original no se muta ni se borra
        }

        this.logger.log(
          `Triggering generation for active week ${week.week_num} in cycle ${cycle.cycle_id}`,
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
                week_number: week.week_num,
                requires_review: false,
                courses: [{ course_id: week.course_id }],
              });
            },
          );
        } catch (error) {
          this.logger.error(
            `Error auto-generating material for week ${week.week_num}: ${error.message}`,
          );
        }
      }
    }
  }
}

