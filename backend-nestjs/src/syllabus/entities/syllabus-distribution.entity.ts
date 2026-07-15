import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Check,
} from 'typeorm';
import { Syllabus } from './syllabus.entity';

@Entity('syllabus_distribution')
@Unique('UQ_syllabus_template_week_topic_subtopic', [
  'syllabusId',
  'templateId',
  'weekNumber',
  'topicId',
  'subtopicId',
])
@Check(`"question_count" > 0`)
export class SyllabusDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'syllabus_id', type: 'uuid' })
  syllabusId: string;

  @ManyToOne(() => Syllabus, (syllabus) => syllabus.distributions, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'syllabus_id' })
  syllabus: Syllabus;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'week_number', type: 'int' })
  weekNumber: number;

  @Column({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ name: 'subtopic_id', type: 'bigint' })
  subtopicId: string;

  @Column({ name: 'question_count', type: 'int' })
  questionCount: number;

  @Column({ name: 'is_generated', type: 'boolean', default: false })
  isGenerated: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
