import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SyllabusDistribution } from './syllabus-distribution.entity';

@Entity('syllabus')
export class Syllabus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

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
    (distribution) => distribution.syllabus,
  )
  distributions: SyllabusDistribution[];
}
