import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaterialsController } from './materials.controller';
import { MaterialsCron } from './materials.cron';
import { GenerateMaterialUseCase } from './use-cases/generate-material.use-case';
import { GetMaterialReviewUseCase } from './use-cases/get-material-review.use-case';
import { ApproveMaterialReviewUseCase } from './use-cases/approve-material-review.use-case';
import { MaterialDownloadsUseCase } from './use-cases/material-downloads.use-case';
import { HandleMaterialWebhookUseCase } from './use-cases/handle-material-webhook.use-case';
import { GetMaterialHistoryUseCase } from './use-cases/get-material-history.use-case';
import { GetMaterialMetricsUseCase } from './use-cases/get-material-metrics.use-case';
import { GetMaterialQuestionsUseCase } from './use-cases/get-material-questions.use-case';
import { CoreApiService } from './services/core-api.service';
import { PdfGeneratorService } from './services/pdf-generator.service';
import { PdfGenerationProcessor } from './processors/pdf-generation.processor';
import { AwsModule } from '../aws/aws.module';
import { MulterModule } from '@nestjs/platform-express';
import { PdfDesignController } from './pdf-design/pdf-design.controller';
import { PdfDesignService } from './pdf-design/pdf-design.service';
import { MaterialRequest } from './entities/material-request.entity';
import { MaterialRequestCourse } from './entities/material-request-course.entity';
import { MaterialReviewQuestion } from './entities/material-review-question.entity';
import { MaterialQuestionUsage } from './entities/material-question-usage.entity';
import { PdfDesignTemplate } from './entities/pdf-design-template.entity';
import { Material } from './entities/material.entity';
import { I_MATERIALS_REPOSITORY } from './repositories/i-materials.repository';
import { MaterialsRepository } from './repositories/materials.repository';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { QuestionBankModule } from '../question-bank/question-bank.module';

@Module({
  imports: [
    AwsModule,
    QuestionBankModule,
    MulterModule.register({ dest: './uploads' }),
    BullModule.registerQueue({
      name: 'materials-queue',
    }),
    BullBoardModule.forFeature({
      name: 'materials-queue',
      adapter: BullMQAdapter,
    }),
    TypeOrmModule.forFeature([
      Material,
      MaterialRequest,
      MaterialRequestCourse,
      MaterialReviewQuestion,
      MaterialQuestionUsage,
      PdfDesignTemplate,
    ]),
  ],
  controllers: [MaterialsController, PdfDesignController],
  providers: [
    PdfDesignService,
    MaterialsCron,
    GenerateMaterialUseCase,
    GetMaterialReviewUseCase,
    ApproveMaterialReviewUseCase,
    MaterialDownloadsUseCase,
    HandleMaterialWebhookUseCase,
    GetMaterialHistoryUseCase,
    GetMaterialMetricsUseCase,
    GetMaterialQuestionsUseCase,
    CoreApiService,
    PdfGeneratorService,
    PdfGenerationProcessor,
    {
      provide: I_MATERIALS_REPOSITORY,
      useClass: MaterialsRepository,
    },
  ],
  exports: [I_MATERIALS_REPOSITORY],
})
export class MaterialsModule {}
