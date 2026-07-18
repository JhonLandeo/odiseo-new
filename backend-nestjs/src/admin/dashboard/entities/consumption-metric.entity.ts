import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from '../../../tenants/entities/tenant.entity';

@Entity('consumption_metrics', { schema: 'public' })
export class ConsumptionMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Company;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'metric_type', length: 100 })
  metricType: string;

  @Column('bigint', { default: 0 })
  value: number;

  @Column({ name: 'billing_month', type: 'int', nullable: false })
  billingMonth: number;

  @Column({ name: 'billing_year', type: 'int', nullable: false })
  billingYear: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
