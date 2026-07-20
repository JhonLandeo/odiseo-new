import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './entities/question.entity';
import { Alternative } from './entities/alternative.entity';
import { QuestionLevelReconciliationState } from './entities/question-level-reconciliation-state.entity';
import { QuestionBankService } from './question-bank.service';
import { FlatQuestionsRepository } from './flat-questions.repository';
import { QuestionLevelIdReconciliationService } from './question-level-id-reconciliation.service';
import { QuestionLevelIdReconciliationCronService } from './question-level-id-reconciliation.cron';
import { IQuestionLevelReconciliationRepository } from './repositories/i-question-level-reconciliation.repository';
import { QuestionLevelReconciliationRepositoryImpl } from './repositories/question-level-reconciliation.repository';

// Depends on the external question bank connection ONLY. It deliberately holds
// no reference to `materials` (or any other feature module): materials imports
// this module, and a dependency back would make the boundary this module exists
// to protect circular. See the anti-corruption-layer note in
// flat-questions.repository.ts.
//
// `QuestionLevelReconciliationState` is the one exception to "external
// connection only": it is LOCAL platform state (default connection) that
// bookkeeps the result of checking the external connection — see
// `QuestionLevelIdReconciliationService` — mirroring how CatalogsModule
// registers `TopicIdSpaceReconciliationState` on its default connection
// alongside its `questionsConnection`-scoped checks.
@Module({
  imports: [
    TypeOrmModule.forFeature([Question, Alternative], 'questionsConnection'),
    TypeOrmModule.forFeature([QuestionLevelReconciliationState]),
  ],
  providers: [
    QuestionBankService,
    FlatQuestionsRepository,
    QuestionLevelIdReconciliationService,
    QuestionLevelIdReconciliationCronService,
    {
      provide: IQuestionLevelReconciliationRepository,
      useClass: QuestionLevelReconciliationRepositoryImpl,
    },
  ],
  exports: [QuestionBankService, FlatQuestionsRepository],
})
export class QuestionBankModule {}
