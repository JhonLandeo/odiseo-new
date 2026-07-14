import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Topic } from './topic.entity';

@Entity({ schema: 'public', name: 'subtopics' })
export class Subtopic {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Topic, (topic) => topic.subtopics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic;
}
