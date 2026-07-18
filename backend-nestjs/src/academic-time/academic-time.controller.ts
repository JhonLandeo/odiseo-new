import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Delete,
  Query,
  Put,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { AcademicTimeUseCase } from './academic-time.use-case';
import { CreateCycleMaterialTemplateDto } from './dtos/create-material-template.dto';
import { UpdateCycleMaterialTemplateDto } from './dtos/update-material-template.dto';
import { CreateCycleDto } from './dtos/create-cycle.dto';
import { UpdateCycleDto } from './dtos/update-cycle.dto';
import { ToggleVisibilityDto } from './dtos/toggle-visibility.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../admin/roles/constants/permissions.constant';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('v1/academic-time')
export class AcademicTimeController {
  constructor(private readonly academicTimeUseCase: AcademicTimeUseCase) {}

  @Get('cycles')
  @RequirePermissions(PERMISSIONS.VIEW_ACADEMIC_TIME)
  async getCycles(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.academicTimeUseCase.getCycles(
      parsedLimit,
      parsedOffset,
      search,
    );
  }

  @Post('cycles')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async createCycle(
    @Body()
    body: CreateCycleDto,
  ) {
    return this.academicTimeUseCase.createCycle(body);
  }

  @Patch('cycles/:id')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async updateCycle(
    @Param('id') id: string,
    @Body()
    body: UpdateCycleDto,
  ) {
    return this.academicTimeUseCase.updateCycle(id, body);
  }

  @Patch('cycles/:id/visibility')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async toggleCycleVisibility(
    @Param('id') id: string,
    @Body() body: ToggleVisibilityDto,
  ) {
    await this.academicTimeUseCase.toggleCycleVisibility(id, body.isActive);
    return { success: true };
  }

  @Patch('weeks/:id/visibility')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async toggleWeekVisibility(
    @Param('id') id: string,
    @Body() body: ToggleVisibilityDto,
  ) {
    await this.academicTimeUseCase.toggleWeekVisibility(id, body.isActive);
    return { success: true };
  }

  @Delete('weeks/:id')
  @HttpCode(405)
  async deleteWeekNotAllowed() {
    return {
      statusCode: 405,
      error: 'Method Not Allowed',
      message:
        'Las semanas no pueden eliminarse individualmente. Desactívelas desde PATCH /academic-time/weeks/:id/visibility.',
    };
  }

  @Delete('cycles/:id')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async deleteCycle(@Param('id') id: string) {
    await this.academicTimeUseCase.deleteCycle(id);
    return { success: true };
  }

  // --- Material Templates ---

  @Get('cycles/:id/templates')
  @RequirePermissions(PERMISSIONS.VIEW_ACADEMIC_TIME)
  async getTemplates(@Param('id') id: string) {
    return this.academicTimeUseCase.getTemplates(id);
  }

  @Post('cycles/:id/templates')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async createTemplate(
    @Param('id') cycleId: string,
    @Body() dto: CreateCycleMaterialTemplateDto,
  ) {
    return this.academicTimeUseCase.createTemplate(cycleId, dto);
  }

  @Put('cycles/:cycleId/templates/:templateId')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async updateTemplate(
    @Param('cycleId') cycleId: string,
    @Param('templateId') templateId: string,
    @Body() dto: UpdateCycleMaterialTemplateDto,
  ) {
    return this.academicTimeUseCase.updateTemplate(cycleId, templateId, dto);
  }

  @Delete('cycles/:cycleId/templates/:templateId')
  @RequirePermissions(PERMISSIONS.MANAGE_ACADEMIC_TIME)
  async deleteTemplate(
    @Param('cycleId') cycleId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.academicTimeUseCase.deleteTemplate(cycleId, templateId);
  }
}
