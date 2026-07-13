import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SubscriptionPlan } from '../../admin/subscriptions/entities/subscription-plan.entity';

@Entity('companies', { schema: 'public' })
export class Company {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 255 })
  subdomain: string;

  @Column({ name: 'commercial_name', length: 255 })
  commercialName: string;

  @Column({ name: 'logo_url', nullable: true, length: 255 })
  logoUrl: string;

  @Column({ name: 'contact_email', nullable: true, length: 255 })
  contactEmail: string;

  @Column({ nullable: true, length: 50 })
  phone: string;

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({ name: 'tax_id', nullable: true, length: 100 })
  taxId: string;

  @Column({ name: 'primary_color', default: '#6366f1', length: 50 })
  primaryColor: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => SubscriptionPlan)
  @JoinColumn({ name: 'subscription_plan_id' })
  subscriptionPlan: SubscriptionPlan;

  @Column({ name: 'subscription_plan_id', nullable: true })
  subscriptionPlanId: string;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'SUSPENDED', 'GRACE_PERIOD'],
    default: 'ACTIVE',
  })
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD';

  @Column({ name: 'grace_period_until', type: 'timestamp', nullable: true })
  gracePeriodUntil: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
