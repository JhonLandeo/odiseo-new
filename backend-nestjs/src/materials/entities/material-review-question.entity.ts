import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MaterialRequest } from './material-request.entity';

export enum ReviewQuestionStatus {
  FOUND = 'FOUND',
  EMPTY = 'EMPTY',
  REPLACED = 'REPLACED',
  REMOVED = 'REMOVED',
}

@Entity('material_review_questions')
export class MaterialReviewQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'material_request_id', type: 'uuid' })
  materialRequestId: string;

  @Column({ name: 'question_id', nullable: true })
  questionId: string;

  @Column({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ name: 'subtopic_id', type: 'bigint' })
  subtopicId: string;

  @Column({ name: 'expected_level', nullable: true })
  expectedLevel: string; // 'EASY', 'MEDIUM', 'HARD'

  @Column()
  position: number;

  @Column({
    type: 'enum',
    enum: ReviewQuestionStatus,
    default: ReviewQuestionStatus.FOUND,
  })
  status: ReviewQuestionStatus;

  @ManyToOne(() => MaterialRequest, (request) => request.reviewQuestions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'material_request_id' })
  materialRequest: MaterialRequest;
}
