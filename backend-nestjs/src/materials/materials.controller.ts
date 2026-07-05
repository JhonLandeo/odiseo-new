import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { GenerateMaterialDto } from './dto/generate-material.dto';
import { WebhookStatusRequestDto } from './dto/webhook-status-request.dto';
import { ApproveReviewDto } from './dto/approve-review.dto';
import { MaterialsService } from './materials.service';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';

@ApiTags('Materials')
@Controller('v1/materials')
export class MaterialsController {
  constructor(
    private readonly materialsService: MaterialsService,
    private readonly generateMaterialUseCase: GenerateMaterialUseCase,
    private readonly cls: ClsService,
  ) {}

  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted
  @ApiOperation({
    summary: 'Solicitar generación asíncrona de balotario/examen',
  })
  @ApiResponse({
    status: 202,
    description: 'La solicitud ha sido encolada exitosamente.',
  })
  @ApiResponse({ status: 400, description: 'Error de validación de negocio.' })
  async generateMaterial(@Body() request: GenerateMaterialDto) {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new UnauthorizedException('Tenant not identified');
    }
    const userId = tenantId;
    return await this.generateMaterialUseCase.execute(
      tenantId,
      userId,
      request,
    );
  }

  @Post('webhook/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Webhook interno para actualización de estado desde el Worker',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado correctamente.',
  })
  async updateMaterialStatus(@Body() request: WebhookStatusRequestDto) {
    await this.materialsService.updateMaterialStatus(request);
    return { success: true };
  }

  @Get(':id/review')
  @ApiOperation({
    summary: 'Obtener reactivos y slots de revisión para curaduría',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de preguntas cargadas para revisión.',
  })
  @ApiResponse({ status: 404, description: 'La solicitud no existe.' })
  async getReviewData(@Param('id') id: string) {
    return await this.materialsService.getReviewData(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Aprobar curaduría y gatillar compilación física asíncrona',
  })
  @ApiResponse({
    status: 202,
    description: 'Revisión guardada y compilación iniciada.',
  })
  @ApiResponse({ status: 409, description: 'Conflicto de concurrencia.' })
  async approveCuration(
    @Param('id') id: string,
    @Body() request: ApproveReviewDto,
  ) {
    const userId = this.cls.get('companyId') || 'system';
    return await this.materialsService.approveCuration(id, request, userId);
  }

  @Get(':id/courses/:courseId/download')
  @ApiOperation({
    summary: 'Descargar PDF de un curso directamente (streaming)',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo PDF devuelto como stream.',
  })
  @ApiResponse({
    status: 404,
    description: 'La solicitud o el curso no existen.',
  })
  async downloadCoursePdf(
    @Param('id') id: string,
    @Param('courseId') courseId: string,
    @Res() res: Response,
  ) {
    const result = await this.materialsService.getDownloadUrl(id, courseId);
    try {
      const buffer = await this.materialsService.streamDownload(result.s3Key);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch {
      // Fallback: redirect to presigned URL if streaming fails
      res.redirect(result.downloadUrl);
    }
  }

  @Get(':id/download-merged')
  @ApiOperation({
    summary: 'Descargar PDF combinado directamente (streaming)',
  })
  @ApiResponse({
    status: 200,
    description: 'Archivo PDF combinado devuelto como stream.',
  })
  @ApiResponse({ status: 404, description: 'La solicitud no existe.' })
  async downloadMergedPdf(@Param('id') id: string, @Res() res: Response) {
    const result = await this.materialsService.getMergedDownloadUrl(id);
    try {
      const buffer = await this.materialsService.streamDownload(result.s3Key);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`,
      );
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch {
      res.redirect(result.downloadUrl);
    }
  }

  @Get('history')
  @ApiOperation({
    summary: 'Obtener historial de solicitudes de generación',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de generación devuelto.',
  })
  async getHistory(
    @Query('cycleId') cycleId?: string,
    @Query('cycleIds') cycleIds?: string,
    @Query('weekNumbers') weekNumbers?: string,
    @Query('templateIds') templateIds?: string,
  ) {
    const idsToFilter = cycleIds
      ? cycleIds.split(',')
      : cycleId
        ? [cycleId]
        : undefined;
    const parsedWeeks = weekNumbers
      ? weekNumbers
          .split(',')
          .map((w) => parseInt(w, 10))
          .filter((w) => !isNaN(w))
      : undefined;
    const parsedTemplates = templateIds ? templateIds.split(',') : undefined;
    return await this.materialsService.getHistory(
      idsToFilter,
      parsedWeeks,
      parsedTemplates,
    );
  }

  @Get(':id/attempts')
  @ApiOperation({
    summary: 'Obtener el historial de intentos/versiones de un material lógico',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de intentos devuelta.',
  })
  async getAttempts(@Param('id') id: string) {
    return await this.materialsService.getAttempts(id);
  }

  @Get('question/:questionId/preview')
  @ApiOperation({
    summary: 'Obtener vista previa de una pregunta por su ID para curaduría',
  })
  @ApiResponse({
    status: 200,
    description: 'Datos de la pregunta.',
  })
  async getQuestionPreview(@Param('questionId') questionId: string) {
    return await this.materialsService.getQuestionPreview(questionId);
  }

  @Get('question/alternatives/search')
  @ApiOperation({
    summary: 'Obtener alternativas de preguntas para curaduría',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de 3 preguntas alternativas.',
  })
  async getQuestionAlternatives(
    @Query('topicId') topicId: string,
    @Query('subtopicId') subtopicId: string,
    @Query('levelId') levelId?: string,
    @Query('limit') limit?: number,
  ) {
    return await this.materialsService.getQuestionAlternatives(
      topicId,
      subtopicId,
      levelId,
      limit ? Number(limit) : 3,
    );
  }
}
