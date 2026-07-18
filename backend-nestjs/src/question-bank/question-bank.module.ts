import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Question } from './entities/question.entity';
import { Alternative } from './entities/alternative.entity';
import { QuestionBankService } from './question-bank.service';
import { FlatQuestionsRepository } from './flat-questions.repository';

// Depends on the external question bank connection ONLY. It deliberately holds
// no reference to `materials` (or any other feature module): materials imports
// this module, and a dependency back would make the boundary this module exists
// to protect circular. See the anti-corruption-layer note in
// flat-questions.repository.ts.
@Module({
  imports: [
    TypeOrmModule.forFeature([Question, Alternative], 'questionsConnection'),
  ],
  providers: [QuestionBankService, FlatQuestionsRepository],
  exports: [QuestionBankService, FlatQuestionsRepository],
})
export class QuestionBankModule {}
