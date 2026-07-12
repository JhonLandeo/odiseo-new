import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('subscription_plans', { schema: 'public' })
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ name: 'max_users', default: 5 })
  maxUsers: number;

  @Column({ name: 'max_pdf_pages_per_month', default: 100 })
  maxPdfPagesPerMonth: number;

  @Column({ name: 'max_questions_per_month', default: 500 })
  maxQuestionsPerMonth: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
