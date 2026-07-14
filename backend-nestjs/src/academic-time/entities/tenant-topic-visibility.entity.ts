import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Topic } from '../../catalogs/entities/topic.entity';

@Entity({ name: 'tenant_topic_visibility' })
export class TenantTopicVisibility {
  @PrimaryColumn({ name: 'topic_id', type: 'bigint' })
  topicId: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Topic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic: Topic;
}
