import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicTimeController } from './academic-time.controller';
import { AcademicTimeUseCase } from './academic-time.use-case';
import { IAcademicTimeRepository } from './repositories/i-academic-time.repository';
import { AcademicTimeRepositoryImpl } from './repositories/academic-time.repository';
import { Cycle } from './entities/cycle.entity';
import { CycleWeek } from './entities/cycle-week.entity';
import { CycleMaterialTemplate } from './entities/cycle-material-template.entity';
import { CycleMaterialTemplateCourse } from './entities/cycle-material-template-course.entity';
import { AuthModule } from '../auth/auth.module';
import { SyllabusModule } from '../syllabus/syllabus.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cycle,
      CycleWeek,
      CycleMaterialTemplate,
      CycleMaterialTemplateCourse,
    ]),
    // Required so JwtAuthGuard (and PermissionsGuard) can resolve AuthService.
    AuthModule,
    // AcademicTimeRepositoryImpl deactivates a cycle's syllabuses through
    // ISyllabusRepository instead of a raw cross-schema write. SyllabusModule
    // imports AcademicTimeModule back (for AcademicTimeUseCase), so both sides
    // use forwardRef to break the cycle.
    forwardRef(() => SyllabusModule),
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
