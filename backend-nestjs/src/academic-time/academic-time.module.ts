import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicTimeController } from './academic-time.controller';
import { AcademicTimeUseCase } from './academic-time.use-case';
import { IAcademicTimeRepository } from './repositories/i-academic-time.repository';
import { AcademicTimeRepositoryImpl } from './repositories/academic-time.repository';
import { Cycle } from './entities/cycle.entity';
import { CycleWeek } from './entities/cycle-week.entity';
import { CycleMaterialTemplate } from './entities/cycle-material-template.entity';
import { CycleMaterialTemplateCourse } from './entities/cycle-material-template-course.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cycle,
      CycleWeek,
      CycleMaterialTemplate,
      CycleMaterialTemplateCourse,
    ]),
  ],
  controllers: [AcademicTimeController],
  providers: [
    AcademicTimeUseCase,
    {
      provide: IAcademicTimeRepository,
      useClass: AcademicTimeRepositoryImpl,
    },
  ],
  exports: [AcademicTimeUseCase],
})
export class AcademicTimeModule {}
