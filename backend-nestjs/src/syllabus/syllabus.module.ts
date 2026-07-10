import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Syllabus } from './entities/syllabus.entity';
import { SyllabusDistribution } from './entities/syllabus-distribution.entity';
import { SyllabusController } from './syllabus.controller';
import { SyllabusRepositoryImpl } from './repositories/syllabus.repository';
import { I_SYLLABUS_REPOSITORY } from './repositories/i-syllabus.repository';
import { SyllabusUseCase } from './syllabus.use-case';

@Module({
  imports: [TypeOrmModule.forFeature([Syllabus, SyllabusDistribution])],
  controllers: [SyllabusController],
  providers: [
    SyllabusUseCase,
    {
      provide: I_SYLLABUS_REPOSITORY,
      useClass: SyllabusRepositoryImpl,
    },
  ],
  exports: [I_SYLLABUS_REPOSITORY],
})
export class SyllabusModule {}
