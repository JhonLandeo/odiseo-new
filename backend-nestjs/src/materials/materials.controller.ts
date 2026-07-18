import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ClsService } from 'nestjs-cls';
import { WebhookAuthGuard } from './guards/webhook-auth.guard';
import { GenerateMaterialDto } from './dto/generate-material.dto';
import { WebhookStatusRequestDto } from './dto/webhook-status-request.dto';
import { ApproveReviewDto } from './dto/approve-review.dto';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';
import { GetMaterialReviewUseCase } from './use-cases/get-material-review.use-case';
import { ApproveMaterialReviewUseCase } from './use-cases/approve-material-review.use-case';
import { MaterialDownloadsUseCase } from './use-cases/material-downloads.use-case';
import { HandleMaterialWebhookUseCase } from './use-cases/handle-material-webhook.use-case';
import { GetMaterialHistoryUseCase } from './use-cases/get-material-history.use-case';
import { GetMaterialMetricsUseCase } from './use-cases/get-material-metrics.use-case';
import { GetMaterialQuestionsUseCase } from './use-cases/get-material-questions.use-case';
import { GetQuestionAlternativesDto } from './dto/get-question-alternatives.dto';

@ApiTags('Materials')
@Controller('v1/materials')
export class MaterialsController {
  constructor(
    private readonly generateMaterialUseCase: GenerateMaterialUseCase,
    private readonly getMaterialReviewUseCase: GetMaterialReviewUseCase,
    private readonly approveMaterialReviewUseCase: ApproveMaterialReviewUseCase,
    private readonly materialDownloadsUseCase: MaterialDownloadsUseCase,
    private readonly handleMaterialWebhookUseCase: HandleMaterialWebhookUseCase,
    private readonly getMaterialHistoryUseCase: GetMaterialHistoryUseCase,
    private readonly getMaterialMetricsUseCase: GetMaterialMetricsUseCase,
    private readonly getMaterialQuestionsUseCase: GetMaterialQuestionsUseCase,
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
  async generateMaterial(@Body() request: GenerateMaterialDto, @Req() req: Request) {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new UnauthorizedException('Tenant not identified');
    }
    const userId = (req as any).user?.sub || tenantId;
    return await this.generateMaterialUseCase.execute(
      tenantId,
      userId,
      request,
    );
  }

  @Post('webhook/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(WebhookAuthGuard)
  @ApiOperation({
    summary: 'Webhook interno para actualización de estado desde el Worker',
  })
  @ApiResponse({
    status: 200,
    description: 'Estado actualizado correctamente.',
  })
  async updateMaterialStatus(@Body() request: WebhookStatusRequestDto) {
    await this.handleMaterialWebhookUseCase.execute(request);
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
    return await this.getMaterialReviewUseCase.execute(id);
  }

  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Guardar borrador de la curaduría en tiempo real',
  })
  @ApiResponse({
    status: 200,
    description: 'Borrador guardado exitosamente.',
  })
  async saveDraftCuration(
    @Param('id') id: string,
    @Body() request: ApproveReviewDto,
    @Req() req: Request,
  ) {
    const userId = (req as any).user?.sub;
    if (!userId) throw new UnauthorizedException('Tenant no identificado');
    return await this.approveMaterialReviewUseCase.saveDraft(id, request, userId);
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
    @Req() req: Request,
  ) {
    const tenantId = this.cls.get('companyId');
    const userId = (req as any).user?.sub;
    if (!userId) throw new UnauthorizedException('Tenant no identificado');
    return await this.approveMaterialReviewUseCase.execute(id, request, userId, tenantId);
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
    @Query('type') type: 'student' | 'keys' | 'solutions' = 'student',
    @Res() res: Response,
  ) {
    const result = await this.materialDownloadsUseCase.getDownloadUrl(id, courseId, type);
    try {
      const buffer = await this.materialDownloadsUseCase.streamDownload(result.s3Key);
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
  async downloadMergedPdf(
    @Param('id') id: string,
    @Query('type') type: 'student' | 'keys' | 'solutions' = 'student',
    @Res() res: Response,
  ) {
    const result = await this.materialDownloadsUseCase.getMergedDownloadUrl(id, type);
    try {
      const buffer = await this.materialDownloadsUseCase.streamDownload(result.s3Key);
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

  @Get('dashboard/metrics')
  @ApiOperation({
    summary: 'Obtener métricas consolidadas para el dashboard del tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Métricas del tenant obtenidas exitosamente.',
  })
  async getDashboardMetrics() {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new UnauthorizedException('Tenant not identified');
    }
    return await this.getMaterialMetricsUseCase.getTenantDashboardMetrics();
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
    return await this.getMaterialHistoryUseCase.getHistory(
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
    return await this.getMaterialHistoryUseCase.getAttempts(id);
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
    return await this.getMaterialQuestionsUseCase.getQuestionPreview(questionId);
  }

  @Post('question/alternatives/search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener alternativas de preguntas para curaduría',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de 3 preguntas alternativas.',
  })
  async getQuestionAlternatives(
    @Body() body: GetQuestionAlternativesDto
  ) {
    return await this.getMaterialQuestionsUseCase.getQuestionAlternatives(
      body.courseId,
      body.topicId,
      body.subtopicId,
      body.levelId,
      body.limit ? Number(body.limit) : 3,
      body.excludeIds || [],
    );
  }
}
