import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Syllabus } from './syllabus.entity';

// NOTE: the real uniqueness constraint for one distribution cell no longer
// lives here as a @Unique decorator. Postgres treats NULL as distinct from
// NULL for uniqueness purposes, so a plain-column UNIQUE(syllabus_id,
// template_id, week_number, topic_id, subtopic_id) never fires for two rows
// that both have template_id IS NULL -- silently breaking the module's LWW
// guarantee (see SyllabusRepositoryImpl.createDistribution). @Unique cannot
// express a NULL-safe COALESCE expression, so the constraint is instead a
// UNIQUE INDEX over (syllabus_id, COALESCE(template_id, sentinel), ...) in
// tenant migration 0011_syllabus_distribution_null_safe_unique. This entity
// is descriptive only (tenant DDL is never driven by `synchronize`); the
// migration is the authoritative source of the real constraint.
@Entity('syllabus_distribution')
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
