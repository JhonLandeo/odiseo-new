import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Course } from './course.entity';
import { Subtopic } from './subtopic.entity';

@Entity({ schema: 'public', name: 'topics' })
export class Topic {
  @PrimaryColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'course_id', type: 'bigint' })
  courseId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.topics, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @OneToMany(() => Subtopic, (subtopic) => subtopic.topic)
  subtopics: Subtopic[];
}
