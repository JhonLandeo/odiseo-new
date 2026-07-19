import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('material_question_usage')
@Index(['cycleId', 'courseId', 'questionId']) // Índice compuesto para validación anti-repetición rápida
// Natural key: each question is recorded at most once per generated course of a
// request. Enforced in tenant schemas by migration 0009 (same name); declared
// here so the entity and the physical constraint never drift.
@Index(
  'uq_material_question_usage_request_course_question',
  ['materialRequestId', 'courseId', 'questionId'],
  {
    unique: true,
  },
)
export class MaterialQuestionUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'material_request_id', type: 'uuid' })
  materialRequestId: string;

  @Column({ name: 'cycle_id', type: 'uuid' })
  cycleId: string;

  @Column({ name: 'question_id' })
  questionId: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId: string;

  @Column({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ name: 'subtopic_id', type: 'bigint' })
  subtopicId: string;

  @Column({ name: 'position_in_pdf' })
  positionInPdf: number;

  @Column({ name: 'was_replacement', default: false })
  wasReplacement: boolean;

  @CreateDateColumn({ name: 'used_at' })
  usedAt: Date;
}
