import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CycleMaterialTemplate } from './cycle-material-template.entity';
import { Course } from '../../catalogs/entities/course.entity';

@Entity({ name: 'cycle_material_template_courses' })
export class CycleMaterialTemplateCourse {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId: string;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @Column({ name: 'questions_quantity', type: 'integer' })
  questionsQuantity: number;

  @Column({ name: 'easy_count', type: 'integer', default: 0 })
  easyCount: number;

  @Column({ name: 'medium_count', type: 'integer', default: 0 })
  mediumCount: number;

  @Column({ name: 'hard_count', type: 'integer', default: 0 })
  hardCount: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CycleMaterialTemplate, (template: CycleMaterialTemplate) => template.courses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template: CycleMaterialTemplate;
}
