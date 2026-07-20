import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Syllabus } from './entities/syllabus.entity';
import { SyllabusDistribution } from './entities/syllabus-distribution.entity';
import { SyllabusController } from './syllabus.controller';
import { SyllabusRepositoryImpl } from './repositories/syllabus.repository';
import { I_SYLLABUS_REPOSITORY } from './repositories/i-syllabus.repository';
import { SyllabusUseCase } from './syllabus.use-case';
import { MaterialGeneratedListener } from './listeners/material-generated.listener';
import { AcademicTimeModule } from '../academic-time/academic-time.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogsModule } from '../catalogs/catalogs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Syllabus, SyllabusDistribution]),
    // AcademicTimeModule imports SyllabusModule back (ISyllabusRepository for
    // cycle-deactivation), so this side needs forwardRef too.
    forwardRef(() => AcademicTimeModule),
    // Required so JwtAuthGuard (and PermissionsGuard) can resolve AuthService.
    AuthModule,
    // ICatalogRepository.courseExists: syllabus creation validates the
    // referenced course before insert (see SyllabusUseCase.create).
    CatalogsModule,
  ],
  controllers: [SyllabusController],
  providers: [
    SyllabusUseCase,
    {
      provide: I_SYLLABUS_REPOSITORY,
      useClass: SyllabusRepositoryImpl,
    },
    MaterialGeneratedListener,
  ],
  // MaterialGeneratedListener is also called directly by MaterialsCron's
  // reconciliation sweep (materials.module.ts imports SyllabusModule for
  // this), so it must be resolvable outside this module too.
  exports: [I_SYLLABUS_REPOSITORY, MaterialGeneratedListener],
})
export class SyllabusModule {}
