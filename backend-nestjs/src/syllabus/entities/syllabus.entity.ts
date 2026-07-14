import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SyllabusDistribution } from './syllabus-distribution.entity';
import { Course } from '../../catalogs/entities/course.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';

@Entity('syllabus')
export class Syllabus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @ManyToOne(() => Cycle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cycle_id' })
  cycle: Cycle;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(
    () => SyllabusDistribution,
    (distribution: SyllabusDistribution) => distribution.syllabus,
  )
  distributions: SyllabusDistribution[];
}
