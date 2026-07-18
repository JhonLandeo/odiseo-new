import {
  Controller,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateSyllabusDto } from './dto/create-syllabus.dto';
import { CreateDistributionDto } from './dto/create-distribution.dto';
import { UpdateDistributionDto } from './dto/update-distribution.dto';
import { CloneSyllabusDto } from './dto/clone-syllabus.dto';
import { ArchiveSyllabusDto } from './dto/archive-syllabus.dto';
import { SyllabusUseCase } from './syllabus.use-case';
import { JwtAuthGuard } from '../auth/auth.guard';
import {
  PermissionsGuard,
  RequirePermissions,
} from '../common/guards/permissions.guard';
import { PERMISSIONS } from '../admin/roles/constants/permissions.constant';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('v1/syllabus')
export class SyllabusController {
  constructor(private readonly useCase: SyllabusUseCase) {}

  @Post()
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async createSyllabus(@Body() dto: CreateSyllabusDto) {
    const syllabus = await this.useCase.create(dto);
    return { status: 'created', syllabus };
  }

  @Get('cycle/:cycleId')
  @RequirePermissions(PERMISSIONS.VIEW_SYLLABUS)
  async getSyllabiByCycle(@Param('cycleId') cycleId: string) {
    return this.useCase.findByCycle(cycleId);
  }

  @Post(':id/distribution')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async createDistribution(
    @Param('id') syllabusId: string,
    @Body() dto: CreateDistributionDto,
  ) {
    const dist = await this.useCase.addDistribution(syllabusId, dto);
    return { status: 'created', distribution: dist };
  }

  @Patch(':id/distribution/:distId')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async updateDistribution(
    @Param('id') syllabusId: string,
    @Param('distId') distId: string,
    @Body() dto: UpdateDistributionDto,
  ) {
    await this.useCase.updateDistributionQuantity(
      distId,
      syllabusId,
      dto.questionCount,
    );
    return { status: 'updated' };
  }

  @Delete(':id/distribution/:distId')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async deleteDistribution(
    @Param('id') syllabusId: string,
    @Param('distId') distId: string,
  ) {
    await this.useCase.deleteDistribution(distId);
    return { status: 'deleted' };
  }

  @Get(':id/summary')
  @RequirePermissions(PERMISSIONS.VIEW_SYLLABUS)
  async getSummary(
    @Param('id') syllabusId: string,
    @Query('templateId') templateId?: string,
  ) {
    const summary = await this.useCase.getSummary(syllabusId, templateId);
    return { status: 'success', summary };
  }

  @Post(':id/clone')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async cloneSyllabus(
    @Param('id') syllabusId: string,
    @Body() dto: CloneSyllabusDto,
  ) {
    const summary = await this.useCase.cloneSyllabus(syllabusId, dto.sourceId);
    return { status: 'cloned', summary };
  }

  @Post('cycle/:targetCycleId/clone-from/:sourceCycleId')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async cloneCycle(
    @Param('targetCycleId') targetCycleId: string,
    @Param('sourceCycleId') sourceCycleId: string,
  ) {
    const result = await this.useCase.cloneCycleSyllabuses(
      targetCycleId,
      sourceCycleId,
    );
    return { status: 'cloned', ...result };
  }

  @Patch(':id/template')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async setTemplate(
    @Param('id') id: string,
    @Body('templateId') templateId: string,
  ) {
    await this.useCase.setTemplate(id, templateId);
    return { status: 'updated' };
  }

  @Patch(':id/archive')
  @RequirePermissions(PERMISSIONS.EDIT_SYLLABUS)
  async archiveSyllabus(
    @Param('id') id: string,
    @Body() dto: ArchiveSyllabusDto,
  ) {
    await this.useCase.archiveSyllabus(id, dto.isActive);
    return { success: true };
  }
}
